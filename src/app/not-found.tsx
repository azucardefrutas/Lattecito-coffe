import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="empty-page">
      <h1>Esta página no está en el menú.</h1>
      <Link className="button" href="/">
        Volver al inicio
      </Link>
    </main>
  );
}
