/**
 * The notification bell (spec §25, D-17): every notification the viewer's role, uid or
 * customer token matches, newest first, with unread count and mark-as-read on open. Mounted
 * once at the top of MvpRouter so it's on every screen, not tucked inside Settings.
 * Also runs the D-32 follow-up ladder (notify.ts): the full scan + daily digest in the
 * Admin/Owner app, and every other person's own self-scan — on load, then hourly while the
 * app is open. Idempotent (keyed per person, item, rung and day), so repeats are no-ops.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Bell as BellIcon } from 'lucide-react';
import type { User } from '../../types';
import type { NotificationRecord } from '../../domain/entities';
import { listMyNotifications, markNotificationRead, scanMyFollowUps, scanTaskNotifications, type MvpNotification } from '../services/notify';
import { formatDateTime } from '../format';
import { useLoad, useMvpCtx, useMvpLang } from './ui';
import { digestLine, translateNotification } from '../i18n';

const SCAN_EVERY_MS = 60 * 60 * 1000;

export const NotificationBell: React.FC<{ user: User; onOpenOrder: (id: string) => void }> = ({ user, onOpenOrder }) => {
  const { ctx, actor } = useMvpCtx(user);
  const lang = useMvpLang();
  const [open, setOpen] = useState(false);
  const { data, reload } = useLoad(() => listMyNotifications(ctx, actor), [ctx]);
  const scanning = useRef(false);
  const list = data ?? [];
  const unread = list.filter(n => !n.readAt).length;

  useEffect(() => {
    const manager = actor.role === 'admin' || actor.role === 'owner';
    const scan = () => {
      if (scanning.current) return;
      scanning.current = true;
      (manager ? scanTaskNotifications(ctx) : scanMyFollowUps(ctx, actor))
        .then(() => reload())
        .catch(err => console.error('Follow-up scan failed:', err))
        .finally(() => { scanning.current = false; });
    };
    scan();
    const timer = setInterval(scan, SCAN_EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const open1 = async (n: NotificationRecord) => {
    if (!n.readAt) { await markNotificationRead(ctx, n.id); reload(); }
    if (n.projectId) { setOpen(false); onOpenOrder(n.projectId); }
  };

  return (
    <div className="relative">
      <button aria-label="Notifications" onClick={() => setOpen(o => !o)} className="relative p-2.5 rounded-lg hover:bg-alabaster cursor-pointer">
        <BellIcon className="w-5 h-5 text-charcoal" />
        {unread > 0 && <span className="absolute -top-1 -right-1 bg-error text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{Math.min(unread, 9)}</span>}
      </button>
      {open && (
        <>
          <button aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-2xl shadow-lg border border-[#f0ebe2] z-40">
            {list.length === 0 && <p className="p-4 text-xs text-warmgray">No notifications yet.</p>}
            <ul className="divide-y divide-[#f0ebe2]">
              {list.map(n => {
                const text = translateNotification(lang, n.templateId as MvpNotification);
                const body = (n.templateId === 'mvp_daily_digest' && digestLine(n.data)) || text?.body;
                return (
                  <li key={n.id}>
                    <button onClick={() => open1(n)} className={`w-full text-left p-3 cursor-pointer hover:bg-alabaster ${!n.readAt ? 'bg-[#B8873D]/5' : ''}`}>
                      <div className="text-xs font-bold text-charcoal">{text?.subject ?? n.templateId}</div>
                      {body && <div className="text-[11px] text-warmgray">{body}</div>}
                      <div className="text-[10px] text-warmgray mt-0.5">{formatDateTime(n.createdAt)}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};
