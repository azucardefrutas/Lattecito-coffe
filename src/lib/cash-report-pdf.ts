export type CashReportDay = {
  date: string;
  tickets: number;
  total: number;
  cash: number;
  transfers: number;
  pendingTransfers: number;
  cost: number;
  expenses: number;
  net: number;
  products?: Array<{ name: string; size: string; quantity: number; amount: number }>;
  extras?: Array<{ name: string; quantity: number; amount: number }>;
};

export type SaleReceiptPdf = {
  number: number;
  date: string;
  customer?: string;
  items: Array<{
    name: string;
    size: string;
    quantity: number;
    baseUnitPrice?: number;
    unitPrice: number;
    cost: number;
    extras?: Array<{ name: string; unitPrice: number }>;
  }>;
  total: number;
  cost: number;
  payment: string;
  paymentStatus: string;
};

const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});

function pdfText(value: string) {
  return value
    .normalize('NFC')
    .replace(/[\\()]/g, (character) => `\\${character}`)
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u202f\u00a0]/g, ' ');
}

function latin1Bytes(value: string) {
  const special: Record<number, number> = {
    0x20ac: 0x80,
    0x201a: 0x82,
    0x201e: 0x84,
    0x2026: 0x85,
    0x2020: 0x86,
    0x2021: 0x87,
    0x2030: 0x89,
    0x2039: 0x8b,
    0x0152: 0x8c,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2022: 0x95,
    0x2122: 0x99,
    0x203a: 0x9b,
    0x0153: 0x9c,
  };
  return Uint8Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0xff ? code : (special[code] ?? 0x3f);
  });
}

function addText(
  commands: string[],
  value: string,
  x: number,
  y: number,
  size: number,
  options: { bold?: boolean; color?: string } = {},
) {
  commands.push(
    `BT /${options.bold ? 'F2' : 'F1'} ${size} Tf ${options.color ?? '0.18 0.13 0.11'} rg 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET`,
  );
}

function formatMoney(cents: number) {
  return moneyFormatter.format(cents / 100);
}

