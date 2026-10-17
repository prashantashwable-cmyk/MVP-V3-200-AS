/**
 * MVP vocabulary and record shapes (Step 03, plan §2).
 *
 * Every order-scoped record carries `orderId` and `customerId` so the
 * Firestore rules can scope it to the order's participants and its own
 * customer. All fields are additive; nothing here renames or removes a
 * pre-MVP field.
 */

export const MVP_STAGES = [
  'LEAD', 'QUALIFIED', 'SURVEY', 'QUOTE', 'BOOKED', 'SITE_READY', 'DELIVERY', 'INSTALLATION', 'QC_HANDOVER', 'AMC',
] as const;
export type MvpStage = typeof MVP_STAGES[number];

export type OrderStatus = 'ACTIVE' | 'ON_HOLD' | 'CANCELLED' | 'COMPLETED';
export type Health = 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'BLOCKED' | 'ON_HOLD';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';
export const OPEN_TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED'];

export const BLOCKER_REASONS = [
  'CUSTOMER_NOT_READY', 'MATERIAL_MISSING', 'POWER_UNAVAILABLE', 'SITE_UNSAFE',
  'WRONG_MEASUREMENT', 'PAYMENT_PENDING', 'SUPPLIER_DELAY', 'OTHER',
] as const;
export type BlockerReason = typeof BLOCKER_REASONS[number];

export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'FAILED' | 'REFUNDED' | 'WAIVED';
export type MilestoneKind = 'SURVEY_FEE' | 'BOOKING_TOKEN' | 'DELIVERY' | 'FINAL';

export type MvpRole = 'admin' | 'owner' | 'sales' | 'surveyor' | 'technician' | 'qc' | 'customer' | 'supplier';

export type TaskType =
  | 'QUALIFY_LEAD' | 'ASSIGN_SURVEYOR' | 'COLLECT_SURVEY_FEE' | 'SURVEY' | 'SITE_CORRECTION' | 'REVIEW_NOT_FEASIBLE'
  | 'PREPARE_QUOTE' | 'APPROVE_MARGIN' | 'QUOTE_DECISION' | 'COLLECT_BOOKING_TOKEN' | 'SITE_READINESS' | 'RAISE_PO'
  | 'VERIFY_SITE_READY' | 'TRACK_DELIVERY' | 'COLLECT_DELIVERY_PAYMENT' | 'INSTALLATION' | 'QC_INSPECTION' | 'REWORK'
  | 'HANDOVER' | 'COLLECT_FINAL_PAYMENT' | 'STATUTORY_LICENCE' | 'AMC_FOLLOW_UP' | 'REVIEW_HOLD' | 'EMERGENCY_RESPONSE'
  | 'SET_NEXT_TASK';

/** Who a rule assigns a task to. Resolved to a real assignee id by the order service. */
export type AssigneeKind = 'admin' | 'customer' | 'sales' | 'surveyor' | 'technician' | 'qc' | 'oncall';

/** Uploaded photo or file. `path` is the Storage key; `dataUrl` is used only in demo mode. */
export interface Evidence {
  path: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
  dataUrl?: string;
  name?: string;
}

interface Versioned {
  id: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
}

interface OrderScoped extends Versioned {
  orderId: string;
  customerId: string;
}

export interface MvpTask extends Versioned {
  /** Empty for a lead-level task (QUALIFY_LEAD). */
  orderId: string;
  customerId: string;
  leadId?: string;
  type: TaskType;
  title: string;
  stage: MvpStage;
  /** A user id, or a pool: `role:admin`, `role:qc`, `role:technician`, `role:surveyor`, `customer:<customerId>`. */
  assigneeId: string;
  assigneeRole: MvpRole;
  status: TaskStatus;
  previousStatus?: TaskStatus;
  /** 0 = the primary task of its rule row; the current task is chosen by (priority, dueDate). */
  priority: number;
  dueDate: string;
  completedAt?: string;
  notes?: string;
  evidence: Evidence[];
  createdBy: string;
  startedAt?: string;
  checkedInAt?: string;
  gateOverrides?: Record<string, { by: string; reason: string; at: string }>;
}

export interface MvpBlocker extends OrderScoped {
  taskId?: string;
  reason: BlockerReason;
  description: string;
  evidence: Evidence[];
  ownerUserId: string;
  status: 'OPEN' | 'RESOLVED';
  resolutionNote?: string;
  createdBy: string;
  createdByRole: MvpRole;
  dueDate: string;
  resolvedAt?: string;
}

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'SURVEY' | 'QUOTE' | 'WON' | 'LOST';

export interface MvpLead extends Versioned {
  /** Old 8-value canonical stage, kept in step with `mvpStatus` (D-04). */
  stage: 'captured' | 'assigned' | 'contacted' | 'survey_done' | 'quoted' | 'negotiating' | 'closed_won' | 'closed_lost';
  mvpStatus: LeadStatus;
  name: string;
  phone: string;
  location: string;
  source: string;
  siteType: string;
  floors: number;
  liftRequirement: string;
  constructionStage: string;
  notes: string;
  consent: boolean;
  sitePhotos: Evidence[];
  salesOwnerId: string;
  nextFollowup?: string;
  orderId?: string;
  lostReason?: string;
  createdBy: string;
}

export type SurveyResult = 'FEASIBLE' | 'REQUIRES_CORRECTION' | 'NOT_FEASIBLE';

export interface MvpSurvey extends OrderScoped {
  surveyorId: string;
  floors: number;
  stops: number;
  capacity: string;
  shaftWidthMm: number;
  shaftDepthMm: number;
  pitMm: number;
  headroomMm: number;
  power: string;
  access: string;
  siteReadiness: string;
  remarks: string;
  feasibility: string;
  result: SurveyResult;
  photos: Evidence[];
  submittedAt: string;
}

