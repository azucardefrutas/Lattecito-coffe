import type { Metadata } from 'next';
import ShowcaseView from '@/components/showcase-view';
import { readShowcaseDashboard, ShowcaseLinkError } from '@/lib/supabase-store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Lattecito Coffee · Informe de negocio',
  description: 'Vista de solo lectura del desempeño de Lattecito Coffee.',
  robots: { index: false, follow: false, noarchive: true },
};

export default async function ShowcasePage({ params }: { params: Promise<{ token: string }> }) {
  if (process.env.APP_SURFACE !== 'catalog-admin' || process.env.CATALOG_ADMIN_ENABLED !== 'true')
    return (
      <ReadError
        title="Vista no disponible"
        detail="Esta página no está habilitada en este sitio."
      />
    );
  try {
    const { token } = await params;
    return <ShowcaseView data={await readShowcaseDashboard(token)} />;
  } catch (error) {
    const detail =
      error instanceof ShowcaseLinkError
        ? error.message
        : 'El informe no está disponible en este momento.';
    return <ReadError title="Acceso de lectura cerrado" detail={detail} />;
  }
}

function ReadError({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="showcase-error">
      <span className="showcase-logo">lattecito</span>
      <span className="eyebrow">INFORME TEMPORAL</span>
      <h1>{title}</h1>
      <p>{detail}</p>
      <small>Solicita al equipo un código QR vigente.</small>
    </main>
  );
}
