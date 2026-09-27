/**
 * D-32 chase list: the Admin's "who do I chase today" card, at the top of the dashboard.
 * Every late item from the follow-up ladder (src/mvp/followUp.ts), worst first, with one tap
 * to WhatsApp or call the person who has to act and "Chased" to hide it until tomorrow.
 * WhatsApp is a plain wa.me link opened from the Admin's own phone: no provider, no cost,
 * nothing is sent without the Admin pressing Send.
 * Why not reuse "Needs attention": that lists orders by problem; this lists people to call,
 * with the message already written.
 */

import React, { useState } from 'react';
import { MessageCircle, Phone, CheckCheck, Megaphone } from 'lucide-react';
import type { User } from '../../types';
import { Card } from '../../components/Common';
import { listChases, markChased, type ChaseRow } from '../services/notify';
import { formatDateTime } from '../format';
import type { Lang } from '../i18n';
import { ErrorNote, SectionTitle, useLoad, useMvpCtx, useMvpLang } from './ui';

const LEVEL_STYLE: Record<number, string> = {
  3: 'border-error bg-error/5',
  2: 'border-[#B8873D] bg-[#B8873D]/5',
  1: 'border-[#f0ebe2]',
};

const LEVEL_LABEL: Record<number, string> = { 3: 'Owner alerted', 2: 'Escalated', 1: 'Late' };

function lateText(hours: number): string {
  if (hours < 1) return 'due now';
  if (hours < 48) return `${Math.floor(hours)} h late`;
  return `${Math.floor(hours / 24)} days late`;
}

/** The prefilled WhatsApp text. ⚖ VERIFY the customer wording with the Owner before go-live. */
export function chaseMessage(row: ChaseRow, lang: Lang): string | undefined {
  const code = row.orderCode ? `${row.orderCode}: ` : '';
  const due = row.dueDate ? formatDateTime(row.dueDate) : '';
  const t: Record<Lang, Partial<Record<ChaseRow['kind'], string>>> = {
    en: {
      OVERDUE: `${code}"${row.what}" was due ${due}. Please finish it today, or mark what is stopping you in the app.`,
      EMERGENCY_LATE: `URGENT ${code}the lift emergency response is late. Please call me now.`,
      CUSTOMER_WAITING: `Namaste. For your lift (${row.orderCode ?? ''}), "${row.what}" is pending from your side since ${due}. Please complete it or reply here if you need help. — All India Elevators`,
      BLOCKER_AGING: `${code}the problem "${row.what}" is still open. What do you need to clear it?`,
      LEAD_FOLLOW_UP: `Lead ${row.what}: the follow-up call was due ${due}. Please call and update the app.`,
    },
    mr: {
      OVERDUE: `${code}"${row.what}" हे काम ${due} पर्यंत होणे अपेक्षित होते. कृपया आज पूर्ण करा, किंवा काय अडचण आहे ते ॲपमध्ये नोंदवा.`,
      EMERGENCY_LATE: `तातडीचे ${code}लिफ्ट आपत्कालीन प्रतिसादाला उशीर झाला आहे. कृपया लगेच फोन करा.`,
      CUSTOMER_WAITING: `नमस्कार. तुमच्या लिफ्टसाठी (${row.orderCode ?? ''}) "${row.what}" हे ${due} पासून तुमच्याकडून बाकी आहे. कृपया पूर्ण करा किंवा मदत हवी असल्यास येथे उत्तर द्या. — ऑल इंडिया एलिव्हेटर्स`,
      BLOCKER_AGING: `${code}"${row.what}" ही अडचण अजून सुटलेली नाही. ती सोडवण्यासाठी काय हवे आहे?`,
      LEAD_FOLLOW_UP: `लीड ${row.what}: फॉलो-अप कॉल ${due} ला करायचा होता. कृपया फोन करून ॲपमध्ये नोंद करा.`,
    },
    hi: {
      OVERDUE: `${code}"${row.what}" ${due} तक होना था. कृपया आज पूरा करें, या ऐप में बताएं कि क्या रुकावट है.`,
      EMERGENCY_LATE: `तुरंत ${code}लिफ्ट आपातकाल के जवाब में देरी हो रही है. कृपया अभी फ़ोन करें.`,
      CUSTOMER_WAITING: `नमस्ते. आपकी लिफ्ट (${row.orderCode ?? ''}) के लिए "${row.what}" ${due} से आपकी ओर से बाकी है. कृपया पूरा करें या मदद चाहिए तो यहाँ जवाब दें. — ऑल इंडिया एलिवेटर्स`,
      BLOCKER_AGING: `${code}"${row.what}" वाली रुकावट अभी भी खुली है. इसे हटाने के लिए क्या चाहिए?`,
      LEAD_FOLLOW_UP: `लीड ${row.what}: फ़ॉलो-अप कॉल ${due} को करना था. कृपया फ़ोन करके ऐप में अपडेट करें.`,
    },
  };
  return t[lang][row.kind] ?? t.en[row.kind];
}

