import type { ProfitMetrics } from './business-analytics';
import type { InventoryUnit } from './inventory-schema';

export type ShowcaseDay = {
  date: string;
  tickets: number;
  sales: number;
  cost: number;
  expenses: number;
  net: number;
};

export type ShowcaseProduct = {
  key: string;
  name: string;
  size: string;
  quantity: number;
  amount: number;
};

export type ShowcaseExtra = {
  key: string;
  name: string;
  quantity: number;
  amount: number;
};

export type ShowcaseInventoryItem = {
  id: string;
  name: string;
  unit: InventoryUnit;
  stock: number;
  minimum: number;
  costPerUnit: number;
  value: number;
  status: 'Disponible' | 'Necesita compra';
};

export type ShowcaseArchive = {
  id: string;
  createdAt: string;
  createdBy: string;
  period: { start: string; end: string; days: number };
  metrics: ProfitMetrics;
  inventory: {
    items: ShowcaseInventoryItem[];
    value: number;
    lowStockCount: number;
  };
};

export type ShowcaseDashboard = {
  generatedAt: string;
  expiresAt: string;
  business: {
    name: string;
    hours: string;
    sample: boolean;
  };
  period: { start: string; end: string; days: number };
  metrics: ProfitMetrics;
  days: ShowcaseDay[];
  products: ShowcaseProduct[];
  extras: ShowcaseExtra[];
  inventory: {
    items: ShowcaseInventoryItem[];
    value: number;
    lowStockCount: number;
  };
  coverage: {
    configuredProducts: number;
    totalProducts: number;
    percentage: number;
    missingProducts: string[];
    recipes: number;
    inventoryItems: number;
    daysWithSales: number;
    daysWithRecordedCost: number;
    reliable: boolean;
  };
  archives: ShowcaseArchive[];
  views: number;
};

export type ShowcaseLinkStatus = {
  id: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  revokedAt: string;
  viewCount: number;
  lastViewedAt: string;
  active: boolean;
};
