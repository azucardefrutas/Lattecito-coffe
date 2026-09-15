import { scryptSync, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { db } from './db';
export async function localOnly() {
  if (process.env.VERCEL) throw new Error('El POS está habilitado solo en este equipo.');
  if (process.env.APP_SURFACE !== 'admin') throw new Error('Acceso no permitido.');
  const h = await headers();
  const host = h.get('host')?.split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost')
    throw new Error('La administración está habilitada solo en este equipo.');
}
export async function authorized() {
  await localOnly();
  const c = (await cookies()).get('latte-session')?.value;
  if (!c) return false;
  const token = createHash('sha256').update(c).digest('hex');
  return !!db()
    .prepare('SELECT token FROM sessions WHERE token=? AND expires>?')
    .get(token, Date.now());
}
export async function authenticate(password: string) {
  const d = db();
  const throttle = d.prepare('SELECT * FROM throttle WHERE id=1').get() as
    { failures: number; until_time: number } | undefined;
  if (throttle && throttle.until_time > Date.now())
    throw new Error('Demasiados intentos. Espera 5 minutos.');
  const auth = d.prepare('SELECT * FROM auth WHERE id=1').get() as
    { hash: string; salt: string } | undefined;
  if (!auth) {
    const salt = randomBytes(16).toString('hex');
    d.prepare('INSERT INTO auth VALUES (1,?,?)').run(
      scryptSync(password, salt, 64).toString('hex'),
      salt,
    );
  } else if (!timingSafeEqual(Buffer.from(auth.hash, 'hex'), scryptSync(password, auth.salt, 64))) {
    const failures = (throttle?.failures ?? 0) + 1;
    d.prepare('INSERT OR REPLACE INTO throttle VALUES (1,?,?)').run(
      failures,
      failures >= 5 ? Date.now() + 300000 : 0,
    );
    throw new Error('Contraseña incorrecta.');
  }
  d.exec('DELETE FROM throttle');
  d.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  const token = randomBytes(32).toString('hex');
  d.prepare('INSERT INTO sessions VALUES (?,?)').run(
    createHash('sha256').update(token).digest('hex'),
    Date.now() + 8 * 60 * 60 * 1000,
  );
  (await cookies()).set('latte-session', token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60,
    secure: false,
  });
}
