/**
 * Staff directory for the Admin (assign surveyor/technician/QC, invites). Reads the real
 * `users` collection (Admin/Owner may list it, firestore.rules), never DbManager.
 */

import { getRepository } from '../../repository';
import type { CanonicalUserRole } from '../../domain/entities';
import type { MvpActor, MvpCtx } from './orderService';
import { MvpError, normalizeIndianMobile } from './orderService';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';

export interface Person {
  id: string;
  name: string;
  role: CanonicalUserRole | 'pending_selection';
  status?: string;
  email?: string;
  phone?: string;
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

/**
 * D-32: the Admin records a person's mobile so the chase list can WhatsApp or call them
 * (Google sign-in gives no phone number). Stored as the 10-digit number; audited.
 */
export async function setPersonPhone(ctx: MvpCtx, actor: MvpActor, userId: string, phone: string): Promise<void> {
  if (actor.role !== 'admin') throw new MvpError('forbidden', 'Only the Admin can change a mobile number.');
  const normalized = phone.trim() === '' ? '' : normalizeIndianMobile(phone);
  if (normalized === null) throw new MvpError('invalid', 'Enter a 10-digit Indian mobile number.');
  const before = await usersRepository(ctx).get(userId);
  if (!before) throw new MvpError('not_found', 'That person was not found.');
  await usersRepository(ctx).update(userId, { phone: normalized });
  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action: 'USER_PHONE_SET', entityType: 'User', entityId: userId,
    before: { phone: before.phone ?? '' }, after: { phone: normalized }, source: 'ui', correlationId: newCorrelationId(),
  });
}
