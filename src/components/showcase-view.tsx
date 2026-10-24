import {
  Archive,
  BarChart3,
  Coffee,
  Images,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react';
import { money } from '@/lib/model';
import { percent } from '@/lib/business-analytics';
import type { ShowcaseDashboard } from '@/lib/showcase';

const date = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
const dateTime = (value: string) =>
  new Date(value).toLocaleString('es-MX', { timeZone: 'America/Cancun' });

export default function ShowcaseView({ data }: { data: ShowcaseDashboard }) {
  const { metrics } = data;
  const maxDay = Math.max(1, ...data.days.map((day) => day.sales));
  const bestProduct = data.products[0];
  return (
    <main className="showcase-page">
      <header className="showcase-hero">
        <div>
          <span className="showcase-logo">lattecito</span>
          <span className="eyebrow">INFORME DE NEGOCIO · SOLO LECTURA</span>
          <h1>Así medimos cada taza.</h1>
          <p>
            Periodo actual del {date(data.period.start)} al {date(data.period.end)}. Esta vista no
            permite editar ventas, inventario ni configuraciones.
          </p>
        </div>
        <div className="showcase-trust">
          <ShieldCheck size={22} />
          <strong>
            {data.accessMode === 'fixed' ? 'Acceso fijo habilitado' : 'Acceso temporal protegido'}
          </strong>
          <span>
            {data.accessMode === 'fixed'
              ? 'La dirección permanece igual hasta desactivarla.'
              : `Vence ${dateTime(data.expiresAt)}`}
          </span>
          <small>{data.views} visitas registradas</small>
        </div>
      </header>

      {!data.coverage.reliable && (
        <section className="showcase-warning" role="status">
          <strong>Margen en proceso de configuración</strong>
          <p>
            Hay costos pendientes para {data.coverage.missingProducts.length} producto(s) o días
            históricos sin costo. Las ventas sí son reales; los porcentajes de utilidad se muestran
            como pendientes hasta completar esos datos.
          </p>
        </section>
      )}

      <section className="showcase-formula" aria-label="Fórmula de utilidad neta">
        <Formula value={money(metrics.sales)} label="Ventas cobradas" />
        <i>−</i>
        <Formula value={money(metrics.productCost)} label="Costo de recetas" />
        <i>−</i>
        <Formula value={money(metrics.operatingExpenses)} label="Compras y gastos" />
        <i>=</i>
        <Formula
          value={data.coverage.reliable ? money(metrics.netProfit) : 'Pendiente'}
          label="Utilidad neta"
          featured
        />
      </section>

      <section className="showcase-metrics">
        <Metric
          label="Tickets"
          value={String(metrics.tickets)}
          detail={`Promedio ${money(metrics.averageTicket)}`}
        />
        <Metric
          label="Margen bruto"
          value={data.coverage.reliable ? percent(metrics.grossMargin) : 'Pendiente'}
          detail="(Ventas − costo) ÷ ventas"
        />
        <Metric
          label="Margen neto"
          value={data.coverage.reliable ? percent(metrics.netMargin) : 'Pendiente'}
          detail="Utilidad neta ÷ ventas"
        />
        <Metric
          label="Retorno"
          value={data.coverage.reliable ? percent(metrics.returnOnInvestment) : 'Pendiente'}
          detail="Utilidad ÷ inversión"
        />
      </section>

      <div className="showcase-grid">
        <section className="showcase-card showcase-chart-card">
          <div className="showcase-card-title">
            <div>
              <span className="eyebrow">RITMO DE VENTAS</span>
              <h2>Actividad diaria</h2>
            </div>
            <BarChart3 />
          </div>
          <div className="showcase-bars">
            {data.days.slice(-14).map((day) => (
              <div
                className="showcase-bar-column"
                key={day.date}
                title={`${date(day.date)}: ${money(day.sales)}`}
              >
                <strong>{day.sales ? money(day.sales) : '—'}</strong>
                <div>
                  <span
                    style={{
                      height: `${Math.max(day.sales ? 8 : 0, (day.sales / maxDay) * 100)}%`,
                    }}
                  />
                </div>
                <small>{date(day.date)}</small>
              </div>
            ))}
            {!data.days.length && (
              <p className="muted">Aún no hay ventas compactadas en el periodo.</p>
            )}
          </div>
        </section>

        <section className="showcase-card showcase-index-card">
          <span className="eyebrow">LECTURA RÁPIDA</span>
          <h2>Índices del negocio</h2>
          <dl>
            <div>
              <dt>Producto con mayor venta</dt>
              <dd>{bestProduct ? bestProduct.name : 'Sin datos'}</dd>
            </div>
            <div>
              <dt>Unidades del producto líder</dt>
              <dd>{bestProduct?.quantity ?? 0}</dd>
            </div>
            <div>
              <dt>Cobertura de costos</dt>
              <dd>{data.coverage.percentage}%</dd>
            </div>
            <div>
              <dt>Días con ventas</dt>
              <dd>{data.coverage.daysWithSales}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="showcase-card">
        <div className="showcase-card-title">
          <div>
            <span className="eyebrow">MEZCLA DE INGRESOS</span>
            <h2>Ventas por producto</h2>
          </div>
          <Coffee />
        </div>
        <div className="responsive-table-wrap">
          <table className="admin-data-table showcase-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Presentación</th>
                <th>Unidades</th>
                <th>Precio promedio</th>
                <th>Ingresos</th>
                <th>Participación</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((product) => (
                <tr key={product.key}>
                  <td data-label="Producto">
                    <strong>{product.name}</strong>
                  </td>
                  <td data-label="Presentación">{product.size}</td>
                  <td data-label="Unidades">{product.quantity}</td>
                  <td data-label="Precio promedio">
                    {money(product.quantity ? Math.round(product.amount / product.quantity) : 0)}
                  </td>
                  <td data-label="Ingresos">{money(product.amount)}</td>
                  <td data-label="Participación">
                    {metrics.sales
                      ? `${Math.round((product.amount / metrics.sales) * 100)}%`
                      : '0%'}
                  </td>
                </tr>
              ))}
              {!data.products.length && (
                <tr>
                  <td className="empty-table" colSpan={6}>
                    Aún no hay productos vendidos en el periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.extras.length > 0 && (
        <section className="showcase-card">
          <div className="showcase-card-title">
            <div>
              <span className="eyebrow">PERSONALIZACIÓN</span>
              <h2>Extras vendidos</h2>
            </div>
          </div>
          <div className="responsive-table-wrap">
            <table className="admin-data-table showcase-table">
              <thead>
                <tr>
                  <th>Extra</th>
                  <th>Unidades</th>
                  <th>Precio promedio</th>
                  <th>Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {data.extras.map((extra) => (
                  <tr key={extra.key}>
                    <td data-label="Extra">
                      <strong>{extra.name}</strong>
                    </td>
                    <td data-label="Unidades">{extra.quantity}</td>
                    <td data-label="Precio promedio">
                      {money(extra.quantity ? Math.round(extra.amount / extra.quantity) : 0)}
                    </td>
                    <td data-label="Ingresos">{money(extra.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="showcase-card">
        <div className="showcase-card-title">
          <div>
            <span className="eyebrow">MATERIA PRIMA</span>
            <h2>Inventario y costo unitario</h2>
          </div>
          <PackageCheck />
        </div>
        <p>
          La leche, el matcha, el café y cada insumo se conectan a las recetas para calcular el
          costo real por producto.
        </p>
        <div className="responsive-table-wrap">
          <table className="admin-data-table showcase-table">
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Existencia</th>
                <th>Costo por unidad</th>
                <th>Valor</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.inventory.items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Insumo">
                    <strong>{item.name}</strong>
                  </td>
                  <td data-label="Existencia">
                    {item.stock.toLocaleString('es-MX')} {item.unit}
                  </td>
                  <td data-label="Costo">
                    {money(item.costPerUnit)} / {item.unit}
                  </td>
                  <td data-label="Valor">{money(item.value)}</td>
                  <td data-label="Estado">
                    <span className={item.status === 'Disponible' ? 'status-good' : 'status-warn'}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!data.inventory.items.length && (
                <tr>
                  <td className="empty-table" colSpan={5}>
                    El inventario todavía está por capturarse.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.archives.length > 0 && (
        <section className="showcase-card showcase-archives">
          <div className="showcase-card-title">
            <div>
              <span className="eyebrow">HISTORIAL CONSERVADO</span>
              <h2>Periodos anteriores</h2>
            </div>
            <Archive />
          </div>
          <p>
            Cada cierre guarda las ventas, los gastos y el inventario tal como estaban antes de
            comenzar de nuevo.
          </p>
          <div className="showcase-archive-list">
            {data.archives.map((archive) => (
              <article className="showcase-archive" key={archive.id}>
                <header>
                  <div>
                    <span>PERIODO CERRADO</span>
                    <h3>
                      {date(archive.period.start)} — {date(archive.period.end)}
                    </h3>
                  </div>
                  <small>Guardado {dateTime(archive.createdAt)}</small>
                </header>
                <dl>
                  <div>
                    <dt>Ventas cobradas</dt>
                    <dd>{money(archive.metrics.sales)}</dd>
                  </div>
                  <div>
                    <dt>Tickets</dt>
                    <dd>{archive.metrics.tickets}</dd>
                  </div>
                  <div>
                    <dt>Costos y gastos</dt>
                    <dd>{money(archive.metrics.investment)}</dd>
                  </div>
                  <div>
                    <dt>Resultado registrado</dt>
                    <dd>{money(archive.metrics.netProfit)}</dd>
                  </div>
                </dl>
                <details>
                  <summary>Ver inventario guardado</summary>
                  <div className="responsive-table-wrap">
                    <table className="admin-data-table showcase-table">
                      <thead>
                        <tr>
                          <th>Insumo</th>
                          <th>Existencia al cierre</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {archive.inventory.items.map((item) => (
                          <tr key={item.id}>
                            <td data-label="Insumo">{item.name}</td>
                            <td data-label="Existencia">
                              {item.stock.toLocaleString('es-MX')} {item.unit}
                            </td>
                            <td data-label="Valor">{money(item.value)}</td>
                          </tr>
                        ))}
                        {!archive.inventory.items.length && (
                          <tr>
                            <td className="empty-table" colSpan={3}>
                              No había insumos registrados en este cierre.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="showcase-method">
        <ReceiptText size={26} />
        <div>
          <span className="eyebrow">METODOLOGÍA</span>
          <h2>Fórmulas que usamos</h2>
        </div>
        <ol>
          <li>
            <strong>Costo de receta</strong>
            <span>Suma de cantidad usada × costo unitario de cada insumo.</span>
          </li>
          <li>
            <strong>Utilidad bruta</strong>
            <span>Ventas cobradas − costo de las recetas vendidas.</span>
          </li>
          <li>
            <strong>Utilidad neta</strong>
            <span>Ventas cobradas − costo de recetas − compras y gastos.</span>
          </li>
          <li>
            <strong>Margen neto</strong>
            <span>Utilidad neta ÷ ventas cobradas × 100.</span>
          </li>
          <li>
            <strong>Retorno de inversión</strong>
            <span>Utilidad neta ÷ inversión total × 100.</span>
          </li>
        </ol>
      </section>

      <section className="showcase-gallery-callout">
        <Images size={30} />
        <div>
          <span className="eyebrow">EVIDENCIA VISUAL</span>
          <h2>Conoce el proyecto en imágenes</h2>
          <p>Recorre el local, los productos y las actividades de Lattecito Coffee.</p>
        </div>
        <a href="https://lattecito-coffe.vercel.app/capturas">Abrir galería</a>
      </section>

      <footer className="showcase-footer">
        <span>Lattecito Coffee · Información agregada, sin datos de clientes</span>
        <span>Actualizado {dateTime(data.generatedAt)}</span>
      </footer>
    </main>
  );
}

function Formula({
  value,
  label,
  featured = false,
}: {
  value: string;
  label: string;
  featured?: boolean;
}) {
  return (
    <div className={featured ? 'featured' : ''}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
