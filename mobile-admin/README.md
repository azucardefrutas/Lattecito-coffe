# Lattecito Admin móvil

Aplicación interna de caja y administración creada con Expo.

## Funciones

- Inicio de sesión con las mismas cuentas del administrador web.
- Caja con productos, tamaños, extras y cantidades.
- Ventas en efectivo y transferencias pendientes de confirmación.
- Resumen diario de ventas, ingresos y costos.
- Ticket virtual que se puede compartir desde el teléfono.

## Configuración local

1. Copia `.env.example` a `.env.local`.
2. Define `EXPO_PUBLIC_API_URL` con la URL pública de la API.
3. Instala dependencias con `npm install`.
4. Inicia con `npx expo start`.

Las credenciales y las llaves privadas permanecen en el servidor. La aplicación solo guarda temporalmente la sesión segura del administrador.
