import React, { useEffect, useState } from 'react';
import { fetchBlobUrl } from './api';

export const inr = (n: number | null | undefined) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'));

const HEALTH: Record<string, [string, string]> = {
  on_track: ['ok', 'Moving automatically'],
  at_risk: ['warn', 'System recovering'],
  critical: ['bad', 'Admin action required'],
  done: ['info', 'Closed'],
};

export function HealthPill({ health }: { health: string }) {
  const [cls, text] = HEALTH[health] ?? ['', health];
  return <span className={`pill ${cls}`}>{text}</span>;
}

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'ok', PAID: 'ok', SYNCED: 'ok', PASS: 'ok',
  ASSIGNED: 'info', OPEN: 'info', ACCEPTED: 'info', IN_PROGRESS: 'info', REQUIRED: 'info', PROCESSING: 'info',
  REJECTED: 'warn', FLAGGED: 'warn', 'PENDING SYNC': 'warn', FLAG: 'warn',
  UNASSIGNED: 'bad', FAILED: 'bad', 'SYNC FAILED': 'bad', FAIL: 'bad', CANCELLED: '',
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill ${STATUS_CLASS[status] ?? ''}`}>{status.replace(/_/g, ' ')}</span>;
}

export function Progress({ value }: { value: number }) {
  return <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%` }} /></div>;
}

export function EvidenceImage({ id, alt }: { id: string; alt?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let url: string | undefined;
    fetchBlobUrl(`/evidence/${encodeURIComponent(id)}`).then(u => { url = u; setSrc(u); }).catch(() => setSrc(undefined));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return src ? <img src={src} alt={alt ?? id} /> : <span className="muted small">[{id}]</span>;
}

let toastSetter: ((s: string | null) => void) | null = null;
export function toast(msg: string) { toastSetter?.(msg); }
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  toastSetter = setMsg;
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function Notifications({ items }: { items: { id: number; at: string; title: string; body: string; read: boolean }[] }) {
  if (!items?.length) return null;
  return (
    <details className="card">
      <summary><b>Notifications</b> <span className="pill info">{items.filter(n => !n.read).length} new</span></summary>
      <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
        {items.slice(0, 12).map(n => (
          <li key={n.id} className="small" style={{ margin: '6px 0' }}>
            <b>{n.title}</b> — {n.body} <span className="muted">· {n.at}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Downscale a camera photo so field uploads stay small on slow networks. */
export async function compressImage(file: File, maxSide = 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A labelled placeholder photo for demos without a camera. Clearly marked. */
export function demoPhotoDataUrl(label: string): string {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 300;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b5cad'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center';
  g.fillText('DEMO PHOTO', 240, 130);
  g.font = '18px sans-serif'; g.fillText(label.slice(0, 40), 240, 170);
  g.fillText(new Date().toLocaleString('en-IN'), 240, 200);
  return c.toDataURL('image/jpeg', 0.7);
}

export function SignaturePad({ onDone }: { onDone: (dataUrl: string) => void }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const [dirty, setDirty] = useState(false);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [(e.clientX - r.left) * (ref.current!.width / r.width), (e.clientY - r.top) * (ref.current!.height / r.height)];
  };
  return (
    <div>
      <canvas ref={ref} width={600} height={180} className="sig" aria-label="Signature pad"
        onPointerDown={e => { drawing.current = true; const [x, y] = pos(e); const g = ref.current!.getContext('2d')!; g.lineWidth = 2.5; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(x, y); }}
        onPointerMove={e => { if (!drawing.current) return; const [x, y] = pos(e); const g = ref.current!.getContext('2d')!; g.lineTo(x, y); g.stroke(); setDirty(true); }}
        onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }} />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn" onClick={() => { ref.current!.getContext('2d')!.clearRect(0, 0, 600, 180); setDirty(false); }}>Clear</button>
        <button className="btn primary" disabled={!dirty} onClick={() => onDone(ref.current!.toDataURL('image/png'))}>Save signature</button>
      </div>
    </div>
  );
}
