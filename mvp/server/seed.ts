/**
 * Demo users. Personas reuse the V3 seed (`src/lib/db.ts` initialUsers):
 * Prashant (Admin), Rajesh (Technician), Sun Elevators (Supplier),
 * Rohan (Customer). Additional technicians/customers/suppliers exist so
 * reassignment, separation of duties (QC ≠ installer) and customer data
 * isolation can be demonstrated. All demo PINs are 1234.
 */
import type { DB } from './db-core';

export const DEMO_PIN = '1234';

export const DEMO_USERS = [
  { id: 'admin', name: 'Prashant Wable', role: 'admin', phone: '+91 98765 43210', org: 'AIEC HQ', lat: 18.5308, lng: 73.8475 },
  { id: 'tech-rajesh', name: 'Rajesh Patel', role: 'technician', phone: '+91 98765 43212', org: 'Technician · Kothrud', lat: 18.5074, lng: 73.8077 },
  { id: 'tech-sunil', name: 'Sunil Jadhav', role: 'technician', phone: '+91 98220 11223', org: 'Technician · Hadapsar', lat: 18.5089, lng: 73.9260 },
  { id: 'tech-amol', name: 'Amol Kulkarni', role: 'technician', phone: '+91 98500 44556', org: 'Technician · Aundh', lat: 18.5590, lng: 73.8070 },
  { id: 'cust-rohan', name: 'Rohan Deshmukh', role: 'customer', phone: '+91 98765 43214', org: 'Deshmukh Builders', lat: null, lng: null },
  { id: 'cust-priya', name: 'Priya Joshi', role: 'customer', phone: '+91 99220 77881', org: 'Joshi Heights CHS', lat: null, lng: null },
  { id: 'sup-sun', name: 'Sun Elevators Mfg.', role: 'supplier', phone: '+91 98765 43213', org: 'Supplier · Chakan', lat: 18.7606, lng: 73.8636 },
  { id: 'sup-apex', name: 'Apex Lift Components', role: 'supplier', phone: '+91 97654 32100', org: 'Supplier · Bhosari', lat: 18.6298, lng: 73.8468 },
] as const;

/** Sample sites for "create project" in the demo. */
export const DEMO_SITES = [
  { title: 'Deshmukh Arcade — 5 floors', customerId: 'cust-rohan', siteAddress: 'Plot 45, Deshmukh Arcade, Kothrud, Pune 411038', area: 'Kothrud', lat: 18.5078, lng: 73.8113, floors: 5, doorType: 'automatic', finish: 'SS' },
  { title: 'Joshi Heights — 7 floors', customerId: 'cust-priya', siteAddress: 'S.No 12, Joshi Heights, Baner, Pune 411045', area: 'Baner', lat: 18.5590, lng: 73.7868, floors: 7, doorType: 'automatic', finish: 'MS' },
  { title: 'Deshmukh Villa — 3 floors', customerId: 'cust-rohan', siteAddress: 'Lane 5, Koregaon Park, Pune 411001', area: 'Koregaon', lat: 18.5362, lng: 73.8940, floors: 3, doorType: 'manual', finish: 'MS' },
] as const;

export function seedIfEmpty(db: DB, now = Date.now()): boolean {
  const n = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (n > 0) return false;
  const ins = db.prepare('INSERT INTO users (id, name, role, phone, pin, active, home_lat, home_lng, org, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)');
  for (const u of DEMO_USERS) ins.run(u.id, u.name, u.role, u.phone, DEMO_PIN, u.lat, u.lng, u.org, now);
  return true;
}
