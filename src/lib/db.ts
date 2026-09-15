import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { initialProducts, type Store } from './model';
const globalDb = globalThis as unknown as { latteDb?: DatabaseSync };
export function db() {
  if (process.env.VERCEL) throw new Error('El POS SQLite solo está disponible localmente.');
  if (!globalDb.latteDb) {
    const dir = process.env.LATTECITO_DATA_DIR || path.join(process.cwd(), 'data');
    mkdirSync(dir, { recursive: true });
    const d = new DatabaseSync(path.join(dir, 'lattecito.sqlite'));
    d.exec(
      'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS store (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS auth (id INTEGER PRIMARY KEY CHECK(id=1), hash TEXT NOT NULL, salt TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS throttle (id INTEGER PRIMARY KEY CHECK(id=1), failures INTEGER NOT NULL, until_time INTEGER NOT NULL);',
    );
    d.prepare('INSERT OR IGNORE INTO store (id,body) VALUES (1,?)').run(
      JSON.stringify({
        products: initialProducts,
        sales: [],
        cash: [],
        movements: [],
        ingredients: [],
        modifiers: [],
        settings: {
          phones: ['529841651702', '529831137618'],
          address: '',
          hours: '',
          sample: true,
        },
      } satisfies Store),
    );
    globalDb.latteDb = d;
  }
  return globalDb.latteDb;
}
export function readStore(): Store {
  return JSON.parse(
    (db().prepare('SELECT body FROM store WHERE id=1').get() as { body: string }).body,
  );
}
export function transaction<T>(fn: (store: Store) => T): T {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const store = readStore();
    const result = fn(store);
    d.prepare('UPDATE store SET body=? WHERE id=1').run(JSON.stringify(store));
    d.exec('COMMIT');
    return result;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
