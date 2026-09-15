'use client';
import { useState } from 'react';
import { money, type Sale } from '@/lib/model';

export default function SaleCorrection({
  sale,
  busy,
  onCancel,
  onConfirm,
}: {
  sale: Sale;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, restock: boolean) => Promise<void>;
}) {
  const [reason, setReason] = useState(''),
    [restock, setRestock] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  return (
    <section className="panel correction-panel" aria-labelledby="correction-heading">
      <span className="eyebrow">CORRECCIÓN CON HISTORIAL</span>
      <h2 id="correction-heading">Devolución del ticket #{String(sale.number).padStart(3, '0')}</h2>
      <p>
        Importe completo: <strong>{money(sale.total)}</strong> · {sale.payment}
      </p>
      <p className="muted">
        Se conservará el ticket original. La devolución quedará en el turno abierto y la comanda
        saldrá de barra.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (confirmed) await onConfirm(reason, restock);
        }}
      >
        <label className="field">
          Motivo de la corrección
          <textarea
            autoFocus
            required
            minLength={5}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Pedido duplicado, producto equivocado…"
          />
        </label>
        <fieldset>
          <legend>¿Qué pasó con los insumos?</legend>
          <label className="check-field">
            <input
              type="radio"
              name="restock"
              checked={!restock}
              onChange={() => setRestock(false)}
            />
            Ya se utilizaron: conservar el consumo como merma.
          </label>
          <label className="check-field">
            <input
              type="radio"
              name="restock"
              checked={restock}
              onChange={() => setRestock(true)}
            />
            No se utilizaron: reponer las cantidades originales.
          </label>
        </fieldset>
        <label className="check-field">
          <input
            required
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Confirmé la devolución de {money(sale.total)} por {sale.payment.toLowerCase()}.
        </label>
        <p className="muted">
          Este registro no envía dinero ni se comunica con una terminal de pago. Para cambiar
          productos o método de pago, registra después una venta nueva.
        </p>
        <div className="inline-fields">
          <button className="button" disabled={busy || !confirmed || reason.trim().length < 5}>
            {busy ? 'Guardando corrección…' : 'Registrar devolución completa'}
          </button>
          <button className="small-button" type="button" disabled={busy} onClick={onCancel}>
            Conservar venta
          </button>
        </div>
      </form>
    </section>
  );
}
