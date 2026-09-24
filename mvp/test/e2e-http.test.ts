/**
 * Multi-user end-to-end over real HTTP: Admin, two technicians, customer
 * and supplier are logged in at the same time with separate sessions.
 * Each acts only through the API. Also proves the backend (not the UI)
 * enforces who can see and do what.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApi } from '../server/api';
import { setup } from './helpers';
import { demoEvidence } from '../server/demo';
import type { Engine } from '../server/workflow/engine';

let server: Server;
let base = '';
let engine: Engine;

before(async () => {
  engine = setup().engine;
  const app = express();
  app.use('/api', createApi(engine));
  await new Promise<void>(r => { server = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => { server.close(); });

async function call(token: string | null, path: string, method = 'GET', body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(userId: string): Promise<string> {
  const r = await call(null, '/login', 'POST', { userId, pin: '1234' });
  assert.equal(r.status, 200, `login ${userId}`);
  return r.body.token;
}

test('five simultaneous users run one project to COMPLETED through the API; backend enforces access', async () => {
  const S: Record<string, string> = {};
  for (const u of ['admin', 'tech-rajesh', 'tech-sunil', 'tech-amol', 'cust-rohan', 'cust-priya', 'sup-sun', 'sup-apex']) S[u] = await login(u);
  assert.equal((await call(null, '/login', 'POST', { userId: 'admin', pin: '0000' })).status, 401);
  assert.equal((await call(null, '/admin/tower')).status, 401);

  // Only Admin can create leads / see the control tower.
  assert.equal((await call(S['cust-rohan'], '/admin/leads', 'POST', { title: 'x', customerId: 'cust-rohan' })).status, 403);
  assert.equal((await call(S['tech-rajesh'], '/admin/tower')).status, 403);
  const site = (await call(S.admin, '/admin/sample-sites')).body[0];
  const created = await call(S.admin, '/admin/leads', 'POST', site);
  assert.equal(created.status, 200);
  const pid: string = created.body.id;

  // The other customer cannot see or act on this project.
  assert.equal((await call(S['cust-priya'], '/my/projects')).body.projects.length, 0);
  const rohanWork = (await call(S['cust-rohan'], '/my/work')).body.work;
  assert.equal(rohanWork[0].type, 'CUSTOMER_QUOTE_DECISION');
  assert.equal((await call(S['cust-priya'], `/work/${rohanWork[0].id}/decide`, 'POST', { accept: true })).status, 403);
  assert.equal((await call(S['tech-rajesh'], `/work/${rohanWork[0].id}/decide`, 'POST', { accept: true })).status, 403);

  const whoHas = async (): Promise<{ user: string; w: any } | undefined> => {
    for (const u of ['tech-rajesh', 'tech-sunil', 'tech-amol', 'cust-rohan', 'sup-sun', 'sup-apex']) {
      const w = (await call(S[u], '/my/work')).body.work[0];
      if (w) return { user: u, w };
    }
    return undefined;
  };

  const seenBy: string[] = [];
  for (let i = 0; i < 20; i++) {
    const tower = (await call(S.admin, '/admin/tower')).body;
    const row = tower.projects.find((p: any) => p.id === pid);
    if (row.state === 'COMPLETED') break;
    const next = await whoHas();
    assert.ok(next, `someone must own the next step at ${row.state}`);
    const { user, w } = next!;
    seenBy.push(`${w.type}@${user}`);
    const tok = S[user];

    // Scoping: technicians get customer phone for the visit; suppliers get no customer data and no money.
    if (user.startsWith('sup-')) {
      assert.equal(w.project.customer, undefined);
      assert.equal(w.project.quote, undefined);
      assert.equal(w.earning, undefined);
    }
    if (user.startsWith('tech-')) assert.ok(w.project.customer.phone);

    if (w.status === 'ASSIGNED') {
      // Someone who is not the owner cannot accept it.
      const other = user === 'tech-amol' ? 'tech-sunil' : 'tech-amol';
      assert.equal((await call(S[other], `/work/${w.id}/accept`, 'POST', {})).status, 403);
      assert.equal((await call(tok, `/work/${w.id}/accept`, 'POST', { version: w.version })).status, 200);
      // A second click with the stale version is refused (two tabs, one transition).
      assert.equal((await call(tok, `/work/${w.id}/accept`, 'POST', { version: w.version })).status, 409);
    }
    if (w.completion === 'decision') {
      assert.equal((await call(tok, `/work/${w.id}/decide`, 'POST', { accept: true })).status, 200);
    } else if (w.completion === 'payment') {
      // No way to pay a different amount: the client never sends one.
      const r = await call(tok, `/work/${w.id}/pay`, 'POST', { amount: 1, cardNumber: '4111111111111111' });
      assert.equal(r.status, 200);
      assert.equal(r.body.payment.amount, w.payment.amount);
    } else {
      const def = engine.def(w.type);
      // Premature submit is refused with 422 and changes nothing.
      const early = await call(tok, `/work/${w.id}/submit`, 'POST', {});
      assert.equal(early.status, 422);
      for (const [n, ev] of demoEvidence(def, engine.project(pid), engine.now()).entries()) {
        const body = { ...ev, idempotencyKey: `${w.id}-${n}` };
        assert.equal((await call(tok, `/work/${w.id}/evidence`, 'POST', body)).status, 200);
        const dup = await call(tok, `/work/${w.id}/evidence`, 'POST', body);
        assert.equal(dup.body.duplicate, true);
      }
      const sub = await call(tok, `/work/${w.id}/submit`, 'POST', {});
      assert.equal(sub.status, 200, JSON.stringify(sub.body));
      assert.equal(sub.body.outcome, 'PASS');
      // Customer can see work photos only after that work is completed.
      const photo = engine.evidenceFor(w.id).find(e => e.kind === 'photo');
      if (photo) {
        const res = await fetch(`${base}/evidence/${photo.id}`, { headers: { Authorization: `Bearer ${S['cust-rohan']}` } });
        assert.equal(res.status, 200);
        assert.equal((await fetch(`${base}/evidence/${photo.id}`, { headers: { Authorization: `Bearer ${S['cust-priya']}` } })).status, 403);
      }
    }
  }

  const tower = (await call(S.admin, '/admin/tower')).body;
  assert.equal(tower.projects.find((p: any) => p.id === pid).state, 'COMPLETED');
  assert.equal(seenBy.length, 10);
  assert.ok(seenBy.some(s => s.startsWith('SUPPLIER_DISPATCH@sup-')));

  // Customer sees progress, paid milestones and proof; the timeline hides internal escalations.
  const home = (await call(S['cust-rohan'], '/my/projects')).body.projects[0];
  assert.equal(home.state, 'COMPLETED');
  assert.ok(home.payments.every((x: any) => x.status === 'PAID'));
  assert.ok(home.evidence.length > 0);

  // Money cannot be moved by any non-workflow route.
  for (const path of ['/payments', `/admin/projects/${pid}/state`, '/admin/payments/set']) {
    const r = await call(S.admin, path, 'POST', { status: 'PAID' });
    assert.equal(r.status, 404, `${path} must not exist`);
  }

  const kpis = (await call(S.admin, '/admin/kpis')).body;
  assert.equal(kpis.adminInterventions, 0);
  assert.equal(kpis.automationRate, 100);

  // Removing access kills sessions immediately.
  assert.equal((await call(S.admin, '/admin/users/sup-apex/active', 'POST', { active: false })).status, 200);
  assert.equal((await call(S['sup-apex'], '/my/work')).status, 401);
});
