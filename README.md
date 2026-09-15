# Lattecito Coffee

Web pública en Vercel y administración POS local con Next.js, React, TypeScript y SQLite. Sin conexiones a Supabase ni Render.

## Ejecutar

Requisito: Node.js 22.13 o posterior (probado en Node 25.4). SQLite está integrado en Node.

```sh
npm install
npm run dev
```

En otra terminal:

```sh
npm run dev:admin
```

- Web: http://127.0.0.1:3000
- Administración: http://127.0.0.1:3001
- Cada aplicación tiene proceso, puerto y directorio de compilación propios.
- El proceso público bloquea `/admin` y `/api/admin`. El proceso administrativo exige acceso desde el equipo local y contraseña; la primera visita permite crearla. La sesión dura 8 horas y los intentos fallidos se limitan.
- Los dos procesos comparten **solo localmente** el archivo `data/lattecito.sqlite`.

## Operación

1. Crea tu contraseña desde la administración.
2. En **Insumos**, registra materias primas, unidad, costo unitario y mínimo. Agrega las existencias reales con un movimiento y su motivo/proveedor.
3. En **Productos**, valida los precios y configura la receta de cada tamaño. Agrega extras con su propio precio y receta; puedes ocultarlos o elegir qué bebidas los aceptan. La web y el POS utilizan los mismos precios. Para sustitución de leche usa una variante con receta distinta; los extras actuales son adiciones.
4. En **Configuración**, confirma WhatsApp, dirección y horarios. Desactiva el aviso de catálogo de muestra solo cuando lo hayas validado.
5. Abre caja con su fondo inicial. Registra la venta después de confirmar el pago real.
6. La venta genera ticket, comanda y consumo de ingredientes en una sola transacción. El mismo identificador no genera dos ventas ante un reintento.
7. **Barra** actualiza cada 5 segundos las comandas pagadas. Cambia su estado de pendiente a preparación, listo y entregado.
8. Cierra el turno contando el efectivo. El corte guarda esperado, contado y diferencia. Tarjetas y transferencias no aumentan el efectivo esperado.
9. Exporta periódicamente tus datos desde Configuración. Para un respaldo restaurable completo, detén ambos procesos y copia toda la carpeta `data/`; para restaurar, con los procesos detenidos, repón esa carpeta. El JSON exportado es para consulta/migración; todavía no hay importador en la interfaz.

## Qué incluye

- Portada, menú filtrable, búsqueda, tamaños, extras, cantidades, carrito persistente y enlace de WhatsApp a los dos números indicados. El carrito separa combinaciones con extras diferentes y revisa el catálogo al abrirse; no permite enviar artículos con extras retirados.
- Productos editables, recetas por tamaño, insumos, entradas/salidas con historial, extras, caja, descuentos, efectivo/cambio, tickets imprimibles, historial, cola de preparación y cortes.
- Margen bruto estimado a partir del costo de receta guardado en cada venta; no equivale a utilidad neta y requiere costos completos.
- Diseño adaptable a escritorio y móvil; tipografías y fotografías conceptuales guardadas localmente.

## Inventario y correcciones de ventas

- Gramos y mililitros admiten hasta tres decimales; piezas solo cantidades enteras. Las entradas, salidas y recetas respetan esa unidad y no permiten inventario negativo.
- En **Ventas → Corregir venta**, registra el motivo de una devolución completa. La caja debe estar abierta. Primero confirma la devolución real al cliente: el sistema solo registra el movimiento, no transfiere dinero.
- Para cambiar un producto, precio o medio de pago, corrige la venta original y registra otra. El ticket original conserva sus datos y queda marcado como devuelto con fecha, motivo y referencia.
- Elige si los insumos no fueron utilizados y deben reponerse, o si ya se preparó la bebida y deben quedar como consumo/merma. No se repone inventario automáticamente por el simple hecho de devolver dinero.
- La reposición usa el consumo original guardado con la venta, incluso si luego cambian las recetas. En tickets anteriores se recupera del historial de movimientos.
- Una venta admite una devolución completa; repetir la solicitud no devuelve efectivo ni insumos dos veces. Las devoluciones parciales siguen pendientes.
- El movimiento afecta el turno abierto, incluso si la venta es de otro turno. Los cortes cerrados no se reescriben. Solo las devoluciones de efectivo reducen la caja y se rechazan si superan el efectivo esperado disponible.
- El resumen del día resta devoluciones registradas ese día. Los costos de una bebida preparada se conservan como merma; si los insumos vuelven al inventario, se revierte su costo.

