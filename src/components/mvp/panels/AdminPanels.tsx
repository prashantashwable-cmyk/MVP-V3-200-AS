/**
 * Admin controls on the Order View (Step 04 list): reassign task, change
 * due date, hold / resume, cancel, stage override, create next task (NO
 * NEXT ACTION), resolve blockers. Each one is an audited service command.
 */
import React, { useState } from 'react';
import * as svc from '../../../mvp/service';
import { isOpenTask } from '../../../mvp/health';
import { formatIst } from '../../../mvp/money';
import { STAGE_LABELS } from '../../../mvp/stage';
import { MVP_STAGES, type MvpBlocker, type MvpRole, type MvpStage, type MvpTask } from '../../../mvp/types';
import type { OrderBundle } from '../../../mvp/views';
import { labelFor, ROLE_LABELS, type Person } from '../../../mvp/ui/directory';
import { Btn, C, ErrorText, EvidenceThumbs, Field, Input, Select, TextArea, fromDateInput, toDateInput, useAction } from '../../../mvp/ui/kit';

const ASSIGNABLE: MvpRole[] = ['admin', 'sales', 'surveyor', 'technician', 'qc', 'customer'];

function assigneeOptions(people: Person[], bundle: OrderBundle): { id: string; label: string; role: MvpRole }[] {
  return [
    { id: 'role:admin', label: 'Admin desk', role: 'admin' as MvpRole },
    { id: `customer:${bundle.order.customerId}`, label: `Customer · ${bundle.customer?.name ?? ''}`, role: 'customer' as MvpRole },
    ...people.filter(p => ASSIGNABLE.includes(p.role) && p.role !== 'customer').map(p => ({ id: p.id, label: `${p.name} (${ROLE_LABELS[p.role]})`, role: p.role })),
  ];
}