export interface QuoteLines {
  baseLift: number;
  installation: number;
  freight: number;
  other: number;
}

export type MvpQuoteStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'ACCEPTED' | 'REJECTED';

/** Customer-visible quote: prices only, never cost (I-5). */
export interface MvpQuote extends OrderScoped {
  lines: QuoteLines;
  totalExclTax: number;
  taxRatePct: number;
  taxRateConfirmed: boolean;
  taxAmount: number;
  sellingPrice: number;
  status: MvpQuoteStatus;
  approvalRequired: boolean;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  createdBy: string;
}

/** Admin/Owner-only cost record, stored apart from the quote (I-5, D-15). */
export interface MvpQuoteCost extends OrderScoped {
  quoteId: string;
  estimatedCost: number;
  markupPct: number;
  grossMarginPct: number;
}

export interface MvpMilestone extends OrderScoped {
  kind: MilestoneKind;
  label: string;
  amount: number;
  amountPaid: number;
  dueDate?: string;
  status: PaymentStatus;
  method?: string;
  reference?: string;
  proofNote?: string;
  submittedAt?: string;
  submittedBy?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
}

export interface MvpPurchaseOrder extends OrderScoped {
  supplierId: string;
  supplierName: string;
  amount: number;
  expectedDeliveryDate: string;
  materialStatus: 'ORDERED' | 'DISPATCHED' | 'DELAYED' | 'RECEIVED';
  delayNote?: string;
  createdBy: string;
}

export interface MvpSupplier extends Versioned {
  name: string;
  contact: string;
  phone: string;
  gstin?: string;
  status: 'active' | 'suspended';
}

export const INSTALL_CHECKLIST_ITEMS = [
  ['MATERIAL_RECEIVED', 'Material received'],
  ['SITE_CHECKED', 'Site checked'],
  ['RAILS', 'Rails installed'],
  ['BRACKETS', 'Brackets installed'],
  ['MACHINE', 'Machine installed'],
  ['CONTROLLER', 'Controller installed'],
  ['DOORS', 'Doors installed'],
  ['WIRING', 'Wiring completed'],
  ['SAFETY', 'Safety components installed'],
  ['TESTING', 'Testing completed'],
  ['CLEANED', 'Site cleaned'],
] as const;
export type ChecklistKey = typeof INSTALL_CHECKLIST_ITEMS[number][0];

export interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  done: boolean;
  photo?: Evidence;
  note?: string;
  completedBy?: string;
  completedAt?: string;
}

export interface MvpChecklist extends OrderScoped {
  items: ChecklistItem[];
}

export type QcDecision = 'PASS' | 'REWORK' | 'FAIL';

export interface MvpQcRecord extends OrderScoped {
  decision: QcDecision;
  testResults: string;
  remarks: string;
  inspectorId: string;
  evidence: Evidence[];
}

export interface MvpHandover extends OrderScoped {
  customerApprovedAt?: string;
  customerApprovedBy?: string;
  completedAt?: string;
  completedBy?: string;
  finalTest?: string;
  photos: Evidence[];
  overrides: { gate: string; reason: string; by: string; at: string }[];
}

export type MvpAmcStatus = 'WARRANTY' | 'AMC_DUE' | 'AMC_OFFERED' | 'AMC_ACTIVE' | 'AMC_LOST';

export interface MvpAmc extends OrderScoped {
  warrantyStart: string;
  warrantyEnd: string;
  /** Stored status; AMC_DUE is computed on read (D-26). */
  mvpAmcStatus: MvpAmcStatus;
  amcReminderDate: string;
  lastService?: string;
  nextService?: string;
  complaints: { at: string; text: string }[];
}

export const COMPLIANCE_TYPES = [
  ['LIFT_LICENCE', 'Lift licence'],
  ['STATUTORY_INSPECTION', 'Statutory inspection'],
  ['CONTRACTOR_RESPONSIBILITY', 'Contractor responsibility'],
  ['INSURANCE', 'Insurance'],
  ['GST_INVOICE', 'GST invoice'],
  ['TDS', 'TDS'],
  ['CUSTOMER_AGREEMENT', 'Customer agreement'],
  ['PARTNER_AGREEMENT', 'Partner agreement'],
] as const;
export type ComplianceType = typeof COMPLIANCE_TYPES[number][0];
export type ComplianceStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'NOT_APPLICABLE';

export interface MvpComplianceDoc extends OrderScoped {
  type: ComplianceType;
  status: ComplianceStatus;
  file?: Evidence;
  note?: string;
}

export interface MvpServiceCase extends OrderScoped {
  priority: 'P0' | 'P1';
  kind: 'EMERGENCY' | 'COMPLAINT';
  description: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  assigneeId: string;
  taskId: string;
  raisedBy: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  photo?: Evidence;
}

export interface MvpSettings {
  id: 'global';
  version?: number;
  onCall?: { date: string; technicianId: string };
  defaultAssignees?: Partial<Record<'qc' | 'technician' | 'surveyor', string>>;
  emergencyPhone?: string;
  gstRatePct?: number;
  surveyFeeInr?: number;
  updatedAt?: string;
}

export interface MvpInvite {
  id: string; // lower-case email
  email: string;
  role: MvpRole;
  name: string;
  customerId?: string;
  createdBy: string;
  createdAt: string;
  version?: number;
}

export interface MvpNotification {
  id: string;
  projectId?: string;
  audienceUserId: string;
  channel: 'in_app';
  templateId: string;
  status: 'delivered';
  idempotencyKey: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  version?: number;
}

/** A user as the MVP service sees it. */
export interface MvpActor {
  id: string;
  role: MvpRole;
  name?: string;
  customerId?: string;
  isDemo?: boolean;
  authMethod?: string;
}
