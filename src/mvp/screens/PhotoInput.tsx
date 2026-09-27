/**
 * Photo evidence input: reuses components/CameraCapture (camera or upload), compresses on the
 * device to ≤ MAX_EVIDENCE_BYTES (D-16), then saves a DocumentRecord. An item is only shown
 * as attached after the save succeeds ("never mark done until the photo is stored").
 */

import React, { useState } from 'react';
import { Camera, X } from 'lucide-react';
import { CameraCapture } from '../../components/CameraCapture';
import { saveEvidence, dataUrlBytes, getEvidenceFull, MAX_THUMBNAIL_BYTES } from '../services/evidenceService';
import type { DocumentRecord } from '../../domain/entities';
import type { MvpCtx as Ctx } from '../services/orderService';
import { MAX_EVIDENCE_BYTES } from '../config';
import type { MvpActor, MvpCtx } from '../services/orderService';
import { ErrorNote } from './ui';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a readable photo.'));
    img.src = src;
  });
}

/** Re-encodes a photo as JPEG, shrinking until it fits the evidence size limit. */
export async function compressPhoto(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  let maxSide = 1600;
  let quality = 0.8;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlBytes(out) <= MAX_EVIDENCE_BYTES) return out;
    if (quality > 0.5) quality -= 0.15; else maxSide = Math.round(maxSide * 0.75);
  }
  throw new Error('This photo is too large even after compression. Try another photo.');
}

/** A ~240 px JPEG preview for lists; the full photo is fetched only when tapped. */
export async function makeThumbnail(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  let side = 240;
  let quality = 0.6;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlBytes(out) <= MAX_THUMBNAIL_BYTES) return out;
    quality = Math.max(0.3, quality - 0.1);
    side = Math.round(side * 0.8);
  }
  throw new Error('The photo preview could not be made small enough. Try another photo.');
}

/**
 * One evidence tile: the small preview, and the full photo (or PDF) only when tapped —
 * so opening an order no longer downloads every full photo.
 */
export const EvidenceThumb: React.FC<{ ctx: Ctx; doc: DocumentRecord; className?: string }> = ({ ctx, doc, className = 'w-full aspect-square' }) => {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = doc.thumbnailDataUrl ?? doc.dataUrl;
  const isImage = doc.contentType.startsWith('image/');
  const show = async () => {
    setOpen(true); setError(null);
    if (full) return;
    try {
      const f = await getEvidenceFull(ctx, doc);
      if (!f) throw new Error('This file is not available.');
      setFull(f);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <>
      <button type="button" onClick={show} aria-label={`Open ${doc.caption ?? 'evidence'}`} className={`${className} rounded-lg overflow-hidden bg-alabaster flex items-center justify-center cursor-pointer`}>
        {preview && isImage
          ? <img src={preview} alt={doc.caption ?? 'evidence'} className="w-full h-full object-cover" loading="lazy" />
          : <span className="text-[10px] text-warmgray px-1 text-center">{isImage ? 'Photo' : 'PDF'} · tap to open</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4" onClick={() => setOpen(false)}>
          {error && <div className="bg-white rounded-lg p-3 text-sm text-error">{error}</div>}
          {!error && !full && <div className="text-white text-sm">Loading…</div>}
          {full && isImage && <img src={full} alt={doc.caption ?? 'evidence'} className="max-w-full max-h-[80vh] rounded-lg" />}
          {full && !isImage && <a href={full} download={`${doc.caption ?? 'document'}.pdf`} onClick={e => e.stopPropagation()} className="bg-white rounded-lg px-4 py-3 text-sm font-bold">Download the document</a>}
          {doc.caption && <div className="text-white text-xs mt-2">{doc.caption}</div>}
          <button type="button" className="mt-3 text-white text-sm underline min-h-[40px]">Close</button>
        </div>
      )}
    </>
  );
};

export interface SavedPhoto { id: string; dataUrl: string }

export const PhotoInput: React.FC<{
  ctx: MvpCtx; actor: MvpActor;
  target: { orderId?: string; leadId?: string; taskId?: string };
  caption?: string;
  photos: SavedPhoto[];
  onChange: (photos: SavedPhoto[]) => void;
  label?: string;
}> = ({ ctx, actor, target, caption, photos, onChange, label = 'Add photo' }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = async (raw: string) => {
    setOpen(false);
    setBusy(true);
    setError(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('No network — the photo is not saved. Try again when you are online.');
      const dataUrl = await compressPhoto(raw);
      const thumbnailDataUrl = await makeThumbnail(dataUrl);
      const doc = await saveEvidence(ctx, actor, { dataUrl, thumbnailDataUrl, contentType: 'image/jpeg', ...target, caption });
      onChange([...photos, { id: doc.id, dataUrl }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && <ErrorNote message={error} />}
      <div className="flex flex-wrap gap-2 items-center">
        {photos.map(p => (
          <div key={p.id} className="relative">
            <img src={p.dataUrl} alt="attached evidence" className="w-16 h-16 object-cover rounded-lg" />
            <button type="button" aria-label="Remove from this form" onClick={() => onChange(photos.filter(x => x.id !== p.id))}
              className="absolute -top-1.5 -right-1.5 bg-white rounded-full shadow p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
          </div>
        ))}
        <button type="button" disabled={busy} onClick={() => setOpen(true)}
          className="w-16 h-16 rounded-lg border-2 border-dashed border-[#B8873D]/50 flex flex-col items-center justify-center text-[10px] text-[#8a6224] cursor-pointer disabled:opacity-50">
          <Camera className="w-5 h-5" />{busy ? 'Saving…' : label}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-3 w-full max-w-md">
            <CameraCapture onCapture={handleCapture} onCancel={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
