'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  CircleHelp,
  Minus,
  Plus,
  Save,
  UtensilsCrossed,
} from 'lucide-react';
import type { PublicCatalog } from '@/lib/catalog-schema';
import type {
  InventoryItem,
  InventoryRecipe,
  InventoryState,
  InventoryUnit,
} from '@/lib/inventory-schema';
import { money } from '@/lib/model';

const blankItem = () => ({
  name: '',
  unit: 'g' as InventoryUnit,
  minimum: '0',
  cost: '0',
  packageCost: '',
  packageQuantity: '',
  active: true,
});

const itemTemplates: Array<{ name: string; unit: InventoryUnit }> = [
  { name: 'Leche entera', unit: 'ml' },
  { name: 'Leche deslactosada', unit: 'ml' },
  { name: 'Leche de almendra', unit: 'ml' },
  { name: 'Matcha', unit: 'g' },
  { name: 'Café en grano', unit: 'g' },
  { name: 'Vaso con tapa', unit: 'pieza' },
];

type AdjustmentMode = 'entry' | 'exit';

function simpleQuantity(value: number, unit: InventoryUnit) {
  const exact = value.toLocaleString('es-MX', { maximumFractionDigits: 3 });
  if (unit === 'ml' && Math.abs(value) >= 1000) {
    const liters = (value / 1000).toLocaleString('es-MX', { maximumFractionDigits: 3 });
    return { main: `${liters} L`, detail: `${exact} ml` };
  }
  if (unit === 'g' && Math.abs(value) >= 1000) {
    const kilograms = (value / 1000).toLocaleString('es-MX', { maximumFractionDigits: 3 });
    return { main: `${kilograms} kg`, detail: `${exact} g` };
  }
  return {
    main: unit === 'pieza' ? `${exact} ${value === 1 ? 'pieza' : 'piezas'}` : `${exact} ${unit}`,
    detail:
      unit === 'ml'
        ? 'Medido en mililitros'
        : unit === 'g'
          ? 'Medido en gramos'
          : 'Conteo por pieza',
  };
}

function unitHelp(unit: InventoryUnit) {
  if (unit === 'ml') return 'Para leche y jarabes. 1 litro = 1,000 ml.';
  if (unit === 'g') return 'Para café, matcha y polvos. 1 kilo = 1,000 g.';
  return 'Para vasos, tapas, brownies o artículos que cuentas uno por uno.';
}

