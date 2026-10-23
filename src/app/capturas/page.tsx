import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import GalleryView from '@/components/gallery-view';
import { listGalleryItems } from '@/lib/supabase-store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Galería · Lattecito Coffee',
  description: 'Conoce en imágenes el local, las bebidas y el proyecto de Lattecito Coffee.',
  alternates: { canonical: 'https://lattecito-coffe.vercel.app/capturas' },
  robots: { index: false, follow: false, noarchive: true },
};

export default async function CapturasPage() {
  if ((process.env.APP_SURFACE ?? 'public') !== 'public') notFound();
  let items = [] as Awaited<ReturnType<typeof listGalleryItems>>;
  try {
    items = await listGalleryItems(true);
  } catch (error) {
    console.warn('No fue posible cargar la galería pública.', error);
  }
  return (
    <GalleryView
      items={items.map((item) => ({
        id: item.id,
        imageUrl: item.imageUrl,
        title: item.title,
        description: item.description,
        altText: item.altText,
        category: item.category,
        width: item.width,
        height: item.height,
      }))}
    />
  );
}
