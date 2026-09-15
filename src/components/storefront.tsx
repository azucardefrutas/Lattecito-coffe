'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  ArrowUpRight,
  Coffee,
  Heart,
  Menu,
  Minus,
  Plus,
  ShoppingBag,
  X,
  MessageCircle,
  MapPin,
  Clock,
} from 'lucide-react';
import {
  calculate,
  money,
  sizes,
  whatsappText,
  availableModifiers,
  type MenuModifier,
  type Product,
  type Line,
  type Settings,
} from '@/lib/model';
import { addCartLine, inspectCart, lineKey, restoreCart } from '@/lib/cart';

export default function Storefront({ menuOnly = false }: { menuOnly?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]),
    [modifiers, setModifiers] = useState<MenuModifier[]>([]),
    [extras, setExtras] = useState<string[]>([]),
    [reviewing, setReviewing] = useState(true),
    [menuError, setMenuError] = useState(''),
    [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(''),
    [category, setCategory] = useState('Todos'),
    [search, setSearch] = useState('');
  const [cart, setCart] = useState<Line[]>([]),
    [ready, setReady] = useState(false),
    [selected, setSelected] = useState<Product | null>(null),
    [size, setSize] = useState(0),
    [quantity, setQuantity] = useState(1),
    [drawer, setDrawer] = useState(false),
    [nav, setNav] = useState(false),
    [note, setNote] = useState(''),
    [phone, setPhone] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null),
    cartDialog = useRef<HTMLDialogElement>(null),
    menuRequest = useRef(0);
  const menuFailed = Boolean(menuError);
  const loadMenu = useCallback(async () => {
    const request = ++menuRequest.current;
    setReviewing(true);
    setMenuError('');
    try {
      const r = await fetch('/api/menu', { cache: 'no-store' });
      if (!r.ok)
        throw new Error('No pudimos revisar el menú. Reintenta antes de enviar el pedido.');
      const d = await r.json();
      if (request !== menuRequest.current) return;
      setProducts(d.products.map((p: Product) => ({ ...p, cost: [0, 0, 0] })));
      setModifiers(d.modifiers ?? []);
      setSettings(d.settings);
    } catch (e) {
      if (request === menuRequest.current)
        setMenuError(e instanceof Error ? e.message : 'No se pudo revisar el menú.');
    } finally {
      if (request === menuRequest.current) setReviewing(false);
    }
  }, []);
  useEffect(() => {
    void loadMenu();
    /* Cart contains only identifiers and quantities; prices always come from the menu. */
    try {
      const saved = JSON.parse(localStorage.getItem('latte-cart') ?? '[]');
      const restored = restoreCart(saved);
      setCart(restored.lines);
      if (restored.discarded)
        setError('Algunos artículos guardados no eran válidos. Revisa tu pedido.');
    } catch {
      setError('No pudimos recuperar el pedido guardado. Puedes armar uno nuevo.');
    }
    setReady(true);
  }, [loadMenu]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem('latte-cart', JSON.stringify({ version: 2, lines: cart }));
      } catch {
        setError('Tu navegador no permite guardar el pedido. Mantenlo abierto hasta enviarlo.');
      }
  }, [cart, ready]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  useEffect(() => {
    if (drawer) {
      cartDialog.current?.showModal();
      void loadMenu();
    } else cartDialog.current?.close();
  }, [drawer, loadMenu]);
  const { valid: validCart, unavailable } = inspectCart(products, modifiers, cart);
  const totals = validCart.length ? calculate(products, validCart, 0, modifiers) : null;
  const total = totals?.total ?? 0;
  const count = cart.reduce((a, l) => a + l.quantity, 0);
  function choose(p: Product) {
    setSize(0);
    setQuantity(1);
    setExtras([]);
    setSelected(p);
  }
  function add() {
    if (!selected) return;
    try {
      setCart(addCartLine(cart, { productId: selected.id, size, quantity, modifierIds: extras }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa la cantidad.');
      return;
    }
    setSelected(null);
    setDrawer(true);
  }
  function update(line: Line, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          lineKey(l) === lineKey(line) ? { ...l, quantity: Math.min(99, l.quantity + delta) } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }
  const categories = ['Todos', ...new Set(products.map((p) => p.category))];
  return (
    <>
      <div className="announcement">
        Un buen día empieza con un lattecito <Heart size={12} />
      </div>
      <header className="site-header">
        <Link href="/" className="wordmark" aria-label="Lattecito Coffee, inicio">
          lattecito<span>COFFEE & LITTLE MOMENTS</span>
        </Link>
        <nav className={nav ? 'site-nav open' : 'site-nav'}>
          <Link href="/menu" onClick={() => setNav(false)}>
            Nuestro menú
          </Link>
          <a href="/#momento" onClick={() => setNav(false)}>
            El momento Lattecito
          </a>
          <a href="/#visitanos" onClick={() => setNav(false)}>
            Encuéntranos
          </a>
        </nav>
        <div className="header-actions">
          <button
            className="bag-button"
            aria-label={`Mi pedido, ${count} productos`}
            onClick={() => setDrawer(true)}
          >
            <ShoppingBag size={18} />
            <span>Mi pedido</span>
            <b>{count}</b>
          </button>
          <button
            className="icon-button mobile-toggle"
            aria-label="Abrir navegación"
            aria-expanded={nav}
            onClick={() => setNav(!nav)}
          >
            {nav ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main>
        {!menuOnly && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">
                  <span className="small-line" /> HECHO PARA DISFRUTARSE
                </span>
                <h1>
                  La vida sabe
                  <br />
                  mejor con un
                  <br />
                  <em>lattecito.</em>
                </h1>
                <p>
                  Tu café favorito. Una buena conversación.
                  <br />Y ese ratito que es solo para ti.
                </p>
                <Link className="button" href="/menu">
                  Encuentra tu favorito <ArrowUpRight size={18} />
                </Link>
                <div className="hero-note">
                  <Coffee size={20} />
                  <span>
                    Pequeños sorbos.
                    <br />
                    <strong>Bonitos momentos.</strong>
                  </span>
                </div>
              </div>
              <div className="hero-photo">
                <Image
                  src="/hero-latte.png"
                  alt="Latte helado y matcha sobre una barra color terracota. Imagen conceptual de Lattecito."
                  fill
                  priority
                  sizes="(max-width: 760px) 100vw, 50vw"
                />
                <span className="photo-stamp">
                  con cariño,
                  <br />
                  <em>lattecito</em>
                  <Heart size={17} />
                </span>
                <div className="photo-caption">
                  TU NUEVA PAUSA FAVORITA <span>01 — LATTECITO</span>
                </div>
              </div>
            </section>
            <div className="brand-ribbon">
              <span>CAFÉ QUE ABRAZA</span>
              <span>✳</span>
              <span>MATCHA QUE ENAMORA</span>
              <span>✳</span>
              <span>MOMENTOS PARA COMPARTIR</span>
              <span>✳</span>
              <span>SIEMPRE UN LATTECITO</span>
            </div>
          </>
        )}
        <section className="menu-section" id="menu">
          <div className="section-heading">
            <div>
              <span className="eyebrow">¿QUÉ SE TE ANTOJA HOY?</span>
              <h2>{menuOnly ? 'Tu próximo favorito.' : 'Un sorbo, mil razones.'}</h2>
            </div>
            <p>
              Desde el primer café del día
              <br />
              hasta ese antojo de la tarde.
            </p>
          </div>
          {settings?.sample && (
            <p className="sample-note">
              Menú de muestra · Productos, precios e imágenes sujetos a confirmación.
            </p>
          )}
          <div className="menu-tools">
            <div className="categories" aria-label="Categorías">
              {categories.map((c) => (
                <button
                  key={c}
                  aria-pressed={category === c}
                  className={category === c ? 'active' : ''}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <input
              type="search"
              aria-label="Buscar bebida"
              placeholder="Busca tu antojo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {menuError && (
            <div className="notice error" role="alert">
              <p>{menuError}</p>
              <button className="small-button" onClick={() => void loadMenu()}>
                Revisar menú de nuevo
              </button>
            </div>
          )}
          {!settings && reviewing && <p className="notice">Cargando el menú…</p>}
          <div className="product-grid">
            {products
              .filter(
                (p) =>
                  (category === 'Todos' || p.category === category) &&
                  p.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((p, i) => (
                <button key={p.id} className="product-card" onClick={() => choose(p)}>
                  <div className={`product-visual ${p.tone}`}>
                    <span className="product-number">0{i + 1}</span>
                    <Coffee size={85} strokeWidth={0.8} />
                    <span className="product-monogram">lattecito</span>
                    <span className="product-add">
                      <Plus size={20} />
                    </span>
                  </div>
                  <div className="product-label">
                    <div>
                      <small>{p.category}</small>
                      <h3>{p.name}</h3>
                    </div>
                    <span>
                      Desde
                      <br />
                      <strong>{money(p.prices[0])}</strong>
                    </span>
                  </div>
                </button>
              ))}
          </div>
          {settings &&
            products.filter(
              (p) =>
                (category === 'Todos' || p.category === category) &&
                p.name.toLowerCase().includes(search.toLowerCase()),
            ).length === 0 && (
              <p className="notice">No encontramos ese antojo. Prueba otra búsqueda.</p>
            )}
        </section>
        {!menuOnly && (
          <section className="moment" id="momento">
            <div className="moment-art">
              <span>
                un café,
                <br />
                una pausa,
                <br />
                <em>un bonito día.</em>
              </span>
              <Coffee size={62} strokeWidth={1} />
            </div>
            <div className="moment-copy">
              <span className="eyebrow">EL MOMENTO LATTECITO</span>
              <h2>
                Las pequeñas cosas
                <br />
                saben mejor.
              </h2>
              <p>
                Un café entre pendientes. Un matcha con tu persona favorita. Una excusa para
                detenerte y disfrutar.
              </p>
              <p>Lattecito es una invitación a hacer espacio para esos pequeños momentos.</p>
              <Link href="/menu" className="text-link">
                Encuentra tu momento <ArrowRight size={17} />
              </Link>
            </div>
          </section>
        )}
<section className="contact" id="visitanos">
           <div>
             <span className="eyebrow">NOS ENCANTARÍA SABER DE TI</span>
             <h2>
               ¿Nos tomamos
               <br />
               un lattecito?
             </h2>
           </div>
           <div className="contact-details">
             <p>
               <MapPin size={19} />
               {settings?.address || 'Escríbenos para conocer nuestra ubicación.'}
             </p>
             <p>
               <Clock size={19} />
               {settings?.hours || 'Consulta nuestros horarios por WhatsApp.'}
             </p>
             <div className="contact-links">
               {(settings?.phones ?? ['529841651702', '529831137618']).map((p, i) => (
                 <a
                   key={p}
                   href={`https://wa.me/${p}`}
                   target="_blank"
                   rel="noreferrer"
                   className={i === 0 ? 'button' : 'text-link'}
                 >
                   <MessageCircle size={17} />
                   {i === 0 ? 'Hablemos por WhatsApp' : 'Contacto alternativo'}
                   <ArrowUpRight size={16} />
                 </a>
               ))}
             </div>
           </div>
           <div className="map-container">
             <iframe
               src="https://www.google.com/maps?q=18.682381,-88.396380&hl=es&z=15&output=embed"
               width="100%"
               height="100%"
               style={{ border: 0 }}
               allowFullScreen
               loading="lazy"
               referrerPolicy="no-referrer-when-downgrade"
               title="Ubicación de Lattecito Coffee"
             />
           </div>
         </section>
      </main>
      <footer>
        <Link href="/" className="wordmark">
          lattecito<span>COFFEE & LITTLE MOMENTS</span>
        </Link>
        <p>Hecho con calma. Disfrutado con cariño.</p>
        <small>© {new Date().getFullYear()} Lattecito Coffee</small>
      </footer>
      <dialog
        ref={dialog}
        aria-label="Personalizar bebida"
        onCancel={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setSelected(null);
        }}
        className="product-dialog"
      >
        {selected && (
          <>
            <button
              className="icon-button dialog-close"
              aria-label="Cerrar producto"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <div className={`product-dialog-art product-visual ${selected.tone}`}>
              <Coffee size={120} strokeWidth={0.7} />
              <span className="product-monogram">lattecito</span>
            </div>
            <div className="product-form">
              <span className="eyebrow">{selected.category}</span>
              <h2>{selected.name}</h2>
              <p>{selected.description}</p>
              <fieldset>
                <legend>Elige tu tamaño</legend>
                <div className="size-options">
                  {sizes.map((s, i) => (
                    <button
                      key={s}
                      aria-pressed={size === i}
                      className={size === i ? 'selected' : ''}
                      onClick={() => setSize(i)}
                    >
                      {s}
                      <strong>{money(selected.prices[i])}</strong>
                    </button>
                  ))}
                </div>
              </fieldset>
              {availableModifiers(selected.id, modifiers).length > 0 && (
                <fieldset>
                  <legend>Hazlo a tu gusto</legend>
                  {availableModifiers(selected.id, modifiers).map((m) => (
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
                      <span>
                        {m.name} <strong>+{money(m.price)}</strong>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="quantity-row">
                <span>Cantidad</span>
                <div className="stepper">
                  <button
                    aria-label="Reducir cantidad"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity(quantity - 1)}
                  >
                    <Minus size={15} />
                  </button>
                  <b>{quantity}</b>
                  <button
                    aria-label="Aumentar cantidad"
                    disabled={quantity >= 99}
                    onClick={() => setQuantity(quantity + 1)}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
              <button className="button full" onClick={add}>
                Agregar al pedido{' '}
                <span>
                  {money(
                    (selected.prices[size] +
                      modifiers
                        .filter((m) => extras.includes(m.id))
                        .reduce((sum, m) => sum + m.price, 0)) *
                      quantity,
                  )}
                </span>
              </button>
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              <small className="muted">Precios en MXN. Confirma la disponibilidad al pedir.</small>
            </div>
          </>
        )}
      </dialog>
      <dialog
        ref={cartDialog}
        aria-label="Tu pedido"
        onCancel={() => setDrawer(false)}
        className="cart-dialog"
      >
        <div className="cart-heading">
          <div>
            <span className="eyebrow">ALGO RICO TE ESPERA</span>
            <h2>
              Tu pedido <small>({count})</small>
            </h2>
          </div>
          <button
            aria-label="Cerrar pedido"
            className="icon-button"
            onClick={() => setDrawer(false)}
          >
            <X />
          </button>
        </div>
        {menuFailed && (
          <div className="notice error" role="alert">
            <p>{menuError}</p>
            <button className="small-button" onClick={() => void loadMenu()}>
              Revisar menú de nuevo
            </button>
          </div>
        )}
        {!reviewing && unavailable.length > 0 && (
          <div className="notice error" role="alert">
            <p>
              Hay {unavailable.length} combinaciones con productos o extras no disponibles. Quítalas
              para continuar.
            </p>
            <button className="small-button" onClick={() => setCart(validCart)}>
              Quitar artículos no disponibles
            </button>
          </div>
        )}
        {validCart.length === 0 ? (
          <div className="cart-empty">
            <ShoppingBag size={42} strokeWidth={1} />
            <h3>Una pausa por llenar.</h3>
            <p>Agrega tu bebida favorita para comenzar.</p>
            <button className="button" onClick={() => setDrawer(false)}>
              Seguir explorando
            </button>
          </div>
        ) : (
          <>
            <div className="cart-lines">
              {validCart.map((l, index) => {
                const p = products.find((p) => p.id === l.productId)!;
                return (
                  <div className="cart-line" key={lineKey(l)}>
                    <div className={`mini-cup ${p.tone}`}>
                      <Coffee size={26} />
                    </div>
                    <div>
                      <h3>{p.name}</h3>
                      <small>
                        {sizes[l.size]} · {money(totals!.items[index].unitPrice)} c/u
                      </small>
                      {!!l.modifierIds?.length && (
                        <p className="cart-extras">
                          {modifiers
                            .filter((m) => l.modifierIds?.includes(m.id))
                            .map((m) => `${m.name} +${money(m.price)}`)
                            .join(' · ')}
                        </p>
                      )}
                      <div className="stepper">
                        <button
                          aria-label={`Quitar uno de ${p.name}`}
                          onClick={() => update(l, -1)}
                        >
                          <Minus size={13} />
                        </button>
                        <b>{l.quantity}</b>
                        <button
                          aria-label={`Agregar uno de ${p.name}`}
                          onClick={() => update(l, 1)}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                    <strong>{money(totals!.items[index].unitPrice * l.quantity)}</strong>
                  </div>
                );
              })}
            </div>
            <label className="field">
              ¿Algo que debamos saber?
              <textarea
                placeholder="Sin azúcar, para llevar…"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Enviar mi pedido a</legend>
              <div className="phone-options">
                {settings?.phones.map((p, i) => (
                  <label key={p}>
                    <input
                      type="radio"
                      name="phone"
                      checked={phone === i}
                      onChange={() => setPhone(i)}
                    />
                    {p.slice(2)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="cart-total">
              <span>Total</span>
              <strong>
                {money(total)} <small>MXN</small>
              </strong>
            </div>
            {!reviewing && !menuFailed && unavailable.length === 0 ? (
              <a
                className="button full"
                target="_blank"
                rel="noreferrer"
                href={`https://wa.me/${settings?.phones[phone] ?? settings?.phones[0]}?text=${encodeURIComponent(whatsappText(products, validCart, note, modifiers))}`}
              >
                <MessageCircle size={19} />
                Continuar en WhatsApp
                <ArrowUpRight size={18} />
              </a>
            ) : (
              <button className="button full" disabled>
                {reviewing ? 'Revisando precios y extras…' : 'Revisa el pedido para continuar'}
              </button>
            )}
            <p className="muted cart-fine">
              Revisa y envía el mensaje en WhatsApp. Tu pedido queda confirmado cuando te
              respondamos.
            </p>
          </>
        )}
      </dialog>
    </>
  );
}
