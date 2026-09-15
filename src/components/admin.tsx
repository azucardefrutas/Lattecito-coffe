'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BarChart3,
  Coffee,
  ShoppingBag,
  Package,
  Wallet,
  ClipboardList,
  Settings,
  LogOut,
  Plus,
  Minus,
  Download,
  RefreshCw,
  Printer,
  ChefHat,
  X,
} from 'lucide-react';
import {
  money,
  sizes,
  quoteSale,
  expectedCash,
  availableModifiers,
  daySummary,
  type Store,
  type Line,
  type Product,
  type Ingredient,
  type RecipeItem,
  type Sale,
  type Modifier,
} from '@/lib/model';
import SaleCorrection from '@/components/sale-correction';
const navigation = [
  ['Resumen', BarChart3],
  ['Nueva venta', ShoppingBag],
  ['Productos', Coffee],
  ['Insumos', Package],
  ['Caja y cortes', Wallet],
  ['Ventas', ClipboardList],
  ['Barra', ChefHat],
  ['Configuración', Settings],
] as const;
const blankProduct: Product = {
  id: '',
  name: '',
  category: 'Cafés',
  description: '',
  prices: [0, 0, 0],
  cost: [0, 0, 0],
  stock: 0,
  active: true,
  tone: 'coffee',
  recipes: [[], [], []],
};
const blankIngredient: Ingredient = {
  id: '',
  name: '',
  unit: 'g',
  stock: 0,
  minimum: 0,
  costPerUnit: 0,
};
function date(value: string) {
  return new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}
