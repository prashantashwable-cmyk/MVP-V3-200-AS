/**
 * AIEC canonical domain model — Phase 02.
 *
 * This module defines the entities named in
 * docs/architecture/02-domain-model.md as plain TypeScript types. It is
 * additive: nothing in src/types.ts is removed or renamed, and no
 * existing screen is required to import from here yet. Phase 04
 * (repository layer) is where real persistence starts writing these
 * shapes; Phases 08/09 progressively move screens onto them.
 *
 * Where a legacy type in src/types.ts already covers part of an entity
 * (e.g. `Lead`, `Deal`, `Payment`, `PurchaseOrder`), the canonical type
 * here is the target shape and src/domain/adapters.ts provides
 * best-effort conversion functions rather than forcing an immediate
 * rewrite (pack principle: "introduce canonical types and adapters
 * rather than mass-breaking changes").
 */

import type {
  UserId,
  CustomerId,
  SiteId,
  LeadId,
  ProjectId,
  QuoteId,
  QuoteVersionId,
  ContractId,
  PaymentScheduleId,
  PaymentId,
  InvoiceId,
  SupplierId,
  PurchaseOrderId,
  ProductionOrderId,
  ShipmentId,
  DeliveryReceiptId,
  InstallationJobId,
  QCInspectionId,
  SnagId,
  HandoverId,
  WarrantyId,
  AMCId,
  ServiceCaseId,
  DocumentId,
  NotificationId,
  ApprovalRequestId,
  AuditEventId,
  WorkflowInstanceId,
  WorkflowExecutionId,
  TaskId,
  BlockerId,
  PaymentMilestoneId,
  SiteSurveyId,
} from './ids';

// ---------------------------------------------------------------------------
// Canonical lifecycle, shared across the project spine.
// ---------------------------------------------------------------------------

/**
 * The single canonical lifecycle stage for a Project, per RUN_ALL.md /
 * 02_DOMAIN_MODEL_AND_PROJECT_SPINE.md. Individual sub-entities (Quote,
 * Contract, InstallationJob, ...) carry their own, more granular status,
 * but every one of them is reachable from a `projectId` and every
 * project can always answer "what stage am I at" using this field.
 */
export type ProjectStage =
  | 'lead'
  | 'customer_site_confirmed'
  | 'quoting'
  | 'negotiation'
  | 'contract'
  | 'payment'
  | 'procurement'
  | 'production'
  | 'delivery'
  | 'installation'
  | 'qc'
  | 'handover'
  | 'warranty_amc'
  | 'service'
  | 'closed_lost'
  // MVP additions (D-03). Additive: existing values stay valid for old data.
  | 'survey'
  | 'site_ready';

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type CanonicalUserRole = 'admin' | 'surveyor' | 'technician' | 'customer' | 'supplier' | 'owner' | 'sales' | 'qc';

export interface CanonicalUser {
  id: UserId;
  role: CanonicalUserRole;
  name: string;
  email?: string;
  phone?: string;
  status: 'active' | 'pending' | 'inactive';
  /** MVP: set for customer users from their invite (D-13). */
  customerId?: CustomerId;
}

// ---------------------------------------------------------------------------
// Customer / Site — new first-class entities, previously embedded in Lead.
// ---------------------------------------------------------------------------

