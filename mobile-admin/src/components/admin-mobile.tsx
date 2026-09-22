import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  isUnauthorized,
  loadDashboard,
  login,
  sendCommand,
  type Dashboard,
  type Product,
  type Sale,
} from '@/lib/api';
import { InventoryMobile } from '@/components/inventory-mobile';

type Tab = 'resumen' | 'caja' | 'ventas' | 'inventario' | 'costos';
type CartLine = { productId: string; size: number; quantity: number; modifierIds: string[] };

const sizes = ['Chico', 'Mediano', 'Grande'];
const money = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);

function ActionButton({
  label,
  onPress,
  disabled = false,
  tone = 'dark',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'dark' | 'light' | 'danger';
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'light' && styles.buttonLight,
        tone === 'danger' && styles.buttonDanger,
        (pressed || disabled) && styles.buttonMuted,
      ]}
    >
      <Text style={[styles.buttonText, tone === 'light' && styles.buttonTextDark]}>{label}</Text>
    </Pressable>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.metric, accent && styles.metricAccent]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function SaleCard({
  sale,
  onConfirm,
  onOpen,
}: {
  sale: Sale;
  onConfirm: (id: string) => void;
  onOpen: (sale: Sale) => void;
}) {
  const pending = sale.paymentStatus === 'Pendiente';
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.cardTitle}>Ticket #{sale.number}</Text>
          <Text style={styles.muted}>
            {new Date(sale.date).toLocaleTimeString('es-MX', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {' · '}
            {sale.createdBy}
          </Text>
        </View>
        <View style={[styles.status, pending ? styles.statusPending : styles.statusPaid]}>
          <Text style={styles.statusText}>{sale.paymentStatus}</Text>
        </View>
      </View>
      {sale.items.map((item, index) => (
        <View key={`${sale.id}-${index}`}>
          <Text style={styles.lineText}>
            {item.quantity} × {item.name} · {item.size}
          </Text>
          {item.extras?.map((extra) => (
            <Text key={extra.id} style={styles.extraLine}>
              + {extra.name}
            </Text>
          ))}
        </View>
      ))}
      <View style={styles.rowBetween}>
        <Text style={styles.salePayment}>{sale.payment}</Text>
        <Text style={styles.saleTotal}>{money(sale.total)}</Text>
      </View>
      {pending && (
        <ActionButton label="Confirmar transferencia" onPress={() => onConfirm(sale.id)} />
      )}
      <ActionButton label="Ver comprobante" tone="light" onPress={() => onOpen(sale)} />
    </View>
  );
}

