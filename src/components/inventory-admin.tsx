'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowDownUp, Boxes, Plus, Save, UtensilsCrossed } from 'lucide-react';
import type { PublicCatalog } from '@/lib/catalog-schema';
import type { InventoryItem, InventoryRecipe, InventoryState, InventoryUnit } from '@/lib/inventory-schema';
import { money, sizes } from '@/lib/model';

const blankItem = () => ({
  name: '',
  unit: 'g' as InventoryUnit,
  minimum: '0',
  cost: '0',
  active: true,
});

export default function InventoryAdmin({ catalog }: { catalog: PublicCatalog }) {
  const [data, setData] = useState<InventoryState | null>(null);
  const [itemDraft, setItemDraft] = useState(blankItem());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
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
    const ok = await command(
      {
        action: 'adjust',
        itemId: adjustingId,
        quantity: Number(adjustQuantity),
        reason: adjustReason.trim(),
      },
      'Existencia actualizada y movimiento registrado.',
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
      active: item.active,
    });
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

  if (!data) return <section className="panel"><p>{error || 'Cargando inventario…'}</p></section>;

  return (
    <div className="inventory-stack">
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice success" role="status">{notice}</p>}
      <section className="summary-grid inventory-summary">
        <article className="metric-card"><span>INSUMOS ACTIVOS</span><strong>{data.summary.itemCount}</strong><small>en el inventario central</small></article>
        <article className="metric-card"><span>STOCK CRÍTICO</span><strong>{data.summary.lowStockCount}</strong><small>en mínimo o por debajo</small></article>
        <article className="metric-card"><span>VALOR ESTIMADO</span><strong>{money(data.summary.inventoryValue)}</strong><small>existencia × costo unitario</small></article>
        <article className="metric-card"><span>RECETAS</span><strong>{data.summary.configuredRecipes}</strong><small>configuradas para descuento automático</small></article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div><span className="eyebrow">EXISTENCIAS</span><h2>Insumos y alertas</h2></div>
          <button className="small-button" disabled={busy} onClick={() => void load()}>Actualizar</button>
        </div>
        {data.summary.lowStockCount > 0 && (
          <p className="inventory-alert"><AlertTriangle size={18} /> Hay {data.summary.lowStockCount} insumo(s) en nivel crítico.</p>
        )}
        <div className="inventory-grid">
          {data.items.map((item) => {
            const low = item.active && item.stock <= item.minimum;
            return (
              <article className={`inventory-card ${low ? 'low' : ''}`} key={item.id}>
                <div className="inventory-card-head"><Boxes size={20} /><span>{low ? 'Stock crítico' : item.active ? 'Disponible' : 'Inactivo'}</span></div>
                <h3>{item.name}</h3>
                <strong>{item.stock.toLocaleString('es-MX')} {item.unit}</strong>
                <p>Mínimo: {item.minimum} {item.unit} · Costo: {money(item.costPerUnit)} / {item.unit}</p>
                <div className="inventory-actions">
                  <button className="small-button" onClick={() => editItem(item)}>Editar</button>
                  <button className="small-button" onClick={() => { setAdjustingId(item.id); setAdjustQuantity(''); }}>Entrada / salida</button>
                </div>
              </article>
            );
          })}
          {!data.items.length && <p className="muted">Crea el primer insumo para comenzar a controlar existencias.</p>}
        </div>

        <form className="inventory-form" onSubmit={saveItem}>
          <div className="section-heading"><div><span className="eyebrow">{editingId ? 'EDITAR INSUMO' : 'NUEVO INSUMO'}</span><h3>{editingId ? itemDraft.name : 'Agregar materia prima'}</h3></div></div>
          <div className="field-grid">
            <label>Nombre<input required minLength={2} value={itemDraft.name} onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })} placeholder="Ej. Café en grano" /></label>
            <label>Unidad<select value={itemDraft.unit} onChange={(event) => setItemDraft({ ...itemDraft, unit: event.target.value as InventoryUnit })}><option value="g">Gramos (g)</option><option value="ml">Mililitros (ml)</option><option value="pieza">Piezas</option></select></label>
            <label>Stock mínimo<input required min="0" step={itemDraft.unit === 'pieza' ? '1' : '0.001'} type="number" value={itemDraft.minimum} onChange={(event) => setItemDraft({ ...itemDraft, minimum: event.target.value })} /></label>
            <label>Costo por {itemDraft.unit} (MXN)<input required min="0" step="0.01" type="number" value={itemDraft.cost} onChange={(event) => setItemDraft({ ...itemDraft, cost: event.target.value })} /></label>
          </div>
          <label className="check-row"><input checked={itemDraft.active} type="checkbox" onChange={(event) => setItemDraft({ ...itemDraft, active: event.target.checked })} /> Insumo activo</label>
          <div className="inventory-actions"><button className="button" disabled={busy} type="submit"><Save size={17} /> Guardar insumo</button>{editingId && <button className="small-button" type="button" onClick={() => { setEditingId(null); setItemDraft(blankItem()); }}>Cancelar</button>}</div>
        </form>

        {adjustingId && (
          <form className="inventory-form accent" onSubmit={adjustStock}>
            <span className="eyebrow">MOVIMIENTO DE STOCK</span>
            <h3>{data.items.find((item) => item.id === adjustingId)?.name}</h3>
            <p>Usa una cantidad positiva para una compra o entrada. Usa una cantidad negativa para merma, corrección o salida manual.</p>
            <div className="field-grid">
              <label>Cantidad<input autoFocus required step="0.001" type="number" value={adjustQuantity} onChange={(event) => setAdjustQuantity(event.target.value)} placeholder="Ej. 1000 o -50" /></label>
              <label>Motivo<input required minLength={2} maxLength={300} value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} /></label>
            </div>
            <div className="inventory-actions"><button className="button" disabled={busy} type="submit"><ArrowDownUp size={17} /> Registrar movimiento</button><button className="small-button" type="button" onClick={() => setAdjustingId(null)}>Cancelar</button></div>
          </form>
        )}
      </section>

      <section className="panel">
        <div className="section-heading"><div><span className="eyebrow">DESCUENTO AUTOMÁTICO</span><h2>Recetas por producto y extra</h2></div><UtensilsCrossed size={25} /></div>
        <p>Define cuánto consume cada tamaño o pieza. Al registrar una venta, esos insumos se descuentan en una sola operación segura.</p>
        <label className="inventory-target">Producto o extra<select value={recipeTarget} onChange={(event) => setRecipeTarget(event.target.value)}>{catalog.products.map((product) => (product.kind === 'snack' ? ['Pieza'] : sizes).map((size, index) => <option key={`${product.id}-${index}`} value={`product|${product.id}|${index}`}>{product.name} · {size}</option>))}{catalog.modifiers.map((modifier) => <option key={modifier.id} value={`modifier|${modifier.id}|-1`}>Extra · {modifier.name}</option>)}</select></label>
        <div className="recipe-list">
          {recipeDraft.map((ingredient) => {
            const item = data.items.find((candidate) => candidate.id === ingredient.itemId);
            return <div key={ingredient.itemId}><span>{item?.name ?? 'Insumo eliminado'}</span><strong>{ingredient.quantity} {item?.unit}</strong><button onClick={() => setRecipeDraft((current) => current.filter((row) => row.itemId !== ingredient.itemId))}>Quitar</button></div>;
          })}
          {!recipeDraft.length && <p className="muted">Esta presentación todavía no tiene receta.</p>}
        </div>
        <div className="recipe-add">
          <select value={newIngredient} onChange={(event) => setNewIngredient(event.target.value)}><option value="">Selecciona un insumo</option>{data.items.filter((item) => item.active && !recipeDraft.some((row) => row.itemId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select>
          <input min="0.001" step="0.001" type="number" value={newQuantity} onChange={(event) => setNewQuantity(event.target.value)} placeholder="Cantidad" />
          <button className="small-button" type="button" onClick={addIngredient}><Plus size={16} /> Agregar</button>
        </div>
        <button className="button" disabled={busy || !recipeTarget} onClick={() => void saveRecipe()}><Save size={17} /> Guardar receta</button>
      </section>

      <section className="panel">
        <span className="eyebrow">TRAZABILIDAD</span><h2>Últimos movimientos</h2>
        <div className="movement-table"><div className="movement-head"><span>Fecha</span><span>Insumo</span><span>Cantidad</span><span>Motivo</span><span>Usuario</span></div>{data.movements.map((movement) => { const item = data.items.find((candidate) => candidate.id === movement.itemId); return <div key={movement.id}><span>{new Date(movement.date).toLocaleString('es-MX')}</span><strong>{item?.name ?? 'Insumo'}</strong><span className={movement.quantity > 0 ? 'positive' : 'negative'}>{movement.quantity > 0 ? '+' : ''}{movement.quantity} {item?.unit}</span><span>{movement.reason}</span><span>{movement.createdBy}</span></div>; })}{!data.movements.length && <p className="muted">Todavía no hay movimientos registrados.</p>}</div>
      </section>
    </div>
  );
}
