/**
 * HTTP API. Every route resolves the caller from a session token and is
 * authorised HERE (role + ownership), independently of what the UI shows.
 * The engine re-checks ownership on every owner action (defense in depth).
 *
 * There is intentionally NO endpoint that sets a payment status, a
 * project state, or a work-item status directly. State only moves through
 * the workflow actions below.
 */
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { Engine, UserRow } from './workflow/engine';
import { WorkflowError } from './workflow/engine';
import { controlTower, customerHome, myWork, notifications, projectDetail, whyStuck } from './workflow/views';
import { analyzeCatalog, checkInvariants } from './workflow/gaps';
import { computeKpis } from './workflow/kpi';
import { projectLifecycle } from './workflow/lifecycle';
import type { DemoDirector, Scenario } from './demo';
import { DEMO_SITES } from './seed';

type Authed = Request & { user: UserRow };

export function createApi(engine: Engine, director?: DemoDirector): express.Router {
  const r = express.Router();
  r.use(express.json({ limit: '8mb' }));

  const actorOf = (u: UserRow) => ({ id: u.id, role: u.role, name: u.name });

  const auth = (req: Request, res: Response, next: NextFunction) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const row = token ? engine.db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as { user_id: string } | undefined : undefined;
    const user = row ? engine.user(row.user_id) : undefined;
    if (!user || !user.active) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Log in again' });
    (req as Authed).user = user;
    next();
  };
  const role = (...roles: UserRow['role'][]) => (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes((req as Authed).user.role)) return res.status(403).json({ error: 'FORBIDDEN', message: `Requires role: ${roles.join('/')}` });
    next();
  };
  const h = (fn: (req: Authed, res: Response) => unknown) => async (req: Request, res: Response) => {
    try {
      const out = await fn(req as Authed, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof WorkflowError) return res.status(e.status).json({ error: e.code, message: e.message, details: e.details });
      console.error(e);
      res.status(500).json({ error: 'INTERNAL', message: e instanceof Error ? e.message : String(e) });
    }
  };

  // ---- public -------------------------------------------------------------
  r.get('/health', (_req, res) => res.json({ ok: true, seq: engine.changeSeq() }));

  r.get('/login-options', (_req, res) => {
    res.json(engine.users().map(u => ({ id: u.id, name: u.name, role: u.role, org: u.org, active: !!u.active })));
  });

  r.post('/login', (req, res) => {
    const { userId, pin } = req.body ?? {};
    const u = engine.user(String(userId ?? ''));
    if (!u || u.pin !== String(pin ?? '')) return res.status(401).json({ error: 'BAD_LOGIN', message: 'Wrong user or PIN' });
    if (!u.active) return res.status(403).json({ error: 'INACTIVE', message: 'Your access has been removed' });
    const token = randomBytes(24).toString('hex');
    engine.db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, u.id, Date.now());
    res.json({ token, user: { id: u.id, name: u.name, role: u.role, org: u.org } });
  });

  // ---- any logged-in user -------------------------------------------------------
  r.get('/me', auth, h(req => ({ id: req.user.id, name: req.user.name, role: req.user.role, org: req.user.org })));
  r.post('/logout', auth, h(req => {
    engine.db.prepare('DELETE FROM sessions WHERE token = ?').run((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
  }));
  r.get('/sync', auth, h(() => ({ seq: engine.changeSeq(), now: engine.now() })));
  r.get('/notifications', auth, h(req => notifications(engine, req.user.id)));
  r.post('/notifications/read', auth, h(req => {
    engine.tx(() => engine.db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id));
  }));

  // ---- owner actions (technician / supplier / customer) -----------------------------
  r.get('/my/work', auth, role('technician', 'supplier', 'customer'), h(req => myWork(engine, req.user)));
  r.get('/my/projects', auth, role('customer'), h(req => customerHome(engine, req.user)));

  r.post('/work/:id/accept', auth, h(req => engine.acceptTask(actorOf(req.user), req.params.id, req.body?.version)));
  r.post('/work/:id/decline', auth, h(req => engine.declineTask(actorOf(req.user), req.params.id, String(req.body?.reason ?? ''))));
  r.post('/work/:id/start', auth, h(req => engine.startTask(actorOf(req.user), req.params.id)));
  r.post('/work/:id/evidence', auth, h(req => {
    const b = req.body ?? {};
    return engine.addEvidence(actorOf(req.user), req.params.id, {
      kind: b.kind, label: b.label, data: b.data, capturedAt: b.capturedAt, lat: b.lat, lng: b.lng, idempotencyKey: b.idempotencyKey,
    });
  }));
  r.post('/work/:id/submit', auth, h((req, res) => {
    const out = engine.submitTask(actorOf(req.user), req.params.id, req.body?.version);
    if (out.outcome === 'INCOMPLETE') res.status(422);
    return out;
  }));
  r.post('/work/:id/decide', auth, role('customer'), h(req => engine.decideQuote(actorOf(req.user), req.params.id, !!req.body?.accept, String(req.body?.reason ?? ''))));
  r.post('/work/:id/pay', auth, role('customer'), h(async (req, res) => {
    const out = await engine.pay(actorOf(req.user), req.params.id, { method: req.body?.method, cardNumber: req.body?.cardNumber });
    if (!out.ok) res.status(402);
    return out;
  }));

  /** Evidence images: Admin; the person who captured it; the current owner of the work; the project's customer once the work is done. */
  r.get('/evidence/:id', auth, h((req, res) => {
    const ev = engine.db.prepare('SELECT ev.*, wi.assigned_user_id, wi.status AS work_status, p.customer_id FROM evidence ev JOIN work_items wi ON wi.id = ev.work_item_id JOIN projects p ON p.id = ev.project_id WHERE ev.id = ?').get(req.params.id) as any;
    if (!ev) throw new WorkflowError('NOT_FOUND', 404, 'Evidence not found');
    const u = req.user;
    const allowed = u.role === 'admin' || ev.submitted_by === u.id || (ev.assigned_user_id === u.id && !ev.superseded)
      || (u.role === 'customer' && ev.customer_id === u.id && ev.work_status === 'COMPLETED' && ev.kind === 'photo');
    if (!allowed) throw new WorkflowError('FORBIDDEN', 403, 'Not your evidence');
    const data = JSON.parse(ev.data);
    const m = typeof data?.dataUrl === 'string' ? /^data:([^;,]+)(;base64)?,(.*)$/s.exec(data.dataUrl) : null;
    if (!m) return { id: ev.id, kind: ev.kind, data };
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(m[2] ? Buffer.from(m[3], 'base64') : decodeURIComponent(m[3]));
  }));

  // ---- Admin -------------------------------------------------------------------------
  const admin = [auth, role('admin')];
  r.get('/admin/tower', ...admin, h(() => controlTower(engine)));
  r.get('/admin/projects/:id', ...admin, h(req => projectDetail(engine, req.params.id)));
  r.get('/admin/projects/:id/why', ...admin, h(req => whyStuck(engine, req.params.id)));
  r.get('/admin/kpis', ...admin, h(() => computeKpis(engine)));
  r.get('/admin/health', ...admin, h(() => ({
    catalog: analyzeCatalog(engine.catalog),
    invariants: checkInvariants(engine),
    lifecycle: { states: projectLifecycle.states.length, transitions: projectLifecycle.transitions.length },
  })));
  r.get('/admin/users', ...admin, h(() => engine.users().map(u => ({
    id: u.id, name: u.name, role: u.role, org: u.org, phone: u.phone, active: !!u.active,
    openWork: (engine.db.prepare("SELECT COUNT(*) AS n FROM work_items WHERE assigned_user_id = ? AND status NOT IN ('COMPLETED','CANCELLED')").get(u.id) as { n: number }).n,
  }))));
  r.get('/admin/sample-sites', ...admin, h(() => DEMO_SITES));

  r.post('/admin/leads', ...admin, h(req => engine.createLead(actorOf(req.user), req.body ?? {})));
  r.post('/admin/projects/:id/lead', ...admin, h(req => engine.adminCompleteLead(actorOf(req.user), req.params.id, req.body ?? {})));
  r.post('/admin/work/:id/assign', ...admin, h(req => engine.adminAssign(actorOf(req.user), req.params.id, String(req.body?.userId ?? ''), String(req.body?.reason ?? 'Admin decision'))));
  r.post('/admin/work/:id/extend', ...admin, h(req => engine.adminExtend(actorOf(req.user), req.params.id, Number(req.body?.minutes), String(req.body?.reason ?? 'Admin extended'))));
  r.post('/admin/work/:id/review', ...admin, h(req => engine.adminReviewFlag(actorOf(req.user), req.params.id, !!req.body?.approve, String(req.body?.note ?? ''))));
  r.post('/admin/work/:id/offline-payment', ...admin, h(req => engine.adminRecordOfflinePayment(actorOf(req.user), req.params.id, String(req.body?.reference ?? ''))));
  r.post('/admin/users/:id/active', ...admin, h(req => engine.setUserActive(actorOf(req.user), req.params.id, !!req.body?.active)));

  // Demo controls (clearly demo-only; they never change workflow rules).
  r.post('/admin/demo/clock', ...admin, h(req => engine.advanceClock(actorOf(req.user), Number(req.body?.minutes))));
  r.post('/admin/demo/tick', ...admin, h(() => ({ actions: engine.tick() })));
  r.post('/admin/demo/flags/:id', ...admin, h(req => {
    for (const [k, v] of Object.entries(req.body ?? {})) {
      if (!['failNextPayment'].includes(k)) throw new WorkflowError('BAD_INPUT', 400, `Unknown demo switch ${k}`);
      engine.setFlag(actorOf(req.user), req.params.id, k, v);
    }
  }));
  r.post('/admin/demo/start', ...admin, h(req => {
    if (!director) throw new WorkflowError('UNAVAILABLE', 503, 'Demo bot not running');
    let projectId = req.body?.projectId as string | undefined;
    if (!projectId) {
      const site = DEMO_SITES[engine.projects().length % DEMO_SITES.length];
      projectId = engine.createLead(actorOf(req.user), { ...site }).id;
    }
    director.start(projectId, (req.body?.scenario as Scenario) === 'failures' ? 'failures' : 'happy');
    return { projectId };
  }));
  r.post('/admin/demo/stop', ...admin, h(req => director?.stop(String(req.body?.projectId))));
  r.get('/admin/demo/status', ...admin, h(() => director?.status() ?? []));

  // Unknown API routes are a JSON 404, never the SPA page.
  r.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'No such endpoint' }));
  return r;
}