function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function RecipeEditor({
  value,
  ingredients,
  onChange,
}: {
  value: RecipeItem[];
  ingredients: Ingredient[];
  onChange: (r: RecipeItem[]) => void;
}) {
  return (
    <>
      <div>
        {value.map((r, n) => (
          <div className="recipe-row" key={n}>
            <select
              aria-label={`Insumo ${n + 1}`}
              value={r.ingredientId}
              onChange={(e) =>
                onChange(
                  value.map((x, i) => (i === n ? { ...x, ingredientId: e.target.value } : x)),
                )
              }
            >
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
            <input
              aria-label={`Cantidad de insumo ${n + 1}`}
              type="number"
              min="0.001"
              step={
                ingredients.find((i) => i.id === r.ingredientId)?.unit === 'pieza' ? '1' : '0.001'
              }
              required
              value={r.quantity}
              onChange={(e) =>
                onChange(
                  value.map((x, i) => (i === n ? { ...x, quantity: Number(e.target.value) } : x)),
                )
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Quitar insumo de receta"
              onClick={() => onChange(value.filter((_, i) => i !== n))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="small-button"
        disabled={!ingredients.length}
        onClick={() => onChange([...value, { ingredientId: ingredients[0].id, quantity: 1 }])}
      >
        <Plus size={14} />
        Añadir insumo
      </button>
      {!ingredients.length && <p className="muted">Primero registra los insumos.</p>}
    </>
  );
}

export default function Admin({
  authenticated,
  setup,
}: {
  authenticated: boolean;
  setup: boolean;
}) {
  const [signed, setSigned] = useState(authenticated),
    [store, setStore] = useState<Store | null>(null),
    [tab, setTab] = useState('Resumen'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [password, setPassword] = useState('');
  const [lines, setLines] = useState<Line[]>([]),
    [discount, setDiscount] = useState(0),
    [payment, setPayment] = useState('Efectivo'),
    [received, setReceived] = useState(''),
    [customer, setCustomer] = useState(''),
    [receipt, setReceipt] = useState<Sale | null>(null),
    [correctionId, setCorrectionId] = useState<string | null>(null),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState('Todos');
  const [editProduct, setEditProduct] = useState<Product | null>(null),
    [editIngredient, setEditIngredient] = useState<Ingredient | null>(null),
    [editModifier, setEditModifier] = useState<Modifier | null>(null),
    [opening, setOpening] = useState(''),
    [counted, setCounted] = useState('');
  const [stockId, setStockId] = useState(''),
    [stockQuantity, setStockQuantity] = useState(''),
    [stockReason, setStockReason] = useState('');
  const [chosen, setChosen] = useState<Product | null>(null),
    [size, setSize] = useState(0),
    [extras, setExtras] = useState<string[]>([]);
  const chooser = useRef<HTMLDialogElement>(null);
  const saleId = useRef('');
  const inFlight = useRef(false);
  async function refresh() {
    const r = await fetch('/api/admin', { cache: 'no-store' });
    if (r.status === 401) {
      setSigned(false);
      setStore(null);
      throw new Error('La sesión terminó. Inicia sesión de nuevo.');
    }
    if (!r.ok) throw new Error('No se pudo cargar la administración.');
    const data = await r.json();
    setStore(data);
    return data as Store;
  }
  useEffect(() => {
    if (signed) refresh().catch((e) => setError(e.message));
  }, [signed]);
  useEffect(() => {
    if (chosen) chooser.current?.showModal();
    else chooser.current?.close();
  }, [chosen]);
  useEffect(() => {
    if (!signed || tab !== 'Barra') return;
    const id = setInterval(() => refresh().catch((e) => setError(e.message)), 5000);
    return () => clearInterval(id);
  }, [signed, tab]);
  async function request(payload: unknown) {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'No se pudo guardar.');
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión.');
      return null;
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function save(payload: unknown, done?: () => void) {
    const r = await request(payload);
    if (r) {
      done?.();
      setMessage('Cambios guardados.');
      try {
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo actualizar.');
      }
    }
  }
  async function login(e: FormEvent) {
    e.preventDefault();
    const r = await request({ action: 'login', password });
    if (r) {
      setPassword('');
      setSigned(true);
    }
  }
  if (!signed)
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={login}>
          <div className="wordmark">
            lattecito<span>ESPACIO DEL EQUIPO</span>
          </div>
          <h1>{setup ? 'Tu barra, en orden.' : 'Qué gusto verte.'}</h1>
          <p>
            {setup
              ? 'Crea la contraseña del administrador local para empezar a configurar tu cafetería.'
              : 'Ingresa tu contraseña para abrir el punto de venta.'}
          </p>
          <label className="field">
            {setup ? 'Crear contraseña' : 'Contraseña'}
            <input
              autoComplete={setup ? 'new-password' : 'current-password'}
              type="password"
              minLength={10}
              maxLength={128}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button className="button full" disabled={busy}>
            {busy ? 'Comprobando…' : setup ? 'Crear acceso privado' : 'Entrar a mi cafetería'}
          </button>
          <p style={{ marginTop: 20, fontSize: 11 }}>
            Administración local · Acceso protegido · Puerto 3001
          </p>
        </form>
      </main>
    );
  if (!store)
    return (
      <main className="empty-page">
        <h1>Preparando tu espacio.</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="button" onClick={() => refresh().catch((e) => setError(e.message))}>
              Reintentar
            </button>
          </>
        ) : (
          <p>Cargando la información guardada…</p>
        )}
      </main>
    );
  const session = store.cash.find((c) => !c.closedAt);
  const today = new Date().toLocaleDateString('en-CA');
  const summary = daySummary(store, today);
  const daily = summary.sales,
    revenue = summary.net,
    cost = summary.cost;
  const correction = store.sales.find((s) => s.id === correctionId && !s.refund);
  const shownReceipt = receipt ? (store.sales.find((s) => s.id === receipt.id) ?? receipt) : null;
  const low = store.ingredients.filter((i) => i.stock <= i.minimum);
  let quote: ReturnType<typeof quoteSale> | null = null;
  let quoteError = '';
  if (lines.length)
    try {
      quote = quoteSale(store, lines, discount);
    } catch (e) {
      quoteError = e instanceof Error ? e.message : 'Revisa las recetas.';
    }
  function addChosen() {
    if (!chosen) return;
    setLines((prev) => [...prev, { productId: chosen.id, size, quantity: 1, modifierIds: extras }]);
    setChosen(null);
    saleId.current = '';
  }
  async function charge() {
    if (!quote || busy) return;
    if (!saleId.current) saleId.current = crypto.randomUUID();
    const r = await request({
      action: 'sale',
      id: saleId.current,
      lines,
      discount,
      payment,
      received: Math.round(Number(received) * 100),
      customer,
    });
    if (r) {
      setReceipt(r);
      setLines([]);
      setReceived('');
      setCustomer('');
      setDiscount(0);
      saleId.current = '';
      setMessage('Venta registrada. La comanda está en barra.');
      try {
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo actualizar.');
      }
    }
  }
  function lineQuantity(index: number, delta: number) {
    setLines((prev) =>
      prev
        .map((l, i) => (i === index ? { ...l, quantity: Math.min(99, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0),
    );
    saleId.current = '';
  }
  const receiptView = receipt && (
    <section className="receipt">
      <strong>LATTECITO COFFEE</strong>
      <br />
      Orden #{String(receipt.number).padStart(3, '0')} · {date(receipt.date)}
      <br />
      {receipt.customer && (
        <>
          Cliente: {receipt.customer}
          <br />
        </>
      )}
      {receipt.items.map((i, n) => (
        <div key={n}>
          {i.quantity} × {i.name} ({i.size})<br />
          {money(i.unitPrice)} c/u — {money(i.unitPrice * i.quantity)}
        </div>
      ))}
      <hr />
      Subtotal: {money(receipt.subtotal)}
      <br />
      Descuento: {money(receipt.discount)}
      <br />
      <strong>Total: {money(receipt.total)}</strong>
      <br />
      {receipt.payment} · Recibido: {money(receipt.received)}
      <br />
      Cambio: {money(receipt.change)}
      <br />
      Folio: {receipt.id}
      <br />
      {shownReceipt?.refund && (
        <>
          <hr />
          <strong>DEVOLUCIÓN COMPLETA: {money(shownReceipt.refund.amount)}</strong>
          <br />
          {date(shownReceipt.refund.date)} · {shownReceipt.refund.payment}
          <br />
          Motivo: {shownReceipt.refund.reason}
          <br />
          {shownReceipt.refund.restocked ? 'Insumos repuestos.' : 'Consumo conservado como merma.'}
          <br />
          Referencia: {shownReceipt.refund.id}
          <br />
        </>
      )}
      Comprobante interno, no fiscal.
      <br />
      <button className="small-button" onClick={() => window.print()}>
        <Printer size={14} />
        Imprimir ticket
      </button>
    </section>
  );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <div className="wordmark">
            lattecito<span>ESPACIO DEL EQUIPO</span>
          </div>
          <div className="staff-caption">TU CAFETERÍA, EN ORDEN.</div>
        </div>
        <nav className="admin-nav">
          {navigation.map(([name, Icon]) => (
            <button
              key={name}
              className={tab === name ? 'active' : ''}
              onClick={() => {
                setTab(name);
                setError('');
                setMessage('');
              }}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <p className="muted" style={{ fontSize: 11 }}>
            Guardado local en este equipo.
          </p>
          <button
            className="small-button"
            onClick={async () => {
              const r = await request({ action: 'logout' });
              if (r) {
                setSigned(false);
                setStore(null);
              }
            }}
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="admin-content">
        <header className="admin-header">
          <div>
            <span className="eyebrow">LATTECITO · ADMINISTRACIÓN</span>
            <h1>{tab === 'Resumen' ? 'Así va tu cafetería.' : tab}</h1>
            <p>
              {new Date().toLocaleDateString('es-MX', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div className="inline-fields">
            <span className={`status-chip ${session ? 'on' : ''}`}>
              <span>●</span>
              {session ? 'Caja abierta' : 'Caja cerrada'}
            </span>
            <button
              className="icon-button"
              aria-label="Actualizar datos"
              onClick={() => refresh().catch((e) => setError(e.message))}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {store.settings.sample && (
          <p className="notice">
            Configuración inicial: el catálogo contiene precios de muestra. Registra insumos,
            recetas y costos antes de comenzar.
          </p>
        )}
        {tab === 'Resumen' && (
          <>
            <div className="metrics">
              <div className="metric">
                <small>Ventas netas de hoy</small>
                <strong>{money(revenue)}</strong>
                <p>
                  {daily.length} tickets · {money(summary.returned)} devueltos hoy
                </p>
              </div>
              <div className="metric">
                <small>Margen bruto estimado</small>
                <strong>{money(revenue - cost)}</strong>
                <p>Depende de costos completos; sin gastos operativos.</p>
              </div>
              <div className="metric">
                <small>Descuentos de hoy</small>
                <strong>{money(daily.reduce((a, s) => a + s.discount, 0))}</strong>
                <p>Descuento guardado por venta</p>
              </div>
              <div className="metric">
                <small>Efectivo esperado</small>
                <strong>{money(session ? expectedCash(store, session) : 0)}</strong>
                <p>{session ? 'Fondo inicial + ventas en efectivo' : 'Abre caja para comenzar'}</p>
              </div>
            </div>
            <section className="panel">
              <div className="panel-heading">
                <h2>Antes de la siguiente taza</h2>
                <button className="small-button" onClick={() => setTab('Insumos')}>
                  Ver insumos
                </button>
              </div>
              {!store.ingredients.length ? (
                <p className="muted">
                  Aún no hay insumos. Registra café, leche, vasos y sus existencias para comenzar.
                </p>
              ) : low.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Insumo</th>
                        <th>Disponible</th>
                        <th>Mínimo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {low.map((i) => (
                        <tr key={i.id}>
                          <td>{i.name}</td>
                          <td>
                            {i.stock} {i.unit}
                          </td>
                          <td>
                            {i.minimum} {i.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">Todos los insumos están por encima de su mínimo.</p>
              )}
            </section>
            <section className="panel">
              <h2>Un flujo sencillo para tu barra</h2>
              <p className="muted">
                1. Configura insumos y recetas → 2. Abre caja → 3. Cobra → 4. Prepara en barra → 5.
                Haz tu corte.
              </p>
              <button className="button" onClick={() => setTab('Nueva venta')}>
                Registrar una venta
              </button>
            </section>
          </>
        )}
        {tab === 'Nueva venta' && (
          <div className="pos-layout">
            <div>
              <div className="menu-tools">
                <input
                  aria-label="Buscar producto para venta"
                  type="search"
                  placeholder="Buscar bebida…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="categories" style={{ marginBottom: 20 }}>
                {['Todos', ...new Set(store.products.map((p) => p.category))].map((c) => (
                  <button
                    className={category === c ? 'active' : ''}
                    onClick={() => setCategory(c)}
                    key={c}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="pos-grid">
                {store.products
                  .filter(
                    (p) =>
                      p.active &&
                      (category === 'Todos' || p.category === category) &&
                      p.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      className="pos-card"
                      onClick={() => {
                        setChosen(p);
                        setSize(0);
                        setExtras([]);
                      }}
                    >
                      <div className={`product-visual ${p.tone}`} />
                      <h3>{p.name}</h3>
                      <small>Desde {money(p.prices[0])}</small>
                    </button>
                  ))}
              </div>
              {receiptView}
            </div>
            <aside className="ticket">
              <h2>La próxima pausa.</h2>
              <small>Venta actual · {lines.reduce((a, l) => a + l.quantity, 0)} productos</small>
              {!lines.length && <p className="notice">Toca una bebida para comenzar.</p>}
              {lines.map((l, i) => {
                const p = store.products.find((p) => p.id === l.productId);
                return (
                  <div className="ticket-line" key={i}>
                    <div className="ticket-line-head">
                      <strong>{p?.name}</strong>
                      <span>{quote ? money(quote.items[i].unitPrice * l.quantity) : '—'}</span>
                    </div>
                    <p>
                      {sizes[l.size]}
                      {l.modifierIds?.map(
                        (id) => ' · ' + store.modifiers.find((m) => m.id === id)?.name,
                      )}
                    </p>
                    <div className="stepper">
                      <button aria-label={`Quitar ${p?.name}`} onClick={() => lineQuantity(i, -1)}>
                        <Minus size={13} />
                      </button>
                      <b>{l.quantity}</b>
                      <button aria-label={`Añadir ${p?.name}`} onClick={() => lineQuantity(i, 1)}>
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
              <label className="field">
                Nombre para la comanda
                <input
                  maxLength={100}
                  value={customer}
                  placeholder="Opcional"
                  onChange={(e) => setCustomer(e.target.value)}
                />
              </label>
              <div className="inline-fields">
                <label className="field">
                  Descuento %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                  />
                </label>
                <label className="field">
                  Método de pago
                  <select value={payment} onChange={(e) => setPayment(e.target.value)}>
                    <option>Efectivo</option>
                    <option>Tarjeta</option>
                    <option>Transferencia</option>
                  </select>
                </label>
              </div>
              {payment === 'Efectivo' && (
                <label className="field">
                  Efectivo recibido (MXN)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                  />
                </label>
              )}
              {quoteError && <p className="notice error">{quoteError}</p>}
              <div className="ticket-total">
                <span>Total</span>
                <span>{money(quote?.total ?? 0)}</span>
              </div>
              {quote && payment === 'Efectivo' && (
                <p className="muted">
                  Cambio: {money(Math.max(0, Math.round(Number(received) * 100) - quote.total))}
                </p>
              )}
              <button
                className="button full"
                disabled={busy || !quote || !session}
                onClick={charge}
              >
                {busy ? 'Guardando venta…' : 'Confirmar cobro'}
                <ShoppingBag size={17} />
              </button>
              <p className="muted" style={{ fontSize: 10, marginTop: 12 }}>
                {session
                  ? 'Confirma el pago real antes de registrar. Tarjeta y transferencia no procesan pagos.'
                  : 'Abre caja en «Caja y cortes» para cobrar.'}
              </p>
            </aside>
          </div>
        )}
        {tab === 'Productos' && (
          <>
            <section className="panel">
              <div className="panel-heading">
                <h2>Menú y recetas</h2>
                <button
                  className="button"
                  onClick={() => setEditProduct(structuredClone(blankProduct))}
                >
                  <Plus size={15} />
                  Nuevo producto
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Chico / Mediano / Grande</th>
                      <th>Recetas</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {store.products.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <br />
                          <small>{p.category}</small>
                        </td>
                        <td>{p.prices.map(money).join(' / ')}</td>
                        <td>{p.recipes?.filter((r) => r.length).length ?? 0} de 3 tamaños</td>
                        <td>{p.active ? 'Visible' : 'Oculto'}</td>
                        <td>
                          <button
                            className="small-button"
                            onClick={() =>
                              setEditProduct(
                                structuredClone({ ...p, recipes: p.recipes ?? [[], [], []] }),
                              )
                            }
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            {editProduct && (
              <form
                className="panel admin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  save({ action: 'product', product: editProduct }, () => setEditProduct(null));
                }}
              >
                <h2 className="wide">{editProduct.id ? 'Editar producto' : 'Nuevo producto'}</h2>
                <label className="field">
                  Nombre
                  <input
                    required
                    value={editProduct.name}
                    onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Categoría
                  <select
                    value={editProduct.category}
                    onChange={(e) => setEditProduct({ ...editProduct, category: e.target.value })}
                  >
                    {['Cafés', 'Matcha', 'Bobas', 'Frappés', 'Postres'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="field wide">
                  Descripción
                  <textarea
                    value={editProduct.description}
                    onChange={(e) =>
                      setEditProduct({ ...editProduct, description: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Imagen conceptual
                  <select
                    value={editProduct.tone}
                    onChange={(e) => setEditProduct({ ...editProduct, tone: e.target.value })}
                  >
                    {['coffee', 'matcha', 'boba', 'caramel', 'cocoa', 'dark'].map((c, i) => (
                      <option value={c} key={c}>
                        {['Latte', 'Matcha', 'Boba', 'Caramelo', 'Chocolate', 'Americano'][i]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={editProduct.active}
                    onChange={(e) => setEditProduct({ ...editProduct, active: e.target.checked })}
                  />
                  Visible en menú
                </label>
                {sizes.map((s, n) => (
                  <section key={s} className="panel wide">
                    <label className="field">
                      Precio {s} (MXN)
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={editProduct.prices[n] / 100}
                        onChange={(e) =>
                          setEditProduct({
                            ...editProduct,
                            prices: editProduct.prices.map((v, i) =>
                              i === n ? Math.round(Number(e.target.value) * 100) : v,
                            ),
                          })
                        }
                      />
                    </label>
                    <p>Receta · {s}</p>
                    <RecipeEditor
                      value={editProduct.recipes?.[n] ?? []}
                      ingredients={store.ingredients}
                      onChange={(r) =>
                        setEditProduct({
                          ...editProduct,
                          recipes: (editProduct.recipes ?? [[], [], []]).map((v, i) =>
                            i === n ? r : v,
                          ),
                        })
                      }
                    />
                  </section>
                ))}
                <div className="wide inline-fields">
                  <button className="button" disabled={busy}>
                    Guardar producto
                  </button>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => setEditProduct(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
            <section className="panel">
              <div className="panel-heading">
                <h2>Extras y modificadores</h2>
                <button
                  className="small-button"
                  onClick={() => setEditModifier({ id: '', name: '', price: 0, recipe: [] })}
                >
                  <Plus size={15} />
                  Nuevo extra
                </button>
              </div>
              <p className="muted">
                Cada extra agrega su precio y consume su receta. Para sustituir leche, configura una
                variante de producto con la receta correspondiente.
              </p>
              {store.modifiers.map((m) => (
                <p key={m.id}>
                  {m.name} · {money(m.price)} · {m.active === false ? 'Oculto' : 'Disponible'}{' '}
                  <button
                    className="small-button"
                    onClick={() => setEditModifier(structuredClone(m))}
                  >
                    Editar
                  </button>
                </p>
              ))}
              {editModifier && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save({ action: 'modifier', modifier: editModifier }, () =>
                      setEditModifier(null),
                    );
                  }}
                >
                  <div className="inline-fields">
                    <label className="field">
                      Nombre del extra
                      <input
                        required
                        value={editModifier.name}
                        onChange={(e) => setEditModifier({ ...editModifier, name: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      Precio extra (MXN)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={editModifier.price / 100}
                        onChange={(e) =>
                          setEditModifier({
                            ...editModifier,
                            price: Math.round(Number(e.target.value) * 100),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={editModifier.active !== false}
                      onChange={(e) =>
                        setEditModifier({ ...editModifier, active: e.target.checked })
                      }
                    />
                    Extra disponible en la web y en caja
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={!editModifier.productIds}
                      onChange={(e) =>
                        setEditModifier({
                          ...editModifier,
                          productIds: e.target.checked ? null : [],
                        })
                      }
                    />
                    Aplicar a todas las bebidas
                  </label>
                  {editModifier.productIds && (
                    <fieldset>
                      <legend>Bebidas que aceptan este extra</legend>
                      {store.products.map((p) => (
                        <label className="check-field" key={p.id}>
                          <input
                            type="checkbox"
                            checked={editModifier.productIds!.includes(p.id)}
                            onChange={(e) =>
                              setEditModifier({
                                ...editModifier,
                                productIds: e.target.checked
                                  ? [...editModifier.productIds!, p.id]
                                  : editModifier.productIds!.filter((id) => id !== p.id),
                              })
                            }
                          />
                          {p.name}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <RecipeEditor
                    value={editModifier.recipe}
                    ingredients={store.ingredients}
                    onChange={(recipe) => setEditModifier({ ...editModifier, recipe })}
                  />
                  <div className="inline-fields" style={{ marginTop: 20 }}>
                    <button className="button" disabled={busy}>
                      Guardar extra
                    </button>
                    <button
                      className="small-button"
                      type="button"
                      onClick={() => setEditModifier(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </section>
          </>
        )}
        {tab === 'Insumos' && (
          <>
            <section className="panel">
              <div className="panel-heading">
                <h2>Lo que hay en tu barra</h2>
                <button
                  className="button"
                  onClick={() => setEditIngredient({ ...blankIngredient })}
                >
                  <Plus size={15} />
                  Nuevo insumo
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Insumo</th>
                      <th>Existencias</th>
                      <th>Mínimo</th>
                      <th>Costo por unidad</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {store.ingredients.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <strong>{i.name}</strong>
                        </td>
                        <td>
                          {i.stock} {i.unit} {i.stock <= i.minimum ? '· Bajo' : ''}
                        </td>
                        <td>
                          {i.minimum} {i.unit}
                        </td>
                        <td>
                          ${(i.costPerUnit / 100).toFixed(4)} / {i.unit}
                        </td>
                        <td>
                          <button
                            className="small-button"
                            onClick={() => setEditIngredient({ ...i })}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!store.ingredients.length && (
                <p className="notice">
                  No hay insumos registrados. Agrega el primero para construir tus recetas.
                </p>
              )}
            </section>
            {editIngredient && (
              <form
                className="panel admin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  save({ action: 'ingredient', ingredient: editIngredient }, () =>
                    setEditIngredient(null),
                  );
                }}
              >
                <h2 className="wide">{editIngredient.id ? 'Editar insumo' : 'Nuevo insumo'}</h2>
                <label className="field">
                  Nombre
                  <input
                    required
                    value={editIngredient.name}
                    onChange={(e) => setEditIngredient({ ...editIngredient, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Unidad
                  <select
                    value={editIngredient.unit}
                    onChange={(e) =>
                      setEditIngredient({
                        ...editIngredient,
                        unit: e.target.value as Ingredient['unit'],
                      })
                    }
                  >
                    <option value="g">Gramos</option>
                    <option value="ml">Mililitros</option>
                    <option value="pieza">Piezas</option>
                  </select>
                </label>
                <label className="field">
                  Mínimo para alerta
                  <input
                    required
                    type="number"
                    min="0"
                    step={editIngredient.unit === 'pieza' ? '1' : '0.001'}
                    value={editIngredient.minimum}
                    onChange={(e) =>
                      setEditIngredient({ ...editIngredient, minimum: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="field">
                  Costo por {editIngredient.unit} (MXN)
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.0001"
                    value={editIngredient.costPerUnit / 100}
                    onChange={(e) =>
                      setEditIngredient({
                        ...editIngredient,
                        costPerUnit: Number(e.target.value) * 100,
                      })
                    }
                  />
                </label>
                <p className="muted wide">
                  Ejemplo: 1 litro de leche cuesta $30; registra $0.03 por ml. Las existencias se
                  agregan mediante un movimiento.
                </p>
                <div className="inline-fields wide">
                  <button className="button" disabled={busy}>
                    Guardar insumo
                  </button>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => setEditIngredient(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
            <form
              className="panel"
              onSubmit={(e) => {
                e.preventDefault();
                save(
                  {
                    action: 'stock',
                    productId: stockId,
                    quantity: Number(stockQuantity),
                    reason: stockReason,
                  },
                  () => {
                    setStockQuantity('');
                    setStockReason('');
                  },
                );
              }}
            >
              <h2>Entrada o ajuste de inventario</h2>
              <div className="admin-form">
                <label className="field">
                  Insumo
                  <select required value={stockId} onChange={(e) => setStockId(e.target.value)}>
                    <option value="">Seleccionar insumo</option>
                    {store.ingredients.map((i) => (
                      <option value={i.id} key={i.id}>
                        {i.name} ({i.unit})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Cantidad (+ entrada / − salida)
                  <input
                    required
                    type="number"
                    step={
                      store.ingredients.find((i) => i.id === stockId)?.unit === 'pieza'
                        ? '1'
                        : '0.001'
                    }
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                  />
                </label>
                <label className="field wide">
                  Motivo o proveedor
                  <input
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="Compra de leche · proveedor…"
                    value={stockReason}
                    onChange={(e) => setStockReason(e.target.value)}
                  />
                </label>
              </div>
              <button className="button" disabled={busy || !store.ingredients.length}>
                Registrar movimiento
              </button>
            </form>
            <section className="panel">
              <h2>Historial de movimientos</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Insumo</th>
                      <th>Cantidad</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.movements.slice(0, 100).map((m) => (
                      <tr key={m.id}>
                        <td>{date(m.date)}</td>
                        <td>{store.ingredients.find((i) => i.id === m.productId)?.name}</td>
                        <td>
                          {m.quantity > 0 ? '+' : ''}
                          {m.quantity}
                        </td>
                        <td>{m.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!store.movements.length && (
                <p className="notice">
                  Los movimientos aparecerán al registrar existencias o ventas.
                </p>
              )}
            </section>
          </>
        )}
        {tab === 'Caja y cortes' && (
          <>
            <section className="panel">
              <h2>{session ? 'Cerrar turno' : 'Abrir caja'}</h2>
              {session ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save({ action: 'close', counted: Math.round(Number(counted) * 100) }, () =>
                      setCounted(''),
                    );
                  }}
                >
                  <p>
                    Fondo inicial: <strong>{money(session.opening)}</strong>
                  </p>
                  <p>
                    Efectivo esperado: <strong>{money(expectedCash(store, session))}</strong>
                  </p>
                  <p className="muted">
                    Tarjetas y transferencias se registran aparte y no aumentan el efectivo de caja.
                  </p>
                  <label className="field">
                    Efectivo contado físicamente (MXN)
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                    />
                  </label>
                  <p>
                    Diferencia:{' '}
                    {money(Math.round(Number(counted) * 100) - expectedCash(store, session))}
                  </p>
                  <button className="button" disabled={busy || counted === ''}>
                    Confirmar corte y cerrar caja
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save({ action: 'open', opening: Math.round(Number(opening) * 100) }, () =>
                      setOpening(''),
                    );
                  }}
                >
                  <label className="field">
                    Fondo inicial en efectivo (MXN)
                    <input
                      required
                      min="0"
                      step="0.01"
                      type="number"
                      value={opening}
                      onChange={(e) => setOpening(e.target.value)}
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    Abrir turno
                  </button>
                </form>
              )}
            </section>
            <section className="panel">
              <h2>Historial de cortes</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Apertura</th>
                      <th>Cierre</th>
                      <th>Esperado</th>
                      <th>Contado</th>
                      <th>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.cash
                      .filter((c) => c.closedAt)
                      .map((c) => (
                        <tr key={c.id}>
                          <td>{date(c.openedAt)}</td>
                          <td>{date(c.closedAt!)}</td>
                          <td>{money(c.expected ?? 0)}</td>
                          <td>{money(c.counted ?? 0)}</td>
                          <td>{money((c.counted ?? 0) - (c.expected ?? 0))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        {tab === 'Ventas' && (
          <>
            <section className="panel">
              <div className="panel-heading">
                <h2>Tickets registrados</h2>
                <button
                  className="small-button"
                  onClick={() =>
                    download(`ventas-${today}.json`, JSON.stringify(store.sales, null, 2))
                  }
                >
                  <Download size={14} />
                  Exportar ventas
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Orden</th>
                      <th>Fecha</th>
                      <th>Pago</th>
                      <th>Descuento</th>
                      <th>Total original</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {store.sales.map((s) => (
                      <tr key={s.id}>
                        <td>#{String(s.number).padStart(3, '0')}</td>
                        <td>{date(s.date)}</td>
                        <td>{s.payment}</td>
                        <td>{money(s.discount)}</td>
                        <td>{money(s.total)}</td>
                        <td>{s.refund ? 'Devuelta' : 'Registrada'}</td>
                        <td>
                          <button className="small-button" onClick={() => setReceipt(s)}>
                            Ver ticket
                          </button>
                          {!s.refund && (
                            <button
                              className="small-button"
                              disabled={!session || busy}
                              onClick={() => setCorrectionId(s.id)}
                            >
                              Corregir venta
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!store.sales.length && (
                <p className="notice">
                  Aún no hay ventas. Los tickets aparecerán después del primer cobro.
                </p>
              )}
            </section>
            {!session && (
              <p className="notice">
                Abre caja para registrar devoluciones. Los cortes cerrados se conservan.
              </p>
            )}
            {correction && (
              <SaleCorrection
                key={correction.id}
                sale={correction}
                busy={busy}
                onCancel={() => setCorrectionId(null)}
                onConfirm={async (reason, restock) => {
                  const result = await request({
                    action: 'refund',
                    saleId: correction.id,
                    reason,
                    restock,
                  });
                  if (result) {
                    setReceipt(result);
                    setCorrectionId(null);
                    setMessage('Corrección registrada en la caja abierta.');
                    try {
                      await refresh();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'No se pudo actualizar.');
                    }
                  }
                }}
              />
            )}
            {receiptView}
          </>
        )}
        {tab === 'Barra' && (
          <>
            <p className="muted">
              Comandas pagadas · Se actualiza cada 5 segundos mientras esta pantalla está abierta.
            </p>
            <div className="kds-grid">
              {store.sales
                .filter((s) => !s.refund && s.status !== 'Entregado')
                .slice()
                .reverse()
                .map((s) => (
                  <article className="kds-ticket" key={s.id}>
                    <header>
                      <strong>
                        #{String(s.number).padStart(3, '0')} {s.customer}
                      </strong>
                      <span className="status-chip">{s.status}</span>
                    </header>
                    <section>
                      <small>{date(s.date)}</small>
                      {s.items.map((i, n) => (
                        <p key={n}>
                          <strong>{i.quantity} ×</strong> {i.name}
                          <br />
                          <small>{i.size}</small>
                        </p>
                      ))}
                      <button
                        className="button full"
                        disabled={busy}
                        onClick={() =>
                          save({
                            action: 'status',
                            id: s.id,
                            status:
                              s.status === 'Pendiente'
                                ? 'Preparando'
                                : s.status === 'Preparando'
                                  ? 'Listo'
                                  : 'Entregado',
                          })
                        }
                      >
                        {s.status === 'Pendiente'
                          ? 'Comenzar preparación'
                          : s.status === 'Preparando'
                            ? 'Marcar listo'
                            : 'Confirmar entrega'}
                      </button>
                    </section>
                  </article>
                ))}
            </div>
            {!store.sales.some((s) => !s.refund && s.status !== 'Entregado') && (
              <p className="notice">La barra está al día. Las nuevas ventas aparecerán aquí.</p>
            )}
          </>
        )}
        {tab === 'Configuración' && (
          <>
            <form
              className="panel admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                save({ action: 'settings', settings: store.settings });
              }}
            >
              <h2 className="wide">Datos del negocio</h2>
              {store.settings.phones.map((p, i) => (
                <label className="field" key={i}>
                  WhatsApp {i + 1} (52 + diez dígitos)
                  <input
                    required
                    pattern="52[0-9]{10}"
                    value={p}
                    onChange={(e) =>
                      setStore({
                        ...store,
                        settings: {
                          ...store.settings,
                          phones: store.settings.phones.map((v, n) =>
                            n === i ? e.target.value : v,
                          ),
                        },
                      })
                    }
                  />
                </label>
              ))}
              <label className="field wide">
                Dirección
                <textarea
                  value={store.settings.address}
                  onChange={(e) =>
                    setStore({ ...store, settings: { ...store.settings, address: e.target.value } })
                  }
                />
              </label>
              <label className="field wide">
                Horarios
                <input
                  value={store.settings.hours}
                  onChange={(e) =>
                    setStore({ ...store, settings: { ...store.settings, hours: e.target.value } })
                  }
                />
              </label>
              <label className="check-field wide">
                <input
                  type="checkbox"
                  checked={store.settings.sample}
                  onChange={(e) =>
                    setStore({
                      ...store,
                      settings: { ...store.settings, sample: e.target.checked },
                    })
                  }
                />
                Mostrar aviso de catálogo de muestra
              </label>
              <div className="wide">
                <button className="button" disabled={busy}>
                  Guardar configuración
                </button>
              </div>
            </form>
            <section className="panel">
              <h2>Respaldo del negocio</h2>
              <p className="muted">
                Descarga tus productos, recetas, insumos, ventas y cortes. Guarda el archivo en un
                lugar seguro. No incluye contraseñas.
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  download(`lattecito-respaldo-${today}.json`, JSON.stringify(store, null, 2))
                }
              >
                <Download size={16} />
                Exportar respaldo
              </button>
            </section>
            <button
              className="small-button"
              onClick={async () => {
                if (await request({ action: 'logout' })) {
                  setSigned(false);
                  setStore(null);
                }
              }}
            >
              <LogOut size={15} />
              Cerrar sesión
            </button>
          </>
        )}
      </main>
      <dialog ref={chooser} onCancel={() => setChosen(null)} className="product-dialog">
        {chosen && (
          <>
            <button
              className="icon-button dialog-close"
              aria-label="Cerrar selección"
              onClick={() => setChosen(null)}
            >
              <X />
            </button>
            <div className={`product-dialog-art product-visual ${chosen.tone}`} />
            <div className="product-form">
              <span className="eyebrow">AGREGAR A LA VENTA</span>
              <h2>{chosen.name}</h2>
              <fieldset>
                <legend>Tamaño</legend>
                <div className="size-options">
                  {sizes.map((s, n) => (
                    <button
                      key={s}
                      className={size === n ? 'selected' : ''}
                      onClick={() => setSize(n)}
                    >
                      {s}
                      <strong>{money(chosen.prices[n])}</strong>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Extras</legend>
                {availableModifiers(chosen.id, store.modifiers).length ? (
                  availableModifiers(chosen.id, store.modifiers).map((m) => (
                    <label className="check-field" key={m.id}>
                      <input
                        type="checkbox"
                        checked={extras.includes(m.id)}
                        onChange={(e) =>
                          setExtras(
                            e.target.checked
                              ? [...extras, m.id]
                              : extras.filter((id) => id !== m.id),
                          )
                        }
                      />
                      {m.name} + {money(m.price)}
                    </label>
                  ))
                ) : (
                  <small>Los extras se configuran en Productos.</small>
                )}
              </fieldset>
              <button className="button full" onClick={addChosen}>
                Agregar a la venta <Plus size={18} />
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
