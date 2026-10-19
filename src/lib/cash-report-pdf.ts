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
  addText(commands, '1', 548, 36, 8, { color: '0.5 0.43 0.39' });

  const content = `${commands.join('\n')}\n`;
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
