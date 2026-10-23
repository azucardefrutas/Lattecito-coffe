'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Save,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  galleryCategories,
  galleryCategoryLabels,
  type GalleryCategory,
  type GalleryItem,
} from '@/lib/gallery-schema';

const PUBLIC_GALLERY_URL = 'https://lattecito-coffe.vercel.app/capturas';
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

type OptimizedImage = { file: File; width: number; height: number };

function cleanTitle(filename: string) {
  const title = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (title.length >= 2 ? title : `Foto ${title || 'de Lattecito'}`).slice(0, 120);
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No fue posible optimizar la foto.'))),
      'image/webp',
      quality,
    ),
  );
}

async function optimizeImage(source: File): Promise<OptimizedImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(source.type))
    throw new Error(`${source.name}: usa una foto JPG, PNG o WebP.`);
  if (source.size > MAX_SOURCE_BYTES)
    throw new Error(`${source.name}: la foto original supera 25 MB.`);
  const bitmap = await createImageBitmap(source);
  const maxSide = 2048;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('El navegador no pudo preparar la foto.');
  context.fillStyle = '#fffaf4';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob = await canvasBlob(canvas, 0.84);
  if (blob.size > 4.5 * 1024 * 1024) blob = await canvasBlob(canvas, 0.7);
  if (blob.size > 4.8 * 1024 * 1024)
    throw new Error(`${source.name}: no fue posible reducirla por debajo de 5 MB.`);
  return {
    file: new File([blob], `${cleanTitle(source.name).replace(/\s+/g, '-').toLowerCase()}.webp`, {
      type: 'image/webp',
    }),
    width,
    height,
  };
}