export const TaskAdminControls: React.FC<{ ctx: svc.ServiceCtx; task: MvpTask; bundle: OrderBundle; people: Person[]; onDone: () => void }> = ({ ctx, task, bundle, people, onDone }) => {
  const a = useAction(onDone);
  const opts = assigneeOptions(people, bundle);
  const [who, setWho] = useState(task.assigneeId);
  const [due, setDue] = useState(toDateInput(task.dueDate));
  const chosen = opts.find(o => o.id === who);
  return (
    <details className="rounded-xl p-3" style={{ background: C.deep }}>
      <summary className="text-xs font-semibold cursor-pointer" style={{ color: C.gold }}>Admin: reassign or reschedule this task</summary>
      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        <Field label="Assignee">
          <Select value={who} onChange={e => setWho(e.target.value)}>
            {!opts.some(o => o.id === task.assigneeId) && <option value={task.assigneeId}>{labelFor(task.assigneeId, people)}</option>}
            {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Due date"><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
        <Btn tone="ghost" busy={a.busy} disabled={who === task.assigneeId} onClick={() => a.run(() => svc.reassignTask(ctx, task.id, who, chosen?.role ?? task.assigneeRole), 'Task reassigned')}>Reassign</Btn>
        <Btn tone="ghost" busy={a.busy} disabled={!due || due === toDateInput(task.dueDate)} onClick={() => a.run(() => svc.changeDueDate(ctx, task.id, fromDateInput(due)), 'Due date changed')}>Change due date</Btn>
      </div>
      <ErrorText error={a.error} />
    </details>
  );
};

export const OrderAdminBar: React.FC<{ ctx: svc.ServiceCtx; bundle: OrderBundle; people: Person[]; onDone: () => void }> = ({ ctx, bundle, people, onDone }) => {
  const a = useAction(onDone);
  const status = bundle.order.status ?? 'ACTIVE';
  const [reason, setReason] = useState('');
  const [review, setReview] = useState(toDateInput(new Date(Date.now() + 7 * 86400e3).toISOString()));
  const [stage, setStage] = useState<MvpStage>(svc.mvpStageOf(bundle.order));
  const opts = assigneeOptions(people, bundle);
  const [tTitle, setTTitle] = useState('');
  const [tWho, setTWho] = useState('role:admin');
  const [tDue, setTDue] = useState(toDateInput(new Date(Date.now() + 86400e3).toISOString()));
  const openTasks = bundle.tasks.filter(isOpenTask);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Field label="Reason (required for hold, cancel and override)"><Input value={reason} onChange={e => setReason(e.target.value)} /></Field>
        <div className="flex gap-2 flex-wrap items-end">
          {status === 'ACTIVE' && (
            <>
              <Field label="Hold review date"><Input type="date" value={review} onChange={e => setReview(e.target.value)} /></Field>
              <Btn tone="ghost" busy={a.busy} disabled={!reason.trim()} onClick={() => a.run(() => svc.putOnHold(ctx, bundle.order.id, reason, fromDateInput(review)), 'Order on hold')}>Put on hold</Btn>
            </>
          )}
          {status === 'ON_HOLD' && <Btn tone="green" busy={a.busy} onClick={() => a.run(() => svc.resumeOrder(ctx, bundle.order.id), 'Order resumed')}>Resume</Btn>}
          {(status === 'ACTIVE' || status === 'ON_HOLD') && (
            <Btn tone="danger" busy={a.busy} disabled={!reason.trim()} onClick={() => {
              if (window.confirm('Cancel this order? Open tasks will be cancelled; nothing is deleted.')) a.run(() => svc.cancelOrder(ctx, bundle.order.id, reason), 'Order cancelled');
            }}>Cancel order</Btn>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <Field label="Override stage">
            <Select value={stage} onChange={e => setStage(e.target.value as MvpStage)}>
              {MVP_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </Select>
          </Field>
          <Btn tone="ghost" busy={a.busy} disabled={!reason.trim() || stage === svc.mvpStageOf(bundle.order)} onClick={() => a.run(() => svc.overrideStage(ctx, bundle.order.id, stage, reason), 'Stage overridden (audited)')}>Override</Btn>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold" style={{ color: C.muted }}>Create a task {openTasks.length === 0 && bundle.order.status !== 'CANCELLED' ? '(NO NEXT ACTION — please set one)' : ''}</div>
        <div className="grid sm:grid-cols-3 gap-2">
          <Input placeholder="What needs to happen?" value={tTitle} onChange={e => setTTitle(e.target.value)} />
          <Select aria-label="Assignee" value={tWho} onChange={e => setTWho(e.target.value)}>{opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
          <Input aria-label="Due" type="date" value={tDue} onChange={e => setTDue(e.target.value)} />
        </div>
        <Btn tone="ghost" busy={a.busy} disabled={!tTitle.trim()} onClick={() => a.run(() => svc.createManualTask(ctx, bundle.order.id, {
          title: tTitle, assigneeId: tWho, assigneeRole: opts.find(o => o.id === tWho)?.role ?? 'admin', dueDate: fromDateInput(tDue),
        }), 'Task created')}>Create task</Btn>
      </div>
      <ErrorText error={a.error} />
    </div>
  );
};

export const BlockerList: React.FC<{ ctx: svc.ServiceCtx; blockers: MvpBlocker[]; onDone: () => void }> = ({ ctx, blockers, onDone }) => {
  if (!blockers.length) return <p className="text-sm" style={{ color: C.muted }}>No blockers.</p>;
  return <div className="space-y-2">{blockers.map(b => <BlockerRow key={b.id} ctx={ctx} b={b} onDone={onDone} />)}</div>;
};

const BlockerRow: React.FC<{ ctx: svc.ServiceCtx; b: MvpBlocker; onDone: () => void }> = ({ ctx, b, onDone }) => {
  const a = useAction(onDone);
  const [note, setNote] = useState('');
  const mine = ctx.actor.role === 'admin' || b.ownerUserId === ctx.actor.id || (ctx.actor.role === 'customer' && b.ownerUserId === `customer:${ctx.actor.customerId}`);
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: b.status === 'OPEN' ? C.card.action : C.card.done, color: '#200A0C' }}>
      <div className="flex justify-between text-sm gap-2 flex-wrap"><b>{b.reason.replace(/_/g, ' ')}</b><span>{b.status} · {formatIst(b.createdAt)}</span></div>
      <p className="text-sm">{b.description}</p>
      <EvidenceThumbs items={b.evidence} />
      {b.resolutionNote && <p className="text-xs">Resolved: {b.resolutionNote}</p>}
      {b.status === 'OPEN' && mine && (
        <div className="flex gap-2 flex-wrap">
          <TextArea rows={1} placeholder="Resolution note" value={note} onChange={e => setNote(e.target.value)} style={{ background: 'white', color: '#111' }} />
          <Btn tone="green" busy={a.busy} disabled={!note.trim()} onClick={() => a.run(() => svc.resolveBlocker(ctx, b.id, note), 'Blocker resolved')}>Resolve</Btn>
        </div>
      )}
      <ErrorText error={a.error} />
    </div>
  );
};
