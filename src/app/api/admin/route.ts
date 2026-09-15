import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authenticate, authorized, localOnly } from '@/lib/auth';
import { db, readStore, transaction } from '@/lib/db';
import {
  quoteSale,
  deductIngredients,
  expectedCash,
  adjustStock,
  refundSale,
  validateQuantity,
} from '@/lib/model';
export const runtime = 'nodejs';
const cents = z.number().int().min(0).max(100000000);
const recipe = z
  .array(z.object({ ingredientId: z.string().min(1), quantity: z.number().positive().max(100000) }))
  .max(50);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), password: z.string().min(10).max(128) }),
  z.object({ action: z.literal('logout') }),
  z.object({ action: z.literal('open'), opening: cents }),
  z.object({ action: z.literal('close'), counted: cents }),
  z.object({
    action: z.literal('refund'),
    saleId: z.string().min(1),
    reason: z.string().trim().min(5).max(300),
    restock: z.boolean(),
  }),
  z.object({
    action: z.literal('stock'),
    productId: z.string(),
    quantity: z
      .number()
      .min(-100000)
      .max(100000)
      .refine((v) => v !== 0),
    reason: z.string().trim().min(3).max(200),
  }),
  z.object({
    action: z.literal('product'),
    product: z.object({
      id: z.string().max(80),
      name: z.string().trim().min(2).max(100),
      description: z.string().max(500),
      category: z.enum(['Cafés', 'Matcha', 'Bobas', 'Frappés', 'Postres']),
      prices: z.array(cents).length(3),
      cost: z.array(cents).length(3),
      active: z.boolean(),
      tone: z.enum(['coffee', 'matcha', 'boba', 'caramel', 'cocoa', 'dark']),
      recipes: z.array(recipe).length(3),
    }),
  }),
  z.object({
    action: z.literal('ingredient'),
    ingredient: z.object({
      id: z.string().max(80),
      name: z.string().trim().min(2).max(100),
      unit: z.enum(['g', 'ml', 'pieza']),
      minimum: z.number().min(0).max(10000000),
      costPerUnit: z.number().min(0).max(1000000),
    }),
  }),
  z.object({
    action: z.literal('modifier'),
    modifier: z.object({
      id: z.string().max(80),
      name: z.string().trim().min(2).max(100),
      price: cents,
      recipe: recipe.min(1),
      active: z.boolean().optional(),
      productIds: z.array(z.string()).max(500).nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal('status'),
    id: z.string(),
    status: z.enum(['Pendiente', 'Preparando', 'Listo', 'Entregado']),
  }),
  z.object({
    action: z.literal('settings'),
    settings: z.object({
      phones: z
        .array(z.string().regex(/^52\d{10}$/))
        .min(1)
        .max(2),
      address: z.string().max(300),
      hours: z.string().max(300),
      sample: z.boolean(),
    }),
  }),
  z.object({
    action: z.literal('sale'),
    id: z.uuid(),
    customer: z.string().max(100),
    lines: z
      .array(
        z.object({
          productId: z.string(),
          size: z.number().int().min(0).max(2),
          quantity: z.number().int().min(1).max(99),
          modifierIds: z.array(z.string()).max(20).optional(),
        }),
      )
      .min(1)
      .max(100),
    discount: z.number().int().min(0).max(100),
    payment: z.enum(['Efectivo', 'Tarjeta', 'Transferencia']),
    received: cents,
  }),
]);
export async function GET() {
  try {
    if (!(await authorized()))
      return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
    return NextResponse.json(readStore(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Acceso local requerido.' }, { status: 403 });
  }
}
export async function POST(req: NextRequest) {
  try {
    await localOnly();
    const origin = req.headers.get('origin');
    if (!origin || new URL(origin).host !== req.headers.get('host'))
      return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
    const raw = await req.text();
    if (raw.length > 50000)
      return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 });
    const input = schema.safeParse(JSON.parse(raw));
    if (!input.success)
      return NextResponse.json(
        { error: 'Revisa los campos y sus valores. Completa la información solicitada.' },
        { status: 400 },
      );
    const a = input.data;
    if (a.action === 'login') {
      await authenticate(a.password);
      return NextResponse.json({ ok: true });
    }
    if (!(await authorized()))
      return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
    if (a.action === 'logout') {
      const c = (await cookies()).get('latte-session')?.value;
      if (c)
        db()
          .prepare('DELETE FROM sessions WHERE token=?')
          .run(createHash('sha256').update(c).digest('hex'));
      (await cookies()).delete('latte-session');
      return NextResponse.json({ ok: true });
    }
    const result = transaction((store) => {
      const session = store.cash.find((c) => !c.closedAt);
      const now = new Date().toISOString();
      if (a.action === 'open') {
        if (session) throw new Error('Ya existe una caja abierta.');
        store.cash.unshift({ id: randomUUID(), openedAt: now, opening: a.opening });
      }
      if (a.action === 'close') {
        if (!session) throw new Error('No hay caja abierta.');
        session.expected = expectedCash(store, session);
        session.counted = a.counted;
        session.closedAt = now;
      }
      if (a.action === 'stock') {
        adjustStock(store, a.productId, a.quantity, a.reason, now);
      }
      if (a.action === 'refund') return refundSale(store, a.saleId, a.reason, a.restock, now);
      if (a.action === 'ingredient') {
        if (a.ingredient.minimum !== 0) validateQuantity(a.ingredient.minimum, a.ingredient.unit);
        const old = store.ingredients.find((p) => p.id === a.ingredient.id);
        if (
          old &&
          old.unit !== a.ingredient.unit &&
          (old.stock !== 0 ||
            store.products.some((p) =>
              p.recipes?.some((r) => r.some((i) => i.ingredientId === old.id)),
            ) ||
            store.modifiers.some((m) => m.recipe.some((r) => r.ingredientId === old.id)))
        )
          throw new Error('No cambies la unidad de un insumo en uso. Crea otro insumo.');
        if (old) Object.assign(old, a.ingredient);
        else store.ingredients.push({ ...a.ingredient, id: randomUUID(), stock: 0 });
      }
      if (a.action === 'modifier') {
        if (a.modifier.recipe.some((r) => !store.ingredients.some((i) => i.id === r.ingredientId)))
          throw new Error('Insumo inexistente.');
        for (const r of a.modifier.recipe)
          validateQuantity(
            r.quantity,
            store.ingredients.find((i) => i.id === r.ingredientId)!.unit,
          );
        if (a.modifier.productIds?.some((id) => !store.products.some((p) => p.id === id)))
          throw new Error('Uno de los productos del extra no existe.');
        const old = store.modifiers.find((p) => p.id === a.modifier.id);
        if (old) Object.assign(old, a.modifier);
        else store.modifiers.push({ ...a.modifier, id: randomUUID() });
      }
      if (a.action === 'status') {
        const s = store.sales.find((s) => s.id === a.id);
        if (!s) throw new Error('Comanda inexistente.');
        if (s.refund) throw new Error('La venta está corregida y ya no está en preparación.');
        s.status = a.status;
      }
      if (a.action === 'product') {
        if (
          a.product.recipes
            .flat()
            .some((r) => !store.ingredients.some((i) => i.id === r.ingredientId))
        )
          throw new Error('La receta contiene un insumo inexistente.');
        for (const r of a.product.recipes.flat())
          validateQuantity(
            r.quantity,
            store.ingredients.find((i) => i.id === r.ingredientId)!.unit,
          );
        const old = store.products.find((p) => p.id === a.product.id);
        if (old) Object.assign(old, a.product);
        else store.products.push({ ...a.product, id: randomUUID(), stock: 0 });
      }
      if (a.action === 'settings') store.settings = a.settings;
      if (a.action === 'sale') {
        const existing = store.sales.find((s) => s.id === a.id);
        if (existing) return existing;
        if (!session) throw new Error('Abre la caja antes de cobrar.');
        const { needs, ...total } = quoteSale(store, a.lines, a.discount);
        if (a.payment === 'Efectivo' && a.received < total.total)
          throw new Error('El efectivo recibido es insuficiente.');
        deductIngredients(store, needs, `Venta ${a.id}`, now);
        const sale = {
          id: a.id,
          date: now,
          sessionId: session.id,
          ...total,
          payment: a.payment,
          received: a.payment === 'Efectivo' ? a.received : total.total,
          change: a.payment === 'Efectivo' ? a.received - total.total : 0,
          customer: a.customer,
          status: 'Pendiente' as const,
          number: store.sales.length + 1,
          consumed: [...needs].map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
        };
        store.sales.unshift(sale);
        return sale;
      }
      return { ok: true };
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo guardar.' },
      { status: 400 },
    );
  }
}