export default function GalleryAdmin() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<GalleryCategory>('local');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/catalog-admin/gallery', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'No fue posible cargar las fotos.');
    setItems(body.items);
  }, []);

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar las fotos.'),
    );
  }, [load]);

  function chooseFiles(selected: FileList | null) {
    if (!selected) return;
    const next = Array.from(selected);
    if (next.length > 20) {
      setFiles(next.slice(0, 20));
      setNotice('Se prepararon las primeras 20 fotos. Puedes subir las demás en otro lote.');
      return;
    }
    setFiles(next);
    setNotice('');
  }

  async function upload() {
    if (!files.length) return setError('Selecciona al menos una foto.');
    setBusy(true);
    setError('');
    setNotice('');
    let uploaded = 0;
    const failures: string[] = [];
    for (const [index, source] of files.entries()) {
      try {
        setProgress(`Optimizando ${index + 1} de ${files.length}: ${source.name}`);
        const image = await optimizeImage(source);
        const title = cleanTitle(source.name);
        const form = new FormData();
        form.set('image', image.file);
        form.set('title', title);
        form.set('description', '');
        form.set('altText', `${title} en Lattecito Coffee`);
        form.set('category', category);
        form.set('width', String(image.width));
        form.set('height', String(image.height));
        form.set('published', 'true');
        setProgress(`Subiendo ${index + 1} de ${files.length}: ${source.name}`);
        const response = await fetch('/api/catalog-admin/gallery', { method: 'POST', body: form });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'No fue posible subirla.');
        uploaded += 1;
      } catch (cause) {
        failures.push(cause instanceof Error ? cause.message : `${source.name}: error al subir.`);
      }
    }
    setProgress('');
    setBusy(false);
    setFiles([]);
    if (fileInput.current) fileInput.current.value = '';
    await load();
    if (failures.length) setError(failures.join(' '));
    if (uploaded)
      setNotice(
        `${uploaded} foto${uploaded === 1 ? '' : 's'} publicada${uploaded === 1 ? '' : 's'} correctamente.`,
      );
  }

  function change(id: string, patch: Partial<GalleryItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function save(item: GalleryItem) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/catalog-admin/gallery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'No fue posible guardar los cambios.');
      change(item.id, body.item);
      setNotice('Foto actualizada. La galería pública ya refleja el cambio.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar los cambios.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: GalleryItem) {
    if (!window.confirm(`¿Eliminar definitivamente “${item.title}”?`)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/catalog-admin/gallery', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'No fue posible eliminar la foto.');
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setNotice('Foto eliminada de la galería y del almacenamiento.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible eliminar la foto.');
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setItems(reordered);
    setBusy(true);
    try {
      const response = await fetch('/api/catalog-admin/gallery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', ids: reordered.map((item) => item.id) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'No fue posible guardar el orden.');
      setItems(body.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el orden.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(PUBLIC_GALLERY_URL);
    setNotice('Enlace público copiado.');
  }

  const visibleCount = items.filter((item) => item.published).length;
  return (
    <div className="gallery-admin-stack">
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

      <section className="panel gallery-admin-hero">
        <div>
          <span className="eyebrow">ARCHIVO VISUAL · GALERÍA PÚBLICA</span>
          <h2>Fotos del proyecto en un solo enlace</h2>
          <p>
            Sube imágenes del local, bebidas, alimentos y eventos. Se optimizan antes de enviarse
            para que la galería abra rápido desde el QR, incluso con datos móviles.
          </p>
          <div className="gallery-stat-row">
            <span>
              <strong>{items.length}</strong> alojadas
            </span>
            <span>
              <strong>{visibleCount}</strong> visibles
            </span>
          </div>
        </div>
        <Camera size={68} aria-hidden="true" />
      </section>

      <section className="panel gallery-share-card">
        <img src="/qr-galeria.png" alt="Código QR de la galería pública de Lattecito Coffee" />
        <div>
          <span className="eyebrow">ENLACE ESTABLE PARA EL CONCURSO</span>
          <h2>Escanea y abre la galería</h2>
          <code>{PUBLIC_GALLERY_URL}</code>
          <div className="inline-fields">
            <button className="small-button" onClick={() => void copyLink()}>
              <Copy size={15} /> Copiar enlace
            </button>
            <a className="small-button" href="/qr-galeria.png" download="lattecito-galeria-qr.png">
              <Download size={15} /> Descargar QR
            </a>
            <a className="small-button" href={PUBLIC_GALLERY_URL} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Ver galería
            </a>
          </div>
        </div>
      </section>

      <section className="panel gallery-upload-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SUBIR FOTOS</span>
            <h2>Nuevo lote</h2>
          </div>
          <UploadCloud size={28} aria-hidden="true" />
        </div>
        <div className="gallery-upload-grid">
          <label className="gallery-file-picker">
            <ImagePlus size={28} />
            <strong>
              {files.length
                ? `${files.length} foto${files.length === 1 ? '' : 's'} lista${files.length === 1 ? '' : 's'}`
                : 'Elegir fotos'}
            </strong>
            <span>JPG, PNG o WebP · hasta 20 por lote</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => chooseFiles(event.target.files)}
            />
          </label>
          <label>
            Grupo para este lote
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as GalleryCategory)}
            >
              {galleryCategories.map((value) => (
                <option value={value} key={value}>
                  {galleryCategoryLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <button className="button" disabled={busy || !files.length} onClick={() => void upload()}>
            <UploadCloud size={17} /> {busy ? 'Procesando…' : 'Optimizar y publicar'}
          </button>
        </div>
        {progress && (
          <p className="gallery-progress" role="status">
            {progress}
          </p>
        )}
        <p className="gallery-upload-note">
          Puedes cambiar título, descripción, orden y visibilidad después de subirlas.
        </p>
      </section>

      <section className="panel gallery-library-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">BIBLIOTECA</span>
            <h2>Orden y publicación</h2>
          </div>
          <CheckCircle2 size={24} aria-hidden="true" />
        </div>
        {items.length ? (
          <div className="gallery-admin-grid">
            {items.map((item, index) => (
              <article className="gallery-admin-card" key={item.id}>
                <div
                  className="gallery-admin-preview"
                  style={{ aspectRatio: `${item.width} / ${item.height}` }}
                >
                  <img src={item.imageUrl} alt={item.altText} />
                  <span className={item.published ? 'published' : 'hidden'}>
                    {item.published ? <Eye size={14} /> : <EyeOff size={14} />}
                    {item.published ? 'Pública' : 'Oculta'}
                  </span>
                </div>
                <div className="gallery-admin-fields">
                  <label>
                    Título
                    <input
                      value={item.title}
                      maxLength={120}
                      onChange={(event) => change(item.id, { title: event.target.value })}
                    />
                  </label>
                  <label>
                    Descripción
                    <textarea
                      value={item.description}
                      maxLength={500}
                      rows={3}
                      placeholder="Qué muestra esta foto y por qué es importante"
                      onChange={(event) => change(item.id, { description: event.target.value })}
                    />
                  </label>
                  <label>
                    Texto accesible
                    <input
                      value={item.altText}
                      maxLength={180}
                      onChange={(event) => change(item.id, { altText: event.target.value })}
                    />
                  </label>
                  <div className="gallery-admin-row">
                    <label>
                      Categoría
                      <select
                        value={item.category}
                        onChange={(event) =>
                          change(item.id, { category: event.target.value as GalleryCategory })
                        }
                      >
                        {galleryCategories.map((value) => (
                          <option value={value} key={value}>
                            {galleryCategoryLabels[value]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="gallery-publish-toggle">
                      <input
                        type="checkbox"
                        checked={item.published}
                        onChange={(event) => change(item.id, { published: event.target.checked })}
                      />
                      <span>{item.published ? 'Visible en el QR' : 'Oculta del QR'}</span>
                    </label>
                  </div>
                  <div className="gallery-card-actions">
                    <div>
                      <button
                        className="icon-button"
                        disabled={busy || index === 0}
                        aria-label={`Mover ${item.title} antes`}
                        onClick={() => void move(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={busy || index === items.length - 1}
                        aria-label={`Mover ${item.title} después`}
                        onClick={() => void move(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                    <button
                      className="small-button"
                      disabled={busy}
                      onClick={() => void save(item)}
                    >
                      <Save size={15} /> Guardar
                    </button>
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={() => void remove(item)}
                    >
                      <Trash2 size={15} /> Eliminar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="gallery-empty-admin">
            <Camera size={36} />
            <strong>Aún no hay fotos alojadas</strong>
            <p>Elige tu primer lote arriba. La galería pública ya está lista para recibirlo.</p>
          </div>
        )}
      </section>
    </div>
  );
}
