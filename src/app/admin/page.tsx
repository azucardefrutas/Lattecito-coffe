import Admin from '@/components/admin';
import { authorized, localOnly } from '@/lib/auth';
import { db } from '@/lib/db';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function Page() {
  try {
    await localOnly();
  } catch {
    notFound();
  }
  return (
    <Admin
      authenticated={await authorized()}
      setup={!db().prepare('SELECT id FROM auth WHERE id=1').get()}
    />
  );
}
