/**
 * Admin interventions on one order (spec §9, S7, D-24, D-25, I-4), each through the order
 * service so it is permission-checked and audited. Also used by field roles for "raise blocker".
 */

import React, { useState } from 'react';
import type { BlockerReason, MvpStage, Task } from '../../domain/entities';
import { Button, Card } from '../../components/Common';
import {
  assignSurveyor, BLOCKER_REASONS, cancelOrder, changeDueDate, completeTask, createAdminTask, overrideStage,
  putOnHold, raiseBlocker, reassignTask, resolveBlocker, resumeOrder, type MvpActor, type MvpCtx,
} from '../services/orderService';
import type { OrderViewModel } from '../services/readModels';
import type { Person } from '../services/people';
import { MVP_STAGES, MVP_STAGE_LABELS } from '../stage';
import { ErrorNote, inputCls, labelCls, SectionTitle, useAction } from './ui';

const GENERIC_COMPLETE: Task['type'][] = ['REVIEW_ORDER', 'REVIEW_NOT_FEASIBLE', 'AMC_FOLLOW_UP', 'EMERGENCY_RESPONSE'];

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type Mode = null | 'reassign' | 'due' | 'hold' | 'cancel' | 'override' | 'blocker' | 'surveyor';

export const AdminActions: React.FC<{
  view: OrderViewModel; ctx: MvpCtx; actor: MvpActor; people: Person[]; onDone: () => void;
}> = ({ view, ctx, actor, people, onDone }) => {
  const { run, busy, error } = useAction();
  const [mode, setMode] = useState<Mode>(null);
  const [taskId, setTaskId] = useState<string>(view.currentTask?.id ?? view.openTasks[0]?.id ?? '');
  const [assignee, setAssignee] = useState('');
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [stage, setStage] = useState<MvpStage>(view.stage);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const isAdmin = actor.role === 'admin';
  const orderId = view.order.id;
  const staff = people.filter(p => ['admin', 'surveyor', 'technician', 'qc', 'sales'].includes(p.role));

  const done = async (fn: () => Promise<unknown>) => {
    if (await run(fn)) { setMode(null); setText(''); setDate(''); setAssignee(''); onDone(); }
  };

  const assigneeFor = (id: string) => {
    if (id === 'role:admin') return { id, role: 'admin' as const };
    if (id === 'customer') return { id: `customer:${view.order.customerId}`, role: 'customer' as const };
    const p = people.find(x => x.id === id);
    return { id, role: (p?.role ?? 'technician') as any };
  };

  const openSurveyTask = view.openTasks.find(t => t.type === 'ASSIGN_SURVEYOR');

  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>{isAdmin ? 'Admin actions' : 'Actions'}</SectionTitle>
      {error && <ErrorNote message={error} />}
      <div className="flex flex-wrap gap-2">
        {isAdmin && openSurveyTask && <Button variant="primary" onClick={() => setMode('surveyor')}>Assign surveyor</Button>}
        {isAdmin && view.openTasks.length > 0 && <Button variant="secondary" onClick={() => setMode('reassign')}>Reassign task</Button>}
        {isAdmin && view.openTasks.length > 0 && <Button variant="secondary" onClick={() => setMode('due')}>Change due date</Button>}
        {isAdmin && view.noNextAction && (
          <Button variant="primary" disabled={busy} onClick={() => done(() => createAdminTask(ctx, actor, orderId, {}))}>Create next task</Button>
        )}
        {isAdmin && view.currentTask && GENERIC_COMPLETE.includes(view.currentTask.type) && (
          <Button variant="emerald" disabled={busy} onClick={() => done(() => completeTask(ctx, actor, view.currentTask!.id))}>Mark “{view.currentTask.title}” done</Button>
        )}
        {view.status === 'ACTIVE' && actor.role !== 'owner' && <Button variant="outline" onClick={() => setMode('blocker')}>Raise blocker</Button>}
        {isAdmin && view.status === 'ACTIVE' && <Button variant="ghost" onClick={() => setMode('hold')}>Put on hold</Button>}
        {isAdmin && view.status === 'ON_HOLD' && (
          <Button variant="emerald" disabled={busy} onClick={() => done(() => resumeOrder(ctx, actor, orderId, 'Resumed from Order View'))}>Resume order</Button>
        )}
        {isAdmin && (view.status === 'ACTIVE' || view.status === 'ON_HOLD') && <Button variant="ghost" onClick={() => setMode('cancel')}>Cancel order</Button>}
        {isAdmin && <Button variant="ghost" onClick={() => setMode('override')}>Override stage</Button>}
      </div>

      {view.blockers.map(b => (
        <div key={b.id} className="p-3 rounded-xl bg-error/5 border border-error/20 space-y-2">
          <div className="text-xs"><strong>{b.reason.replace(/_/g, ' ')}</strong> — {b.description}</div>
          {(isAdmin || b.ownerUserId === actor.userId || b.ownerUserId === `customer:${actor.customerId}`) && (
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Resolution note" value={notes[b.id] ?? ''} onChange={e => setNotes({ ...notes, [b.id]: e.target.value })} />
              <Button variant="emerald" disabled={busy || !(notes[b.id] ?? '').trim()} onClick={() => done(() => resolveBlocker(ctx, actor, b.id, notes[b.id]))}>Resolve</Button>
            </div>
          )}
        </div>
      ))}

      {mode && (
        <div className="p-3 rounded-xl bg-alabaster space-y-3">
          {(mode === 'reassign' || mode === 'due') && (
            <div>
              <label className={labelCls}>Task</label>
              <select className={inputCls} value={taskId} onChange={e => setTaskId(e.target.value)}>
                {view.openTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          )}
          {(mode === 'reassign' || mode === 'surveyor') && (
            <div>
              <label className={labelCls}>{mode === 'surveyor' ? 'Surveyor' : 'Assign to'}</label>
              <select className={inputCls} value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">Choose…</option>
                {mode === 'reassign' && <option value="role:admin">Admin</option>}
                {mode === 'reassign' && <option value="customer">Customer</option>}
                {(mode === 'surveyor' ? people.filter(p => p.role === 'surveyor') : staff).map(p => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
              </select>
            </div>
          )}
          {(mode === 'due' || mode === 'hold' || mode === 'surveyor') && (
            <div>
              <label className={labelCls}>{mode === 'hold' ? 'Review date' : mode === 'surveyor' ? 'Survey date' : 'New due date'}</label>
              <input type="datetime-local" className={inputCls} value={date}
                onChange={e => setDate(e.target.value)}
                placeholder={mode === 'due' ? toLocalInput(view.openTasks.find(t => t.id === taskId)?.dueDate ?? new Date().toISOString()) : ''} />
            </div>
          )}
          {mode === 'override' && (
            <div>
              <label className={labelCls}>Stage</label>
              <select className={inputCls} value={stage} onChange={e => setStage(e.target.value as MvpStage)}>
                {MVP_STAGES.map(s => <option key={s} value={s}>{MVP_STAGE_LABELS[s]}</option>)}
              </select>
            </div>
          )}
          {mode === 'blocker' && (
            <div>
              <label className={labelCls}>Reason</label>
              <select className={inputCls} value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">Choose…</option>
                {BLOCKER_REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          )}
          {mode !== 'surveyor' && (
            <div>
              <label className={labelCls}>{mode === 'blocker' ? 'Description' : 'Reason (saved in the audit log)'}</label>
              <input className={inputCls} value={text} onChange={e => setText(e.target.value)} />
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => {
              const iso = date ? new Date(date).toISOString() : undefined;
              if (mode === 'reassign') return done(() => reassignTask(ctx, actor, taskId, assigneeFor(assignee), text));
              if (mode === 'due') return done(() => changeDueDate(ctx, actor, taskId, iso ?? '', text));
              if (mode === 'hold') return done(() => putOnHold(ctx, actor, orderId, text, iso));
              if (mode === 'cancel') return done(() => cancelOrder(ctx, actor, orderId, text));
              if (mode === 'override') return done(() => overrideStage(ctx, actor, orderId, stage, text));
              if (mode === 'surveyor') return done(() => assignSurveyor(ctx, actor, orderId, assignee, iso));
              if (mode === 'blocker') {
                return done(() => raiseBlocker(ctx, actor, {
                  orderId, taskId: view.currentTask?.id, reason: assignee as BlockerReason, description: text,
                }));
              }
            }}>Save</Button>
            <Button variant="ghost" onClick={() => setMode(null)}>Close</Button>
          </div>
        </div>
      )}
    </Card>
  );
};
