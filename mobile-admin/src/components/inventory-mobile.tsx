import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { sendCommand, type Dashboard, type InventoryItem } from '@/lib/api';

const sizes = ['Chico', 'Mediano', 'Grande'];
const money = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);

type Props = {
  token: string;
  dashboard: Dashboard;
  refresh: () => Promise<void>;
  setBusy: (busy: boolean) => void;
  setError: (error: string) => void;
};

function Button({ label, onPress, light = false }: { label: string; onPress: () => void; light?: boolean }) {
  return <Pressable onPress={onPress} style={[styles.button, light && styles.buttonLight]}><Text style={[styles.buttonText, light && styles.buttonTextDark]}>{label}</Text></Pressable>;
}

export function InventoryMobile({ token, dashboard, refresh, setBusy, setError }: Props) {
  const { inventory, catalog } = dashboard;
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<InventoryItem['unit']>('g');
  const [minimum, setMinimum] = useState('0');
  const [cost, setCost] = useState('0');
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [reason, setReason] = useState('Compra a proveedor');
  const [productId, setProductId] = useState(catalog.products[0]?.id ?? '');
  const [sizeIndex, setSizeIndex] = useState(0);
  const [recipe, setRecipe] = useState<{ itemId: string; quantity: number }[]>([]);
  const [recipeItemId, setRecipeItemId] = useState('');
  const [recipeQuantity, setRecipeQuantity] = useState('');

  const savedRecipe = useMemo(
    () => inventory.recipes.find((item) => item.targetType === 'product' && item.targetId === productId && item.sizeIndex === sizeIndex),
    [inventory.recipes, productId, sizeIndex],
  );
  useEffect(() => setRecipe(savedRecipe?.ingredients.map((item) => ({ ...item })) ?? []), [savedRecipe]);

  const run = async (body: object) => {
    setBusy(true);
    setError('');
    try {
      await sendCommand(token, body);
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el inventario.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const clearItem = () => {
    setEditing(null); setName(''); setUnit('g'); setMinimum('0'); setCost('0');
  };
  const startEdit = (item: InventoryItem) => {
    setEditing(item); setName(item.name); setUnit(item.unit); setMinimum(String(item.minimum)); setCost(String(item.costPerUnit / 100));
  };
  const saveItem = async () => {
    const ok = await run({
      action: 'inventory-item',
      item: { ...(editing ? { id: editing.id } : {}), name: name.trim(), unit, minimum: Number(minimum), costPerUnit: Math.round(Number(cost) * 100), active: editing?.active ?? true },
    });
    if (ok) clearItem();
  };
  const saveAdjustment = async () => {
    if (!adjusting) return;
    const ok = await run({ action: 'inventory-adjust', itemId: adjusting.id, quantity: adjustSign * Math.abs(Number(adjustAmount)), reason: reason.trim() });
    if (ok) { setAdjusting(null); setAdjustAmount(''); setReason('Compra a proveedor'); }
  };
  const addRecipeItem = () => {
    const quantity = Number(recipeQuantity);
    if (!recipeItemId || !Number.isFinite(quantity) || quantity <= 0) return setError('Selecciona el insumo y escribe una cantidad válida.');
    if (recipe.some((item) => item.itemId === recipeItemId)) return setError('Ese insumo ya está en la receta.');
    setRecipe((current) => [...current, { itemId: recipeItemId, quantity }]);
    setRecipeItemId(''); setRecipeQuantity(''); setError('');
  };
  const saveRecipe = () => run({ action: 'inventory-recipe', recipe: { targetType: 'product', targetId: productId, sizeIndex, ingredients: recipe } });

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Inventario central</Text>
      <Text style={styles.copy}>Las existencias y recetas se comparten con el administrador web.</Text>
      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricLabel}>Insumos</Text><Text style={styles.metricValue}>{inventory.summary.itemCount}</Text></View>
        <View style={[styles.metric, inventory.summary.lowStockCount > 0 && styles.metricWarning]}><Text style={styles.metricLabel}>Stock crítico</Text><Text style={styles.metricValue}>{inventory.summary.lowStockCount}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>Valor</Text><Text style={styles.metricValue}>{money(inventory.summary.inventoryValue)}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>Recetas</Text><Text style={styles.metricValue}>{inventory.summary.configuredRecipes}</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Existencias</Text>
      {inventory.items.map((item) => {
        const low = item.active && item.stock <= item.minimum;
        return <View key={item.id} style={[styles.card, low && styles.lowCard]}>
          <View style={styles.row}><View style={styles.flex}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.muted}>Mínimo {item.minimum} {item.unit} · {money(item.costPerUnit)}/{item.unit}</Text></View><View style={[styles.badge, low && styles.badgeLow]}><Text style={styles.badgeText}>{low ? 'CRÍTICO' : 'OK'}</Text></View></View>
          <Text style={styles.stock}>{item.stock.toLocaleString('es-MX')} <Text style={styles.stockUnit}>{item.unit}</Text></Text>
          <View style={styles.buttonRow}><Button label="+ Entrada" onPress={() => { setAdjusting(item); setAdjustSign(1); setReason('Compra a proveedor'); }} /><Button label="− Salida" light onPress={() => { setAdjusting(item); setAdjustSign(-1); setReason('Merma o corrección'); }} /><Button label="Editar" light onPress={() => startEdit(item)} /></View>
        </View>;
      })}
      {!inventory.items.length && <Text style={styles.empty}>Todavía no hay insumos. Crea el primero abajo.</Text>}

      {adjusting && <View style={[styles.card, styles.adjustCard]}>
        <Text style={styles.cardTitle}>{adjustSign > 0 ? 'Entrada' : 'Salida'} · {adjusting.name}</Text>
        <TextInput keyboardType="decimal-pad" placeholder="Cantidad" placeholderTextColor="#8b7868" style={styles.input} value={adjustAmount} onChangeText={setAdjustAmount} />
        <TextInput placeholder="Motivo" placeholderTextColor="#8b7868" style={styles.input} value={reason} onChangeText={setReason} />
        <View style={styles.buttonRow}><Button label="Registrar" onPress={saveAdjustment} /><Button label="Cancelar" light onPress={() => setAdjusting(null)} /></View>
      </View>}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{editing ? `Editar ${editing.name}` : 'Nuevo insumo'}</Text>
        <TextInput placeholder="Nombre del insumo" placeholderTextColor="#8b7868" style={styles.input} value={name} onChangeText={setName} />
        <View style={styles.chips}>{(['g', 'ml', 'pieza'] as const).map((value) => <Pressable key={value} onPress={() => setUnit(value)} style={[styles.chip, unit === value && styles.chipSelected]}><Text style={[styles.chipText, unit === value && styles.chipTextSelected]}>{value}</Text></Pressable>)}</View>
        <TextInput keyboardType="decimal-pad" placeholder="Stock mínimo" placeholderTextColor="#8b7868" style={styles.input} value={minimum} onChangeText={setMinimum} />
        <TextInput keyboardType="decimal-pad" placeholder={`Costo por ${unit} en MXN`} placeholderTextColor="#8b7868" style={styles.input} value={cost} onChangeText={setCost} />
        <View style={styles.buttonRow}><Button label="Guardar insumo" onPress={saveItem} />{editing && <Button label="Cancelar" light onPress={clearItem} />}</View>
      </View>

      <Text style={styles.sectionTitle}>Recetas automáticas</Text>
      <Text style={styles.copy}>Configura el consumo de cada bebida. La caja lo descontará al generar el ticket.</Text>
      <View style={styles.chips}>{catalog.products.map((product) => <Pressable key={product.id} onPress={() => setProductId(product.id)} style={[styles.chip, productId === product.id && styles.chipSelected]}><Text style={[styles.chipText, productId === product.id && styles.chipTextSelected]}>{product.name}</Text></Pressable>)}</View>
      <View style={styles.chips}>{sizes.map((size, index) => <Pressable key={size} onPress={() => setSizeIndex(index)} style={[styles.chip, sizeIndex === index && styles.chipSelected]}><Text style={[styles.chipText, sizeIndex === index && styles.chipTextSelected]}>{size}</Text></Pressable>)}</View>
      <View style={styles.card}>
        {recipe.map((row) => { const item = inventory.items.find((candidate) => candidate.id === row.itemId); return <View key={row.itemId} style={styles.recipeRow}><Text style={styles.flex}>{item?.name ?? 'Insumo'}</Text><Text style={styles.recipeAmount}>{row.quantity} {item?.unit}</Text><Pressable onPress={() => setRecipe((current) => current.filter((entry) => entry.itemId !== row.itemId))}><Text style={styles.remove}>Quitar</Text></Pressable></View>; })}
        {!recipe.length && <Text style={styles.empty}>Sin receta configurada.</Text>}
        <Text style={styles.smallLabel}>Selecciona un insumo</Text>
        <View style={styles.chips}>{inventory.items.filter((item) => item.active && !recipe.some((row) => row.itemId === item.id)).map((item) => <Pressable key={item.id} onPress={() => setRecipeItemId(item.id)} style={[styles.chip, recipeItemId === item.id && styles.chipSelected]}><Text style={[styles.chipText, recipeItemId === item.id && styles.chipTextSelected]}>{item.name}</Text></Pressable>)}</View>
        <TextInput keyboardType="decimal-pad" placeholder="Cantidad usada" placeholderTextColor="#8b7868" style={styles.input} value={recipeQuantity} onChangeText={setRecipeQuantity} />
        <View style={styles.buttonRow}><Button label="Agregar insumo" light onPress={addRecipeItem} /><Button label="Guardar receta" onPress={saveRecipe} /></View>
      </View>

      <Text style={styles.sectionTitle}>Movimientos recientes</Text>
      {inventory.movements.slice(0, 20).map((movement) => { const item = inventory.items.find((candidate) => candidate.id === movement.itemId); return <View key={movement.id} style={styles.movement}><View style={styles.flex}><Text style={styles.cardTitle}>{item?.name ?? 'Insumo'}</Text><Text style={styles.muted}>{movement.reason} · {movement.createdBy}</Text></View><Text style={movement.quantity > 0 ? styles.positive : styles.negative}>{movement.quantity > 0 ? '+' : ''}{movement.quantity} {item?.unit}</Text></View>; })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14, padding: 16 }, title: { color: '#2d211b', fontSize: 28, fontWeight: '900' }, copy: { color: '#6f5c4f', fontSize: 14, lineHeight: 20 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, metric: { backgroundColor: '#fffaf3', borderColor: '#e3d6c6', borderRadius: 16, borderWidth: 1, padding: 13, width: '48%' }, metricWarning: { backgroundColor: '#f7e7c2', borderColor: '#e3c889' }, metricLabel: { color: '#766357', fontSize: 11, fontWeight: '700' }, metricValue: { color: '#2d211b', fontSize: 20, fontWeight: '900', marginTop: 6 },
  sectionTitle: { color: '#3a241b', fontSize: 19, fontWeight: '900', marginTop: 9 }, card: { backgroundColor: '#fffaf3', borderColor: '#e3d6c6', borderRadius: 18, borderWidth: 1, gap: 11, padding: 16 }, lowCard: { backgroundColor: '#fff5df', borderColor: '#d9a15f' }, adjustCard: { backgroundColor: '#f3e8da' }, cardTitle: { color: '#2d211b', fontSize: 15, fontWeight: '900' }, muted: { color: '#7b685b', fontSize: 12, lineHeight: 17 }, stock: { color: '#2d211b', fontSize: 29, fontWeight: '900' }, stockUnit: { color: '#806b5e', fontSize: 15 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' }, flex: { flex: 1 }, badge: { backgroundColor: '#dce7cf', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, badgeLow: { backgroundColor: '#f0cfa1' }, badgeText: { color: '#49392f', fontSize: 10, fontWeight: '900' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, button: { backgroundColor: '#3a241b', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10 }, buttonLight: { backgroundColor: '#eadfd2' }, buttonText: { color: '#fff', fontSize: 12, fontWeight: '800' }, buttonTextDark: { color: '#3a241b' }, input: { backgroundColor: '#fff', borderColor: '#d7c8b8', borderRadius: 12, borderWidth: 1, color: '#2d211b', fontSize: 15, paddingHorizontal: 13, paddingVertical: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderColor: '#cdbba9', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 }, chipSelected: { backgroundColor: '#8f4f35', borderColor: '#8f4f35' }, chipText: { color: '#6e5849', fontSize: 11, fontWeight: '700' }, chipTextSelected: { color: '#fff' }, smallLabel: { color: '#7b685b', fontSize: 11, fontWeight: '800' },
  recipeRow: { alignItems: 'center', borderBottomColor: '#e3d6c6', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 9 }, recipeAmount: { color: '#2d211b', fontWeight: '800' }, remove: { color: '#a14535', fontSize: 12, fontWeight: '800' }, empty: { color: '#806b5e', paddingVertical: 12, textAlign: 'center' }, movement: { alignItems: 'center', backgroundColor: '#fffaf3', borderColor: '#e3d6c6', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 13 }, positive: { color: '#34734c', fontWeight: '900' }, negative: { color: '#a84538', fontWeight: '900' },
});
