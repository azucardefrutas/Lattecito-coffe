import { notFound } from 'next/navigation';
import CatalogAdmin from '@/components/catalog-admin';

export const dynamic = 'force-dynamic';

export default function Page() {
  if (process.env.APP_SURFACE !== 'catalog-admin' || process.env.CATALOG_ADMIN_ENABLED !== 'true')
    notFound();
  return <CatalogAdmin />;
}
