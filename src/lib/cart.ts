import { calculate, type Product, type Line, type MenuModifier } from './model.ts';

export function lineKey(line: Line) {
  return JSON.stringify([line.productId, line.size, [...(line.modifierIds ?? [])].sort()]);
}
export function addCartLine(lines: Line[], line: Line) {
  const index = lines.findIndex((l) => lineKey(l) === lineKey(line));
  if (index < 0) {
    if (lines.length >= 100) throw new Error('El pedido admite hasta 100 combinaciones.');
    return [...lines, line];
  }
  if (lines[index].quantity + line.quantity > 99)
    throw new Error('Puedes pedir hasta 99 unidades de cada combinación.');
  return lines.map((l, i) => (i === index ? { ...l, quantity: l.quantity + line.quantity } : l));
}
export function restoreCart(raw: unknown): { lines: Line[]; discarded: boolean } {
  const payload = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && 'version' in raw && raw.version === 2 && 'lines' in raw
      ? raw.lines
      : null;
  if (!Array.isArray(payload)) return { lines: [], discarded: true };
  let lines: Line[] = [],
    discarded = false;
  for (const entry of payload.slice(0, 100)) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.productId !== 'string' ||
      entry.productId.length > 80 ||
      !Number.isInteger(entry.size) ||
      entry.size < 0 ||
      entry.size > 2 ||
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 1 ||
      entry.quantity > 99 ||
      (entry.modifierIds !== undefined &&
        (!Array.isArray(entry.modifierIds) ||
          entry.modifierIds.length > 20 ||
          entry.modifierIds.some((id: unknown) => typeof id !== 'string') ||
          new Set(entry.modifierIds).size !== entry.modifierIds.length))
    ) {
      discarded = true;
      continue;
    }
    try {
      lines = addCartLine(lines, {
        productId: entry.productId,
        size: entry.size,
        quantity: entry.quantity,
        modifierIds: entry.modifierIds ?? [],
      });
    } catch {
      discarded = true;
    }
  }
  return { lines, discarded: discarded || payload.length > 100 };
}
export function inspectCart(products: Product[], modifiers: MenuModifier[], lines: Line[]) {
  const valid: Line[] = [],
    unavailable: Line[] = [];
  for (const line of lines) {
    try {
      calculate(products, [line], 0, modifiers);
      valid.push(line);
    } catch {
      unavailable.push(line);
    }
  }
  return { valid, unavailable };
}
