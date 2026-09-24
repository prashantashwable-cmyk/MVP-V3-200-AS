/**
 * Staff directory for the Admin (assign surveyor/technician/QC, invites). Reads the real
 * `users` collection (Admin/Owner may list it, firestore.rules), never DbManager.
 */

import { getRepository } from '../../repository';
import type { CanonicalUserRole } from '../../domain/entities';
import type { MvpCtx } from './orderService';

export interface Person {
  id: string;
  name: string;
  role: CanonicalUserRole | 'pending_selection';
  status?: string;
  email?: string;
  customerId?: string;
}

export const usersRepository = (ctx: MvpCtx) => getRepository<Person & { version?: number }>('users', ctx);

export async function listPeople(ctx: MvpCtx, role?: CanonicalUserRole): Promise<Person[]> {
  const list = role ? await usersRepository(ctx).query({ role } as Partial<Person>) : await usersRepository(ctx).list();
  return list.filter(p => p.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name));
}

export function nameMap(people: Person[]): Record<string, string> {
  return Object.fromEntries(people.map(p => [p.id, p.name]));
}
