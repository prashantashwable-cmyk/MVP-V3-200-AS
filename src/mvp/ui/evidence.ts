/**
 * Evidence upload (D-16): images (and the licence PDF) up to 10 MB.
 * Real sessions upload to Firebase Storage under `orders/{orderId}/…`
 * (`firebase/storage`, part of the existing `firebase` package) and keep
 * only the path; demo sessions keep a compressed data URL in memory, so
 * "Try as Role" never touches Storage. No computer vision.
 */
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from 'firebase/storage';
import { app } from '../../lib/firebase';
import type { AppEnvironment } from '../../lib/environment';
import { MVP_CONFIG } from '../config';
import type { Evidence } from '../types';

const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
let storageConnected = false;

function storage() {
  const s = getStorage(app);
  const emu = (import.meta as any).env?.VITE_STORAGE_EMULATOR_HOST as string | undefined;
  if (emu && !storageConnected) {
    const [h, p] = emu.split(':');
    connectStorageEmulator(s, h, Number(p));
    storageConnected = true;
  }
  return s;
}

/** Shrinks a photo on the device before upload (longest side 1600 px, JPEG 0.75). */
async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.75));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // e.g. HEIC the browser cannot decode: upload as is
  }
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export async function uploadEvidence(env: AppEnvironment, orderKey: string, userId: string, file: File): Promise<Evidence> {
  if (!ALLOWED.test(file.type)) throw new Error('Only photos (JPEG/PNG/WebP/HEIC) or a PDF can be attached.');
  const blob = await compressImage(file);
  if (blob.size > MVP_CONFIG.MAX_EVIDENCE_BYTES) throw new Error('The file is larger than 10 MB.');
  const contentType = blob.type || file.type;
  const name = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${contentType === 'application/pdf' ? 'pdf' : 'jpg'}`;
  const path = `orders/${orderKey}/${name}`;
  const base: Evidence = { path, contentType, sizeBytes: blob.size, uploadedBy: userId, uploadedAt: new Date().toISOString(), name: file.name };
  if (env === 'demo') return { ...base, dataUrl: await toDataUrl(blob) };
  await uploadBytes(ref(storage(), path), blob, { contentType, customMetadata: { uploadedBy: userId } });
  return base;
}

const urlCache = new Map<string, string>();

/** A short-lived download URL, fetched only when the viewer opens the photo (storage rules decide). */
export async function evidenceUrl(e: Evidence): Promise<string> {
  if (e.dataUrl) return e.dataUrl;
  const hit = urlCache.get(e.path);
  if (hit) return hit;
  const url = await getDownloadURL(ref(storage(), e.path));
  urlCache.set(e.path, url);
  return url;
}
