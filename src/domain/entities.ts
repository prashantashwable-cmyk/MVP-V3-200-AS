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
  | 'closed_lost';

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type CanonicalUserRole = 'admin' | 'surveyor' | 'technician' | 'customer' | 'supplier';

export interface CanonicalUser {
  id: UserId;
  role: CanonicalUserRole;
  name: string;
  email?: string;
  phone?: string;
  status: 'active' | 'pending' | 'inactive';
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
  };
}

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
  shipmentId: ShipmentId;
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
}

export type ServiceCaseStatus = 'open' | 'assigned' | 'resolved' | 'closed';

export interface ServiceCase {
  id: ServiceCaseId;
  projectId: ProjectId;
  status: ServiceCaseStatus;
  reportedBy: UserId;
  assignedTo?: UserId;
  createdAt: string;
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
