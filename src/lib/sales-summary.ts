export type SaleExtra = { id: string; name: string; unitPrice: number };

export type DetailedSaleItem = {
  productId?: string;
  productName?: string;
  sizeIndex?: number;
  name: string;
  size: string;
  quantity: number;
  baseUnitPrice?: number;
  extras?: SaleExtra[];
  unitPrice: number;
  cost: number;
};

export type SaleForSummary = {
  id: string;
  number: number;
  date: string;
  customer?: string;
  note?: string;
  items: DetailedSaleItem[];
  subtotal: number;
  total: number;
  payment: 'Efectivo' | 'Transferencia';
  paymentStatus: 'Pagado' | 'Pendiente';
  received: number;
  change: number;
};

export type DailyProductTotal = {
  key: string;
  productId: string;
  name: string;
  size: string;
  quantity: number;
  amount: number;
};

export type DailyExtraTotal = {
  key: string;
  id: string;
  name: string;
  quantity: number;
  amount: number;
};

export type DailySalesBreakdown = {
  products: DailyProductTotal[];
  extras: DailyExtraTotal[];
  total: number;
  cash: number;
  transfers: number;
  pendingTransfers: number;
  tickets: number;
};

export function displaySaleItem(item: DetailedSaleItem) {
  const extras = item.extras?.length
    ? ` + ${item.extras.map((extra) => extra.name).join(', ')}`
    : '';
  return `${item.name}${extras} · ${item.size}`;
}

export function dailySalesBreakdown(sales: SaleForSummary[]): DailySalesBreakdown {
  const paid = sales.filter((sale) => sale.paymentStatus === 'Pagado');
  const productMap = new Map<string, DailyProductTotal>();
  const extraMap = new Map<string, DailyExtraTotal>();

  for (const sale of paid) {
    for (const item of sale.items) {
      const productId = item.productId ?? `legacy:${item.name.toLocaleLowerCase('es-MX')}`;
      const key = `${productId}|${item.sizeIndex ?? item.size}`;
      const extrasUnit = (item.extras ?? []).reduce((sum, extra) => sum + extra.unitPrice, 0);
      const baseUnitPrice = item.baseUnitPrice ?? Math.max(0, item.unitPrice - extrasUnit);
      const product = productMap.get(key) ?? {
        key,
        productId,
        name: item.productName ?? item.name,
        size: item.size,
        quantity: 0,
        amount: 0,
      };
      product.quantity += item.quantity;
      product.amount += baseUnitPrice * item.quantity;
      productMap.set(key, product);

      for (const extra of item.extras ?? []) {
        const extraKey = extra.id || `legacy:${extra.name.toLocaleLowerCase('es-MX')}`;
        const total = extraMap.get(extraKey) ?? {
          key: extraKey,
          id: extra.id,
          name: extra.name,
          quantity: 0,
          amount: 0,
        };
        total.quantity += item.quantity;
        total.amount += extra.unitPrice * item.quantity;
        extraMap.set(extraKey, total);
      }
    }
  }

  return {
    products: [...productMap.values()].sort(
      (a, b) => b.amount - a.amount || a.name.localeCompare(b.name),
    ),
    extras: [...extraMap.values()].sort(
      (a, b) => b.amount - a.amount || a.name.localeCompare(b.name),
    ),
    total: paid.reduce((sum, sale) => sum + sale.total, 0),
    cash: paid
      .filter((sale) => sale.payment === 'Efectivo')
      .reduce((sum, sale) => sum + sale.total, 0),
    transfers: paid
      .filter((sale) => sale.payment === 'Transferencia')
      .reduce((sum, sale) => sum + sale.total, 0),
    pendingTransfers: sales
      .filter((sale) => sale.paymentStatus === 'Pendiente')
      .reduce((sum, sale) => sum + sale.total, 0),
    tickets: sales.length,
  };
}

export function receiptText(sale: SaleForSummary, money: (cents: number) => string) {
  const lines = sale.items.flatMap((item) => [
    `${item.quantity} × ${item.name} · ${item.size}`,
    ...(item.extras ?? []).map(
      (extra) => `  + ${extra.name} · ${money(extra.unitPrice * item.quantity)}`,
    ),
    `  ${money(item.unitPrice * item.quantity)}`,
  ]);
  return [
    'LATTECITO COFFEE',
    `Comprobante #${sale.number}`,
    new Date(sale.date).toLocaleString('es-MX', { timeZone: 'America/Cancun' }),
    sale.customer ? `Cliente: ${sale.customer}` : '',
    '--------------------------------',
    ...lines,
    '--------------------------------',
    `Total: ${money(sale.total)}`,
    `${sale.payment}: ${sale.paymentStatus}`,
    sale.payment === 'Efectivo' ? `Recibido: ${money(sale.received)}` : '',
    sale.payment === 'Efectivo' ? `Cambio: ${money(sale.change)}` : '',
    sale.note ? `Nota: ${sale.note}` : '',
    'Gracias por tu compra.',
  ]
    .filter(Boolean)
    .join('\n');
}