export function AdminMobile() {
  const [token, setToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<Tab>('resumen');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [payment, setPayment] = useState<'Efectivo' | 'Transferencia'>('Efectivo');
  const [received, setReceived] = useState('');
  const [customer, setCustomer] = useState('');
  const [note, setNote] = useState('');
  const [ticket, setTicket] = useState<Sale | null>(null);
  const [costDrafts, setCostDrafts] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const logout = async () => {
    await SecureStore.deleteItemAsync('lattecito-admin-token');
    setToken(null);
    setDashboard(null);
  };

  const refresh = async (activeToken = token) => {
    if (!activeToken) return;
    try {
      const data = await loadDashboard(activeToken);
      setDashboard(data);
      setCostDrafts(
        Object.fromEntries(
          data.catalog.products.map((product) => [
            product.id,
            (data.costs[product.id] ?? [0, 0, 0]).map((value) => String(value / 100)),
          ]),
        ),
      );
      setError('');
    } catch (nextError) {
      if (isUnauthorized(nextError)) await logout();
      setError(nextError instanceof Error ? nextError.message : 'No fue posible actualizar.');
    }
  };

  useEffect(() => {
    SecureStore.getItemAsync('lattecito-admin-token').then(async (saved) => {
      if (!saved) return;
      setToken(saved);
      await refresh(saved);
    });
  }, []);

  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      const session = await login(username.trim(), password);
      await SecureStore.setItemAsync('lattecito-admin-token', session.token);
      setToken(session.token);
      setPassword('');
      await refresh(session.token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No fue posible iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  const products = dashboard?.catalog.products.filter((product) => product.active) ?? [];
  const modifiers = dashboard?.catalog.modifiers.filter((modifier) => modifier.active) ?? [];
  const cartLines = Object.values(cart);
  const cartTotal = useMemo(
    () =>
      cartLines.reduce((sum, line) => {
        const product = products.find((item) => item.id === line.productId);
        const extras = line.modifierIds.reduce(
          (modifierSum, id) =>
            modifierSum + (modifiers.find((modifier) => modifier.id === id)?.price ?? 0),
          0,
        );
        return sum + ((product?.prices[line.size] ?? 0) + extras) * line.quantity;
      }, 0),
    [cartLines, modifiers, products],
  );

  const cartKey = (productId: string, size: number) => `${productId}:${size}`;
  const addProduct = (product: Product, size: number) => {
    const key = cartKey(product.id, size);
    setCart((current) => ({
      ...current,
      [key]: current[key]
        ? { ...current[key], quantity: current[key].quantity + 1 }
        : { productId: product.id, size, quantity: 1, modifierIds: [] },
    }));
  };
  const changeQuantity = (line: CartLine, delta: number) => {
    const key = cartKey(line.productId, line.size);
    setCart((current) => {
      const quantity = line.quantity + delta;
      if (quantity < 1) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: { ...line, quantity } };
    });
  };
  const toggleModifier = (line: CartLine, modifierId: string) => {
    const key = cartKey(line.productId, line.size);
    setCart((current) => ({
      ...current,
      [key]: {
        ...line,
        modifierIds: line.modifierIds.includes(modifierId)
          ? line.modifierIds.filter((id) => id !== modifierId)
          : [...line.modifierIds, modifierId],
      },
    }));
  };

  const completeSale = async () => {
    if (!token || !cartLines.length) return;
    const receivedCents = Math.round(Number(received || 0) * 100);
    if (payment === 'Efectivo' && receivedCents < cartTotal) {
      setError('El efectivo recibido es insuficiente.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const sale = await sendCommand<Sale>(token, {
        action: 'sale',
        id: Crypto.randomUUID(),
        customer: customer.trim(),
        note: note.trim(),
        lines: cartLines,
        payment,
        received: payment === 'Efectivo' ? receivedCents : 0,
      });
      setTicket(sale);
      setCart({});
      setReceived('');
      setCustomer('');
      setNote('');
      await refresh(token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No fue posible cobrar.');
    } finally {
      setBusy(false);
    }
  };

  const confirmTransfer = (id: string) => {
    Alert.alert('Confirmar transferencia', 'Confirma sólo después de revisar el depósito.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          if (!token) return;
          setBusy(true);
          try {
            await sendCommand(token, { action: 'confirm-transfer', saleId: id });
            await refresh(token);
          } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'No fue posible confirmar.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const saveCosts = async (productId: string) => {
    if (!token) return;
    const values = (costDrafts[productId] ?? []).map((value) =>
      Math.round(Number(value || 0) * 100),
    );
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      setError('Revisa los costos del producto.');
      return;
    }
    setBusy(true);
    try {
      await sendCommand(token, { action: 'costs', productId, costs: values });
      await refresh(token);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'No fue posible guardar costos.');
    } finally {
      setBusy(false);
    }
  };

  const shareTicket = async (sale: Sale) => {
    const lines = sale.items.flatMap((item) => [
      `${item.quantity} × ${item.name} · ${item.size}`,
      ...(item.extras ?? []).map(
        (extra) => `  + ${extra.name} · ${money(extra.unitPrice * item.quantity)}`,
      ),
      `  ${money(item.unitPrice * item.quantity)}`,
    ]);
    await Share.share({
      message: [
        'LATTECITO COFFEE',
        `Comprobante #${sale.number}`,
        new Date(sale.date).toLocaleString('es-MX'),
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
        .join('\n'),
    });
  };

  if (!token || !dashboard) {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.loginWrap}
        >
          <View style={styles.loginCard}>
            <Text style={styles.eyebrow}>LATTECITO COFFEE</Text>
            <Text style={styles.loginTitle}>Administración móvil</Text>
            <Text style={styles.loginCopy}>Caja, ventas y ganancias del día en un solo lugar.</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setUsername}
              placeholder="Usuario"
              placeholderTextColor="#8b7868"
              style={styles.input}
              value={username}
            />
            <TextInput
              onChangeText={setPassword}
              onSubmitEditing={signIn}
              placeholder="Contraseña"
              placeholderTextColor="#8b7868"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <ActionButton label={busy ? 'Entrando…' : 'Entrar'} disabled={busy} onPress={signIn} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const content = () => {
    if (tab === 'resumen') {
      const { summary } = dashboard;
      return (
        <View style={styles.section}>
          <Text style={styles.pageTitle}>Resumen de hoy</Text>
          <View style={styles.metricGrid}>
            <Metric label="Ventas cobradas" value={money(summary.total)} accent />
            <Metric label="Efectivo" value={money(summary.cash)} />
            <Metric label="Transferencias" value={money(summary.transfers)} />
            <Metric label="En espera" value={money(summary.pendingTransfers)} />
            <Metric label="Tickets" value={String(summary.tickets)} />
            <Metric
              label="Ganancia bruta"
              value={summary.missingCostCount ? 'Configura costos' : money(summary.grossProfit)}
            />
          </View>
          {summary.missingCostCount > 0 && dashboard.user.role === 'developer' ? (
            <Pressable onPress={() => setTab('costos')} style={styles.notice}>
              <Text style={styles.noticeTitle}>
                Faltan costos en {summary.missingCostCount} productos
              </Text>
              <Text style={styles.noticeCopy}>Agrégalos para calcular la ganancia real.</Text>
            </Pressable>
          ) : null}
          <Text style={styles.sectionTitle}>Últimos tickets</Text>
          {dashboard.sales.slice(0, 4).map((sale) => (
            <SaleCard key={sale.id} sale={sale} onConfirm={confirmTransfer} onOpen={setTicket} />
          ))}
          {!dashboard.sales.length && <Text style={styles.empty}>Todavía no hay ventas hoy.</Text>}
          <Text style={styles.sectionTitle}>Suma por producto</Text>
          <View style={styles.card}>
            {dashboard.daily.products.map((product) => (
              <View key={product.key} style={styles.dailyRow}>
                <Text style={styles.dailyName}>
                  {product.quantity} × {product.name} · {product.size}
                </Text>
                <Text style={styles.dailyAmount}>{money(product.amount)}</Text>
              </View>
            ))}
            {!dashboard.daily.products.length && (
              <Text style={styles.empty}>Todavía no hay productos cobrados.</Text>
            )}
            {dashboard.daily.extras.length > 0 && <Text style={styles.dailyHeading}>EXTRAS</Text>}
            {dashboard.daily.extras.map((extra) => (
              <View key={extra.key} style={styles.dailyRow}>
                <Text style={styles.dailyName}>
                  {extra.quantity} × {extra.name}
                </Text>
                <Text style={styles.dailyAmount}>{money(extra.amount)}</Text>
              </View>
            ))}
            <View style={styles.dailyTotal}>
              <Text style={styles.dailyTotalLabel}>SUMA DEL DÍA</Text>
              <Text style={styles.dailyTotalValue}>{money(dashboard.daily.total)}</Text>
            </View>
          </View>
          <Text style={styles.sectionTitle}>Últimos 7 días</Text>
          <View style={styles.card}>
            {dashboard.history.map((day) => (
              <View key={day.date} style={styles.dailyRow}>
                <Text style={styles.dailyName}>
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString('es-MX')} · {day.tickets}{' '}
                  tickets
                </Text>
                <Text style={styles.dailyAmount}>{money(day.total)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.retentionCopy}>
            Los comprobantes detallados se eliminan después de siete días. Los totales diarios
            permanecen guardados.
          </Text>
        </View>
      );
    }

    if (tab === 'ventas') {
      return (
        <View style={styles.section}>
          <Text style={styles.pageTitle}>Ventas de hoy</Text>
          {dashboard.sales.map((sale) => (
            <SaleCard key={sale.id} sale={sale} onConfirm={confirmTransfer} onOpen={setTicket} />
          ))}
          {!dashboard.sales.length && <Text style={styles.empty}>Todavía no hay ventas hoy.</Text>}
        </View>
      );
    }

    if (tab === 'inventario') {
      return (
        <InventoryMobile
          dashboard={dashboard}
          refresh={() => refresh(token)}
          setBusy={setBusy}
          setError={setError}
          token={token}
        />
      );
    }

    if (tab === 'costos') {
      return (
        <View style={styles.section}>
          <Text style={styles.pageTitle}>Costos de productos</Text>
          <Text style={styles.pageCopy}>Se usan para calcular la ganancia bruta del día.</Text>
          {products.map((product) => (
            <View key={product.id} style={styles.card}>
              <Text style={styles.cardTitle}>{product.name}</Text>
              <View style={styles.costRow}>
                {(product.kind === 'snack' ? ['Pieza'] : sizes).map((size, index) => (
                  <View key={size} style={styles.costField}>
                    <Text style={styles.smallLabel}>{size}</Text>
                    <TextInput
                      keyboardType="decimal-pad"
                      onChangeText={(value) =>
                        setCostDrafts((current) => ({
                          ...current,
                          [product.id]: (current[product.id] ?? ['0', '0', '0']).map(
                            (item, itemIndex) => (itemIndex === index ? value : item),
                          ),
                        }))
                      }
                      style={styles.costInput}
                      value={costDrafts[product.id]?.[index] ?? '0'}
                    />
                  </View>
                ))}
              </View>
              <ActionButton label="Guardar costos" onPress={() => saveCosts(product.id)} />
            </View>
          ))}
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text style={styles.pageTitle}>Nueva venta</Text>
        <Text style={styles.sectionTitle}>Productos</Text>
        {products.map((product) => (
          <View key={product.id} style={styles.productCard}>
            {product.imageUrl ? (
              <Image contentFit="cover" source={product.imageUrl} style={styles.productImage} />
            ) : (
              <View style={styles.productPlaceholder}>
                <Text style={styles.productInitial}>{product.name[0]}</Text>
              </View>
            )}
            <View style={styles.productBody}>
              <Text style={styles.cardTitle}>{product.name}</Text>
              <Text numberOfLines={2} style={styles.muted}>
                {product.description}
              </Text>
              {(product.kind === 'snack' ? ['Pieza'] : sizes).map((size, index) => (
                <View key={size} style={styles.sizeRow}>
                  <Text style={styles.sizeText}>
                    {size} · {money(product.prices[index] ?? 0)}
                  </Text>
                  <Pressable onPress={() => addProduct(product, index)} style={styles.plus}>
                    <Text style={styles.plusText}>+</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Cuenta</Text>
        {!cartLines.length && <Text style={styles.empty}>Usa el + para agregar productos.</Text>}
        {cartLines.map((line) => {
          const product = products.find((item) => item.id === line.productId)!;
          return (
            <View key={cartKey(line.productId, line.size)} style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{product.name}</Text>
                  <Text style={styles.muted}>
                    {product.kind === 'snack' ? 'Pieza' : sizes[line.size]} ·{' '}
                    {money(product.prices[line.size])}
                  </Text>
                </View>
                <View style={styles.quantity}>
                  <Pressable onPress={() => changeQuantity(line, -1)} style={styles.quantityButton}>
                    <Text>−</Text>
                  </Pressable>
                  <Text style={styles.quantityText}>{line.quantity}</Text>
                  <Pressable onPress={() => changeQuantity(line, 1)} style={styles.quantityButton}>
                    <Text>+</Text>
                  </Pressable>
                </View>
              </View>
              {modifiers.filter(
                (modifier) =>
                  modifier.productIds?.includes(product.id) ||
                  (!modifier.productIds && product.kind !== 'snack'),
              ).length > 0 && (
                <View style={styles.chips}>
                  {modifiers
                    .filter(
                      (modifier) =>
                        modifier.productIds?.includes(product.id) ||
                        (!modifier.productIds && product.kind !== 'snack'),
                    )
                    .map((modifier) => {
                      const selected = line.modifierIds.includes(modifier.id);
                      return (
                        <Pressable
                          key={modifier.id}
                          onPress={() => toggleModifier(line, modifier.id)}
                          style={[styles.chip, selected && styles.chipSelected]}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                            {modifier.name} +{money(modifier.price)}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              )}
            </View>
          );
        })}
        {cartLines.length > 0 && (
          <View style={styles.checkout}>
            <View style={styles.rowBetween}>
              <Text style={styles.checkoutLabel}>Total</Text>
              <Text style={styles.checkoutTotal}>{money(cartTotal)}</Text>
            </View>
            <View style={styles.segment}>
              {(['Efectivo', 'Transferencia'] as const).map((method) => (
                <Pressable
                  key={method}
                  onPress={() => setPayment(method)}
                  style={[styles.segmentButton, payment === method && styles.segmentSelected]}
                >
                  <Text
                    style={[styles.segmentText, payment === method && styles.segmentTextSelected]}
                  >
                    {method}
                  </Text>
                </Pressable>
              ))}
            </View>
            {payment === 'Efectivo' && (
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={setReceived}
                placeholder="Efectivo recibido"
                placeholderTextColor="#8b7868"
                style={styles.input}
                value={received}
              />
            )}
            <TextInput
              onChangeText={setCustomer}
              placeholder="Nombre del cliente (opcional)"
              placeholderTextColor="#8b7868"
              style={styles.input}
              value={customer}
            />
            <TextInput
              multiline
              onChangeText={setNote}
              placeholder="Nota (opcional)"
              placeholderTextColor="#8b7868"
              style={[styles.input, styles.noteInput]}
              value={note}
            />
            {payment === 'Transferencia' && (
              <Text style={styles.pendingCopy}>
                La venta quedará en espera hasta confirmar el depósito.
              </Text>
            )}
            <ActionButton
              label={busy ? 'Guardando…' : 'Cobrar y generar ticket'}
              disabled={busy}
              onPress={completeSale}
            />
          </View>
        )}
      </View>
    );
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'caja', label: 'Caja' },
    { id: 'ventas', label: 'Ventas' },
    { id: 'inventario', label: 'Inventario' },
    ...(dashboard.user.role === 'developer' ? [{ id: 'costos' as Tab, label: 'Costos' }] : []),
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>LATTECITO</Text>
          <Text style={styles.user}>
            {dashboard.user.username} ·{' '}
            {dashboard.user.role === 'developer' ? 'Desarrollador' : 'Administrador'}
          </Text>
        </View>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>Salir</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
          />
        }
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
        {content()}
      </ScrollView>
      <View style={styles.nav}>
        {tabs.map((item) => (
          <Pressable key={item.id} onPress={() => setTab(item.id)} style={styles.navButton}>
            <Text style={[styles.navText, tab === item.id && styles.navTextActive]}>
              {item.label}
            </Text>
            {tab === item.id && <View style={styles.navDot} />}
          </Pressable>
        ))}
      </View>
      {busy && (
        <View pointerEvents="none" style={styles.busy}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
      <Modal
        animationType="slide"
        transparent
        visible={Boolean(ticket)}
        onRequestClose={() => setTicket(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.ticket}>
            <Text style={styles.eyebrow}>LATTECITO COFFEE</Text>
            <Text style={styles.ticketTitle}>Comprobante #{ticket?.number}</Text>
            {ticket && (
              <Text style={styles.muted}>{new Date(ticket.date).toLocaleString('es-MX')}</Text>
            )}
            {ticket?.customer ? (
              <Text style={styles.lineText}>Cliente: {ticket.customer}</Text>
            ) : null}
            {ticket?.items.map((item, index) => (
              <View key={index} style={styles.ticketItem}>
                <View style={styles.flex}>
                  <Text style={styles.lineText}>
                    {item.quantity} × {item.name} · {item.size}
                  </Text>
                  {item.extras?.map((extra) => (
                    <Text key={extra.id} style={styles.extraLine}>
                      + {extra.name} · {money(extra.unitPrice * item.quantity)}
                    </Text>
                  ))}
                </View>
                <Text style={styles.lineText}>{money(item.unitPrice * item.quantity)}</Text>
              </View>
            ))}
            <View style={styles.ticketRule} />
            <View style={styles.rowBetween}>
              <Text style={styles.checkoutLabel}>Total</Text>
              <Text style={styles.checkoutTotal}>{money(ticket?.total ?? 0)}</Text>
            </View>
            <Text style={styles.pendingCopy}>
              {ticket?.payment} · {ticket?.paymentStatus}
            </Text>
            {ticket?.payment === 'Efectivo' && (
              <Text style={styles.lineText}>
                Recibido: {money(ticket.received)} · Cambio: {money(ticket.change)}
              </Text>
            )}
            {ticket?.note ? <Text style={styles.lineText}>Nota: {ticket.note}</Text> : null}
            {ticket && (
              <ActionButton label="Compartir ticket" onPress={() => shareTicket(ticket)} />
            )}
            <ActionButton label="Cerrar" tone="light" onPress={() => setTicket(null)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f0e6' },
  flex: { flex: 1 },
  loginWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  loginCard: {
    backgroundColor: '#fffaf3',
    borderRadius: 28,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: '#e3d6c6',
  },
  eyebrow: { color: '#8f4f35', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  loginTitle: { color: '#2d211b', fontSize: 30, fontWeight: '800' },
  loginCopy: { color: '#6f5c4f', fontSize: 16, lineHeight: 23, marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d7c8b8',
    borderRadius: 14,
    color: '#2d211b',
    fontSize: 16,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  noteInput: { minHeight: 76, textAlignVertical: 'top' },
  error: { color: '#a8352c', fontWeight: '700' },
  errorBox: {
    backgroundColor: '#fde8e4',
    borderRadius: 12,
    margin: 16,
    marginBottom: 0,
    padding: 12,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#3a241b',
    borderRadius: 14,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  buttonLight: { backgroundColor: '#eadfd2' },
  buttonDanger: { backgroundColor: '#a8352c' },
  buttonMuted: { opacity: 0.55 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  buttonTextDark: { color: '#3a241b' },
  header: {
    alignItems: 'center',
    backgroundColor: '#fffaf3',
    borderBottomColor: '#e3d6c6',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  brand: { color: '#3a241b', fontSize: 17, fontWeight: '900', letterSpacing: 2 },
  user: { color: '#806b5e', fontSize: 12, marginTop: 3 },
  logout: { color: '#8f4f35', fontWeight: '800', padding: 8 },
  scroll: { paddingBottom: 110 },
  section: { gap: 14, padding: 16 },
  pageTitle: { color: '#2d211b', fontSize: 28, fontWeight: '900' },
  pageCopy: { color: '#6f5c4f', fontSize: 15, marginTop: -8 },
  sectionTitle: { color: '#3a241b', fontSize: 18, fontWeight: '800', marginTop: 8 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    backgroundColor: '#fffaf3',
    borderColor: '#e3d6c6',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 100,
    padding: 15,
    width: '48%',
  },
  metricAccent: { backgroundColor: '#dce7cf', borderColor: '#c3d2b2' },
  metricLabel: { color: '#766357', fontSize: 12, fontWeight: '700' },
  metricValue: { color: '#2d211b', fontSize: 20, fontWeight: '900', marginTop: 10 },
  notice: { backgroundColor: '#f3dfbd', borderRadius: 18, padding: 16 },
  noticeTitle: { color: '#5e3e1f', fontSize: 15, fontWeight: '900' },
  noticeCopy: { color: '#745633', marginTop: 4 },
  card: {
    backgroundColor: '#fffaf3',
    borderColor: '#e3d6c6',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  cardTitle: { color: '#2d211b', fontSize: 16, fontWeight: '900' },
  muted: { color: '#7b685b', fontSize: 13, lineHeight: 18 },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  lineText: { color: '#514137', flexShrink: 1, fontSize: 14 },
  extraLine: { color: '#8f4f35', fontSize: 12, marginLeft: 12, marginTop: 3 },
  status: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusPending: { backgroundColor: '#f4dca9' },
  statusPaid: { backgroundColor: '#dce7cf' },
  statusText: { color: '#3a312b', fontSize: 11, fontWeight: '900' },
  salePayment: { color: '#765f50', fontWeight: '700' },
  saleTotal: { color: '#2d211b', fontSize: 18, fontWeight: '900' },
  empty: { color: '#806b5e', fontSize: 15, paddingVertical: 20, textAlign: 'center' },
  dailyRow: {
    alignItems: 'center',
    borderBottomColor: '#e3d6c6',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  dailyName: { color: '#5d4b40', flex: 1, fontSize: 13 },
  dailyAmount: { color: '#2d211b', fontSize: 14, fontWeight: '900' },
  dailyHeading: {
    color: '#8f4f35',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 12,
  },
  dailyTotal: {
    alignItems: 'center',
    backgroundColor: '#3a241b',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    padding: 15,
  },
  dailyTotalLabel: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  dailyTotalValue: { color: '#fff', fontSize: 21, fontWeight: '900' },
  retentionCopy: {
    backgroundColor: '#eadfd2',
    borderRadius: 14,
    color: '#6f5c4f',
    fontSize: 12,
    lineHeight: 18,
    padding: 13,
  },
  productCard: {
    backgroundColor: '#fffaf3',
    borderColor: '#e3d6c6',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  productImage: { height: 150, width: 105 },
  productPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#d8c0a8',
    height: 150,
    justifyContent: 'center',
    width: 105,
  },
  productInitial: { color: '#fff', fontSize: 40, fontWeight: '900' },
  productBody: { flex: 1, gap: 6, padding: 13 },
  sizeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sizeText: { color: '#5d4b40', fontSize: 13, fontWeight: '700' },
  plus: {
    alignItems: 'center',
    backgroundColor: '#3a241b',
    borderRadius: 999,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  plusText: { color: '#fff', fontSize: 21, fontWeight: '600', marginTop: -2 },
  quantity: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  quantityButton: {
    alignItems: 'center',
    backgroundColor: '#eadfd2',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  quantityText: { color: '#2d211b', fontWeight: '900', minWidth: 18, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderColor: '#cdbba9',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipSelected: { backgroundColor: '#8f4f35', borderColor: '#8f4f35' },
  chipText: { color: '#6e5849', fontSize: 12, fontWeight: '700' },
  chipTextSelected: { color: '#fff' },
  checkout: { backgroundColor: '#fffaf3', borderRadius: 22, gap: 12, padding: 18 },
  checkoutLabel: { color: '#6b574a', fontSize: 16, fontWeight: '700' },
  checkoutTotal: { color: '#2d211b', fontSize: 25, fontWeight: '900' },
  segment: { backgroundColor: '#eadfd2', borderRadius: 14, flexDirection: 'row', padding: 4 },
  segmentButton: { alignItems: 'center', borderRadius: 11, flex: 1, padding: 11 },
  segmentSelected: { backgroundColor: '#3a241b' },
  segmentText: { color: '#665145', fontWeight: '800' },
  segmentTextSelected: { color: '#fff' },
  pendingCopy: { color: '#765a30', fontSize: 13, lineHeight: 18 },
  costRow: { flexDirection: 'row', gap: 7 },
  costField: { flex: 1 },
  smallLabel: { color: '#7b685b', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  costInput: {
    backgroundColor: '#fff',
    borderColor: '#d7c8b8',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 10,
  },
  nav: {
    backgroundColor: '#fffaf3',
    borderTopColor: '#e3d6c6',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    left: 0,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    position: 'absolute',
    right: 0,
  },
  navButton: { alignItems: 'center', flex: 1, gap: 5, padding: 8 },
  navText: { color: '#8b7868', fontSize: 12, fontWeight: '700' },
  navTextActive: { color: '#3a241b', fontWeight: '900' },
  navDot: { backgroundColor: '#8f4f35', borderRadius: 4, height: 4, width: 18 },
  busy: {
    alignItems: 'center',
    backgroundColor: 'rgba(45,33,27,.45)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  modalBackdrop: { backgroundColor: 'rgba(35,25,20,.55)', flex: 1, justifyContent: 'flex-end' },
  ticket: {
    backgroundColor: '#fffaf3',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 12,
    maxHeight: '85%',
    padding: 24,
    paddingBottom: 34,
  },
  ticketTitle: { color: '#2d211b', fontSize: 25, fontWeight: '900' },
  ticketRule: { backgroundColor: '#d9cbbc', height: 1, marginVertical: 5 },
  ticketItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
});
