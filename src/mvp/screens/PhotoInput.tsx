/**
 * Photo evidence input: reuses components/CameraCapture (camera or upload), compresses on the
 * device to ≤ MAX_EVIDENCE_BYTES (D-16), then saves a DocumentRecord. An item is only shown
 * as attached after the save succeeds ("never mark done until the photo is stored").
 */

import React, { useState } from 'react';
import { Camera, X } from 'lucide-react';
import { CameraCapture } from '../../components/CameraCapture';
import { saveEvidence, dataUrlBytes } from '../services/evidenceService';
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
      const doc = await saveEvidence(ctx, actor, { dataUrl, contentType: 'image/jpeg', ...target, caption });
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
