import { createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import {
  clearAuthFailures,
  readAuthAttempts,
  registerAuthFailure,
  type MobileUser,
} from './supabase-store';
import { issueMobileToken, mobileAuthSecret, verifyMobileToken } from './mobile-token';

export { issueMobileToken, verifyMobileToken } from './mobile-token';

const configuredUser = z.object({
  username: z.string().min(3).max(50),
  role: z.enum(['admin', 'developer']),
  salt: z.string().regex(/^[a-f0-9]{32}$/),
  hash: z.string().regex(/^[a-f0-9]{128}$/),
});

function users() {
  const raw = process.env.MOBILE_ADMIN_USERS_JSON;
  if (!raw) throw new Error('Las cuentas móviles no están configuradas.');
  return z.array(configuredUser).min(1).max(20).parse(JSON.parse(raw));
}

export function mobileUser(request: NextRequest) {
  return verifyMobileToken(request.headers.get('authorization'));
}

export const adminSessionCookie = 'lattecito_admin_session';

export function webAdminUser(request: NextRequest) {
  const token = request.cookies.get(adminSessionCookie)?.value;
  if (!token) return null;
  try {
    return verifyMobileToken(`Bearer ${token}`);
  } catch {
    return null;
  }
}

function attemptKey(request: NextRequest, username: string) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return createHash('sha256')
    .update(`${mobileAuthSecret()}:${username.toLowerCase()}:${forwarded}`)
    .digest('hex');
}

export async function authenticateMobileUser(
  request: NextRequest,
  username: string,
  password: string,
) {
  const key = attemptKey(request, username);
  if ((await readAuthAttempts(key)) >= 5)
    throw new Error('Demasiados intentos. Espera 15 minutos antes de volver a intentar.');
  const user = users().find((item) => item.username.toLowerCase() === username.toLowerCase());
  const fallbackSalt = '00000000000000000000000000000000';
  const derived = scryptSync(password, user?.salt ?? fallbackSalt, 64).toString('hex');
  const expected = user?.hash ?? '0'.repeat(128);
  const valid = timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expected, 'hex'));
  if (!user || !valid) {
    await registerAuthFailure(key);
    throw new Error('Usuario o contraseña incorrectos.');
  }
  await clearAuthFailures(key);
  return { username: user.username, role: user.role } satisfies MobileUser;
}
