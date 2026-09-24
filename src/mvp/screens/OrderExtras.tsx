/**
 * Stage-specific panels shown inside the Order View (MvpOrderView renderExtra). Each later
 * step adds its panel here (quote, payments, readiness, installation, QC, handover…).
 */

import React, { useState } from 'react';
import type { User } from '../../types';
import { Button, Card } from '../../components/Common';
import { getLatestSurvey, waiveSurveyFee } from '../services/orderService';
import type { OrderViewExtraProps } from './MvpOrderView';
import { ErrorNote, inputCls, SectionTitle, useAction, useLoad, useMvpCtx } from './ui';
import { QuotePanel } from './QuotePanels';
import { PaymentsPanel } from './PaymentsPanel';
import { ReadinessPanel, SupplyPanel } from './SupplyPanels';

const SurveyPanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view }) => {
  const { ctx } = useMvpCtx(user);
  const { data } = useLoad(() => getLatestSurvey(ctx, view.order.id), [ctx, view.order.id, view.stage]);
  if (!data || user.role === 'customer') return null;
  return (
    <Card className="p-4 space-y-1">
      <SectionTitle>Survey · {data.result.replace(/_/g, ' ')}</SectionTitle>
      <div className="text-xs text-warmgray">
        {data.floors} floors · {data.stops} stops · {data.capacityPersons} persons · shaft {data.shaftWidthMm}×{data.shaftDepthMm} mm · pit {data.pitMm} mm · headroom {data.headroomMm} mm
      </div>
      <div className="text-xs text-warmgray">Power: {data.power || '—'} · Access: {data.access || '—'} · Site: {data.siteReadiness || '—'}</div>
      {data.remarks && <div className="text-xs">{data.remarks}</div>}
    </Card>
  );
};

const SurveyFeePanel: React.FC<{ user: User } & OrderViewExtraProps> = ({ user, view, reload }) => {
  const { ctx, actor } = useMvpCtx(user);
  const { run, busy, error } = useAction();
  const [reason, setReason] = useState('');
  const feeTask = view.openTasks.find(t => t.type === 'COLLECT_SURVEY_FEE');
  if (!feeTask || user.role !== 'admin') return null;
  return (
    <Card className="p-4 space-y-2">
      <SectionTitle>Survey fee (D-30)</SectionTitle>
      {error && <ErrorNote message={error} />}
      <p className="text-xs text-warmgray">Collect the survey fee before assigning a surveyor, or waive it with a reason (audited).</p>
      <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for waiving" />
      <Button variant="secondary" disabled={busy || !reason.trim()} onClick={() => run(() => waiveSurveyFee(ctx, actor, view.order.id, reason)).then(ok => ok && reload())}>Waive survey fee</Button>
    </Card>
  );
};

export const OrderExtras: React.FC<{ user: User; onOpenSurvey?: (orderId: string) => void } & OrderViewExtraProps> = props => {
  const surveyTask = props.view.openTasks.find(t => t.type === 'SURVEY' && t.assigneeId === props.user.id);
  return (
    <>
      {surveyTask && props.onOpenSurvey && (
        <Button variant="primary" fullWidth onClick={() => props.onOpenSurvey!(props.view.order.id)}>Start the survey</Button>
      )}
      <SurveyFeePanel {...props} />
      <ReadinessPanel {...props} />
      <SupplyPanel {...props} />
      <QuotePanel {...props} />
      <PaymentsPanel {...props} />
      <SurveyPanel {...props} />
    </>
  );
};