export function createCashReportPdf(day: CashReportDay) {
  const date = new Date(`${day.date}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const generated = new Date().toLocaleString('es-MX', { timeZone: 'America/Cancun' });
  const profit = day.total - day.cost;
  const hasDetails = Boolean(day.products?.length || day.extras?.length);
  const commands: string[] = [
    'q 0.23 0.14 0.11 rg 0 708 612 84 re f Q',
    'q 0.96 0.92 0.87 rg 0 0 612 708 re f Q',
  ];

  addText(commands, 'lattecito coffee', 48, 756, 23, { bold: true, color: '1 1 1' });
  addText(commands, 'CORTE DE CAJA', 48, 735, 9, { color: '0.9 0.82 0.76' });
  addText(commands, 'Resumen diario', 48, 660, 24, { bold: true });
  addText(commands, date, 48, 637, 12, { color: '0.42 0.34 0.3' });

  const rows: Array<[string, string]> = [
    ['Tickets registrados', String(day.tickets)],
    ['Efectivo cobrado', formatMoney(day.cash)],
    ['Transferencias cobradas', formatMoney(day.transfers)],
    ['Transferencias pendientes', formatMoney(day.pendingTransfers)],
    ['Venta total cobrada', formatMoney(day.total)],
    ['Costo registrado', formatMoney(day.cost)],
    ['Gastos de insumos', formatMoney(day.expenses)],
    ['Disponible después de gastos', formatMoney(day.net)],
  ];
  let y = 585;
  rows.forEach(([label, value], index) => {
    const fill = index % 2 === 0 ? '1 0.98 0.95' : '0.94 0.89 0.84';
    commands.push(`q ${fill} rg 48 ${y - 13} 516 42 re f Q`);
    addText(commands, label, 64, y + 2, 11, { color: '0.42 0.34 0.3' });
    addText(commands, value, 548 - value.length * 5.7, y + 1, 12, { bold: true });
    y -= 48;
  });

  commands.push('q 0.48 0.25 0.2 rg 48 126 516 58 re f Q');
  addText(commands, 'GANANCIA ESTIMADA', 64, 155, 10, { bold: true, color: '0.91 0.82 0.75' });
  addText(commands, formatMoney(profit), 390, 148, 19, { bold: true, color: '1 1 1' });
  addText(
    commands,
    'La ganancia se calcula como venta cobrada menos costo registrado.',
    48,
    104,
    9,
    { color: '0.42 0.34 0.3' },
  );
  addText(commands, `Generado: ${generated}`, 48, 52, 8, { color: '0.5 0.43 0.39' });
  addText(commands, 'Documento generado desde Historial compacto.', 48, 36, 8, {
    color: '0.5 0.43 0.39',
  });
  addText(commands, hasDetails ? '1 de 2' : '1', 530, 36, 8, { color: '0.5 0.43 0.39' });

  const content = `${commands.join('\n')}\n`;
  if (hasDetails) {
    const detail: string[] = [
      'q 0.23 0.14 0.11 rg 0 708 612 84 re f Q',
      'q 0.98 0.96 0.93 rg 0 0 612 708 re f Q',
    ];
    addText(detail, 'lattecito coffee', 48, 756, 23, { bold: true, color: '1 1 1' });
    addText(detail, 'DETALLE DEL DÍA', 48, 735, 9, { color: '0.9 0.82 0.76' });
    addText(detail, 'Productos y extras vendidos', 48, 660, 22, { bold: true });
    addText(detail, date, 48, 638, 11, { color: '0.42 0.34 0.3' });
    detail.push('q 0.48 0.25 0.2 rg 48 590 516 30 re f Q');
    addText(detail, 'CANT.', 58, 601, 9, { bold: true, color: '1 1 1' });
    addText(detail, 'PRODUCTO', 108, 601, 9, { bold: true, color: '1 1 1' });
    addText(detail, 'INGRESO', 490, 601, 9, { bold: true, color: '1 1 1' });
    const detailRows = [
      ...(day.products ?? []).map((row) => ({
        quantity: row.quantity,
        name: `${row.name} · ${row.size}`,
        amount: row.amount,
      })),
      ...(day.extras ?? []).map((row) => ({
        quantity: row.quantity,
        name: `Extra · ${row.name}`,
        amount: row.amount,
      })),
    ];
    let detailY = 560;
    detailRows.slice(0, 17).forEach((row, index) => {
      if (index % 2 === 0) detail.push(`q 1 0.99 0.97 rg 48 ${detailY - 9} 516 27 re f Q`);
      addText(detail, String(row.quantity), 62, detailY, 9, { bold: true });
      addText(detail, row.name.slice(0, 52), 108, detailY, 9);
      addText(detail, formatMoney(row.amount), 490, detailY, 9, { bold: true });
      detailY -= 29;
    });
    if (detailRows.length > 17)
      addText(
        detail,
        `+ ${detailRows.length - 17} renglones adicionales disponibles en la administración.`,
        48,
        62,
        8,
        { color: '0.5 0.43 0.39' },
      );
    addText(detail, 'Página 2 de 2', 500, 36, 8, { color: '0.5 0.43 0.39' });
    return buildDocument([content, `${detail.join('\n')}\n`], `Corte de caja ${day.date}`);
  }
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${latin1Bytes(content).length} >>\nstream\n${content}endstream`,
    `<< /Title (Corte de caja ${pdfText(day.date)}) /Author (Lattecito Coffee) /Creator (Lattecito Admin) >>`,
  ];

  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return latin1Bytes(pdf);
}

