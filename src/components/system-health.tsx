'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Database, RefreshCw, Server, ShieldCheck } from 'lucide-react';

type Health = {
  status: string;
  latencyMs: number;
  checkedAt: string;
  catalogVersion: number;
  catalogUpdatedAt: string;
  salesToday: number;
  inventoryItems: number;
  recipes: number;
  productCosts: number;
  activeShowcaseLinks: number;
};

export default function SystemHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [browserLatency, setBrowserLatency] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const started = performance.now();
    try {
      const response = await fetch('/api/catalog-admin/health', { cache: 'no-store' });
      const body = await response.json();
      setBrowserLatency(Math.round(performance.now() - started));
      if (!response.ok) throw new Error(body.error ?? 'No fue posible revisar el sistema.');
      setHealth(body);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible revisar el sistema.');
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [load]);
  return (
    <section className="panel system-health">
      <div className="section-heading">
        <div>
          <span className="eyebrow">TELEMETRÍA PRIVADA</span>
          <h2>Salud del sistema</h2>
        </div>
        <button className="small-button" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={15} /> Revisar
        </button>
      </div>
      <p>
        Diagnóstico técnico visible únicamente para administradores autenticados. Se actualiza cada
        30 segundos.
      </p>
      {error && <p className="notice error">{error}</p>}
      {health && (
        <>
          <div className="health-grid">
            <HealthItem
              icon={<Database />}
              label="Base de datos"
              value={health.status}
              detail={`${health.latencyMs} ms en servidor`}
              good={health.status === 'Saludable'}
            />
            <HealthItem
              icon={<Server />}
              label="Respuesta completa"
              value={`${browserLatency} ms`}
              detail="Navegador → servidor → base"
              good={browserLatency < 2500}
            />
            <HealthItem
              icon={<Activity />}
              label="Ventas de hoy"
              value={String(health.salesToday)}
              detail={`Catálogo v${health.catalogVersion}`}
              good
            />
            <HealthItem
              icon={<ShieldCheck />}
              label="Accesos públicos"
              value={String(health.activeShowcaseLinks)}
              detail="enlaces temporales activos"
              good={health.activeShowcaseLinks <= 1}
            />
          </div>
          <div className="health-facts">
            <span>{health.inventoryItems} insumos</span>
            <span>{health.recipes} recetas</span>
            <span>{health.productCosts} costos directos</span>
            <span>Última revisión {new Date(health.checkedAt).toLocaleTimeString('es-MX')}</span>
          </div>
        </>
      )}
    </section>
  );
}
function HealthItem({
  icon,
  label,
  value,
  detail,
  good,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  good: boolean;
}) {
  return (
    <article className={good ? 'healthy' : 'slow'}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
