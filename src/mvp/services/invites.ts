/**
 * The Admin's invite list (D-13 as changed in Step 02): the only way anyone other than the
 * owner email gets a role in MVP_MODE (no self-signup, firestore.rules `inviteMatches()`).
 * A customer invite is tied to an existing Customer record — usually the one their order
 * already created — so their sign-in gets the matching `customerId` claim (D-12).
 */

import type { CanonicalUserRole, Customer, Invite } from '../../domain/entities';
import { customerRepository, inviteRepository } from '../../repository/entities';
import { createIfAbsent } from '../../repository/transactions';
import { recordAuditEvent, newCorrelationId } from '../../lib/audit';
import { MvpError, nowOf, type MvpActor, type MvpCtx } from './orderService';
import { requireEmail, requireText } from '../validate';

export async function listInvites(ctx: MvpCtx): Promise<Invite[]> {
  return (await inviteRepository(ctx).list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listCustomersForInvite(ctx: MvpCtx): Promise<Customer[]> {
  return (await customerRepository(ctx).list()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createInvite(
  ctx: MvpCtx, actor: MvpActor, input: { email: string; name: string; role: CanonicalUserRole; customerId?: string },
): Promise<Invite> {
  if (actor.role !== 'admin') throw new MvpError('forbidden', 'Only the Admin can invite people.');
  const email = requireEmail(input.email);
  const name = requireText(input.name, 'Name');
  if (input.role === 'customer' && !input.customerId) throw new MvpError('invalid', 'Choose the customer this invite is for.');

  const invite: Invite = {
    id: email, email, name, role: input.role, customerId: input.customerId as Invite['customerId'],
    createdBy: actor.userId, createdAt: nowOf(ctx).toISOString(),
  };
  const repo = inviteRepository(ctx);
  const existing = await repo.get(email);
  if (existing) await repo.update(email, invite as any, (existing as any).version ?? 0);
  else await createIfAbsent(ctx, 'invites', invite as any);

  await recordAuditEvent(ctx, {
    actorId: actor.userId, actorRole: actor.role, action: existing ? 'INVITE_UPDATED' : 'INVITE_CREATED', entityType: 'Invite', entityId: email,
    before: existing ? { role: existing.role } : undefined, after: { role: input.role, name },
    source: 'ui', correlationId: newCorrelationId(),
  });
  return invite;
}
