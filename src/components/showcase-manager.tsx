'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock3, Copy, Download, ExternalLink, Link2, QrCode, ShieldOff } from 'lucide-react';
import type { ShowcaseLinkStatus, ShowcaseStaticAccessStatus } from '@/lib/showcase';

type Created = { link: ShowcaseLinkStatus; url: string; qrDataUrl: string };
type Fixed = { access: ShowcaseStaticAccessStatus; url: string; qrDataUrl: string };
const dateTime = (value: string) =>
  new Date(value).toLocaleString('es-MX', { timeZone: 'America/Cancun' });

export default function ShowcaseManager() {
  const [links, setLinks] = useState<ShowcaseLinkStatus[]>([]);
  const [durationDays, setDurationDays] = useState(90);
  const [created, setCreated] = useState<Created | null>(null);
  const [fixed, setFixed] = useState<Fixed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/catalog-admin/showcase', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'No fue posible cargar los enlaces.');
    setLinks(body.links);
    setFixed(body.fixed);
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
      setNotice('QR temporal creado. El enlace temporal anterior quedó cerrado automáticamente.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible crear el acceso.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleFixed() {
    if (!fixed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/catalog-admin/showcase', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !fixed.access.enabled }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'No fue posible actualizar el QR fijo.');
      setFixed(body.fixed);
      setNotice(
        body.fixed.access.enabled
          ? 'QR fijo habilitado. La dirección seguirá siendo la misma.'
          : 'QR fijo deshabilitado. La dirección se conserva para volver a habilitarla después.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible actualizar el QR fijo.');
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

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setNotice('Enlace copiado.');
  }
  function download(qrDataUrl: string, filename: string) {
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = filename;
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

      {fixed && (
        <section className="panel showcase-fixed-card">
          <div className="showcase-access-heading">
            <div>
              <span className="eyebrow">QR FIJO · DIRECCIÓN PERMANENTE</span>
              <h2>Imprímelo una vez y úsalo siempre</h2>
              <p>
                Al habilitarlo conserva exactamente el mismo enlace. Puedes apagar el acceso y
                volverlo a encender después sin cambiar el QR.
              </p>
            </div>
            <span className={fixed.access.enabled ? 'status-good' : 'status-warn'}>
              {fixed.access.enabled ? 'Habilitado' : 'Deshabilitado'}
            </span>
          </div>
          <div className={`showcase-qr-result${fixed.access.enabled ? '' : ' is-disabled'}`}>
            <img alt="Código QR fijo para el modo de lectura" src={fixed.qrDataUrl} />
            <div>
              <strong>Enlace fijo de Lattecito</strong>
              <p>
                {fixed.access.enabled
                  ? 'Disponible para escanear ahora.'
                  : 'El QR conserva su dirección, pero no abre el informe mientras esté apagado.'}
              </p>
              <code>{fixed.url}</code>
              <small>
                {fixed.access.viewCount} visitas · Actualizado por {fixed.access.updatedBy} el{' '}
                {dateTime(fixed.access.updatedAt)}
              </small>
              <div className="inline-fields">
                <button className="small-button" onClick={() => void copy(fixed.url)}>
                  <Copy size={15} /> Copiar
                </button>
                <button
                  className="small-button"
                  onClick={() => download(fixed.qrDataUrl, 'lattecito-modo-lectura-qr-fijo.png')}
                >
                  <Download size={15} /> Descargar QR
                </button>
                {fixed.access.enabled && (
                  <a className="small-button" href={fixed.url} rel="noreferrer" target="_blank">
                    <ExternalLink size={15} /> Abrir
                  </a>
                )}
              </div>
            </div>
          </div>
          <button
            className={fixed.access.enabled ? 'danger-button' : 'button'}
            disabled={busy}
            onClick={() => void toggleFixed()}
          >
            {fixed.access.enabled ? <ShieldOff size={16} /> : <Link2 size={16} />}
            {fixed.access.enabled ? 'Deshabilitar QR fijo' : 'Habilitar QR fijo'}
          </button>
        </section>
      )}

      <section className="panel showcase-builder">
        <div className="showcase-builder-form">
          <span className="eyebrow">QR TEMPORAL · DIRECCIÓN ALEATORIA</span>
          <h2>Comparte un acceso con vencimiento</h2>
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
            <Clock3 size={17} /> {busy ? 'Preparando…' : 'Generar QR temporal'}
          </button>
          <small>
            Cada QR temporal usa una dirección aleatoria. Crear otro cierra únicamente el temporal
            anterior; el QR fijo no cambia.
          </small>
        </div>
        {created ? (
          <div className="showcase-qr-result">
            <img alt="Código QR para el modo de lectura" src={created.qrDataUrl} />
            <div>
              <strong>QR listo para compartir</strong>
              <p>Vence {dateTime(created.link.expiresAt)}</p>
              <code>{created.url}</code>
              <div className="inline-fields">
                <button className="small-button" onClick={() => void copy(created.url)}>
                  <Copy size={15} /> Copiar
                </button>
                <button
                  className="small-button"
                  onClick={() =>
                    download(created.qrDataUrl, 'lattecito-modo-lectura-qr-temporal.png')
                  }
                >
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
            El enlace temporal completo solo se muestra al generarlo. Si necesitas una dirección que
            puedas volver a descargar, utiliza el QR fijo de arriba.
          </p>
        )}
      </section>
      <section className="panel">
        <span className="eyebrow">ESTADO DEL QR TEMPORAL</span>
        <h2>{active ? 'Hay un QR temporal activo' : 'No hay QR temporales activos'}</h2>
        {active && (
          <div className="showcase-active-link">
            <div>
              <strong>Creado por {active.createdBy}</strong>
              <span>Vence {dateTime(active.expiresAt)}</span>
              <small>
                {active.viewCount} visitas ·{' '}
                {active.lastViewedAt
                  ? `Última ${dateTime(active.lastViewedAt)}`
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
