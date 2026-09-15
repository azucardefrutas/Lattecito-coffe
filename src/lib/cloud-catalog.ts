import { BlobPreconditionFailedError, get, put } from '@vercel/blob';
import snapshot from '@/data/public-menu.json';
import { catalogSchema, type PublicCatalog } from './catalog-schema';

const CATALOG_PATH = 'lattecito/catalog.json';

export class CatalogConflictError extends Error {}

export async function readCloudCatalog(): Promise<{
  catalog: PublicCatalog;
  etag: string | null;
  source: 'blob' | 'snapshot';
}> {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)
    return { catalog: catalogSchema.parse(snapshot), etag: null, source: 'snapshot' };
  const result = await get(CATALOG_PATH, { access: 'public', useCache: false });
  if (!result) return { catalog: catalogSchema.parse(snapshot), etag: null, source: 'snapshot' };
  const catalog = catalogSchema.parse(JSON.parse(await new Response(result.stream).text()));
  return { catalog, etag: result.blob.etag, source: 'blob' };
}

export async function saveCloudCatalog(catalog: PublicCatalog, etag: string | null) {
  const parsed = catalogSchema.parse(catalog);
  try {
    return await put(CATALOG_PATH, JSON.stringify(parsed), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json; charset=utf-8',
      cacheControlMaxAge: 60,
      ...(etag ? { ifMatch: etag } : {}),
    });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError)
      throw new CatalogConflictError(
        'El menú cambió en otra pestaña. Actualiza y vuelve a intentar.',
      );
    throw error;
  }
}