export interface Customer {
  id: CustomerId;
  name: string;
  phone: string;
  email?: string;
  companyName?: string;
  /** The lead this customer was created from, if any. Immutable once set. */
  sourceLeadId?: LeadId;
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  id: SiteId;
  customerId: CustomerId;
  address: string;
  latitude?: number;
  longitude?: number;
  buildingType?: 'residential' | 'commercial' | 'industrial' | 'institutional' | 'mixed-use';
  floors?: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Lead — kept as the pre-sale entry point; now points forward to Project.
// ---------------------------------------------------------------------------

export type CanonicalLeadStage =
  | 'captured'
  | 'assigned'
  | 'contacted'
  | 'survey_done'
  | 'quoted'
  | 'negotiating'
  | 'closed_won'
  | 'closed_lost';

export interface CanonicalLead {
  id: LeadId;
  stage: CanonicalLeadStage;
  surveyorId?: UserId;
  /** Set once the lead converts — the forward pointer that starts the spine. */
  projectId?: ProjectId;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Project — the operational spine. Every downstream record traces here.
// ---------------------------------------------------------------------------

export interface Project {
  id: ProjectId;
  /** Immutable once set — a project never silently changes owner customer. */
  customerId: CustomerId;
  siteId: SiteId;
  sourceLeadId?: LeadId;
  stage: ProjectStage;
  ownerUserId: UserId; // sales owner / account owner
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Denormalized, deliberate snapshot for list views — not a source of truth. */
  displaySummary?: {
    customerName: string;
    siteAddress: string;
    /** MVP: so the assigned technician can call the customer from the site. */
    customerPhone?: string;
  };
  // --- MVP additions (D-02, D-05, D-12; all optional so old documents stay valid) ---
  /** Human display code `AE-####`, generated once in a transaction, never changed. */
  displayCode?: string;
  /** Missing means ACTIVE (D-05). Independent of `stage`. */
  status?: OrderStatus;
  statusReason?: string;
  holdReviewDate?: string;
  /** uids + `customer:<customerId>`; recomputed by the MVP order service. Drives the rules. */
  participantIds?: string[];
  /** Installation checklist items done, 0–11 (D-10). */
  checklistDone?: number;
  qcPassedAt?: string;
  completedAt?: string;
  liftSummary?: string;
  sellingPrice?: number;
  /** QC inspector the Admin picked for this order (used by INSTALLATION_COMPLETED). */
  qcUserId?: string;
  /** D-14 soft-gate overrides by the Admin (reason required, audited). */
  gateOverrides?: Partial<Record<string, { by: string; at: string; reason: string }>>;
  version?: number;
  updatedBy?: string;
}

export type OrderStatus = 'ACTIVE' | 'ON_HOLD' | 'CANCELLED' | 'COMPLETED';

// ---------------------------------------------------------------------------
// Quote / QuoteVersion / Contract
// ---------------------------------------------------------------------------

export type QuoteStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'negotiating'
  | 'accepted'
  | 'rejected'
  | 'expired';

export interface Quote {
  id: QuoteId;
  projectId: ProjectId;
  status: QuoteStatus;
  currentVersionId?: QuoteVersionId;
  decisionNote?: string;
  decidedAt?: string;
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteVersion {
  id: QuoteVersionId;
  quoteId: QuoteId;
  projectId: ProjectId;
  versionNumber: number;
  /** Immutable once created — a new negotiation round creates a new version. */
  lineItems: { description: string; qty: number; unitPrice: number }[];
  totalAmount: number;
  marginPercent?: number;
  // MVP (spec §16): customer-visible price build-up. Cost lives only in `quote_costs`.
  lines?: { base: number; installation: number; freight: number; other: number };
  subtotalExclTax?: number;
  taxRatePct?: number;
  taxRateConfirmed?: boolean;
  taxAmount?: number;
  sellingPrice?: number;
  approvedBy?: UserId;
  approvedAt?: string;
  createdAt: string;
  createdBy: UserId;
}

export type ContractStatus = 'draft' | 'sent_for_signature' | 'signed' | 'void';

export interface Contract {
  id: ContractId;
  projectId: ProjectId;
  quoteVersionId: QuoteVersionId;
  status: ContractStatus;
  signedAt?: string;
  signedByCustomer?: boolean;
  documentId?: DocumentId;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Payment / PaymentSchedule / Invoice
// ---------------------------------------------------------------------------

export type PaymentScheduleStatus = 'active' | 'completed' | 'paused' | 'cancelled';

export interface PaymentSchedule {
  id: PaymentScheduleId;
  projectId: ProjectId;
  contractId: ContractId;
  status: PaymentScheduleStatus;
  installments: {
    label: string;
    percentOfTotal: number;
    amount: number;
    dueDate?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export type PaymentPath = 'direct' | 'loan_emi';
export type PaymentAttemptStatus = 'initiated' | 'confirmed' | 'failed' | 'refunded';

export interface Payment {
  id: PaymentId;
  projectId: ProjectId;
  paymentScheduleId: PaymentScheduleId;
  installmentLabel: string;
  amount: number;
  path: PaymentPath;
  status: PaymentAttemptStatus;
  /** Required for every side-effecting payment attempt — see Phase 06. */
  idempotencyKey: string;
  method?: 'UPI' | 'NEFT' | 'Cheque' | 'Cash' | 'Bank Transfer' | 'Gateway' | 'Loan Disbursal';
  referenceNo?: string;
  confirmedAt?: string;
  createdAt: string;
  createdBy: UserId;
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void';

export interface Invoice {
  id: InvoiceId;
  projectId: ProjectId;
  /** An invoice can be issued before or after payment — never assume order. */
  paymentId?: PaymentId;
  status: InvoiceStatus;
  amount: number;
  issuedAt?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Supplier / PurchaseOrder / ProductionOrder / Shipment / DeliveryReceipt
// ---------------------------------------------------------------------------

export interface Supplier {
  id: SupplierId;
  name: string;
  gstin?: string;
  status: 'active' | 'suspended';
  contactName?: string;
  phone?: string;
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent_to_supplier'
  | 'accepted_by_supplier'
  | 'in_production'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export interface PurchaseOrder {
  id: PurchaseOrderId;
  projectId: ProjectId;
  supplierId: SupplierId;
  status: PurchaseOrderStatus;
  amount: number;
  createdAt: string;
  createdBy: UserId;
  approvedBy?: UserId;
  approvedAt?: string;
  /** Required for PO creation idempotency — see Phase 06. */
  idempotencyKey: string;
  // MVP (spec §24)
  items?: string;
  expectedDeliveryDate?: string;
  materialStatus?: 'ORDERED' | 'DISPATCHED' | 'DELIVERED' | 'DELAYED';
  delayReason?: string;
  version?: number;
}

export type ProductionOrderStatus = 'queued' | 'in_progress' | 'qc_hold' | 'completed';

export interface ProductionOrder {
  id: ProductionOrderId;
  projectId: ProjectId;
  purchaseOrderId: PurchaseOrderId;
  status: ProductionOrderStatus;
  createdAt: string;
  updatedAt: string;
}

export type ShipmentStatus = 'scheduled' | 'dispatched' | 'in_transit' | 'arrived' | 'delayed';

export interface Shipment {
  id: ShipmentId;
  projectId: ProjectId;
  purchaseOrderId: PurchaseOrderId;
  status: ShipmentStatus;
  dispatchedAt?: string;
  arrivedAt?: string;
}

export type DeliveryReceiptStatus = 'ok' | 'damaged' | 'missing_items' | 'disputed';

export interface DeliveryReceipt {
  id: DeliveryReceiptId;
  projectId: ProjectId;
  /** Optional since the MVP: material can be received against a PO without a Shipment record. */
  shipmentId?: ShipmentId;
  note?: string;
  documentIds?: string[];
  status: DeliveryReceiptStatus;
  receivedBy: UserId;
  receivedAt: string;
  incidentId?: string;
}

// ---------------------------------------------------------------------------
// InstallationJob / QCInspection / Snag / Handover / Warranty / AMC / Service
// ---------------------------------------------------------------------------

export type InstallationJobStatus =
  | 'assigned'
  | 'site_readiness_pending'
  | 'checked_in'
  | 'in_progress'
  | 'evidence_pending'
  | 'completed'
  | 'qc_requested';

export interface InstallationJob {
  id: InstallationJobId;
  projectId: ProjectId;
  technicianId: UserId;
  status: InstallationJobStatus;
  siteReadinessConfirmed?: boolean;
  checkedInAt?: string;
  completedAt?: string;
  // MVP (spec §18)
  startedAt?: string;
  checklist?: Record<string, { done: boolean; by?: string; at?: string; note?: string; documentId?: string }>;
  checkInLocation?: { lat: number; lng: number; accuracyM?: number };
  version?: number;
}

export type QCResult = 'pending' | 'pass' | 'fail';

export interface QCInspection {
  id: QCInspectionId;
  projectId: ProjectId;
  installationJobId: InstallationJobId;
  inspectorId: UserId;
  result: QCResult;
  discipline?: 'mechanical' | 'electrical' | 'safety' | 'general';
  inspectedAt?: string;
  // MVP (spec §19)
  decision?: 'PASS' | 'REWORK' | 'FAIL';
  tests?: Record<string, boolean>;
  remarks?: string;
  documentIds?: string[];
}

export type SnagStatus = 'open' | 'assigned' | 'reworked' | 'reinspection_pending' | 'closed';

export interface Snag {
  id: SnagId;
  projectId: ProjectId;
  qcInspectionId: QCInspectionId;
  status: SnagStatus;
  description: string;
  assignedTo?: UserId;
  reworkCount: number;
}

export type HandoverStatus =
  | 'blocked_qc_not_passed'
  | 'compliance_pending'
  | 'checklist_pending'
  | 'walkthrough_pending'
  | 'customer_accepted'
  | 'certificate_issued';

export interface Handover {
  id: HandoverId;
  projectId: ProjectId;
  /** Handover MUST NOT reach customer_accepted/certificate_issued unless this is true. */
  qcPassed: boolean;
  status: HandoverStatus;
  customerAcceptedAt?: string;
  certificateDocumentId?: DocumentId;
  // MVP (spec §20)
  customerConfirmedBy?: string;
  customerConfirmedName?: string;
  customerConfirmedDevice?: string;
  completedAt?: string;
  completedBy?: string;
  finalTestConfirmed?: boolean;
  documentIds?: string[];
  overrides?: { gate: string; reason: string; by: string; at: string }[];
  version?: number;
}

export interface Warranty {
  id: WarrantyId;
  projectId: ProjectId;
  handoverId: HandoverId;
  startDate: string;
  endDate: string;
}

export type AMCStatus = 'active' | 'expired' | 'cancelled';

export interface AMC {
  id: AMCId;
  projectId: ProjectId;
  status: AMCStatus;
  startDate: string;
  endDate: string;
  // MVP (D-26). AMC_DUE is computed from warrantyEnd, never stored.
  mvpAmcStatus?: 'WARRANTY' | 'AMC_OFFERED' | 'AMC_ACTIVE' | 'AMC_LOST';
  warrantyEnd?: string;
  reminderDate?: string;
  lastServiceDate?: string;
  nextServiceDate?: string;
  version?: number;
}

export type ServiceCaseStatus = 'open' | 'assigned' | 'resolved' | 'closed';

export interface ServiceCase {
  id: ServiceCaseId;
  projectId: ProjectId;
  status: ServiceCaseStatus;
  reportedBy: UserId;
  assignedTo?: UserId;
  createdAt: string;
  // MVP (D-28 emergency; complaints)
  kind?: 'EMERGENCY' | 'COMPLAINT';
  priority?: 'P0' | 'P1' | 'P2';
  description?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  documentIds?: string[];
  version?: number;
}

// ---------------------------------------------------------------------------
// Document / Notification / ApprovalRequest / AuditEvent / Workflow*
// ---------------------------------------------------------------------------

export interface DocumentRecord {
  id: DocumentId;
  projectId?: ProjectId;
  ownerEntityType: string;
  ownerEntityId: string;
  storagePath: string; // object storage key — see Phase 11
  contentType: string;
  sizeBytes: number;
  uploadedBy: UserId;
  uploadedAt: string;
  version: number;
  // MVP (D-16 as changed in Step 02): evidence bytes stored inline, ≤ 900 KB.
  dataUrl?: string;
  caption?: string;
  taskId?: string;
  kind?: 'photo' | 'document';
}

export type NotificationChannel = 'email' | 'whatsapp' | 'sms' | 'in_app';
export type NotificationStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface NotificationRecord {
  id: NotificationId;
  projectId?: ProjectId;
  audienceUserId: UserId;
  channel: NotificationChannel;
  templateId: string;
  status: NotificationStatus;
  idempotencyKey: string;
  createdAt: string;
  /** MVP: set by the audience when opened in the bell. */
  readAt?: string;
}

export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: ApprovalRequestId;
  projectId?: ProjectId;
  entityType: string;
  entityId: string;
  requestedBy: UserId;
  requiredPermission: string; // see src/domain/permissions.ts (Phase 05)
  status: ApprovalRequestStatus;
  decidedBy?: UserId;
  decidedAt?: string;
  reason?: string;
  createdAt: string;
}

export interface AuditEvent {
  id: AuditEventId;
  actorId: UserId | 'system';
  actorRole: CanonicalUserRole | 'system';
  action: string;
  entityType: string;
  entityId: string;
  projectId?: ProjectId;
  before?: unknown;
  after?: unknown;
  timestamp: string;
  reason?: string;
  source: 'ui' | 'api' | 'automation' | 'webhook';
  correlationId: string;
}

export type WorkflowInstanceStatus = 'running' | 'waiting_approval' | 'completed' | 'failed' | 'compensated';

export interface WorkflowInstance {
  id: WorkflowInstanceId;
  workflowKey: string; // see src/workflows (Phase 03/07)
  projectId?: ProjectId;
  status: WorkflowInstanceStatus;
  startedAt: string;
  completedAt?: string;
}

export type WorkflowExecutionStatus = 'succeeded' | 'failed' | 'retrying' | 'dead_letter';

export interface WorkflowExecution {
  id: WorkflowExecutionId;
  workflowInstanceId: WorkflowInstanceId;
  stepKey: string;
  status: WorkflowExecutionStatus;
  attempt: number;
  error?: string;
  idempotencyKey: string;
  executedAt: string;
}

// ---------------------------------------------------------------------------
// ReconciliationRecord — Phase 11. "Our record <-> External record."
// ---------------------------------------------------------------------------

export type ReconciliationStatus =
  | 'matched'
  | 'mismatch'
  | 'missing_external'
  | 'missing_internal'
  | 'duplicate'
  | 'pending'
  | 'manual_resolution';

export interface ReconciliationRecord {
  id: string;
  /** e.g. 'payment' — reusable across domains per Phase 11's "start with
   * payments and expand." */
  domain: string;
  internalRecordId?: string;
  externalRecordId?: string;
  status: ReconciliationStatus;
  internalAmount?: number;
  externalAmount?: number;
  reconciledAt: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

// ---------------------------------------------------------------------------
// MVP (Phase 1) entities — docs/mvp/MVP_REFACTOR_PLAN.md §2. Additive.
// ---------------------------------------------------------------------------

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';

export type TaskType =
  | 'QUALIFY_LEAD' | 'ASSIGN_SURVEYOR' | 'COLLECT_SURVEY_FEE' | 'SURVEY' | 'SITE_CORRECTION'
  | 'REVIEW_NOT_FEASIBLE' | 'PREPARE_QUOTE' | 'APPROVE_MARGIN' | 'QUOTE_DECISION'
  | 'COLLECT_BOOKING_TOKEN' | 'SITE_READINESS' | 'RAISE_PO' | 'VERIFY_SITE_READY'
  | 'TRACK_DELIVERY' | 'COLLECT_DELIVERY_PAYMENT' | 'INSTALLATION' | 'QC_INSPECTION'
  | 'REWORK' | 'HANDOVER' | 'COLLECT_FINAL_PAYMENT' | 'STATUTORY_LICENCE'
  | 'AMC_FOLLOW_UP' | 'REVIEW_HOLD' | 'EMERGENCY_RESPONSE' | 'REVIEW_ORDER';

export type MvpStage =
  | 'LEAD' | 'QUALIFIED' | 'SURVEY' | 'QUOTE' | 'BOOKED'
  | 'SITE_READY' | 'DELIVERY' | 'INSTALLATION' | 'QC_HANDOVER' | 'AMC';

/** D-06. `assigneeId` is a uid, `customer:<customerId>` or `role:<role>` (e.g. `role:admin`). */
export interface Task {
  id: TaskId;
  /** Set for order tasks. Lead-stage tasks (QUALIFY_LEAD) carry `leadId` instead. */
  orderId?: ProjectId;
  leadId?: LeadId;
  type: TaskType;
  title: string;
  stage: MvpStage;
  assigneeId: string;
  assigneeRole: CanonicalUserRole;
  status: TaskStatus;
  /** True for the task that represents "the next action" of the event that created it. */
  primary?: boolean;
  dueDate: string;
  completedAt?: string;
  notes?: string;
  evidenceIds?: string[];
  /** Status to return to when a blocker is resolved (D-07). */
  previousStatus?: TaskStatus;
  /** Small structured result the assignee records (e.g. the customer's site-readiness checklist). */
  data?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type BlockerReason =
  | 'CUSTOMER_NOT_READY' | 'MATERIAL_MISSING' | 'POWER_UNAVAILABLE' | 'SITE_UNSAFE'
  | 'WRONG_MEASUREMENT' | 'PAYMENT_PENDING' | 'SUPPLIER_DELAY' | 'OTHER';

/** D-07. */
export interface Blocker {
  id: BlockerId;
  orderId: ProjectId;
  taskId?: TaskId;
  reason: BlockerReason;
  description: string;
  evidence: string[];
  ownerUserId: string;
  status: 'OPEN' | 'RESOLVED';
  dueDate: string;
  resolutionNote?: string;
  createdAt: string;
  createdBy: string;
  resolvedAt?: string;
  resolvedBy?: string;
  version: number;
}

export type MilestoneKind = 'SURVEY_FEE' | 'BOOKING_TOKEN' | 'DELIVERY' | 'FINAL';
export type MvpPaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'FAILED' | 'REFUNDED';

/** D-14 / spec §17. */
export interface PaymentMilestone {
  id: PaymentMilestoneId;
  orderId: ProjectId;
  kind: MilestoneKind;
  label: string;
  amount: number;
  dueDate?: string;
  status: MvpPaymentStatus;
  amountReceived: number;
  method?: string;
  reference?: string;
  notes?: string;
  proof?: { reference: string; documentId?: string; submittedAt: string; submittedBy: string };
  verifiedBy?: string;
  verifiedAt?: string;
  rejectedReason?: string;
  waived?: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type SurveyResult = 'FEASIBLE' | 'REQUIRES_CORRECTION' | 'NOT_FEASIBLE';

/** Spec §15. Measurements in millimetres. */
export interface SiteSurvey {
  id: SiteSurveyId;
  orderId: ProjectId;
  surveyorId: string;
  floors: number;
  stops: number;
  capacityPersons: number;
  shaftWidthMm: number;
  shaftDepthMm: number;
  pitMm: number;
  headroomMm: number;
  power: string;
  access: string;
  siteReadiness: string;
  remarks: string;
  photoIds: string[];
  result: SurveyResult;
  submittedAt: string;
}

/** D-15. Admin/owner only — id is the QuoteVersion id. Never shown to other roles (I-5). */
export interface QuoteCost {
  id: string;
  orderId: ProjectId;
  quoteId: QuoteId;
  estimatedCost: number;
  markupPct: number;
  grossMarginPct: number;
  belowMinimum: boolean;
  approvalRequestId?: ApprovalRequestId;
  createdAt: string;
}

export type ComplianceType =
  | 'LIFT_LICENSE' | 'STATUTORY_INSPECTION' | 'CONTRACTOR_RESPONSIBILITY' | 'INSURANCE'
  | 'GST_INVOICE' | 'TDS' | 'CUSTOMER_AGREEMENT' | 'PARTNER_AGREEMENT';

/** D-27 ⚖ VERIFY — the software records compliance, it does not guarantee it. */
export interface ComplianceItem {
  id: string;
  orderId: ProjectId;
  type: ComplianceType;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'NOT_APPLICABLE';
  documentId?: string;
  note?: string;
  updatedBy: string;
  updatedAt: string;
  version: number;
}

/** D-13 as changed in Step 02: the Admin's invite list. id = lower-case email. */
export interface Invite {
  id: string;
  email: string;
  role: CanonicalUserRole;
  name: string;
  customerId?: CustomerId;
  createdBy: string;
  createdAt: string;
}