export default function InventoryAdmin({ catalog }: { catalog: PublicCatalog }) {
  const [data, setData] = useState<InventoryState | null>(null);
  const [itemDraft, setItemDraft] = useState(blankItem());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustMode, setAdjustMode] = useState<AdjustmentMode>('entry');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('Compra a proveedor');
  const [recipeTarget, setRecipeTarget] = useState(
    catalog.products[0] ? `product|${catalog.products[0].id}|0` : '',
  );
  const [recipeDraft, setRecipeDraft] = useState<InventoryRecipe['ingredients']>([]);
  const [newIngredient, setNewIngredient] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/catalog-admin/inventory', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'No fue posible cargar el inventario.');
      setData(body);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar el inventario.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRecipe = useMemo(() => {
    if (!data || !recipeTarget) return null;
    const [targetType, targetId, sizeIndex] = recipeTarget.split('|');
    return data.recipes.find(
      (recipe) =>
        recipe.targetType === targetType &&
        recipe.targetId === targetId &&
        recipe.sizeIndex === Number(sizeIndex),
    );
  }, [data, recipeTarget]);

  useEffect(() => {
    setRecipeDraft(selectedRecipe?.ingredients.map((item) => ({ ...item })) ?? []);
  }, [selectedRecipe]);

  async function command(body: object, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/catalog-admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No fue posible guardar el cambio.');
      await load();
      setNotice(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el cambio.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await command(
      {
        action: 'item',
        item: {
          ...(editingId ? { id: editingId } : {}),
          name: itemDraft.name.trim(),
          unit: itemDraft.unit,
          minimum: Number(itemDraft.minimum),
          costPerUnit: Math.round(Number(itemDraft.cost) * 100),
          active: itemDraft.active,
        },
      },
      editingId ? 'Insumo actualizado.' : 'Insumo creado. Registra su primera entrada.',
    );
    if (ok) {
      setEditingId(null);
      setItemDraft(blankItem());
    }
  }

  async function adjustStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustingId) return;
    const amount = Math.abs(Number(adjustQuantity));
    const selectedItem = data?.items.find((item) => item.id === adjustingId);
    if (!selectedItem || !Number.isFinite(amount) || amount <= 0) {
      setError('Escribe una cantidad mayor que cero.');
      return;
    }
    if (adjustMode === 'exit' && amount > selectedItem.stock) {
      setError(
        `No puedes descontar más de lo disponible: ${simpleQuantity(selectedItem.stock, selectedItem.unit).main}.`,
      );
      return;
    }
    const ok = await command(
      {
        action: 'adjust',
        itemId: adjustingId,
        quantity: adjustMode === 'entry' ? amount : -amount,
        reason: adjustReason.trim(),
      },
      adjustMode === 'entry' ? 'Compra sumada al inventario.' : 'Salida descontada del inventario.',
    );
    if (ok) {
      setAdjustingId(null);
      setAdjustQuantity('');
      setAdjustReason('Compra a proveedor');
    }
  }

  async function saveRecipe() {
    if (!recipeTarget) return;
    const [targetType, targetId, sizeIndex] = recipeTarget.split('|');
    await command(
      {
        action: 'recipe',
        recipe: {
          targetType,
          targetId,
          sizeIndex: Number(sizeIndex),
          ingredients: recipeDraft,
        },
      },
      recipeDraft.length ? 'Receta guardada.' : 'Receta eliminada.',
    );
  }

  function editItem(item: InventoryItem) {
    setEditingId(item.id);
    setItemDraft({
      name: item.name,
      unit: item.unit,
      minimum: String(item.minimum),
      cost: String(item.costPerUnit / 100),
      packageCost: '',
      packageQuantity: '',
      active: item.active,
    });
  }

  function openAdjustment(itemId: string, mode: AdjustmentMode) {
    setAdjustingId(itemId);
    setAdjustMode(mode);
    setAdjustQuantity('');
    setAdjustReason(mode === 'entry' ? 'Compra a proveedor' : 'Merma o corrección');
  }

  function calculateUnitCost() {
    const packageCost = Number(itemDraft.packageCost);
    const packageQuantity = Number(itemDraft.packageQuantity);
    if (
      !Number.isFinite(packageCost) ||
      packageCost <= 0 ||
      !Number.isFinite(packageQuantity) ||
      packageQuantity <= 0
    ) {
      setError('Escribe el precio pagado y el contenido total del paquete.');
      return;
    }
    const result = packageCost / packageQuantity;
    if (Math.round(result * 100) < 1) {
      setError(
        'El costo por unidad es menor a un centavo. Usa una unidad más grande para evitar perder precisión.',
      );
      return;
    }
    setItemDraft((current) => ({ ...current, cost: result.toFixed(4) }));
    setError('');
  }

  function addIngredient() {
    const quantity = Number(newQuantity);
    if (!newIngredient || !Number.isFinite(quantity) || quantity <= 0) {
      setError('Selecciona un insumo e indica una cantidad válida.');
      return;
    }
    if (recipeDraft.some((item) => item.itemId === newIngredient)) {
      setError('Ese insumo ya está dentro de la receta.');
      return;
    }
    setRecipeDraft((current) => [...current, { itemId: newIngredient, quantity }]);
    setNewIngredient('');
    setNewQuantity('');
    setError('');
  }

  const selectedAdjustment = data?.items.find((item) => item.id === adjustingId) ?? null;
  const adjustmentAmount = Math.abs(Number(adjustQuantity));
  const projectedStock = selectedAdjustment
    ? selectedAdjustment.stock +
      (Number.isFinite(adjustmentAmount)
        ? adjustMode === 'entry'
          ? adjustmentAmount
          : -adjustmentAmount
        : 0)
    : 0;

  if (!data)
    return (
      <section className="panel">
        <p>{error || 'Cargando inventario…'}</p>
      </section>
    );

  return (
    <div className="inventory-stack">
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      <section className="inventory-unit-guide" aria-labelledby="inventory-help-title">
        <div className="inventory-unit-guide-copy">
          <CircleHelp size={24} />
          <div>
            <span className="eyebrow">GUÍA RÁPIDA</span>
            <h2 id="inventory-help-title">¿Cómo funciona el inventario?</h2>
            <p>
              Tú eliges una cantidad para recibir aviso. Cuando lo disponible llega a esa cantidad o
              baja de ella, aparecerá <strong>“Necesita compra”</strong>.
            </p>
          </div>
        </div>
        <div className="inventory-unit-examples">
          <div>
            <strong>1 litro</strong>
            <span>= 1,000 ml</span>
            <small>Leche y jarabes</small>
          </div>
          <div>
            <strong>1 kilo</strong>
            <span>= 1,000 g</span>
            <small>Café, matcha y polvos</small>
          </div>
          <div>
            <strong>1 vaso</strong>
            <span>= 1 pieza</span>
            <small>Vasos, tapas y snacks</small>
          </div>
        </div>
        <p className="inventory-critical-example">
          <AlertTriangle size={17} /> Ejemplo: si eliges “avisarme al llegar a 1 litro”, la alerta
          aparece cuando queden 1,000 ml o menos.
        </p>
      </section>
      <section className="summary-grid inventory-summary">
        <article className="metric-card">
          <span>INSUMOS ACTIVOS</span>
          <strong>{data.summary.itemCount}</strong>
          <small>en el inventario central</small>
        </article>
        <article className="metric-card">
          <span>NECESITAN COMPRA</span>
          <strong>{data.summary.lowStockCount}</strong>
          <small>llegaron al nivel de aviso</small>
        </article>
        <article className="metric-card">
          <span>VALOR ESTIMADO</span>
          <strong>{money(data.summary.inventoryValue)}</strong>
          <small>existencia × costo unitario</small>
        </article>
        <article className="metric-card">
          <span>RECETAS</span>
          <strong>{data.summary.configuredRecipes}</strong>
          <small>configuradas para descuento automático</small>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">EXISTENCIAS</span>
            <h2>Lo que tienes disponible</h2>
          </div>
          <button className="small-button" disabled={busy} onClick={() => void load()}>
            Actualizar
          </button>
        </div>
        {data.summary.lowStockCount > 0 && (
          <p className="inventory-alert">
            <AlertTriangle size={18} />{' '}
            {data.summary.lowStockCount === 1
              ? 'Hay 1 ingrediente que necesita compra.'
              : `Hay ${data.summary.lowStockCount} ingredientes que necesitan compra.`}
          </p>
        )}
        <div className="inventory-grid">
          {data.items.map((item) => {
            const low = item.active && item.stock <= item.minimum;
            const stock = simpleQuantity(item.stock, item.unit);
            const minimum = simpleQuantity(item.minimum, item.unit);
            return (
              <article className={`inventory-card ${low ? 'low' : ''}`} key={item.id}>
                <div className="inventory-card-head">
                  <Boxes size={20} />
                  <span>
                    {low ? 'Necesita compra' : item.active ? 'Cantidad suficiente' : 'Inactivo'}
                  </span>
                </div>
                <h3>{item.name}</h3>
                <span className="inventory-card-label">Te quedan</span>
                <strong>{stock.main}</strong>
                <small className="inventory-card-conversion">{stock.detail}</small>
                <p>
                  <strong>{low ? '¿Por qué aparece el aviso?' : 'Próximo aviso:'}</strong>{' '}
                  {low
                    ? `Quedan ${stock.main} y pediste recibir aviso al llegar a ${minimum.main}.`
                    : `Te avisaremos cuando queden ${minimum.main}.`}
                  <br />
                  Costo: {money(item.costPerUnit)} por {item.unit}.
                </p>
                <div className="inventory-actions">
                  <button className="small-button" onClick={() => editItem(item)}>
                    Editar
                  </button>
                  <button className="small-button" onClick={() => openAdjustment(item.id, 'entry')}>
                    <Plus size={15} /> Registrar compra
                  </button>
                  <button className="small-button" onClick={() => openAdjustment(item.id, 'exit')}>
                    <Minus size={15} /> Merma o corrección
                  </button>
                </div>
              </article>
            );
          })}
          {!data.items.length && (
            <p className="muted">Crea el primer insumo para comenzar a controlar existencias.</p>
          )}
        </div>

        <form className="inventory-form" onSubmit={saveItem}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">{editingId ? 'EDITAR INSUMO' : 'NUEVO INSUMO'}</span>
              <h3>{editingId ? itemDraft.name : 'Agregar materia prima'}</h3>
            </div>
          </div>
          {!editingId && (
            <div className="inventory-templates">
              <span>Inicio rápido</span>
              <div>
                {itemTemplates.map((template) => (
                  <button
                    key={template.name}
                    type="button"
                    onClick={() =>
                      setItemDraft({ ...blankItem(), name: template.name, unit: template.unit })
                    }
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field-grid">
            <label>
              Nombre
              <input
                required
                minLength={2}
                value={itemDraft.name}
                onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })}
                placeholder="Ej. Café en grano"
              />
            </label>
            <label>
              ¿Cómo lo vas a medir?
              <select
                value={itemDraft.unit}
                onChange={(event) =>
                  setItemDraft({ ...itemDraft, unit: event.target.value as InventoryUnit })
                }
              >
                <option value="ml">Líquido: mililitros (ml)</option>
                <option value="g">Peso: gramos (g)</option>
                <option value="pieza">Conteo: piezas</option>
              </select>
              <small>{unitHelp(itemDraft.unit)}</small>
            </label>
            <label>
              Avisarme cuando queden
              <input
                required
                min="0"
                step={itemDraft.unit === 'pieza' ? '1' : '0.001'}
                type="number"
                value={itemDraft.minimum}
                onChange={(event) => setItemDraft({ ...itemDraft, minimum: event.target.value })}
              />
              <small>
                Es el punto para volver a comprar. Ejemplo: 1 litro se escribe como 1000 ml.
              </small>
            </label>
            <label>
              Costo por {itemDraft.unit} (MXN)
              <input
                required
                min="0"
                step="0.01"
                type="number"
                value={itemDraft.cost}
                onChange={(event) => setItemDraft({ ...itemDraft, cost: event.target.value })}
              />
              <small>Si no lo conoces, usa la calculadora de abajo.</small>
            </label>
          </div>
          <div className="unit-cost-calculator">
            <div>
              <span className="eyebrow">CALCULADORA DE COSTO</span>
              <p>
                Escribe cuánto pagaste por el paquete y cuánto contiene. Calcularemos el costo de
                cada ml, gramo o pieza automáticamente.
              </p>
            </div>
            <label>
              Precio pagado (MXN)
              <input
                min="0.01"
                step="0.01"
                type="number"
                value={itemDraft.packageCost}
                onChange={(event) =>
                  setItemDraft({ ...itemDraft, packageCost: event.target.value })
                }
              />
            </label>
            <label>
              ¿Cuánto trae el paquete? ({itemDraft.unit})
              <input
                min="0.001"
                step="0.001"
                type="number"
                value={itemDraft.packageQuantity}
                onChange={(event) =>
                  setItemDraft({ ...itemDraft, packageQuantity: event.target.value })
                }
              />
            </label>
            <button className="small-button" type="button" onClick={calculateUnitCost}>
              Calcular costo por {itemDraft.unit}
            </button>
          </div>
          <label className="check-row">
            <input
              checked={itemDraft.active}
              type="checkbox"
              onChange={(event) => setItemDraft({ ...itemDraft, active: event.target.checked })}
            />{' '}
            Insumo activo
          </label>
          <div className="inventory-actions">
            <button className="button" disabled={busy} type="submit">
              <Save size={17} /> Guardar insumo
            </button>
            {editingId && (
              <button
                className="small-button"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setItemDraft(blankItem());
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        {selectedAdjustment && (
          <form
            className={`inventory-form accent stock-movement-form ${adjustMode}`}
            onSubmit={adjustStock}
          >
            <span className="eyebrow">
              {adjustMode === 'entry' ? 'REGISTRAR COMPRA' : 'REGISTRAR MERMA O CORRECCIÓN'}
            </span>
            <h3>{selectedAdjustment.name}</h3>
            <p>
              Ahora tienes{' '}
              <strong>
                {simpleQuantity(selectedAdjustment.stock, selectedAdjustment.unit).main}
              </strong>
              . Elige qué ocurrió y escribe una cantidad normal, sin signos negativos.
            </p>
            <div className="movement-type-picker" aria-label="Tipo de movimiento">
              <button
                className={adjustMode === 'entry' ? 'active' : ''}
                type="button"
                onClick={() => {
                  setAdjustMode('entry');
                  setAdjustReason('Compra a proveedor');
                }}
              >
                <Plus size={17} /> Sumé una compra
              </button>
              <button
                className={adjustMode === 'exit' ? 'active' : ''}
                type="button"
                onClick={() => {
                  setAdjustMode('exit');
                  setAdjustReason('Merma o corrección');
                }}
              >
                <Minus size={17} /> Desconté una cantidad
              </button>
            </div>
            <div className="stock-movement-grid">
              <label>
                {adjustMode === 'entry' ? 'Cantidad que compraste' : 'Cantidad que vas a descontar'}{' '}
                ({selectedAdjustment.unit})
                <input
                  autoFocus
                  required
                  min={selectedAdjustment.unit === 'pieza' ? '1' : '0.001'}
                  step={selectedAdjustment.unit === 'pieza' ? '1' : '0.001'}
                  type="number"
                  value={adjustQuantity}
                  onChange={(event) => setAdjustQuantity(event.target.value)}
                  placeholder={selectedAdjustment.unit === 'pieza' ? 'Ej. 20' : 'Ej. 1000'}
                />
                <small>{unitHelp(selectedAdjustment.unit)}</small>
              </label>
              <label>
                Motivo
                <input
                  required
                  minLength={2}
                  maxLength={300}
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                />
              </label>
              <div className={`stock-result-preview ${projectedStock < 0 ? 'invalid' : ''}`}>
                <span>Después quedarán</span>
                <strong>
                  {simpleQuantity(Math.max(projectedStock, 0), selectedAdjustment.unit).main}
                </strong>
                <small>
                  {projectedStock < 0
                    ? 'No puedes descontar más de lo disponible.'
                    : simpleQuantity(Math.max(projectedStock, 0), selectedAdjustment.unit).detail}
                </small>
              </div>
            </div>
            <div className="inventory-actions">
              <button className="button" disabled={busy || projectedStock < 0} type="submit">
                <ArrowDownUp size={17} /> Confirmar movimiento
              </button>
              <button className="small-button" type="button" onClick={() => setAdjustingId(null)}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">DESCUENTO AUTOMÁTICO</span>
            <h2>Recetas por producto y extra</h2>
          </div>
          <UtensilsCrossed size={25} />
        </div>
        <p>
          Define cuánto consume cada tamaño o pieza. Al registrar una venta, esos insumos se
          descuentan en una sola operación segura.
        </p>
        <label className="inventory-target">
          Producto o extra
          <select value={recipeTarget} onChange={(event) => setRecipeTarget(event.target.value)}>
            {catalog.products.map((product) =>
              (product.kind === 'snack' || product.kind === 'merch'
                ? ['Pieza']
                : catalog.sizes
              ).map((size, index) => (
                <option key={`${product.id}-${index}`} value={`product|${product.id}|${index}`}>
                  {product.name} · {size}
                </option>
              )),
            )}
            {catalog.modifiers.map((modifier) => (
              <option key={modifier.id} value={`modifier|${modifier.id}|-1`}>
                Extra · {modifier.name}
              </option>
            ))}
          </select>
        </label>
        <div className="recipe-list">
          {recipeDraft.map((ingredient) => {
            const item = data.items.find((candidate) => candidate.id === ingredient.itemId);
            return (
              <div key={ingredient.itemId}>
                <span>{item?.name ?? 'Insumo eliminado'}</span>
                <strong>
                  {ingredient.quantity} {item?.unit}
                </strong>
                <button
                  onClick={() =>
                    setRecipeDraft((current) =>
                      current.filter((row) => row.itemId !== ingredient.itemId),
                    )
                  }
                >
                  Quitar
                </button>
              </div>
            );
          })}
          {!recipeDraft.length && (
            <p className="muted">Esta presentación todavía no tiene receta.</p>
          )}
        </div>
        <div className="recipe-add">
          <select value={newIngredient} onChange={(event) => setNewIngredient(event.target.value)}>
            <option value="">Selecciona un insumo</option>
            {data.items
              .filter((item) => item.active && !recipeDraft.some((row) => row.itemId === item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.unit})
                </option>
              ))}
          </select>
          <input
            min="0.001"
            step="0.001"
            type="number"
            value={newQuantity}
            onChange={(event) => setNewQuantity(event.target.value)}
            placeholder="Cantidad"
          />
          <button className="small-button" type="button" onClick={addIngredient}>
            <Plus size={16} /> Agregar
          </button>
        </div>
        <button
          className="button"
          disabled={busy || !recipeTarget}
          onClick={() => void saveRecipe()}
        >
          <Save size={17} /> Guardar receta
        </button>
      </section>

      <section className="panel">
        <span className="eyebrow">TRAZABILIDAD</span>
        <h2>Últimos movimientos</h2>
        <div className="movement-table">
          <div className="movement-head">
            <span>Fecha</span>
            <span>Insumo</span>
            <span>Cantidad</span>
            <span>Motivo</span>
            <span>Usuario</span>
          </div>
          {data.movements.map((movement) => {
            const item = data.items.find((candidate) => candidate.id === movement.itemId);
            return (
              <div key={movement.id}>
                <span>{new Date(movement.date).toLocaleString('es-MX')}</span>
                <strong>{item?.name ?? 'Insumo'}</strong>
                <span className={movement.quantity > 0 ? 'positive' : 'negative'}>
                  {movement.quantity > 0 ? '+' : ''}
                  {movement.quantity} {item?.unit}
                </span>
                <span>{movement.reason}</span>
                <span>{movement.createdBy}</span>
              </div>
            );
          })}
          {!data.movements.length && (
            <p className="muted">Todavía no hay movimientos registrados.</p>
          )}
        </div>
      </section>
    </div>
  );
}
