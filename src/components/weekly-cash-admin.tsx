'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { money } from '@/lib/model';
import type { WeeklyCashExpense, WeeklyCashSummary } from '@/lib/weekly-cash';

type Dashboard = { weeklyCash: WeeklyCashSummary };

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
  });
}

export default function WeeklyCashAdmin() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState<WeeklyCashExpense | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    try {
      const response = await fetch('/api/catalog-admin/sales', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No fue posible cargar la caja semanal.');
      setData(result);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar la caja semanal.');
    } finally {
      if (!silent) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 5_000);
    return () => window.clearInterval(interval);
  }, [load]);

  function clearForm() {
    setName('');
    setQuantity('');
    setAmount('');
    setEditing(null);
  }

  async function command(body: object) {
    const response = await fetch('/api/catalog-admin/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'No fue posible guardar el gasto.');
    return result;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = quantity.trim() ? Number(quantity) : null;
    const total = Math.round(Number(amount) * 100);
    if (name.trim().length < 2) return setError('Escribe el nombre del insumo.');
    if (parsedQuantity !== null && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0))
      return setError('La cantidad debe ser mayor que cero o quedar vacía.');
    if (!Number.isInteger(total) || total < 1)
      return setError('Escribe el precio total del gasto.');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await command({
        action: 'save-weekly-expense',
        id: editing?.id ?? crypto.randomUUID(),
        name: name.trim(),
        quantity: parsedQuantity,
        total,
      });
      setNotice(editing ? 'Gasto semanal actualizado.' : 'Gasto descontado de la caja semanal.');
      clearForm();
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el gasto.');
    } finally {
      setBusy(false);
    }
  }

  function edit(expense: WeeklyCashExpense) {
    setEditing(expense);
    setName(expense.name);
    setQuantity(expense.quantity === null ? '' : String(expense.quantity));
    setAmount(String(expense.total / 100));
    setNotice('');
  }

  async function remove(expense: WeeklyCashExpense) {
    if (!window.confirm(`¿Eliminar ${expense.name} por ${money(expense.total)}?`)) return;
    setBusy(true);
    setError('');
    try {
      await command({ action: 'delete-weekly-expense', expenseId: expense.id });
      if (editing?.id === expense.id) clearForm();
      setNotice('Gasto semanal eliminado.');
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible eliminar el gasto.');
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <section className="panel weekly-cash-panel">{error || 'Cargando caja semanal…'}</section>
    );

  const cash = data.weeklyCash;
  return (
    <div className="weekly-cash-stack">
      {error && <p className="notice error">{error}</p>}
      {notice && <p className="notice success">{notice}</p>}

      <section className="panel weekly-cash-hero">
        <div>
          <span className="eyebrow">CUADRE SEMANAL</span>
          <h2>Caja total</h2>
          <p>
            Del {dateLabel(cash.weekStart)} al {dateLabel(cash.weekEnd)}. Las ventas cobradas se
            acumulan automáticamente de lunes a domingo.
          </p>
        </div>
        <CalendarDays aria-hidden="true" size={34} />
      </section>

      <section className="summary-grid weekly-cash-metrics">
        <article className="metric-card">
          <span>VENTAS SEMANALES</span>
          <strong>{money(cash.salesTotal)}</strong>
          <small>{cash.tickets} tickets cobrados</small>
        </article>
        <article className="metric-card">
          <span>INSUMOS TOTALES</span>
          <strong>− {money(cash.expensesTotal)}</strong>
          <small>diarios y generales</small>
        </article>
        <article className="metric-card weekly-balance-card">
          <span>SALDO FINAL ESPERADO</span>
          <strong>{money(cash.expectedBalance)}</strong>
          <small>ventas semanales menos insumos</small>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LUNES A DOMINGO</span>
            <h2>Ventas por día</h2>
          </div>
        </div>
        <div className="responsive-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Día</th>
                <th>Tickets</th>
                <th>Efectivo</th>
                <th>Transferencia</th>
                <th>Venta cobrada</th>
              </tr>
            </thead>
            <tbody>
              {cash.days.map((day) => (
                <tr key={day.date}>
                  <td data-label="Día">
                    <b>{day.label}</b>
                    <small>{dateLabel(day.date)}</small>
                  </td>
                  <td data-label="Tickets">{day.tickets}</td>
                  <td data-label="Efectivo">{money(day.cash)}</td>
                  <td data-label="Transferencia">{money(day.transfers)}</td>
                  <td data-label="Venta cobrada">
                    <b>{money(day.total)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel weekly-expense-layout">
        <form className="weekly-expense-form" onSubmit={save}>
          <span className="eyebrow">DESCUENTO GLOBAL</span>
          <h2>{editing ? 'Editar gasto semanal' : 'Restar insumo de la semana'}</h2>
          <p>Úsalo para compras que deban descontarse de la caja total semanal.</p>
          <label>
            Nombre del insumo
            <input
              maxLength={100}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Matcha"
            />
          </label>
          <label>
            Cantidad (opcional)
            <input
              min="0.001"
              step="0.001"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Ej. 1"
            />
          </label>
          <label>
            Precio total
            <input
              min="0.01"
              step="0.01"
              type="number"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Ej. 500"
            />
          </label>
          <div className="inline-fields">
            <button className="button" disabled={busy} type="submit">
              <Plus size={17} /> {editing ? 'Guardar cambio' : 'Registrar gasto'}
            </button>
            {editing && (
              <button className="small-button" type="button" onClick={clearForm}>
                Cancelar
              </button>
            )}
          </div>
        </form>
        <div className="weekly-formula-card">
          <span>VENTAS DE LA SEMANA</span>
          <strong>{money(cash.salesTotal)}</strong>
          <span>GASTOS REGISTRADOS POR DÍA</span>
          <strong>− {money(cash.dailyExpensesTotal)}</strong>
          <span>GASTOS GENERALES DE CAJA TOTAL</span>
          <strong>− {money(cash.weeklyExpensesTotal)}</strong>
          <hr />
          <span>SALDO FINAL ESPERADO</span>
          <b>{money(cash.expectedBalance)}</b>
          <small>
            Transferencias pendientes: {money(cash.pendingTotal)}. Se suman cuando se confirman.
          </small>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MOVIMIENTOS GLOBALES</span>
            <h2>Insumos descontados en Caja total</h2>
          </div>
        </div>
        <div className="responsive-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Cantidad</th>
                <th>Registro</th>
                <th>Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cash.expenses.map((expense) => (
                <tr key={expense.id}>
                  <td data-label="Insumo">
                    <b>{expense.name}</b>
                  </td>
                  <td data-label="Cantidad">{expense.quantity ?? '—'}</td>
                  <td data-label="Registro">
                    {new Date(expense.date).toLocaleString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td data-label="Total">
                    <b>− {money(expense.total)}</b>
                  </td>
                  <td data-label="Acciones">
                    <div className="table-actions">
                      <button onClick={() => edit(expense)}>
                        <Pencil size={15} /> Editar
                      </button>
                      <button className="danger-action" onClick={() => void remove(expense)}>
                        <Trash2 size={15} /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!cash.expenses.length && (
                <tr>
                  <td className="empty-table" colSpan={5}>
                    Todavía no hay gastos generales en esta semana.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
