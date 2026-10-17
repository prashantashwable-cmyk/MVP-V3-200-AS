/**
 * People the Admin can assign work to, and display names for assignee ids.
 * Real sessions: the `users` collection (Admin-readable; others get only
 * role labels). Demo sessions: the existing demo identities plus one demo
 * person per MVP role, so "Try as Role" can play a whole order in one tab.
 */
import { getRepository } from '../../repository';
import type { RepositoryContext } from '../../repository/types';
import type { MvpActor, MvpRole } from '../types';

export interface Person { id: string; name: string; role: MvpRole; customerId?: string }

export const ROLE_LABELS: Record<MvpRole, string> = {
  admin: 'Admin', owner: 'Owner', sales: 'Sales', surveyor: 'Surveyor', technician: 'Technician', qc: 'QC', customer: 'Customer', supplier: 'Supplier',
};

export const DEMO_MVP_PEOPLE: Person[] = [
  { id: 'demo_owner', name: 'Owner (demo)', role: 'owner' },
  { id: 'demo_sales', name: 'Sales Sameer (demo)', role: 'sales' },
  { id: 'demo_qc', name: 'QC Meera (demo)', role: 'qc' },
  { id: 'demo_technician_2', name: 'Technician Vikas (demo)', role: 'technician' },
];

let demoPeople: Person[] = [];

/** App.tsx registers the demo identities (it already owns the legacy demo store), so MVP code never touches the legacy browser store (D-01). */
export function registerDemoPeople(people: Person[]): void {
  demoPeople = people;
}

export async function loadDirectory(ctx: RepositoryContext, actor: MvpActor): Promise<Person[]> {
  if (ctx.environment === 'demo') {
    return [...demoPeople, ...DEMO_MVP_PEOPLE];
  }
  if (actor.role !== 'admin' && actor.role !== 'owner') return [];
  try {
    const users = await getRepository<any>('users', ctx).list();
    return users
      .filter(u => u.role && u.role !== 'pending_selection' && u.status !== 'inactive')
      .map(u => ({ id: u.id, name: u.name || u.email || u.id, role: u.role as MvpRole, customerId: u.customerId }));
  } catch {
    return [];
  }
}

/** "Admin", "Customer", a person's name, or the role behind a pool id. */
export function labelFor(id: string | null | undefined, people: Person[], customerName?: string): string {
  if (!id) return '—';
  if (id === 'role:admin') return 'Admin';
  if (id.startsWith('role:')) return `${ROLE_LABELS[id.slice(5) as MvpRole] ?? id.slice(5)} (any)`;
  if (id.startsWith('customer:')) return customerName ? `Customer · ${customerName}` : 'Customer';
  return people.find(p => p.id === id)?.name ?? id;
}