export function createSaleReceiptPdf(sale: SaleReceiptPdf) {
  const rows = sale.items.flatMap((item) => {
    const extrasUnit = (item.extras ?? []).reduce((sum, extra) => sum + extra.unitPrice, 0);
    const productUnit = item.baseUnitPrice ?? Math.max(0, item.unitPrice - extrasUnit);
    return [
      {
        quantity: String(item.quantity),
        description: `${item.name} · ${item.size}`,
        unit: formatMoney(productUnit),
        total: formatMoney(productUnit * item.quantity),
        muted: false,
      },
      ...(item.extras ?? []).map((extra) => ({
        quantity: '',
        description: `+ ${extra.name}`,
        unit: formatMoney(extra.unitPrice),
        total: formatMoney(extra.unitPrice * item.quantity),
        muted: true,
      })),
    ];
  });
  const chunks: (typeof rows)[] = [];
  for (let index = 0; index < rows.length; index += 18) chunks.push(rows.slice(index, index + 18));
  if (!chunks.length) chunks.push([]);
  const generated = new Date().toLocaleString('es-MX', { timeZone: 'America/Cancun' });
  const saleDate = new Date(sale.date).toLocaleString('es-MX', { timeZone: 'America/Cancun' });
  const margin =
    sale.total > 0 && sale.cost > 0
      ? Math.round(((sale.total - sale.cost) / sale.total) * 1000) / 10
      : null;
  const pageCommands = chunks.map((chunk, pageIndex) => {
    const commands = [
      'q 0.23 0.14 0.11 rg 0 708 612 84 re f Q',
      'q 0.98 0.96 0.93 rg 0 0 612 708 re f Q',
    ];
    addText(commands, 'lattecito coffee', 42, 756, 22, { bold: true, color: '1 1 1' });
    addText(commands, `TICKET #${sale.number}`, 42, 735, 9, { color: '0.91 0.82 0.75' });
    addText(
      commands,
      pageIndex === 0 ? 'Detalle de venta' : 'Detalle de venta · continuación',
      42,
      672,
      21,
      { bold: true },
    );
    addText(commands, saleDate, 42, 650, 10, { color: '0.42 0.34 0.3' });
    if (pageIndex === 0 && sale.customer)
      addText(commands, `Cliente: ${sale.customer}`, 42, 630, 10);
    commands.push('q 0.48 0.25 0.2 rg 42 584 528 30 re f Q');
    addText(commands, 'CANT.', 52, 595, 9, { bold: true, color: '1 1 1' });
    addText(commands, 'PRODUCTO', 102, 595, 9, { bold: true, color: '1 1 1' });
    addText(commands, 'P. UNITARIO', 410, 595, 9, { bold: true, color: '1 1 1' });
    addText(commands, 'TOTAL', 522, 595, 9, { bold: true, color: '1 1 1' });
    let y = 558;
    chunk.forEach((row, index) => {
      if (index % 2 === 0) commands.push(`q 1 0.99 0.97 rg 42 ${y - 9} 528 27 re f Q`);
      const color = row.muted ? '0.5 0.43 0.39' : '0.18 0.13 0.11';
      addText(commands, row.quantity, 54, y, 9, { bold: !row.muted, color });
      addText(commands, row.description.slice(0, 48), 102, y, 9, { bold: !row.muted, color });
      addText(commands, row.unit, 414, y, 9, { color });
      addText(commands, row.total, 518, y, 9, { bold: !row.muted, color });
      y -= 28;
    });
    if (pageIndex === chunks.length - 1) {
      commands.push('q 0.91 0.84 0.77 rg 316 120 254 118 re f Q');
      addText(commands, 'VENTA TOTAL', 332, 211, 9, { bold: true });
      addText(commands, formatMoney(sale.total), 462, 209, 12, { bold: true });
      addText(commands, 'COSTO REGISTRADO', 332, 183, 9);
      addText(commands, sale.cost > 0 ? formatMoney(sale.cost) : 'Pendiente', 462, 182, 10, {
        bold: true,
      });
      addText(commands, 'UTILIDAD BRUTA', 332, 155, 9);
      addText(
        commands,
        sale.cost > 0 ? formatMoney(sale.total - sale.cost) : 'Pendiente',
        462,
        154,
        10,
        { bold: true },
      );
      addText(commands, 'MARGEN', 332, 132, 9);
      addText(commands, margin === null ? 'Pendiente' : `${margin}%`, 462, 131, 10, { bold: true });
      addText(commands, `${sale.payment} · ${sale.paymentStatus}`, 42, 210, 10, { bold: true });
      addText(
        commands,
        sale.cost > 0
          ? 'Utilidad bruta = venta total - costo registrado.'
          : 'Captura los costos de receta para calcular utilidad y margen.',
        42,
        185,
        9,
        { color: '0.42 0.34 0.3' },
      );
    }
    addText(commands, `Generado: ${generated}`, 42, 44, 8, { color: '0.5 0.43 0.39' });
    addText(commands, `Página ${pageIndex + 1} de ${chunks.length}`, 510, 44, 8, {
      color: '0.5 0.43 0.39',
    });
    return `${commands.join('\n')}\n`;
  });
  return buildDocument(pageCommands, `Ticket Lattecito ${sale.number}`);
}

function buildDocument(pageCommands: string[], title: string) {
  const pageIds = pageCommands.map((_, index) => 5 + index * 2);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  pageCommands.forEach((content, index) => {
    const contentId = 6 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${latin1Bytes(content).length} >>\nstream\n${content}endstream`);
  });
  const infoId = objects.length + 1;
  objects.push(
    `<< /Title (${pdfText(title)}) /Author (Lattecito Coffee) /Creator (Lattecito Admin) >>`,
  );
  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return latin1Bytes(pdf);
}
