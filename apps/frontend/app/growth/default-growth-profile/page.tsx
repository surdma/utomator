import { redirect } from 'next/navigation';

/** The legacy sample URL resolves to the canonical Pipeline artboard. */
export default function Page() {
  redirect('/dashboard/workspace');
}
