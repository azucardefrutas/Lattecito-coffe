import { fetch } from 'expo/fetch';

export type Role = 'admin' | 'developer';
export type AdminUser = { username: string; role: Role };
export type Modifier = { id: string; name: string; price: number; active: boolean };
export type Product = {
  id: string;
  name: string;
  kind?: 'drink' | 'snack';
  category: string;
  description: string;
  prices: number[];
  active: boolean;
  imageUrl?: string;
};
export type SaleItem = {
  productId?: string;
  productName?: string;
  sizeIndex?: number;
  name: string;
  size: string;
  quantity: number;
  baseUnitPrice?: number;
  extras?: { id: string; name: string; unitPrice: number }[];
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
export type InventoryItem = {
  id: string;
  name: string;
  unit: 'g' | 'ml' | 'pieza';
  stock: number;
  minimum: number;
  costPerUnit: number;
  active: boolean;
  updatedAt: string;
};
export type InventoryRecipe = {
  targetType: 'product' | 'modifier';
  targetId: string;
  sizeIndex: number;
  ingredients: { itemId: string; quantity: number }[];
};
export type InventoryMovement = {
  id: string;
  itemId: string;
  quantity: number;
  reason: string;
  type: 'entry' | 'adjustment' | 'sale';
  resultingStock: number;
  saleId: string;
  createdBy: string;
  date: string;
};
export type Dashboard = {
  user: AdminUser;
  catalog: { products: Product[]; modifiers: Modifier[] };
  costs: Record<string, number[]>;
  sales: Sale[];
  inventory: {
    items: InventoryItem[];
    recipes: InventoryRecipe[];
    movements: InventoryMovement[];
    summary: {
      itemCount: number;
      lowStockCount: number;
      inventoryValue: number;
      configuredRecipes: number;
    };
  };
  daily: {
    products: {
      key: string;
      productId: string;
      name: string;
      size: string;
      quantity: number;
      amount: number;
    }[];
    extras: { key: string; id: string; name: string; quantity: number; amount: number }[];
    total: number;
    cash: number;
    transfers: number;
    pendingTransfers: number;
    tickets: number;
  };
  history: {
    date: string;
    tickets: number;
    total: number;
    cash: number;
    transfers: number;
    pendingTransfers: number;
    cost: number;
  }[];
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
    const error = new Error(
      (body as { error?: string } | null)?.error ?? 'No fue posible conectar.',
    );
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
