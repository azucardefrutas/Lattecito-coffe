'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Coffee, Expand, X } from 'lucide-react';
import {
  galleryCategories,
  galleryCategoryLabels,
  type GalleryCategory,
  type GalleryItem,
} from '@/lib/gallery-schema';

type PublicGalleryItem = Pick<
  GalleryItem,
  'id' | 'imageUrl' | 'title' | 'description' | 'altText' | 'category' | 'width' | 'height'
>;

export default function GalleryView({ items }: { items: PublicGalleryItem[] }) {
  const [filter, setFilter] = useState<'all' | GalleryCategory>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const categories = useMemo(
    () => galleryCategories.filter((category) => items.some((item) => item.category === category)),
    [items],
  );
  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.category === filter)),
    [filter, items],
  );
  const selectedIndex = selectedId ? filtered.findIndex((item) => item.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;

  function move(direction: -1 | 1) {
    if (!selected || filtered.length < 2) return;
    const next = (selectedIndex + direction + filtered.length) % filtered.length;
    setSelectedId(filtered[next].id);
  }

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null);
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  });

  return (
    <main className="public-gallery-page">
      {items.length > 0 && (
        <nav className="public-gallery-filters" aria-label="Filtrar fotografías">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            Todas <span>{items.length}</span>
          </button>
          {categories.map((category) => {
            const count = items.filter((item) => item.category === category).length;
            return (
              <button
                className={filter === category ? 'active' : ''}
                key={category}
                onClick={() => setFilter(category)}
              >
                {galleryCategoryLabels[category]} <span>{count}</span>
              </button>
            );
          })}
        </nav>
      )}

      {filtered.length ? (
        <section className="public-gallery-grid" aria-live="polite">
          {filtered.map((item, index) => (
            <button
              className="public-gallery-card"
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              aria-label={`Abrir foto: ${item.title}`}
            >
              <span
                className="public-gallery-image"
                style={{ aspectRatio: `${item.width} / ${item.height}` }}
              >
                <img
                  src={item.imageUrl}
                  alt={item.altText}
                  loading={index < 4 ? 'eager' : 'lazy'}
                  decoding="async"
                />
                <span className="public-gallery-expand">
                  <Expand size={18} /> Ver
                </span>
              </span>
              <span className="public-gallery-caption">
                <small>{galleryCategoryLabels[item.category]}</small>
                <strong>{item.title}</strong>
                {item.description && <span>{item.description}</span>}
              </span>
            </button>
          ))}
        </section>
      ) : (
        <section className="public-gallery-empty">
          <Coffee size={42} />
          <h2>Estamos preparando esta galería</h2>
          <p>Muy pronto encontrarás aquí fotos del proyecto Lattecito Coffee.</p>
          <a className="button" href="/">
            Conocer el menú
          </a>
        </section>
      )}

      {selected && (
        <div
          className="gallery-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={selected.title}
          onClick={() => setSelectedId(null)}
        >
          <button
            className="gallery-lightbox-close"
            aria-label="Cerrar foto"
            onClick={() => setSelectedId(null)}
          >
            <X size={24} />
          </button>
          {filtered.length > 1 && (
            <button
              className="gallery-lightbox-nav previous"
              aria-label="Foto anterior"
              onClick={(event) => {
                event.stopPropagation();
                move(-1);
              }}
            >
              <ChevronLeft size={30} />
            </button>
          )}
          <figure onClick={(event) => event.stopPropagation()}>
            <img src={selected.imageUrl} alt={selected.altText} />
            <figcaption>
              <strong>{selected.title}</strong>
              {selected.description && <span>{selected.description}</span>}
            </figcaption>
          </figure>
          {filtered.length > 1 && (
            <button
              className="gallery-lightbox-nav next"
              aria-label="Foto siguiente"
              onClick={(event) => {
                event.stopPropagation();
                move(1);
              }}
            >
              <ChevronRight size={30} />
            </button>
          )}
        </div>
      )}
    </main>
  );
}
