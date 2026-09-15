'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Coffee,
  ImagePlus,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { money, sizes } from '@/lib/model';
import type { CatalogModifier, CatalogProduct, PublicCatalog } from '@/lib/catalog-schema';

type View = 'summary' | 'products' | 'extras' | 'business';
const tones: CatalogProduct['tone'][] = ['coffee', 'matcha', 'boba', 'caramel', 'cocoa', 'dark'];
const blankProduct = (): CatalogProduct => ({
  id: crypto.randomUUID(),
  name: '',
  category: 'Cafés',
  description: '',
  prices: [0, 0, 0],
  active: true,
  tone: 'coffee',
});
const blankModifier = (): CatalogModifier => ({
  id: crypto.randomUUID(),
  name: '',
  price: 0,
  active: true,
  productIds: null,
});

export default function CatalogAdmin() {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [source, setSource] = useState<'blob' | 'snapshot'>('snapshot');
  const [view, setView] = useState<View>('summary');
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [modifier, setModifier] = useState<CatalogModifier | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/catalog-admin', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No fue posible cargar el catálogo.');
      setCatalog(result.catalog);
      setEtag(result.etag);
      setSource(result.source);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar el catálogo.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: PublicCatalog, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/catalog-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog: next, etag }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No fue posible guardar el cambio.');
      setCatalog(result.catalog);
      setEtag(result.etag);
      setSource('blob');
      setNotice(message);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el cambio.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file: File) {
    const body = new FormData();
    body.set('image', file);
    const response = await fetch('/api/catalog-admin', { method: 'POST', body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'No fue posible subir la imagen.');
    return result.imageUrl as string;
  }

  async function saveProduct() {
    if (!catalog || !product) return;
    setBusy(true);
    setError('');
    try {
      const completed = image ? { ...product, imageUrl: await uploadImage(image) } : product;
      const exists = catalog.products.some((item) => item.id === completed.id);
      const next = {
        ...catalog,
        products: exists
          ? catalog.products.map((item) => (item.id === completed.id ? completed : item))
          : [...catalog.products, completed],
      };
      if (
        await save(next, exists ? 'Bebida actualizada en el menú.' : 'Bebida agregada al menú.')
      ) {
        setProduct(null);
        setImage(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar la bebida.');
      setBusy(false);
    }
  }

  async function saveModifier() {
    if (!catalog || !modifier) return;
    const exists = catalog.modifiers.some((item) => item.id === modifier.id);
    const next = {
      ...catalog,
      modifiers: exists
        ? catalog.modifiers.map((item) => (item.id === modifier.id ? modifier : item))
        : [...catalog.modifiers, modifier],
    };
    if (await save(next, exists ? 'Extra actualizado.' : 'Extra agregado.')) setModifier(null);
  }

  if (!catalog)
    return (
      <main className="catalog-loading">
        <Coffee size={38} />
        <h1>Administración del menú</h1>
        <p>{error || 'Cargando el catálogo…'}</p>
        {error && (
          <button className="button" onClick={() => void load()}>
            Reintentar
          </button>
        )}
      </main>
    );

  return (
    <div className="catalog-shell">
      <aside className="catalog-sidebar">
        <div className="wordmark">
          lattecito<span>ADMINISTRACIÓN WEB</span>
        </div>
        <nav aria-label="Secciones de administración">
          <Nav
            active={view === 'summary'}
            icon={<LayoutDashboard />}
            label="Resumen"
            onClick={() => setView('summary')}
          />
          <Nav
            active={view === 'products'}
            icon={<Coffee />}
            label="Menú"
            onClick={() => setView('products')}
          />
          <Nav
            active={view === 'extras'}
            icon={<Sparkles />}
            label="Extras"
            onClick={() => setView('extras')}
          />
          <Nav
            active={view === 'business'}
            icon={<Settings2 />}
            label="Negocio"
            onClick={() => setView('business')}
          />
        </nav>
        <p>Acceso protegido por tu cuenta de Vercel.</p>
      </aside>

      <main className="catalog-main">
        <header className="catalog-header">
          <div>
            <span className="eyebrow">LATTECITO · CATÁLOGO</span>
            <h1>
              {view === 'summary'
                ? 'Resumen'
                : view === 'products'
                  ? 'Menú'
                  : view === 'extras'
                    ? 'Extras'
                    : 'Datos del negocio'}
            </h1>
          </div>
          <button className="small-button" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={16} /> Actualizar
          </button>
        </header>
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
        {source === 'snapshot' && (
          <p className="notice">
            El primer cambio creará el catálogo editable en línea con esta copia inicial.
          </p>
        )}

        {view === 'summary' && (
          <>
            <section className="summary-grid">
              <article className="metric-card">
                <span>BEBIDAS</span>
                <strong>{catalog.products.length}</strong>
                <small>{catalog.products.filter((item) => item.active).length} visibles</small>
              </article>
              <article className="metric-card">
                <span>EXTRAS</span>
                <strong>{catalog.modifiers.length}</strong>
                <small>
                  {catalog.modifiers.filter((item) => item.active !== false).length} disponibles
                </small>
              </article>
              <article className="metric-card">
                <span>FOTOGRAFÍAS</span>
                <strong>{catalog.products.filter((item) => item.imageUrl).length}</strong>
                <small>de {catalog.products.length} bebidas</small>
              </article>
            </section>
            <section className="panel">
              <span className="eyebrow">CONTROL DEL SITIO</span>
              <h2>Todo lo que publiques aparece en el menú</h2>
              <p>
                Edita bebidas, precios, fotografías, extras, teléfonos, dirección y horarios. Puedes
                ocultar un producto sin borrar su información.
              </p>
              <button className="button" onClick={() => setView('products')}>
                Administrar menú
              </button>
            </section>
          </>
        )}

        {view === 'products' && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">BEBIDAS</span>
                <h2>Productos del menú</h2>
              </div>
              <button
                className="button"
                onClick={() => {
                  setProduct(blankProduct());
                  setImage(null);
                }}
              >
                <Plus size={17} /> Nueva bebida
              </button>
            </div>
            <div className="catalog-product-grid">
              {catalog.products.map((item) => (
                <article className="catalog-product-card" key={item.id}>
                  <div
                    className={`catalog-product-image ${item.tone}`}
                    style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
                  />
                  <div>
                    <span className="eyebrow">{item.category}</span>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <strong>{item.prices.map(money).join(' · ')}</strong>
                    <small>{item.active ? 'Visible en el menú' : 'Oculta'}</small>
                    <button
                      className="small-button"
                      onClick={() => {
                        setProduct({ ...item });
                        setImage(null);
                      }}
                    >
                      Editar bebida
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === 'extras' && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">PERSONALIZACIÓN</span>
                <h2>Extras disponibles</h2>
              </div>
              <button className="button" onClick={() => setModifier(blankModifier())}>
                <Plus size={17} /> Nuevo extra
              </button>
            </div>
            <div className="simple-list">
              {catalog.modifiers.length ? (
                catalog.modifiers.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <p>
                        {money(item.price)} ·{' '}
                        {item.productIds === null || item.productIds === undefined
                          ? 'Todas las bebidas'
                          : `${item.productIds.length} bebidas`}{' '}
                        · {item.active === false ? 'Oculto' : 'Disponible'}
                      </p>
                    </div>
                    <button
                      className="small-button"
                      onClick={() =>
                        setModifier({
                          ...item,
                          productIds: item.productIds ? [...item.productIds] : item.productIds,
                        })
                      }
                    >
                      Editar
                    </button>
                  </article>
                ))
              ) : (
                <p className="muted">Todavía no hay extras publicados.</p>
              )}
            </div>
          </section>
        )}

        {view === 'business' && (
          <BusinessForm
            catalog={catalog}
            busy={busy}
            onSave={(settings) => save({ ...catalog, settings }, 'Datos del negocio actualizados.')}
          />
        )}
      </main>

      {product && (
        <ProductEditor
          product={product}
          image={image}
          busy={busy}
          onChange={setProduct}
          onImage={setImage}
          onCancel={() => {
            setProduct(null);
            setImage(null);
          }}
          onSave={() => void saveProduct()}
        />
      )}
      {modifier && (
        <ModifierEditor
          modifier={modifier}
          products={catalog.products}
          busy={busy}
          onChange={setModifier}
          onCancel={() => setModifier(null)}
          onSave={() => void saveModifier()}
        />
      )}
    </div>
  );
}

function Nav({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ProductEditor({
  product,
  image,
  busy,
  onChange,
  onImage,
  onCancel,
  onSave,
}: {
  product: CatalogProduct;
  image: File | null;
  busy: boolean;
  onChange: (product: CatalogProduct) => void;
  onImage: (file: File | null) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const preview = useMemo(
    () => (image ? URL.createObjectURL(image) : product.imageUrl),
    [image, product.imageUrl],
  );
  useEffect(() => {
    if (image && preview) return () => URL.revokeObjectURL(preview);
  }, [image, preview]);
  return (
    <div className="catalog-overlay">
      <form
        className="catalog-editor"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">EDITOR DE BEBIDA</span>
            <h2>{product.name || 'Nueva bebida'}</h2>
          </div>
          <button type="button" className="small-button" onClick={onCancel}>
            Cerrar
          </button>
        </div>
        <label className="catalog-image-upload">
          <div
            className={`catalog-product-image ${product.tone}`}
            style={preview ? { backgroundImage: `url(${preview})` } : undefined}
          >
            <ImagePlus />
          </div>
          <span>
            {image ? image.name : product.imageUrl ? 'Cambiar fotografía' : 'Agregar fotografía'}
            <small>JPG, PNG, WebP o AVIF · máximo 5 MB</small>
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={(event) => onImage(event.target.files?.[0] ?? null)}
          />
        </label>
        {product.imageUrl && !image && (
          <button
            type="button"
            className="text-button"
            onClick={() => onChange({ ...product, imageUrl: undefined })}
          >
            Quitar fotografía actual
          </button>
        )}
        <div className="form-grid">
          <label className="field">
            Nombre
            <input
              required
              minLength={2}
              maxLength={100}
              value={product.name}
              onChange={(event) => onChange({ ...product, name: event.target.value })}
            />
          </label>
          <label className="field">
            Categoría
            <input
              required
              minLength={2}
              maxLength={60}
              value={product.category}
              onChange={(event) => onChange({ ...product, category: event.target.value })}
            />
          </label>
        </div>
        <label className="field">
          Descripción
          <textarea
            required
            minLength={5}
            maxLength={500}
            value={product.description}
            onChange={(event) => onChange({ ...product, description: event.target.value })}
          />
        </label>
        <fieldset>
          <legend>Precios por tamaño</legend>
          <div className="form-grid three">
            {sizes.map((size, index) => (
              <label className="field" key={size}>
                {size}
                <input
                  required
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  value={(product.prices[index] / 100).toString()}
                  onChange={(event) => {
                    const prices = [...product.prices];
                    prices[index] = Math.round(Number(event.target.value) * 100);
                    onChange({ ...product, prices });
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <label className="field">
            Estilo visual
            <select
              value={product.tone}
              onChange={(event) =>
                onChange({ ...product, tone: event.target.value as CatalogProduct['tone'] })
              }
            >
              {tones.map((tone) => (
                <option key={tone}>{tone}</option>
              ))}
            </select>
          </label>
          <label className="check-field catalog-active">
            <input
              type="checkbox"
              checked={product.active}
              onChange={(event) => onChange({ ...product, active: event.target.checked })}
            />{' '}
            Visible y disponible en el menú
          </label>
        </div>
        <div className="inline-fields">
          <button className="button" disabled={busy}>
            <Save size={17} /> {busy ? 'Guardando…' : 'Guardar bebida'}
          </button>
          <button type="button" className="small-button" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function ModifierEditor({
  modifier,
  products,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  modifier: CatalogModifier;
  products: CatalogProduct[];
  busy: boolean;
  onChange: (modifier: CatalogModifier) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const all = modifier.productIds === null || modifier.productIds === undefined;
  return (
    <div className="catalog-overlay">
      <form
        className="catalog-editor compact"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">EDITOR DE EXTRA</span>
            <h2>{modifier.name || 'Nuevo extra'}</h2>
          </div>
          <button type="button" className="small-button" onClick={onCancel}>
            Cerrar
          </button>
        </div>
        <div className="form-grid">
          <label className="field">
            Nombre
            <input
              required
              minLength={2}
              maxLength={100}
              value={modifier.name}
              onChange={(event) => onChange({ ...modifier, name: event.target.value })}
            />
          </label>
          <label className="field">
            Precio adicional
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={(modifier.price / 100).toString()}
              onChange={(event) =>
                onChange({ ...modifier, price: Math.round(Number(event.target.value) * 100) })
              }
            />
          </label>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={modifier.active !== false}
            onChange={(event) => onChange({ ...modifier, active: event.target.checked })}
          />{' '}
          Extra disponible
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={all}
            onChange={(event) =>
              onChange({ ...modifier, productIds: event.target.checked ? null : [] })
            }
          />{' '}
          Aplicar a todas las bebidas
        </label>
        {!all && (
          <fieldset>
            <legend>Bebidas compatibles</legend>
            <div className="check-grid">
              {products.map((item) => (
                <label className="check-field" key={item.id}>
                  <input
                    type="checkbox"
                    checked={modifier.productIds?.includes(item.id) ?? false}
                    onChange={(event) =>
                      onChange({
                        ...modifier,
                        productIds: event.target.checked
                          ? [...(modifier.productIds ?? []), item.id]
                          : (modifier.productIds ?? []).filter((id) => id !== item.id),
                      })
                    }
                  />{' '}
                  {item.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="inline-fields">
          <button className="button" disabled={busy}>
            <Save size={17} /> {busy ? 'Guardando…' : 'Guardar extra'}
          </button>
          <button type="button" className="small-button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function BusinessForm({
  catalog,
  busy,
  onSave,
}: {
  catalog: PublicCatalog;
  busy: boolean;
  onSave: (settings: PublicCatalog['settings']) => Promise<boolean>;
}) {
  const [settings, setSettings] = useState(catalog.settings);
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(settings);
      }}
    >
      <span className="eyebrow">INFORMACIÓN PÚBLICA</span>
      <h2>Contacto y aviso del menú</h2>
      <div className="form-grid">
        <label className="field">
          WhatsApp principal
          <input
            required
            pattern="52[0-9]{10}"
            value={settings.phones[0] ?? ''}
            onChange={(event) =>
              setSettings({
                ...settings,
                phones: [event.target.value, ...settings.phones.slice(1)],
              })
            }
          />
        </label>
        <label className="field">
          WhatsApp alternativo
          <input
            pattern="52[0-9]{10}"
            value={settings.phones[1] ?? ''}
            onChange={(event) =>
              setSettings({
                ...settings,
                phones: event.target.value
                  ? [settings.phones[0], event.target.value]
                  : [settings.phones[0]],
              })
            }
          />
        </label>
      </div>
      <label className="field">
        Dirección
        <textarea
          maxLength={300}
          value={settings.address}
          onChange={(event) => setSettings({ ...settings, address: event.target.value })}
        />
      </label>
      <label className="field">
        Horarios
        <textarea
          maxLength={300}
          value={settings.hours}
          onChange={(event) => setSettings({ ...settings, hours: event.target.value })}
        />
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={settings.sample}
          onChange={(event) => setSettings({ ...settings, sample: event.target.checked })}
        />{' '}
        Mostrar aviso de menú y precios de muestra
      </label>
      <button className="button" disabled={busy}>
        <Save size={17} /> {busy ? 'Guardando…' : 'Guardar datos del negocio'}
      </button>
    </form>
  );
}
