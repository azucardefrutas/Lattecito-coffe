import { z } from 'zod';

export const inventoryUnitSchema = z.enum(['g', 'ml', 'pieza']);
export const stockQuantitySchema = z
  .number()
  .finite()
  .min(-100_000)
  .max(100_000)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, {
    message: 'Usa un máximo de tres decimales.',
  });

export const inventoryItemInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(100),
  unit: inventoryUnitSchema,
  minimum: z.number().finite().min(0).max(100_000),
  costPerUnit: z.number().int().min(0).max(10_000_000),
  active: z.boolean().default(true),
});

export const recipeIngredientSchema = z.object({
  itemId: z.uuid(),
  quantity: z.number().finite().positive().max(100_000),
});

export const inventoryRecipeInputSchema = z.object({
  targetType: z.enum(['product', 'modifier']),
  targetId: z.string().trim().min(1).max(80),
  sizeIndex: z.number().int().min(-1).max(2),
  ingredients: z.array(recipeIngredientSchema).max(100),
});

export type InventoryUnit = z.infer<typeof inventoryUnitSchema>;
export type InventoryItem = {
  id: string;
  name: string;
  unit: InventoryUnit;
  stock: number;
  minimum: number;
  costPerUnit: number;
  active: boolean;
  updatedAt: string;
};
export type InventoryRecipe = z.infer<typeof inventoryRecipeInputSchema>;
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
export type InventoryState = {
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

export function validateUnitQuantity(quantity: number, unit: InventoryUnit, allowNegative = false) {
  const parsed = stockQuantitySchema.parse(quantity);
  if (!allowNegative && parsed <= 0) throw new Error('La cantidad debe ser mayor que cero.');
  if (parsed === 0) throw new Error('La cantidad debe ser distinta de cero.');
  if (unit === 'pieza' && !Number.isInteger(parsed))
    throw new Error('Las piezas deben registrarse en cantidades enteras.');
  return parsed;
}
