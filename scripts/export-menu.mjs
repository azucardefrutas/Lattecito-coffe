import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { publicMenu } from '../src/lib/public-menu.ts';

const directory = process.env.LATTECITO_DATA_DIR || path.join(process.cwd(), 'data');
const db = new DatabaseSync(path.join(directory, 'lattecito.sqlite'), { readOnly: true });
try {
  const row = db.prepare('SELECT body FROM store WHERE id=1').get();
  if (!row) throw new Error('No existe un catálogo local para publicar.');
  const menu = publicMenu(JSON.parse(row.body));
  mkdirSync('src/data', { recursive: true });
  writeFileSync('src/data/public-menu.json', JSON.stringify(menu, null, 2) + '\n');
  console.log(`Catálogo público exportado: ${menu.products.length} productos y ${menu.modifiers.length} extras. Sin datos internos del POS.`);
} finally {
  db.close();
}
