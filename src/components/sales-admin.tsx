'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  Minus,
  PackageMinus,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Share2,
  ShoppingCart,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { PublicCatalog } from '@/lib/catalog-schema';
import { money, standaloneExtraId, standaloneExtraProductId } from '@/lib/model';
import {
  displaySaleItem,
  receiptText,
  type DailySalesBreakdown,
  type SaleForSummary,
} from '@/lib/sales-summary';
import { createCashReportPdf, type CashReportDay } from '@/lib/cash-report-pdf';
import type { SupplyExpense } from '@/lib/expenses';

type Sale = SaleForSummary & {
  createdBy: string;
  confirmedBy: string;
  cost: number;
};
type HistoryDay = {
  date: string;
  tickets: number;
  total: number;
  cash: number;
  transfers: number;
  pendingTransfers: number;
  cost: number;
  expenses: number;
  net: number;
};
type Dashboard = {
  catalog: PublicCatalog;
  sales: Sale[];
  expenses: SupplyExpense[];
  daily: DailySalesBreakdown;
  history: HistoryDay[];
  summary: {
    total: number;
    cash: number;
    transfers: number;
    pendingTransfers: number;
    grossProfit: number;
    expenses: number;
    netAfterExpenses: number;
    missingCostCount: number;
    tickets: number;
  };
};
type CartLine = { productId: string; size: number; quantity: number; modifierIds: string[] };

