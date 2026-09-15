import { fetch } from 'expo/fetch';

export type Role = 'admin' | 'developer';
export type AdminUser = { username: string; role: Role };
export type Modifier = { id: string; name: string; price: number; active: boolean };
export type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  prices: number[];
  active: boolean;
  imageUrl?: string;
};
export type SaleItem = {
  name: string;
  size: string;
  quantity: number;
  unitPrice: number;
  cost: number;
};
export type Sale = {
  id: string;
  number: number;
  date: string;
  createdBy: string;
  confirmedBy: string;
  customer: string;
  note: string;
  items: SaleItem[];
  subtotal: number;
  total: number;
  cost: number;
  payment: 'Efectivo' | 'Transferencia';
  paymentStatus: 'Pagado' | 'Pendiente';
  received: number;
  change: number;
};
export type Dashboard = {
  user: AdminUser;
  catalog: { products: Product[]; modifiers: Modifier[] };
  costs: Record<string, number[]>;
  sales: Sale[];
  summary: {
    total: number;
    cash: number;
    transfers: number;
    pendingTransfers: number;
    grossProfit: number;
    missingCostCount: number;
    tickets: number;
  };
};

const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lattecito-coffe.vercel.app').replace(
  /\/$/,
  '',
);

async function request<T>(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => null)) as { error?: string } | T | null;
  if (!response.ok) {
    const error = new Error((body as { error?: string } | null)?.error ?? 'No fue posible conectar.');
    Object.assign(error, { status: response.status });
    throw error;
  }
  return body as T;
}

export async function login(username: string, password: string) {
  return request<{ token: string; user: AdminUser }>('/api/mobile-admin/auth', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function loadDashboard(token: string) {
  return request<Dashboard>('/api/mobile-admin', { token });
}

export async function sendCommand<T>(token: string, body: object) {
  return request<T>('/api/mobile-admin', { method: 'POST', token, body: JSON.stringify(body) });
}

export function isUnauthorized(error: unknown) {
  return error instanceof Error && (error as Error & { status?: number }).status === 401;
}