## Datos e imágenes

Los nombres y precios iniciales son ejemplos del brief, no un menú comercial confirmado. No se precargan existencias, costos ni ventas ficticias. La aplicación bloquea cobros sin receta, sin caja o sin existencias.

Contactos configurados: `529841651702` y `529831137618`. El pedido se prepara como enlace: el cliente debe enviarlo y el negocio confirmar disponibilidad en WhatsApp. No se envían mensajes automáticamente.

Las imágenes `public/hero-latte.png` y `public/drinks.png` fueron generadas para esta propuesta y deben reemplazarse o validarse frente a los productos reales. El QR existente se conserva sin asumir su destino. Canva no devolvió diseños existentes al buscar Lattecito.

## Compilar y comprobar

```sh
npm test
npm run typecheck
npm run build
npm run build:admin
npm start
# Otra terminal:
npm run start:admin
```

Prueba de integración, después de compilar ambas aplicaciones:

```sh
node scripts/integration.mjs
```

La prueba usa puertos 3100/3101 y una base aislada bajo `test-results/`; no modifica la base del negocio. Comprueba acceso, aislamiento de puertos, protección de origen, lectura pública, receta, pago, reintentos simultáneos, inventario insuficiente, comanda y corte.

## Separación futura por subdominio

`APP_SURFACE=public` y `APP_SURFACE=admin` seleccionan los accesos y la compilación. El script de ejecución configura esta variable. El subdominio administrativo deberá seguir protegido por autenticación y una política de acceso explícita; ocultar la URL no basta.

El POS usa SQLite en disco y solo escucha en `127.0.0.1`. Antes de alojarlo en un subdominio se requiere una estrategia de datos persistentes compartidos/API y acceso HTTPS. SQLite y la administración se bloquean explícitamente en Vercel, incluso si una variable se configura por error. La web desplegada usa únicamente el catálogo público exportado.

## Publicación de la web en Vercel

El proyecto Vercel se conecta al repositorio `azucardefrutas/Lattecito-coffe`, rama de producción `main`, raíz del repositorio, framework Next.js y compilación `npm run build`.

Variables para **Production** y **Preview**:

| Variable                 | Valor      | Uso                                            |
| ------------------------ | ---------- | ---------------------------------------------- |
| `APP_SURFACE`            | `public`   | Mantiene cerradas las rutas de administración. |
| `LATTECITO_CATALOG_MODE` | `snapshot` | Sirve la copia pública sin abrir SQLite.       |

No se necesitan claves privadas ni conexión a una base de datos para esta publicación. `LATTECITO_DATA_DIR` pertenece exclusivamente al POS local y no debe configurarse en Vercel. Tampoco deben subirse archivos `.env`, la carpeta `data/` ni la base de pruebas. Se excluyen en Git y en los archivos del despliegue.

Para actualizar el menú publicado después de editarlo en el POS:

```sh
npm run menu:export
# Revisar src/data/public-menu.json, confirmar y subir el cambio a main.
```

La exportación lee la base local sin modificarla y selecciona solamente nombres, descripciones, categorías, tamaños/precios, extras y datos públicos de contacto. Omite costos, recetas, existencias, ventas, clientes, cortes, sesiones y contraseñas. El archivo se conserva en el repositorio y Vercel lo publica con el siguiente despliegue. **No hay sincronización automática desde la computadora a Vercel.**

La web local continúa leyendo el catálogo del POS mientras `LATTECITO_CATALOG_MODE` esté sin definir o sea `local`. El catálogo exportado mantiene el aviso de muestra hasta que el negocio confirme sus productos y precios.

Pendientes para fases posteriores: app nativa Expo, acceso desde otros dispositivos, sincronización fuera de este equipo, roles por empleado, devoluciones parciales, impuestos/facturación, integración con terminales/Stripe, impresión térmica directa y notificaciones push. La impresión actual usa el diálogo normal del navegador; la vista de barra puede abrirse en otra pestaña del mismo equipo.

Referencia de composición solicitada: https://www.starbucks.com.mx/ . Identidad visual propia en crema, vino suave y café.
