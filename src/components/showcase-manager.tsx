'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, QrCode, ShieldOff } from 'lucide-react';
import type { ShowcaseLinkStatus } from '@/lib/showcase';

type Created = { link: ShowcaseLinkStatus; url: string; qrDataUrl: string };

export default function ShowcaseManager() {
  const [links, setLinks] = useState<ShowcaseLinkStatus[]>([]);
  const [durationDays, setDurationDays] = useState(90);
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/catalog-admin/showcase', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'No fue posible cargar los enlaces.');
    setLinks(body.links);
  }, []);
  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar los enlaces.'),
    );
  }, [load]);

  async function create() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/catalog-admin/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationDays }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'No fue posible crear el acceso.');
      setCreated(body);
      setNotice('QR creado. El enlace anterior quedó cerrado automáticamente.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible crear el acceso.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/catalog-admin/showcase', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'No fue posible cerrar el acceso.');
      setCreated(null);
      setNotice('Acceso de lectura cerrado.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cerrar el acceso.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.url);
    setNotice('Enlace copiado.');
  }
  function download() {
    if (!created) return;
    const link = document.createElement('a');
    link.href = created.qrDataUrl;
    link.download = 'lattecito-modo-lectura-qr.png';
    link.click();
  }
  const active = links.find((link) => link.active);

  return (
    <div className="showcase-manager-stack">
      {error && <p className="notice error">{error}</p>}
      {notice && <p className="notice success">{notice}</p>}
      <section className="panel showcase-manager-intro">
        <div>
          <span className="eyebrow">COMPARTIR · SOLO LECTURA</span>
          <h2>Presenta el negocio sin abrir la administración</h2>
          <p>
            El código QR muestra ventas agregadas, costos, utilidad, inventario e índices. No expone
            clientes, notas, contraseñas ni botones de edición.
          </p>
        </div>
        <QrCode size={62} />
      </section>
      <section className="panel showcase-builder">
        <div className="showcase-builder-form">
          <label>
            Vigencia del acceso
            <select
              value={durationDays}
              onChange={(event) => setDurationDays(Number(event.target.value))}
            >
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
              <option value={60}>60 días</option>
              <option value={90}>90 días</option>
              <option value={180}>180 días</option>
            </select>
          </label>
          <button className="button" disabled={busy} onClick={() => void create()}>
            <QrCode size={17} /> {busy ? 'Preparando…' : 'Generar nuevo QR'}
          </button>
          <small>Solo puede existir un acceso activo. Crear uno nuevo cierra el anterior.</small>
        </div>
        {created ? (
          <div className="showcase-qr-result">
            <img alt="Código QR para el modo de lectura" src={created.qrDataUrl} />
            <div>
              <strong>QR listo para compartir</strong>
              <p>Vence {new Date(created.link.expiresAt).toLocaleString('es-MX')}</p>
              <code>{created.url}</code>
              <div className="inline-fields">
                <button className="small-button" onClick={() => void copy()}>
                  <Copy size={15} /> Copiar
                </button>
                <button className="small-button" onClick={download}>
                  <Download size={15} /> Descargar
                </button>
                <a className="small-button" href={created.url} rel="noreferrer" target="_blank">
                  <ExternalLink size={15} /> Abrir
                </a>
              </div>
            </div>
          </div>
        ) : (
          <p className="showcase-secret-note">
            Por seguridad, el enlace completo solo se muestra al generarlo. Si cerraste esta
            pantalla, crea uno nuevo.
          </p>
        )}
      </section>
      <section className="panel">
        <span className="eyebrow">ESTADO DEL ACCESO</span>
        <h2>{active ? 'Hay un QR activo' : 'No hay accesos activos'}</h2>
        {active && (
          <div className="showcase-active-link">
            <div>
              <strong>Creado por {active.createdBy}</strong>
              <span>Vence {new Date(active.expiresAt).toLocaleString('es-MX')}</span>
              <small>
                {active.viewCount} visitas ·{' '}
                {active.lastViewedAt
                  ? `Última ${new Date(active.lastViewedAt).toLocaleString('es-MX')}`
                  : 'Aún no se ha abierto'}
              </small>
            </div>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void revoke(active.id)}
            >
              <ShieldOff size={16} /> Cerrar acceso
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
