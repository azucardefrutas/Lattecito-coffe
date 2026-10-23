'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Calculator, ChartNoAxesCombined, CircleAlert, QrCode } from 'lucide-react';
import type { PublicCatalog } from '@/lib/catalog-schema';
import type { DailySalesBreakdown } from '@/lib/sales-summary';
import { money } from '@/lib/model';
import { buildProfitMetrics, percent } from '@/lib/business-analytics';

type Dashboard = {
  catalog: PublicCatalog;
  daily: DailySalesBreakdown;
  history: Array<{ date: string; tickets: number; total: number; cost: number; expenses: number }>;
  inventory: {
    summary: {
      itemCount: number;
      configuredRecipes: number;
      lowStockCount: number;
      inventoryValue: number;
    };
  };
  weeklyCash: {
    days: Array<{ date: string; tickets: number; sales: number; dailyExpenses: number }>;
    weeklyExpenses: number;
    sales: number;
  };
  summary: {
    total: number;
    tickets: number;
    expenses: number;
    grossProfit: number;
    missingCostCount: number;
  };
};

export default function FinanceDashboard({
  onOpenInventory,
  onOpenSales,
  onOpenShowcase,
}: {
  onOpenInventory: () => void;
  onOpenSales: () => void;
  onOpenShowcase: () => void;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/catalog-admin/sales', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'No fue posible cargar el resumen.');
      setData(body);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar el resumen.');
    }
  }, []);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const metrics = useMemo(
    () => (data ? buildProfitMetrics(data.history.map((day) => ({ ...day }))) : null),
    [data],
  );
  if (!data || !metrics)
    return (
      <section className="panel">
        <p>{error || 'Preparando el resumen financiero…'}</p>
      </section>
    );
  const reliable =
    data.summary.missingCostCount === 0 && data.inventory.summary.configuredRecipes > 0;
  const max = Math.max(1, ...data.weeklyCash.days.map((day) => day.sales));
  const top = [...data.daily.products].sort((a, b) => b.amount - a.amount)[0];
  return (
    <div className="finance-dashboard">
      {error && <p className="notice error">{error}</p>}
      <section className="finance-lead">
        <div>
          <span className="eyebrow">PULSO DEL NEGOCIO</span>
          <h2>De cada venta al margen real.</h2>
          <p>Ventas, recetas, costos e insumos conectados en una sola lectura.</p>
        </div>
        <button className="button" onClick={onOpenShowcase}>
          <QrCode size={17} /> Compartir informe
        </button>
      </section>
      {!reliable && (
        <section className="cost-coverage-alert">
          <CircleAlert />
          <div>
            <strong>Completa los costos para calcular márgenes confiables</strong>
            <p>
              Faltan costos directos o recetas en {data.summary.missingCostCount} producto(s).
              Captura leche, matcha, café y sus cantidades por receta.
            </p>
            <button onClick={onOpenInventory}>
              Configurar costos <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}
      <section className="finance-equation">
        <div>
          <span>Venta del periodo</span>
          <strong>{money(metrics.sales)}</strong>
        </div>
        <b>−</b>
        <div>
          <span>Inversión registrada</span>
          <strong>{reliable ? money(metrics.investment) : 'Pendiente'}</strong>
        </div>
        <b>=</b>
        <div className="result">
          <span>Utilidad neta</span>
          <strong>{reliable ? money(metrics.netProfit) : 'Pendiente'}</strong>
        </div>
      </section>
      <section className="finance-kpis">
        <article>
          <span>VENTAS HOY</span>
          <strong>{money(data.summary.total)}</strong>
          <small>{data.summary.tickets} tickets</small>
        </article>
        <article>
          <span>MARGEN NETO</span>
          <strong>{reliable ? percent(metrics.netMargin) : 'Pendiente'}</strong>
          <small>Utilidad ÷ ventas</small>
        </article>
        <article>
          <span>TICKET PROMEDIO</span>
          <strong>{money(metrics.averageTicket)}</strong>
          <small>{metrics.tickets} tickets en el periodo</small>
        </article>
        <article>
          <span>VALOR DE INVENTARIO</span>
          <strong>{money(data.inventory.summary.inventoryValue)}</strong>
          <small>{data.inventory.summary.itemCount} insumos</small>
        </article>
      </section>
      <div className="finance-layout">
        <section className="panel finance-week">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SEMANA ACTUAL</span>
              <h2>Ventas por día</h2>
            </div>
            <ChartNoAxesCombined />
          </div>
          <div className="week-bars">
            {data.weeklyCash.days.map((day) => (
              <div key={day.date}>
                <strong>{day.sales ? money(day.sales) : '—'}</strong>
                <span>
                  <i
                    style={{ height: `${Math.max(day.sales ? 8 : 0, (day.sales / max) * 100)}%` }}
                  />
                </span>
                <small>
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString('es-MX', {
                    weekday: 'short',
                  })}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel finance-focus">
          <span className="eyebrow">LECTURA DE HOY</span>
          <h2>{top ? top.name : 'Sin ventas todavía'}</h2>
          <p>
            {top
              ? `${top.quantity} unidades · ${money(top.amount)} cobrados`
              : 'El producto líder aparecerá cuando registres la primera venta.'}
          </p>
          <dl>
            <div>
              <dt>Recetas configuradas</dt>
              <dd>{data.inventory.summary.configuredRecipes}</dd>
            </div>
            <div>
              <dt>Necesitan compra</dt>
              <dd>{data.inventory.summary.lowStockCount}</dd>
            </div>
            <div>
              <dt>Gastos de hoy</dt>
              <dd>{money(data.summary.expenses)}</dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="panel finance-actions">
        <div>
          <Calculator />
          <span>
            <strong>La fórmula necesita datos reales</strong>
            <small>Costo por ml o gramo × cantidad usada en la receta.</small>
          </span>
        </div>
        <div className="inline-fields">
          <button className="small-button" onClick={onOpenSales}>
            Abrir caja
          </button>
          <button className="small-button" onClick={onOpenInventory}>
            Configurar insumos
          </button>
        </div>
      </section>
    </div>
  );
}
