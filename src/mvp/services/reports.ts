/**
 * Owner View (spec §27) and Reports (spec §28). Admin/Owner only (I-5: cost/margin never
 * reach any other role — enforced by the screens, same as QuotePanels). Pure aggregation over
 * the canonical repositories; no new collections, no analytics platform.
 */

import type { AMC, Project, QuoteCost } from '../../domain/entities';
import {
  amcRepository, installationJobRepository, paymentMilestoneRepository, projectRepository, quoteCostRepository,
  qcInspectionRepository, serviceCaseRepository, snagRepository, taskRepository,
} from '../../repository/entities';
import { leadRepository } from './orderService';
import { isOpenTask } from '../health';
import { toMvpStage } from '../stage';
import { leadStatus, type MvpLead } from '../leadModel';
import { amcDisplayStatus } from './qcHandoverService';
import type { MvpCtx } from './orderService';

type OrderRecord = Project & { version?: number };

async function loadCore(ctx: MvpCtx) {
  const [orders, milestones, quoteCosts, tasks] = await Promise.all([
    projectRepository(ctx).list() as Promise<OrderRecord[]>,
    paymentMilestoneRepository(ctx).list(),
    quoteCostRepository(ctx).list() as Promise<QuoteCost[]>,
    taskRepository(ctx).list(),
  ]);
  return { orders: orders.filter(o => !!o.displayCode || !!o.status), milestones, quoteCosts, tasks };
}

function moneyOf(orders: OrderRecord[], milestones: { status: string; amount: number; amountReceived: number; kind: string }[]) {
  const booked = orders.filter(o => (o.status ?? 'ACTIVE') !== 'CANCELLED' && o.sellingPrice).reduce((s, o) => s + (o.sellingPrice ?? 0), 0);
  const collected = milestones.reduce((s, m) => s + (m.status === 'PAID' ? m.amount : m.status === 'PARTIAL' ? m.amountReceived : 0), 0);
  return { booked, collected, outstanding: Math.max(0, booked - collected) };
}

function marginPctOf(quoteCosts: QuoteCost[]): number | null {
  if (!quoteCosts.length) return null;
  return Math.round(quoteCosts.reduce((s, q) => s + q.grossMarginPct, 0) / quoteCosts.length);
}

export interface OwnerSummary {
  ordersCount: number;
  bookedValue: number;
  revenueCollected: number;
  outstanding: number;
  estimatedMarginPct: number | null;
  activeInstallations: number;
  completedLifts: number;
  amc: { warranty: number; due: number; offered: number; active: number; lost: number };
}

/** Owner View (spec §27): revenue, orders, pipeline (via the existing dashboard), outstanding, margin, installs, completed lifts, AMC. */
export async function buildOwnerSummary(ctx: MvpCtx): Promise<OwnerSummary> {
  const { orders, milestones, quoteCosts } = await loadCore(ctx);
  const money = moneyOf(orders, milestones);
  const amcs = await amcRepository(ctx).list();
  const now = new Date();
  const amc = { warranty: 0, due: 0, offered: 0, active: 0, lost: 0 };
  for (const a of amcs as AMC[]) {
    const d = amcDisplayStatus(a, now);
    if (d === 'WARRANTY') amc.warranty++;
    else if (d === 'AMC_DUE') amc.due++;
    else if (d === 'AMC_OFFERED') amc.offered++;
    else if (d === 'AMC_ACTIVE') amc.active++;
    else if (d === 'AMC_LOST') amc.lost++;
  }
  return {
    ordersCount: orders.length,
    bookedValue: money.booked,
    revenueCollected: money.collected,
    outstanding: money.outstanding,
    estimatedMarginPct: marginPctOf(quoteCosts),
    activeInstallations: orders.filter(o => toMvpStage(o.stage) === 'INSTALLATION' && (o.status ?? 'ACTIVE') === 'ACTIVE').length,
    completedLifts: orders.filter(o => o.status === 'COMPLETED').length,
    amc,
  };
}

export interface Reports {
  sales: { totalLeads: number; qualified: number; quotesSent: number; orders: number; conversionPct: number };
  operations: { activeOrders: number; overdueTasks: number; blockedTasks: number; avgInstallDays: number | null };
  money: { booked: number; collected: number; outstanding: number; marginPct: number | null };
  quality: { qcPass: number; rework: number; complaints: number };
}

/** Reporting (spec §28): sales, operations, money, quality — four small tables, no analytics platform. */
export async function buildReports(ctx: MvpCtx): Promise<Reports> {
  const { orders, milestones, quoteCosts, tasks } = await loadCore(ctx);
  const [leads, jobs, inspections, snags, cases] = await Promise.all([
    leadRepository(ctx).list() as Promise<MvpLead[]>,
    installationJobRepository(ctx).list(),
    qcInspectionRepository(ctx).list(),
    snagRepository(ctx).list(),
    serviceCaseRepository(ctx).list(),
  ]);
  const now = Date.now();
  const open = tasks.filter(isOpenTask);
  const statuses = leads.map(leadStatus);
  const won = statuses.filter(s => s === 'WON').length;
  const durations = jobs.filter(j => j.startedAt && j.completedAt).map(j => (new Date(j.completedAt!).getTime() - new Date(j.startedAt!).getTime()) / 86_400_000);
  const money = moneyOf(orders, milestones);
  return {
    sales: {
      totalLeads: leads.length,
      qualified: statuses.filter(s => s !== 'NEW' && s !== 'CONTACTED').length,
      quotesSent: statuses.filter(s => s === 'QUOTE' || s === 'WON').length,
      orders: orders.length,
      conversionPct: leads.length ? Math.round((won / leads.length) * 100) : 0,
    },
    operations: {
      activeOrders: orders.filter(o => (o.status ?? 'ACTIVE') === 'ACTIVE').length,
      overdueTasks: open.filter(t => new Date(t.dueDate).getTime() < now).length,
      blockedTasks: open.filter(t => t.status === 'BLOCKED').length,
      avgInstallDays: durations.length ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10 : null,
    },
    money: { booked: money.booked, collected: money.collected, outstanding: money.outstanding, marginPct: marginPctOf(quoteCosts) },
    quality: {
      qcPass: inspections.filter(i => i.decision === 'PASS').length,
      rework: snags.length,
      complaints: cases.filter(c => c.kind === 'COMPLAINT').length,
    },
  };
}
