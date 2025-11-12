// app/(protected)/inventory/page.tsx
import { redirect } from 'next/navigation';

export default function InventoryIndex() {
  redirect('/inventory/stock');
}
