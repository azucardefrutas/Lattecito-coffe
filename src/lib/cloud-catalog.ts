import snapshot from '@/data/public-menu.json';
import { catalogSchema, type PublicCatalog } from './catalog-schema';
import {
  hasSupabase,
  readSupabaseCatalog,
  saveSupabaseCatalog,
  SupabaseConflictError,
} from './supabase-store';

export class CatalogConflictError extends Error {}

export async function readCloudCatalog(): Promise<{
  catalog: PublicCatalog;
  etag: string | null;
  source: 'supabase' | 'snapshot';
}> {
  if (hasSupabase()) return readSupabaseCatalog();
  return { catalog: catalogSchema.parse(snapshot), etag: null, source: 'snapshot' };
}

export async function saveCloudCatalog(catalog: PublicCatalog, etag: string | null) {
  if (hasSupabase()) {
    try {
      return await saveSupabaseCatalog(catalog, etag);
    } catch (error) {
      if (error instanceof SupabaseConflictError) throw new CatalogConflictError(error.message);
      throw error;
    }
  }
  catalogSchema.parse(catalog);
  throw new Error('Conecta Supabase para guardar cambios en el catálogo.');
}