export default function SalesAdmin({ onManageExtras }: { onManageExtras: () => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [payment, setPayment] = useState<'Efectivo' | 'Transferencia'>('Efectivo');
  const [received, setReceived] = useState('');
  const [customer, setCustomer] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [orderSummaryOpen, setOrderSummaryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expenseName, setExpenseName] = useState('');
  const [expenseQuantity, setExpenseQuantity] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [editingExpense, setEditingExpense] = useState<SupplyExpense | null>(null);
  const previousSizeSignature = useRef<string | null>(null);
  const cartRef = useRef(cart);
  cartRef.current = cart;

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    try {
      const response = await fetch('/api/catalog-admin/sales', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No fue posible cargar las ventas.');
      setData(result);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar las ventas.');
    } finally {
      if (!silent) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 5_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const products = data?.catalog.products.filter((product) => product.active) ?? [];
  const cupSizes = data?.catalog.sizes ?? [];
  const sizeSignature = cupSizes.join('\u0000');
  const modifiers = data?.catalog.modifiers.filter((modifier) => modifier.active !== false) ?? [];
  const lines = Object.values(cart);

  useEffect(() => {
    if (
      previousSizeSignature.current !== null &&
      previousSizeSignature.current !== sizeSignature &&
      Object.keys(cartRef.current).length
    ) {
      setCart({});
      setNotice('Los tamaños cambiaron. La venta abierta se vació para evitar cobrar un tamaño incorrecto.');
    }
    previousSizeSignature.current = sizeSignature;
  }, [sizeSignature]);
  const orderLines = useMemo(
    () =>
      lines.flatMap((line) => {
        const extraId = standaloneExtraId(line.productId);
        if (extraId) {
          const extra = modifiers.find((candidate) => candidate.id === extraId);
          if (!extra) return [];
          return [
            {
              ...line,
              key: key(line.productId, line.size),
              name: extra.name,
              sizeLabel: 'Extra',
              extras: [],
              amount: extra.price * line.quantity,
            },
          ];
        }
        const product = products.find((candidate) => candidate.id === line.productId);
        if (!product) return [];
        const selectedExtras = line.modifierIds.flatMap((id) => {
          const extra = modifiers.find((candidate) => candidate.id === id);
          return extra ? [extra] : [];
        });
        const unitPrice =
          (product.prices[line.size] ?? 0) +
          selectedExtras.reduce((sum, extra) => sum + extra.price, 0);
        return [
          {
            ...line,
            key: key(line.productId, line.size),
            name: product.name,
            sizeLabel: product.kind !== 'drink' ? 'Pieza' : cupSizes[line.size],
            extras: selectedExtras,
            amount: unitPrice * line.quantity,
          },
        ];
      }),
    [cupSizes, lines, modifiers, products],
  );
  const total = useMemo(() => orderLines.reduce((sum, line) => sum + line.amount, 0), [orderLines]);
  const unitCount = useMemo(
    () => orderLines.reduce((sum, line) => sum + line.quantity, 0),
    [orderLines],
  );
  const dailyUnitCount = useMemo(
    () =>
      (data?.daily.products.reduce((sum, product) => sum + product.quantity, 0) ?? 0) +
      (data?.daily.extras.reduce((sum, extra) => sum + extra.quantity, 0) ?? 0),
    [data?.daily.extras, data?.daily.products],
  );

  function key(productId: string, size: number) {
    return `${productId}:${size}`;
  }

  function add(productId: string, size: number) {
    const id = key(productId, size);
    setCart((current) => ({
      ...current,
      [id]: current[id]
        ? { ...current[id], quantity: current[id].quantity + 1 }
        : { productId, size, quantity: 1, modifierIds: [] },
    }));
    setOrderSummaryOpen(false);
  }

  function addStandaloneExtra(modifierId: string) {
    add(standaloneExtraProductId(modifierId), 0);
  }

  function quantity(line: CartLine, delta: number) {
    const id = key(line.productId, line.size);
    setCart((current) => {
      const next = line.quantity + delta;
      if (next > 0) return { ...current, [id]: { ...line, quantity: next } };
      const copy = { ...current };
      delete copy[id];
      return copy;
    });
  }

  function toggleExtra(line: CartLine, modifierId: string) {
    const id = key(line.productId, line.size);
    setCart((current) => ({
      ...current,
      [id]: {
        ...line,
        modifierIds: line.modifierIds.includes(modifierId)
          ? line.modifierIds.filter((item) => item !== modifierId)
          : [...line.modifierIds, modifierId],
      },
    }));
  }

  async function send<T = Sale>(body: object) {
    const response = await fetch('/api/catalog-admin/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'No fue posible guardar la venta.');
    return result as T;
  }

  function clearCheckout() {
    setCart({});
    setReceived('');
    setCustomer('');
    setNote('');
    setEditingSale(null);
    setCorrectionReason('');
    setOrderSummaryOpen(false);
  }

  function editSale(sale: Sale) {
    const next: Record<string, CartLine> = {};
    for (const item of sale.items) {
      if (item.standaloneExtraId) {
        const productId = standaloneExtraProductId(item.standaloneExtraId);
        const id = key(productId, 0);
        next[id] = {
          productId,
          size: 0,
          quantity: item.quantity,
          modifierIds: [],
        };
        continue;
      }
      if (!item.productId || item.sizeIndex === undefined) {
        setError(
          'Este ticket antiguo no contiene los datos necesarios para editarlo. Puedes eliminarlo.',
        );
        return;
      }
      const id = key(item.productId, item.sizeIndex);
      next[id] = {
        productId: item.productId,
        size: item.sizeIndex,
        quantity: item.quantity,
        modifierIds: (item.extras ?? []).map((extra) => extra.id).filter(Boolean),
      };
    }
    setCart(next);
    setPayment(sale.payment);
    setReceived(sale.payment === 'Efectivo' ? String(sale.received / 100) : '');
    setCustomer(sale.customer ?? '');
    setNote(sale.note ?? '');
    setCorrectionReason('');
    setEditingSale(sale);
    setReceipt(null);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function completeSale() {
    if (!lines.length) return;
    const receivedCents = Math.round(Number(received || 0) * 100);
    if (payment === 'Efectivo' && receivedCents < total) {
      setError('El efectivo recibido es menor que el total.');
      return;
    }
    if (editingSale && correctionReason.trim().length < 5) {
      setError('Indica el motivo de la corrección con al menos 5 caracteres.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const sale = await send({
        action: editingSale ? 'edit-sale' : 'sale',
        ...(editingSale
          ? { saleId: editingSale.id, reason: correctionReason.trim() }
          : { id: crypto.randomUUID() }),
        customer: customer.trim(),
        note: note.trim(),
        lines,
        payment,
        received: payment === 'Efectivo' ? receivedCents : 0,
      });
      const corrected = Boolean(editingSale);
      clearCheckout();
      setReceipt(sale);
      setNotice(
        corrected
          ? `Ticket #${sale.number} corregido y totales recalculados.`
          : `Venta #${sale.number} registrada.`,
      );
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible registrar la venta.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSale() {
    if (!deleteTarget) return;
    if (deleteReason.trim().length < 5) {
      setError('Indica el motivo de la eliminación con al menos 5 caracteres.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const deleted = deleteTarget;
      await send<{ number: number }>({
        action: 'delete-sale',
        saleId: deleted.id,
        reason: deleteReason.trim(),
      });
      if (editingSale?.id === deleted.id) clearCheckout();
      if (receipt?.id === deleted.id) setReceipt(null);
      setDeleteTarget(null);
      setDeleteReason('');
      setNotice(`Ticket #${deleted.number} eliminado. Inventario y totales fueron corregidos.`);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible eliminar el ticket.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmTransfer(saleId: string) {
    setBusy(true);
    try {
      await send({ action: 'confirm-transfer', saleId });
      setNotice('Transferencia confirmada e incluida en el total del día.');
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'No fue posible confirmar la transferencia.',
      );
    } finally {
      setBusy(false);
    }
  }

  function clearExpenseForm() {
    setExpenseName('');
    setExpenseQuantity('');
    setExpenseAmount('');
    setEditingExpense(null);
  }

  async function saveExpense() {
    const quantity = expenseQuantity.trim() ? Number(expenseQuantity) : null;
    const amount = Math.round(Number(expenseAmount) * 100);
    if (expenseName.trim().length < 2) {
      setError('Escribe el nombre del insumo comprado.');
      return;
    }
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
      setError('La cantidad debe ser mayor que cero o quedar vacía.');
      return;
    }
    if (!Number.isInteger(amount) || amount < 1) {
      setError('Escribe el precio total del gasto.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await send<SupplyExpense>({
        action: 'save-expense',
        id: editingExpense?.id ?? crypto.randomUUID(),
        name: expenseName.trim(),
        quantity,
        total: amount,
      });
      const wasEditing = Boolean(editingExpense);
      clearExpenseForm();
      setNotice(wasEditing ? 'Gasto actualizado y total recalculado.' : 'Gasto registrado.');
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el gasto.');
    } finally {
      setBusy(false);
    }
  }

  function editExpense(expense: SupplyExpense) {
    setEditingExpense(expense);
    setExpenseName(expense.name);
    setExpenseQuantity(expense.quantity === null ? '' : String(expense.quantity));
    setExpenseAmount(String(expense.total / 100));
    setError('');
    document
      .getElementById('expense-form')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function deleteExpense(expense: SupplyExpense) {
    if (!window.confirm(`¿Eliminar el gasto de ${expense.name} por ${money(expense.total)}?`))
      return;
    setBusy(true);
    setError('');
    try {
      await send<{ id: string }>({ action: 'delete-expense', expenseId: expense.id });
      if (editingExpense?.id === expense.id) clearExpenseForm();
      setNotice('Gasto eliminado y dinero disponible recalculado.');
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible eliminar el gasto.');
    } finally {
      setBusy(false);
    }
  }

  async function shareSale(sale: Sale) {
    const text = receiptText(sale, money);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Comprobante #${sale.number}`, text });
      } else {
        await navigator.clipboard.writeText(text);
        setNotice('Comprobante copiado. Ya puedes enviarlo al cliente.');
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError('No fue posible compartir el comprobante. Puedes imprimirlo o guardarlo como PDF.');
    }
  }

  function downloadHistoryPdf(day: CashReportDay) {
    const bytes = createCashReportPdf(day);
    const file = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lattecito-corte-caja-${day.date}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  if (!data)
    return (
      <section className="panel">
        <p>{error || 'Cargando ventas del día…'}</p>
      </section>
    );

  return (
    <div className="sales-admin-stack">
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}

      <section className="summary-grid sales-summary-grid">
        <article className="metric-card">
          <span>VENTA COBRADA</span>
          <strong>{money(data.summary.total)}</strong>
          <small>{data.summary.tickets} tickets registrados</small>
        </article>
        <article className="metric-card">
          <span>EFECTIVO</span>
          <strong>{money(data.summary.cash)}</strong>
          <small>cobrado hoy</small>
        </article>
        <article className="metric-card">
          <span>TRANSFERENCIAS</span>
          <strong>{money(data.summary.transfers)}</strong>
          <small>{money(data.summary.pendingTransfers)} por confirmar</small>
        </article>
        <article className="metric-card expense-metric">
          <span>GASTOS DE INSUMOS</span>
          <strong>{money(data.summary.expenses)}</strong>
          <small>compras registradas hoy</small>
        </article>
        <article className="metric-card net-metric">
          <span>DISPONIBLE DESPUÉS DE GASTOS</span>
          <strong>{money(data.summary.netAfterExpenses)}</strong>
          <small>venta cobrada menos compras</small>
        </article>
        <article className="metric-card">
          <span>GANANCIA BRUTA</span>
          <strong>
            {data.summary.missingCostCount ? 'Faltan costos' : money(data.summary.grossProfit)}
          </strong>
          <small>venta menos costo registrado</small>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">REGISTRO DEL DÍA</span>
            <h2>Sumas por bebida y extra</h2>
          </div>
          <ReceiptText size={26} />
        </div>
        <p>
          Cada presentación se suma por separado. Las transferencias pendientes aparecen aparte
          hasta que confirmes el depósito.
        </p>
        <div className="daily-breakdown-grid">
          <div>
            <h3>Productos cobrados</h3>
            <div className="daily-lines">
              {data.daily.products.map((product) => (
                <div key={product.key}>
                  <span>
                    {product.quantity} × {product.name} · {product.size}
                  </span>
                  <strong>{money(product.amount)}</strong>
                </div>
              ))}
              {!data.daily.products.length && (
                <p className="muted">Todavía no hay productos cobrados.</p>
              )}
            </div>
          </div>
          <div>
            <h3>Extras cobrados</h3>
            <div className="daily-lines">
              {data.daily.extras.map((extra) => (
                <div key={extra.key}>
                  <span>
                    {extra.quantity} × {extra.name}
                  </span>
                  <strong>{money(extra.amount)}</strong>
                </div>
              ))}
              {!data.daily.extras.length && (
                <p className="muted">Todavía no hay extras cobrados.</p>
              )}
            </div>
          </div>
        </div>
        <div className="daily-total">
          <span>SUMA COBRADA DEL DÍA</span>
          <strong>{money(data.daily.total)}</strong>
        </div>
      </section>

      <section className="panel expense-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">GASTOS DEL DÍA</span>
            <h2>Compras de insumos</h2>
          </div>
          <PackageMinus size={26} />
        </div>
        <p>
          Registra leche, matcha, chocolate u otra compra. El precio total se descuenta de la venta
          cobrada para mostrar cuánto dinero queda disponible.
        </p>
        <div className="expense-layout">
          <div className="expense-form" id="expense-form">
            <label className="field">
              Nombre del insumo
              <input
                maxLength={100}
                placeholder="Ej. Matcha"
                value={expenseName}
                onChange={(event) => setExpenseName(event.target.value)}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Cantidad (opcional)
                <input
                  inputMode="decimal"
                  min="0.001"
                  max="100000"
                  step="0.001"
                  placeholder="Ej. 1"
                  type="number"
                  value={expenseQuantity}
                  onChange={(event) => setExpenseQuantity(event.target.value)}
                />
              </label>
              <label className="field">
                Precio total
                <input
                  inputMode="decimal"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  placeholder="Ej. 500"
                  type="number"
                  value={expenseAmount}
                  onChange={(event) => setExpenseAmount(event.target.value)}
                />
              </label>
            </div>
            <div className="inline-fields expense-form-actions">
              <button className="button" disabled={busy} onClick={() => void saveExpense()}>
                {editingExpense ? 'Guardar cambio' : 'Registrar gasto'}
              </button>
              {editingExpense && (
                <button className="small-button" disabled={busy} onClick={clearExpenseForm}>
                  Cancelar edición
                </button>
              )}
            </div>
          </div>
          <div className="expense-balance" aria-label="Dinero disponible después de gastos">
            <span>VENTA COBRADA</span>
            <strong>{money(data.summary.total)}</strong>
            <span>MENOS GASTOS</span>
            <strong className="expense-negative">− {money(data.summary.expenses)}</strong>
            <hr />
            <span>DINERO DISPONIBLE</span>
            <b>{money(data.summary.netAfterExpenses)}</b>
          </div>
        </div>

        <div className="responsive-table-wrap">
          <table className="admin-data-table expense-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Insumo</th>
                <th>Cantidad</th>
                <th>Precio total</th>
                <th>Registró</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((expense) => (
                <tr key={expense.id}>
                  <td data-label="Hora">
                    {new Date(expense.date).toLocaleTimeString('es-MX', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td data-label="Insumo">
                    <strong>{expense.name}</strong>
                  </td>
                  <td data-label="Cantidad">{expense.quantity ?? '—'}</td>
                  <td data-label="Precio total">
                    <strong>{money(expense.total)}</strong>
                  </td>
                  <td data-label="Registró">{expense.createdBy}</td>
                  <td data-label="Acciones">
                    <div className="table-actions">
                      <button
                        className="small-button"
                        disabled={busy}
                        onClick={() => editExpense(expense)}
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        className="danger-button compact-danger"
                        disabled={busy}
                        onClick={() => void deleteExpense(expense)}
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!data.expenses.length && (
                <tr>
                  <td className="empty-table" colSpan={6}>
                    Todavía no hay gastos registrados hoy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel sales-register-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CAJA</span>
            <h2>
              {editingSale ? `Corregir ticket #${editingSale.number}` : 'Registrar nueva venta'}
            </h2>
          </div>
          <ShoppingCart size={26} />
        </div>
        <div className="sales-workspace">
          {lines.length > 0 && (
            <aside
              aria-label="Resumen de la venta en curso"
              className={`sales-order-summary${orderSummaryOpen ? ' open' : ''}`}
            >
              <button
                aria-expanded={orderSummaryOpen}
                className="sales-order-summary-toggle"
                onClick={() => setOrderSummaryOpen((current) => !current)}
                type="button"
              >
                <span>
                  <ShoppingCart size={18} />
                  <span>
                    <b>Esta venta</b>
                    <small>
                      {unitCount} {unitCount === 1 ? 'unidad' : 'unidades'}
                    </small>
                  </span>
                </span>
                <strong>{money(total)}</strong>
                <ChevronDown aria-hidden="true" size={18} />
              </button>
              <div className="sales-order-summary-body">
                <div className="sales-order-lines">
                  {orderLines.map((line) => (
                    <div key={line.key}>
                      <span>
                        <b>{line.quantity} ×</b> {line.name} · {line.sizeLabel}
                        {line.extras.length > 0 && (
                          <small>+ {line.extras.map((extra) => extra.name).join(', ')}</small>
                        )}
                      </span>
                      <strong>{money(line.amount)}</strong>
                    </div>
                  ))}
                </div>
                <div className="sales-order-total">
                  <span>Total de esta venta</span>
                  <strong>{money(total)}</strong>
                </div>
                <div className="sales-day-glance">
                  <span>REGISTRO COBRADO HOY</span>
                  <strong>{money(data.daily.total)}</strong>
                  <small>
                    {dailyUnitCount} {dailyUnitCount === 1 ? 'unidad' : 'unidades'} ·{' '}
                    {data.daily.tickets} {data.daily.tickets === 1 ? 'ticket' : 'tickets'}
                  </small>
                </div>
              </div>
            </aside>
          )}

          <div className="sales-workspace-main">
            <div className="sales-product-grid">
              {products.map((product) => (
                <article key={product.id}>
                  <strong>{product.name}</strong>
                  {(product.kind !== 'drink' ? ['Pieza'] : cupSizes).map((size, index) => (
                    <button key={size} type="button" onClick={() => add(product.id, index)}>
                      <span>{size}</span>
                      <b>{money(product.prices[index])}</b>
                      <Plus size={15} />
                    </button>
                  ))}
                </article>
              ))}
            </div>
            <section className="sales-extra-catalog" aria-label="Extras disponibles para la venta">
              <div>
                <span className="eyebrow">
                  <Sparkles aria-hidden="true" size={14} /> EXTRAS DISPONIBLES
                </span>
                <p>
                  {modifiers.length
                    ? 'Agrégalos por separado con + o selecciónalos dentro de una bebida.'
                    : 'Todavía no hay extras. Puedes crearlos sin salir del área de administración.'}
                </p>
              </div>
              {modifiers.length > 0 && (
                <div className="sales-extra-catalog-list">
                  {modifiers.map((extra) => (
                    <button
                      key={extra.id}
                      onClick={() => addStandaloneExtra(extra.id)}
                      type="button"
                    >
                      <span>
                        <b>{extra.name}</b>
                        <small>Extra</small>
                      </span>
                      <strong>{money(extra.price)}</strong>
                      <Plus aria-hidden="true" size={15} />
                    </button>
                  ))}
                </div>
              )}
              <button className="small-button" onClick={onManageExtras} type="button">
                <Plus size={15} /> Administrar extras
              </button>
            </section>
            <div className="sales-cart">
              {lines.map((line) => {
                const extraId = standaloneExtraId(line.productId);
                const standaloneExtra = extraId
                  ? modifiers.find((candidate) => candidate.id === extraId)
                  : null;
                if (standaloneExtra) {
                  return (
                    <article key={key(line.productId, line.size)}>
                      <div className="section-heading compact">
                        <div>
                          <strong>{standaloneExtra.name}</strong>
                          <p>Extra · {money(standaloneExtra.price)}</p>
                        </div>
                        <div className="sales-quantity">
                          <button
                            aria-label={`Quitar una unidad de ${standaloneExtra.name}`}
                            onClick={() => quantity(line, -1)}
                            type="button"
                          >
                            <Minus size={14} />
                          </button>
                          <b aria-label={`${line.quantity} unidades`}>{line.quantity}</b>
                          <button
                            aria-label={`Agregar una unidad de ${standaloneExtra.name}`}
                            onClick={() => quantity(line, 1)}
                            type="button"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                }
                const product = products.find((candidate) => candidate.id === line.productId);
                if (!product) return null;
                const available = modifiers.filter(
                  (modifier) =>
                    product.kind !== 'merch' &&
                    (modifier.productIds?.includes(product.id) ||
                      (!modifier.productIds && product.kind === 'drink')),
                );
                return (
                  <article key={key(line.productId, line.size)}>
                    <div className="section-heading compact">
                      <div>
                        <strong>{product.name}</strong>
                        <p>
                          {product.kind !== 'drink' ? 'Pieza' : cupSizes[line.size]} ·{' '}
                          {money(product.prices[line.size])}
                        </p>
                      </div>
                      <div className="sales-quantity">
                        <button
                          aria-label={`Quitar una unidad de ${product.name}`}
                          onClick={() => quantity(line, -1)}
                          type="button"
                        >
                          <Minus size={14} />
                        </button>
                        <b aria-label={`${line.quantity} unidades`}>{line.quantity}</b>
                        <button
                          aria-label={`Agregar una unidad de ${product.name}`}
                          onClick={() => quantity(line, 1)}
                          type="button"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    {available.length > 0 && (
                      <div className="sales-line-extra-picker">
                        <span>EXTRAS PARA {product.name}</span>
                        <div className="sales-extra-chips">
                          {available.map((extra) => (
                            <button
                              aria-pressed={line.modifierIds.includes(extra.id)}
                              className={line.modifierIds.includes(extra.id) ? 'selected' : ''}
                              key={extra.id}
                              onClick={() => toggleExtra(line, extra.id)}
                              type="button"
                            >
                              {extra.name} +{money(extra.price)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              {!lines.length && (
                <div className="sales-empty-cart">
                  <ShoppingCart aria-hidden="true" size={22} />
                  <p>Elige una presentación. Aquí aparecerán sus cantidades y extras.</p>
                </div>
              )}
            </div>
            {lines.length > 0 && (
              <div className="sales-checkout" id="sales-checkout">
                <div className="daily-total">
                  <span>TOTAL DE ESTA VENTA</span>
                  <strong>{money(total)}</strong>
                </div>
                <div className="inline-fields">
                  <button
                    className={
                      payment === 'Efectivo' ? 'small-button active-choice' : 'small-button'
                    }
                    onClick={() => setPayment('Efectivo')}
                  >
                    Efectivo
                  </button>
                  <button
                    className={
                      payment === 'Transferencia' ? 'small-button active-choice' : 'small-button'
                    }
                    onClick={() => setPayment('Transferencia')}
                  >
                    Transferencia
                  </button>
                </div>
                <div className="form-grid">
                  {payment === 'Efectivo' && (
                    <label className="field">
                      Efectivo recibido
                      <input
                        type="number"
                        min={total / 100}
                        step="0.01"
                        value={received}
                        onChange={(event) => setReceived(event.target.value)}
                      />
                    </label>
                  )}
                  <label className="field">
                    Cliente (opcional)
                    <input
                      maxLength={100}
                      value={customer}
                      onChange={(event) => setCustomer(event.target.value)}
                    />
                  </label>
                </div>
                <label className="field">
                  Nota (opcional)
                  <textarea
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                {editingSale && (
                  <label className="field">
                    Motivo de la corrección
                    <textarea
                      maxLength={300}
                      minLength={5}
                      required
                      value={correctionReason}
                      onChange={(event) => setCorrectionReason(event.target.value)}
                      placeholder="Ej. se capturó una bebida equivocada"
                    />
                  </label>
                )}
                {payment === 'Transferencia' && (
                  <p className="notice">
                    La transferencia quedará en espera y no se sumará como cobrada hasta
                    confirmarla.
                  </p>
                )}
                <button className="button" disabled={busy} onClick={() => void completeSale()}>
                  {busy
                    ? 'Guardando…'
                    : editingSale
                      ? 'Guardar corrección'
                      : 'Cobrar y generar comprobante'}
                </button>
                {editingSale && (
                  <button className="small-button" disabled={busy} onClick={clearCheckout}>
                    Cancelar corrección
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <span className="eyebrow">COMPROBANTES DEL DÍA</span>
        <h2>Tickets para revisar o corregir</h2>
        <p className="ticket-help">
          El registro acumulado está arriba. Estos comprobantes conservan el detalle de cada cobro
          para que puedas consultarlo, editarlo o eliminarlo si hubo un error.
        </p>
        <div className="responsive-table-wrap">
          <table className="admin-data-table ticket-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Hora</th>
                <th>Detalle</th>
                <th>Pago</th>
                <th>Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.sales.map((sale) => (
                <tr key={sale.id}>
                  <td data-label="Ticket">
                    <strong>#{sale.number}</strong>
                  </td>
                  <td data-label="Hora">
                    {new Date(sale.date).toLocaleTimeString('es-MX', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    <small>{sale.createdBy}</small>
                  </td>
                  <td data-label="Detalle">
                    <div className="ticket-table-items">
                      {sale.items.map((item, index) => (
                        <span key={index}>
                          <b>{item.quantity} ×</b> {displaySaleItem(item)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td data-label="Pago">
                    {sale.payment}
                    <small>{sale.paymentStatus}</small>
                  </td>
                  <td data-label="Total">
                    <strong>{money(sale.total)}</strong>
                  </td>
                  <td data-label="Acciones">
                    <div className="table-actions ticket-table-actions">
                      <button
                        className="small-button"
                        onClick={() => setReceipt(sale)}
                        type="button"
                      >
                        Ver
                      </button>
                      <button
                        className="small-button"
                        disabled={busy}
                        onClick={() => editSale(sale)}
                        type="button"
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        aria-label={`Eliminar ticket ${sale.number}`}
                        className="danger-button compact-danger"
                        disabled={busy}
                        onClick={() => {
                          setDeleteTarget(sale);
                          setDeleteReason('');
                        }}
                        type="button"
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                      {sale.paymentStatus === 'Pendiente' && (
                        <button
                          className="small-button"
                          disabled={busy}
                          onClick={() => void confirmTransfer(sale.id)}
                          type="button"
                        >
                          Confirmar transferencia
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!data.sales.length && (
                <tr>
                  <td className="empty-table" colSpan={6}>
                    Todavía no hay tickets hoy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="retention-note">
          Los tickets detallados se eliminan automáticamente después de siete días. Los totales
          diarios compactos permanecen para conservar el historial del negocio.
        </p>
      </section>

      <section className="panel">
        <span className="eyebrow">ÚLTIMOS 7 DÍAS</span>
        <h2>Historial compacto</h2>
        <div className="daily-lines compact-history-list">
          {data.history.map((day) => (
            <div className="compact-history-row" key={day.date}>
              <span>
                {new Date(`${day.date}T12:00:00`).toLocaleDateString('es-MX')} · {day.tickets}{' '}
                tickets · Venta {money(day.total)} · Gastos {money(day.expenses)}
              </span>
              <strong>Neto {money(day.net)}</strong>
              <button
                aria-label={`Descargar corte de caja del ${day.date}`}
                className="small-button"
                onClick={() => downloadHistoryPdf(day)}
                type="button"
              >
                <Download size={15} /> Descargar PDF
              </button>
            </div>
          ))}
        </div>
      </section>

      {receipt && (
        <div className="catalog-overlay receipt-overlay">
          <article className="receipt digital-receipt">
            <span className="eyebrow">LATTECITO COFFEE</span>
            <h2>Comprobante #{receipt.number}</h2>
            <p>{new Date(receipt.date).toLocaleString('es-MX')}</p>
            {receipt.customer && <p>Cliente: {receipt.customer}</p>}
            <hr />
            {receipt.items.map((item, index) => (
              <div className="receipt-item" key={index}>
                <div>
                  <span>
                    {item.quantity} × {item.name} · {item.size}
                  </span>
                  {item.extras?.map((extra) => (
                    <small key={extra.id}>
                      + {extra.name} · {money(extra.unitPrice * item.quantity)}
                    </small>
                  ))}
                </div>
                <strong>{money(item.unitPrice * item.quantity)}</strong>
              </div>
            ))}
            <hr />
            <div className="daily-total">
              <span>TOTAL</span>
              <strong>{money(receipt.total)}</strong>
            </div>
            <p>
              {receipt.payment} · {receipt.paymentStatus}
            </p>
            {receipt.payment === 'Efectivo' && (
              <p>
                Recibido: {money(receipt.received)} · Cambio: {money(receipt.change)}
              </p>
            )}
            {receipt.note && <p>Nota: {receipt.note}</p>}
            <p>Gracias por tu compra.</p>
            <div className="inline-fields receipt-actions">
              <button className="button" onClick={() => window.print()}>
                <Printer size={16} /> Imprimir / PDF
              </button>
              <button className="small-button" onClick={() => void shareSale(receipt)}>
                <Share2 size={16} /> Compartir
              </button>
              <button className="small-button" onClick={() => setReceipt(null)}>
                Cerrar
              </button>
            </div>
          </article>
        </div>
      )}

      {deleteTarget && (
        <div className="catalog-overlay receipt-overlay delete-ticket-overlay">
          <article
            aria-labelledby="delete-ticket-title"
            aria-modal="true"
            className="receipt digital-receipt correction-dialog delete-ticket-dialog"
            role="dialog"
          >
            <span className="eyebrow">CORRECCIÓN DE CAJA</span>
            <h2 id="delete-ticket-title">Eliminar ticket #{deleteTarget.number}</h2>
            <p>
              Se restará del total del día y se repondrán automáticamente los insumos que consumió.
            </p>
            <label className="field">
              Motivo obligatorio
              <textarea
                autoFocus
                maxLength={300}
                minLength={5}
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Ej. ticket duplicado"
              />
            </label>
            <div className="delete-reason-help">
              <span>Mínimo 5 caracteres</span>
              <span>{deleteReason.trim().length}/300</span>
            </div>
            <div className="inline-fields receipt-actions delete-ticket-actions">
              <button
                className="danger-button"
                disabled={busy || deleteReason.trim().length < 5}
                onClick={() => void deleteSale()}
                type="button"
              >
                <Trash2 size={16} /> {busy ? 'Eliminando…' : 'Eliminar ticket'}
              </button>
              <button
                className="small-button"
                disabled={busy}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteReason('');
                }}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
