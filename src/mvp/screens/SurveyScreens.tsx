/**
 * Surveyor: My Surveys (today first, then upcoming) and the survey form (spec §15).
 * Why not reuse SiteVisitVerification: legacy local store with a different field set (790 lines).
 * Offline: the form refuses to submit without a network and keeps what was typed (never silent).
 */

import React, { useState } from 'react';
import { Ruler } from 'lucide-react';
import type { User } from '../../types';
import type { SurveyResult, Task } from '../../domain/entities';
import { Button, Card } from '../../components/Common';
import { getMvpTaskQueue } from '../../services/workQueue';
import { projectRepository } from '../../repository/entities';
import { submitSurvey, validateSurvey, type SurveyInput } from '../services/orderService';
import { formatDateTime } from '../format';
import { TIME_ZONE } from '../config';
import { PhotoInput, type SavedPhoto } from './PhotoInput';
import { ErrorNote, inputCls, labelCls, Loading, useAction, useLoad, useMvpCtx } from './ui';

export const SurveyList: React.FC<{ user: User; onOpenSurvey: (orderId: string) => void }> = ({ user, onOpenSurvey }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { data, error, loading } = useLoad(async () => {
    const tasks = (await getMvpTaskQueue(ctx, actor)).filter(t => t.type === 'SURVEY' && t.orderId);
    const orders = await Promise.all(tasks.map(t => projectRepository(ctx).get(t.orderId!)));
    return tasks.map((t, i) => ({ task: t, order: orders[i] }));
  }, [ctx]);
  if (loading && !data) return <Loading label="Loading surveys…" />;
  if (error) return <ErrorNote message={error} />;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
  const isToday = (t: Task) => new Date(t.dueDate).toLocaleDateString('en-CA', { timeZone: TIME_ZONE }) <= today;
  const rows = data ?? [];
  const section = (title: string, list: typeof rows) => list.length > 0 && (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-warmgray">{title}</h3>
      {list.map(({ task, order }) => (
        <button key={task.id} onClick={() => onOpenSurvey(task.orderId!)} className="w-full text-left cursor-pointer">
          <Card className="p-4" hoverEffect>
            <div className="font-bold text-sm">#{order?.displayCode} · {order?.displaySummary?.customerName}</div>
            <div className="text-xs text-warmgray">{order?.displaySummary?.siteAddress}</div>
            <div className="text-xs mt-1 flex items-center gap-1"><Ruler className="w-3.5 h-3.5" />Survey {formatDateTime(task.dueDate)}</div>
          </Card>
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-4 max-w-xl mx-auto pb-24">
      <h2 className="text-lg font-bold text-charcoal">My surveys</h2>
      {rows.length === 0 && <Card className="p-6 text-sm text-warmgray">No surveys assigned to you.</Card>}
      {section('Today', rows.filter(r => isToday(r.task)))}
      {section('Upcoming', rows.filter(r => !isToday(r.task)))}
    </div>
  );
};

const NUM_FIELDS: { k: keyof SurveyInput; label: string }[] = [
  { k: 'floors', label: 'Floors' }, { k: 'stops', label: 'Stops' }, { k: 'capacityPersons', label: 'Capacity (persons)' },
  { k: 'shaftWidthMm', label: 'Shaft width (mm)' }, { k: 'shaftDepthMm', label: 'Shaft depth (mm)' },
  { k: 'pitMm', label: 'Pit (mm)' }, { k: 'headroomMm', label: 'Headroom (mm)' },
];

export const SurveyForm: React.FC<{ user: User; orderId: string; onDone: () => void }> = ({ user, orderId, onDone }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const order = useLoad(() => projectRepository(ctx).get(orderId), [ctx, orderId]);
  const [nums, setNums] = useState<Record<string, string>>({});
  const [text, setText] = useState({ power: '', access: '', siteReadiness: '', remarks: '' });
  const [result, setResult] = useState<SurveyResult | ''>('');
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);

  const input = (): SurveyInput => ({
    floors: Number(nums.floors), stops: Number(nums.stops), capacityPersons: Number(nums.capacityPersons),
    shaftWidthMm: Number(nums.shaftWidthMm), shaftDepthMm: Number(nums.shaftDepthMm), pitMm: Number(nums.pitMm), headroomMm: Number(nums.headroomMm),
    ...text, photoIds: photos.map(p => p.id), result: result as SurveyResult,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (navigator.onLine === false) throw new Error('No network — the survey is not saved yet. Your entries are kept; submit again when you are online.');
      const problems = validateSurvey(input());
      if (problems.length) throw new Error(problems.join(' '));
      await submitSurvey(ctx, actor, orderId, input());
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl mx-auto pb-24">
      <h2 className="text-lg font-bold text-charcoal">Site survey</h2>
      {order.data && <div className="text-sm text-warmgray">#{order.data.displayCode} · {order.data.displaySummary?.customerName} · {order.data.displaySummary?.siteAddress}</div>}
      {error && <ErrorNote message={error} />}
      <Card className="p-4 grid grid-cols-2 gap-3">
        {NUM_FIELDS.map(({ k, label }) => (
          <div key={k}><label className={labelCls}>{label} *</label>
            <input className={inputCls} inputMode="numeric" value={nums[k] ?? ''} onChange={e => setNums({ ...nums, [k]: e.target.value })} required /></div>
        ))}
      </Card>
      <Card className="p-4 space-y-3">
        {(['power', 'access', 'siteReadiness'] as const).map(k => (
          <div key={k}><label className={labelCls}>{k === 'siteReadiness' ? 'Site readiness' : k[0].toUpperCase() + k.slice(1)}</label>
            <input className={inputCls} value={text[k]} onChange={e => setText({ ...text, [k]: e.target.value })} /></div>
        ))}
        <div><label className={labelCls}>Remarks</label><textarea className={inputCls} rows={2} value={text.remarks} onChange={e => setText({ ...text, remarks: e.target.value })} /></div>
        <div><label className={labelCls}>Photos (at least 2) *</label>
          <PhotoInput ctx={ctx} actor={actor} target={{ orderId }} caption="Survey photo" photos={photos} onChange={setPhotos} /></div>
      </Card>
      <Card className="p-4 space-y-2">
        <label className={labelCls}>Result *</label>
        {([['FEASIBLE', 'Feasible'], ['REQUIRES_CORRECTION', 'Requires correction by the customer'], ['NOT_FEASIBLE', 'Not feasible']] as const).map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-alabaster">
            <input type="radio" name="result" className="w-5 h-5" checked={result === v} onChange={() => setResult(v)} />{l}
          </label>
        ))}
      </Card>
      <Button type="submit" variant="primary" fullWidth disabled={busy}>{busy ? 'Submitting…' : 'Submit survey'}</Button>
    </form>
  );
};
