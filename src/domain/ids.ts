/**
 * Branded ID types for the AIEC canonical domain model (Phase 02).
 *
 * Plain `string` IDs are easy to pass in the wrong order (e.g. a
 * `projectId` where a `customerId` is expected) with no compiler help.
 * Branding costs nothing at runtime (IDs are still plain strings on the
 * wire/in Firestore) but gives the type checker a way to catch
 * cross-entity ID mixups across the repository/service/UI boundary that
 * Phase 04 introduces.
 *
 * Usage:
 *   const id: CustomerId = asId<CustomerId>('cust_123');
 */

declare const brand: unique symbol;

export type Id<Kind extends string> = string & { readonly [brand]: Kind };

export function asId<T extends Id<string>>(value: string): T {
  return value as T;
}

export type UserId = Id<'User'>;
export type CustomerId = Id<'Customer'>;
export type SiteId = Id<'Site'>;
export type LeadId = Id<'Lead'>;
export type ProjectId = Id<'Project'>;
export type QuoteId = Id<'Quote'>;
export type QuoteVersionId = Id<'QuoteVersion'>;
export type ContractId = Id<'Contract'>;
export type PaymentScheduleId = Id<'PaymentSchedule'>;
export type PaymentId = Id<'Payment'>;
export type InvoiceId = Id<'Invoice'>;
export type SupplierId = Id<'Supplier'>;
export type PurchaseOrderId = Id<'PurchaseOrder'>;
export type ProductionOrderId = Id<'ProductionOrder'>;
export type ShipmentId = Id<'Shipment'>;
export type DeliveryReceiptId = Id<'DeliveryReceipt'>;
export type InstallationJobId = Id<'InstallationJob'>;
export type QCInspectionId = Id<'QCInspection'>;
export type SnagId = Id<'Snag'>;
export type HandoverId = Id<'Handover'>;
export type WarrantyId = Id<'Warranty'>;
export type AMCId = Id<'AMC'>;
export type ServiceCaseId = Id<'ServiceCase'>;
export type DocumentId = Id<'Document'>;
export type NotificationId = Id<'Notification'>;
export type ApprovalRequestId = Id<'ApprovalRequest'>;
export type AuditEventId = Id<'AuditEvent'>;
export type WorkflowInstanceId = Id<'WorkflowInstance'>;
export type WorkflowExecutionId = Id<'WorkflowExecution'>;
// MVP (Phase 1) additions — additive, see docs/mvp/MVP_REFACTOR_PLAN.md §2.
export type TaskId = Id<'Task'>;
export type BlockerId = Id<'Blocker'>;
export type PaymentMilestoneId = Id<'PaymentMilestone'>;
export type SiteSurveyId = Id<'SiteSurvey'>;

/** Every canonical entity that is meaningfully project-scoped carries this. */
export interface ProjectScoped {
  projectId: ProjectId;
}

/** Standard versioning/audit fields — see Phase 06 for enforcement. */
export interface Versioned {
  version: number;
  updatedAt: string; // ISO 8601
  updatedBy: UserId | string;
}
