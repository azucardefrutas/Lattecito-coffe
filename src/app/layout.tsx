import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/playfair-display/wght-italic.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'Lattecito Coffee · Tu pausa favorita',
  description:
    'Café, matcha y pequeños momentos para disfrutar. Conoce el menú de Lattecito Coffee y arma tu pedido.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
