import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { MobileUser } from './supabase-store';

const tokenPayload = z.object({
  sub: z.string().min(3).max(50),
  role: z.enum(['admin', 'developer']),
  exp: z.number().int(),
});

export function mobileAuthSecret() {
  const value = process.env.MOBILE_ADMIN_AUTH_SECRET;
  if (!value || value.length < 32) throw new Error('La autenticación móvil no está configurada.');
  return value;
}

function signature(value: string) {
  return createHmac('sha256', mobileAuthSecret()).update(value).digest('base64url');
}

export function issueMobileToken(user: MobileUser) {
  const body = Buffer.from(
    JSON.stringify({ ...user, sub: user.username, exp: Date.now() + 8 * 60 * 60 * 1000 }),
  ).toString('base64url');
  return `${body}.${signature(body)}`;
}

export function verifyMobileToken(value: string | null): MobileUser | null {
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice(7);
  const [body, sent, extra] = token.split('.');
  if (!body || !sent || extra) return null;
  const expected = signature(body);
  if (sent.length !== expected.length || !timingSafeEqual(Buffer.from(sent), Buffer.from(expected)))
    return null;
  try {
    const parsed = tokenPayload.parse(JSON.parse(Buffer.from(body, 'base64url').toString()));
    if (parsed.exp <= Date.now()) return null;
    return { username: parsed.sub, role: parsed.role };
  } catch {
    return null;
  }
}