export const ChaseList: React.FC<{ user: User; onOpenOrder: (id: string) => void }> = ({ user, onOpenOrder }) => {
  const { ctx, actor } = useMvpCtx(user);
  const lang = useMvpLang();
  const { data, error, reload } = useLoad(() => listChases(ctx), [ctx], { every: 5 });
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const canMark = actor.role === 'admin';

  const chased = async (row: ChaseRow, how: 'whatsapp' | 'call' | 'other') => {
    setBusy(row.key); setFailed(null);
    try { await markChased(ctx, actor, row, how); reload(); }
    catch (e: any) { setFailed(e?.message ?? String(e)); }
    finally { setBusy(null); }
  };

  if (error) return <ErrorNote message={`Could not load the chase list: ${error}`} />;
  if (!data) return null;

  return (
    <Card className="p-4 space-y-2">
      <SectionTitle right={<Megaphone className="w-4 h-4 text-warmgray" />}>Chase today ({data.length})</SectionTitle>
      {data.length === 0 && <p className="text-xs text-warmgray">Nobody needs chasing right now.</p>}
      {failed && <ErrorNote message={failed} />}
      {data.map(row => {
        const text = chaseMessage(row, lang);
        const chasable = !!row.taskId || !!row.blockerId || !!row.leadId;
        return (
          <div key={row.key} className={`p-3 rounded-xl border space-y-2 ${LEVEL_STYLE[row.level] ?? LEVEL_STYLE[1]}`}>
            <button className="w-full text-left cursor-pointer" onClick={() => row.orderId && onOpenOrder(row.orderId)} disabled={!row.orderId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-sm">{row.personName}</span>
                <span className={`text-[10px] font-bold uppercase ${row.level >= 3 ? 'text-error' : 'text-[#B8873D]'}`}>{LEVEL_LABEL[row.level] ?? ''} · {lateText(row.hoursLate)}</span>
              </div>
              <div className="text-xs text-warmgray mt-0.5">{row.orderCode ? `#${row.orderCode} · ` : ''}{row.what}</div>
            </button>
            <div className="flex flex-wrap gap-2">
              {row.phone && text && (
                <a href={`https://wa.me/91${row.phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
                  onClick={() => canMark && chasable && void chased(row, 'whatsapp')}
                  className="min-h-[40px] px-3 rounded-lg bg-[#25D366] text-white text-xs font-bold inline-flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4" />WhatsApp
                </a>
              )}
              {row.phone && (
                <a href={`tel:+91${row.phone}`} className="min-h-[40px] px-3 rounded-lg border border-[#f0ebe2] bg-white text-xs font-bold inline-flex items-center gap-1.5">
                  <Phone className="w-4 h-4" />Call
                </a>
              )}
              {!row.phone && row.orderId && (
                <button onClick={() => onOpenOrder(row.orderId!)} className="min-h-[40px] px-3 rounded-lg border border-[#f0ebe2] bg-white text-xs font-bold cursor-pointer">Open order</button>
              )}
              {canMark && chasable && (
                <button disabled={busy === row.key} onClick={() => chased(row, 'other')}
                  className="min-h-[40px] px-3 rounded-lg border border-[#f0ebe2] bg-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                  <CheckCheck className="w-4 h-4" />Chased
                </button>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
};
