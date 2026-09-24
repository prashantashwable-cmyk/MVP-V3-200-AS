export type UserRole = 'admin' | 'surveyor' | 'technician' | 'customer' | 'supplier' | 'owner' | 'sales' | 'qc'; // owner/sales/qc: MVP additions (D-12)
export interface InternalNotificationTemplate {
  id: string;
  notificationTypeId: string;
  title: string;
  category: 'sos_alert' | 'payout_failure' | 'delivery_delay' | 'new_lead' | 'site_issue' | 'compliance_breach';
  urgencyTag: 'critical' | 'high' | 'normal' | 'low';
  recipientRoles: UserRole[];
  channels: {
    inAppPush: boolean;
    sms: boolean;
    email: boolean;
    whatsapp: boolean;
  };
  templateContent: string;
  monthlyTriggerCount: number;
  isActive: boolean;
  lastUpdated: string;
}

export interface EscalationTierStep {
  tierLevel: number;
  roleOrContactName: string;
  phoneEmail: string;
  channels: ('sms' | 'call' | 'whatsapp' | 'in_app' | 'email')[];
  delayMinsAfterPrevious: number;
}

export interface EscalationChainConfig {
  id: string;
  scenarioKey: 'sos_unacknowledged' | 'critical_exception' | 'payout_dispute' | 'site_delay_breach' | 'supplier_delivery_halt';
  scenarioName: string;
  description: string;
  initialTriggerDelayMins: number;
  tiers: EscalationTierStep[];
  backupContact: {
    name: string;
    roleTitle: string;
    phone: string;
    email: string;
    isSecondaryFallbackActive: boolean;
  };
  lastDrillTestDate: string;
  lastDrillStatus: 'passed' | 'failed_gap_detected' | 'not_tested';
}

export interface SlaProcessItem {
  id: string;
  slaCategory: 'customer_reply' | 'payment_dispute' | 'payout_dispute' | 'delivery_delay' | 'technician_checkin';
  processName: string;
  relatedRecordId: string;
  targetDurationHours: number;
  currentElapsedHours: number;
  breachStatus: 'on_track' | 'warning' | 'breached';
  isPausedFairly: boolean;
  pauseReason?: string;
  responsibleRole: string;
  lastUpdated: string;
}

export interface SlaCategoryTrend {
  categoryKey: string;
  categoryName: string;
  complianceRatePercent: number;
  trendDirection: 'improving' | 'declining' | 'stable';
  avgResolutionTimeHours: number;
  totalActiveTracked: number;
  totalBreaches30Days: number;
}
export type UserStatus = 'active' | 'pending' | 'inactive';

/**
 * How this session's identity was established. Added Phase 05.
 * 'firebase_auth' (Google Sign-In) is the only path currently backed by a
 * real, server-verifiable credential (a genuine Firebase Auth ID token).
 * 'otp_unverified' and 'password_unverified' record sessions created by
 * this app's client-side-only OTP/email login flows (see src/App.tsx
 * handleEmailSubmit/triggerInstantVerification) — these never call
 * Firebase Auth at all, so Firestore already treats them as
 * unauthenticated (request.auth is null); this field lets in-app
 * permission checks (src/lib/authz.ts) also treat them as unverified for
 * high-risk actions, without breaking their normal day-to-day use of the
 * app. See docs/architecture/05-authorization.md.
 */
export type AuthMethod = 'firebase_auth' | 'otp_unverified' | 'password_unverified' | 'demo';

export interface User {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  authMethod?: AuthMethod;
  status: UserStatus;
  avatarUrl?: string;
  region?: string;
  isDemo?: boolean;
  onboardingCompleted?: boolean;
  aadhaarOrPanDoc?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankVerifiedStatus?: 'verified' | 'failed' | 'pending';
  preferredZones?: string[];
  twoWheelerOwned?: boolean;
  email?: string;
  // Technician properties
  skillTags?: string[];
  certificateDocs?: string[];
  liabilityInsuranceDoc?: string;
  insuranceExpiryDate?: string;
  sopAcknowledgedFlag?: boolean;
  insuranceStatus?: 'active' | 'warning' | 'expired';
  // Supplier properties
  gstin?: string;
  companyName?: string;
  authorizedSignatoryName?: string;
  catalogSeedFile?: string;
  catalogSeedItems?: { name: string; price: number; sku: string }[];
  paymentTermsAcceptedFlag?: boolean;
  // Customer properties
  /** MVP: the Customer record this user is linked to by their invite (D-13). */
  customerId?: string;
  siteAddress?: string;
  communicationConsentFlags?: { sms: boolean; whatsapp: boolean; email: boolean };
  loginPreference?: 'password' | 'otp';
  passwordHash?: string;
  location_permission_status?: 'granted' | 'denied' | 'prompt' | 'unsupported';
  camera_permission_status?: 'granted' | 'denied' | 'prompt' | 'unsupported';
  notification_permission_status?: 'granted' | 'denied' | 'prompt' | 'unsupported';
  primer_shown_flag?: boolean;
  primer_shown_timestamp?: string;
  preferred_language?: 'en' | 'hi' | 'mr';
  theme_preference?: 'light' | 'snow' | 'dark' | 'system';
}

export type LeadStage = 'captured' | 'assigned' | 'contacted' | 'survey_done' | 'quoted' | 'negotiating' | 'closed_won' | 'closed_lost';

export interface ContactInfo {
  name: string;
  phone: string;
  email: string;
  role?: 'owner' | 'contractor' | 'architect' | 'facility_manager' | '';
  companyName?: string;
  consentGiven?: boolean;
  noDirectContact?: boolean;
  relationshipNote?: string;
}

export interface BuildingInfo {
  address: string;
  floors: number;
  type: 'residential' | 'commercial' | 'industrial' | 'institutional' | 'mixed-use';
  driveType?: 'traction' | 'hydraulic' | 'machine-room-less';
  capacityPersons?: number;
  latitude?: number;
  longitude?: number;
  floor_count?: number;
  usage_type?: 'residential' | 'commercial' | 'institutional' | 'mixed-use';
  construction_stage?: 'foundation' | 'structure-up' | 'finishing' | 'ready';
  shaft_dimensions_estimate?: string;
  is_shaft_inaccessible?: boolean;
  is_mixed_use?: boolean;
  mixed_category_detail?: string;
  is_unusually_tall?: boolean;
  special_notes?: string;
  passenger_capacity_estimate?: number;
  shaft_sketch_data_url?: string;
}

export interface Lead {
  id: string;
  stage: LeadStage;
  surveyorId?: string;
  contactInfo: ContactInfo;
  buildingInfo: BuildingInfo;
  createdAt: string;
  updatedAt: string;
  commissionEarned?: number;
  gps_lat_lng?: string;
  gps_accuracy_meters?: number;
  site_photos?: { prompt: string; dataUrl: string; timestamp: string; geotag: string; isLive: boolean }[];
  capture_timestamp?: string;
  nearest_landmark_note?: string;
  is_duplicate_flagged?: boolean;
  duplicate_of_lead_id?: string;
  duplicate_distance_meters?: number;
  surveyor_duplicate_decision?: 'cancel' | 'override_proceed';
  surveyor_duplicate_reason?: string;
  loss_reason?: 'Price' | 'Timeline' | 'Chose Competitor' | 'Site Not Ready' | 'Unresponsive' | 'Not a Fit';
  loss_note?: string;
  revisit_reminder_date?: string;
  marked_lost_by?: string;
  lostAt?: string;
}

export type DealStatus = 'pending' | 'closed' | 'cancelled';

export interface Deal {
  id: string;
  leadId: string;
  customerName?: string;
  customerPhone?: string;
  siteLocation?: string;
  status: DealStatus;
  agreedPrice: number;
  advancePaid: boolean;
  specs: {
    floors: number;
    driveType: string;
    capacity: string;
    cabinStyle: string;
  };
  createdAt: string;
}

export interface InternalNotificationTemplate {
  id: string;
  notificationTypeId: string;
  title: string;
  category: 'sos_alert' | 'payout_failure' | 'delivery_delay' | 'new_lead' | 'site_issue' | 'compliance_breach';
  urgencyTag: 'critical' | 'high' | 'normal' | 'low';
  recipientRoles: UserRole[];
  channels: {
    inAppPush: boolean;
    sms: boolean;
    email: boolean;
    whatsapp: boolean;
  };
  templateContent: string;
  monthlyTriggerCount: number;
  isActive: boolean;
  lastUpdated: string;
}

export interface EscalationTierStep {
  tierLevel: number;
  roleOrContactName: string;
  phoneEmail: string;
  channels: ('sms' | 'call' | 'whatsapp' | 'in_app' | 'email')[];
  delayMinsAfterPrevious: number;
}

export interface EscalationChainConfig {
  id: string;
  scenarioKey: 'sos_unacknowledged' | 'critical_exception' | 'payout_dispute' | 'site_delay_breach' | 'supplier_delivery_halt';
  scenarioName: string;
  description: string;
  initialTriggerDelayMins: number;
  tiers: EscalationTierStep[];
  backupContact: {
    name: string;
    roleTitle: string;
    phone: string;
    email: string;
    isSecondaryFallbackActive: boolean;
  };
  lastDrillTestDate: string;
  lastDrillStatus: 'passed' | 'failed_gap_detected' | 'not_tested';
}

export interface SlaProcessItem {
  id: string;
  slaCategory: 'customer_reply' | 'payment_dispute' | 'payout_dispute' | 'delivery_delay' | 'technician_checkin';
  processName: string;
  relatedRecordId: string;
  targetDurationHours: number;
  currentElapsedHours: number;
  breachStatus: 'on_track' | 'warning' | 'breached';
  isPausedFairly: boolean;
  pauseReason?: string;
  responsibleRole: string;
  lastUpdated: string;
}

export interface SlaCategoryTrend {
  categoryKey: string;
  categoryName: string;
  complianceRatePercent: number;
  trendDirection: 'improving' | 'declining' | 'stable';
  avgResolutionTimeHours: number;
  totalActiveTracked: number;
  totalBreaches30Days: number;
}

export type JobStatus = 'pending' | 'in_progress' | 'qc_pending' | 'completed';

export interface SopStep {
  id: string;
  label: string;
  completed: boolean;
  photoUrl?: string;
  verifiedAt?: string;
}

export interface Job {
  id: string;
  dealId: string;
  technicianId?: string;
  status: JobStatus;
  sopSteps: SopStep[];
  startedAt?: string;
  completedAt?: string;
}

export type PaymentStage = 'Advance (30%)' | 'Material Delivery (40%)' | 'Installation Start (20%)' | 'Handover & QC (10%)' | string;
export type PaymentStatus = 'unpaid' | 'paid' | 'pending' | 'overdue' | 'disputed' | 'partial';

export interface Payment {
  id: string;
  dealId: string;
  stage: PaymentStage;
  amount: number;
  paidAmount?: number;
  status: PaymentStatus;
  dueDate: string;
  paidAt?: string;
  daysOverdue?: number;
  paymentMethod?: 'UPI' | 'NEFT' | 'Cheque' | 'Cash' | 'Bank Transfer' | 'Gateway';
  referenceNo?: string;
  isDisputed?: boolean;
  disputeReason?: string;
  disputeLoggedAt?: string;
  isPaused?: boolean;
  pauseReason?: string;
  pausedAt?: string;
  salesOwner?: string;
  customerName?: string;
  siteName?: string;
  isHighValue?: boolean;
}

export interface ReminderRule {
  id: string;
  daysOffset: number; // e.g. -3 (3 days before due), 0 (on due date), 3 (3 days overdue), 7 (7 days overdue), 15 (15 days overdue)
  title: string;
  channel: 'SMS' | 'WhatsApp' | 'Email' | 'Call Task';
  tone: 'Friendly Nudge' | 'Standard Invoice' | 'Firm Notice' | 'Legal Escalation';
  templateId: string;
  templateBody: string;
  isActive: boolean;
  escalationTier: 1 | 2 | 3 | 4;
}

export type LoanApplicationStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Pre-Approved' | 'Approved' | 'Disbursed' | 'Rejected' | 'Cancelled';

export interface LoanApplication {
  id: string;
  dealId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  requestedAmount: number;
  tenureMonths: number;
  partnerId: string;
  partnerName: string;
  interestRateAnnual: number;
  monthlyEmiAmount: number;
  totalRepaymentAmount: number;
  monthlyIncomeRange: string;
  status: LoanApplicationStatus;
  disbursementAmountReceived?: number;
  disbursementDate?: string;
  disbursementTxnRef?: string;
  shortfallAmount?: number;
  partnerStatusNote?: string;
  isDisbursementDelayed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoanPartner {
  id: string;
  name: string;
  code: string;
  logoUrl?: string;
  interestRate: number;
  maxTenureMonths: number;
  minTenureMonths: number;
  approvalRatePercentage: number;
  avgDisbursementDays: number;
  escalationContactName: string;
  escalationContactPhone: string;
  escalationContactEmail: string;
}

export interface Invoice {
  id: string;
  dealId: string;
  paymentId?: string;
  customerName: string;
  customerGstin?: string;
  type: 'Stage Invoice' | 'Consolidated Final Invoice' | 'Credit Note' | 'Superseding Invoice';
  stageName?: string;
  taxableValue: number;
  gstRate: number; // e.g. 18
  gstAmount: number;
  totalAmount: number;
  issuedAt: string;
  isVoided?: boolean;
  supersededByInvoiceId?: string;
  originalInvoiceId?: string;
}

export interface EscalationItem {
  id: string;
  dealId: string;
  paymentId: string;
  customerName: string;
  customerPhone: string;
  overdueAmount: number;
  overdueDays: number;
  escalationTier: 'Tier 1: Gentle Call Needed' | 'Tier 2: Formal Notice' | 'Tier 3: Consider Installation Hold' | 'Tier 4: Legal / Exec Escalation';
  status: 'Pending Action' | 'Call Logged' | 'Formal Notice Sent' | 'Installation Paused' | 'Resolved';
  callOutcome?: string;
  installationPaused?: boolean;
  customerPromiseDate?: string;
  lastActionAt?: string;
  createdAt: string;
}

export interface DisputeItem {
  id: string;
  paymentId: string;
  dealId: string;
  customerName: string;
  customerPhone: string;
  originalTransactionId: string;
  disputeAmount: number;
  disputeReason: string;
  supportingEvidence?: string;
  status: 'Open' | 'Under Investigation' | 'Full Refund Approved' | 'Partial Refund Approved' | 'Rejected';
  resolutionType?: 'Full Refund' | 'Partial Refund' | 'Rejected';
  resolutionAmount?: number;
  resolutionExplanation?: string;
  isLoanFinanced?: boolean;
  partnerName?: string;
  creditNoteId?: string;
  raisedAt: string;
  resolvedAt?: string;
}

export interface PriceHistoryEntry {
  timestamp: string;
  oldPrice: number;
  newPrice: number;
  changedBy: string;
  status: 'Approved' | 'Pending Admin Review';
  reason?: string;
}

export interface SupplierCatalogItem {
  itemId: string;
  itemName: string;
  price: number;
  pendingPrice?: number;
  pendingPriceReason?: string;
  category?: string;
  leadTimeDays?: number;
  specification?: string;
  isDiscontinued?: boolean;
  isCustom?: boolean;
  priceHistory?: PriceHistoryEntry[];
  lastUpdated?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  status: 'active' | 'inactive' | 'suspended';
  kycStatus: 'Verified' | 'Pending' | 'Rejected' | 'Suspended';
  specialtyCategories: string[];
  regionServed: string;
  performanceScore: number; // e.g. 94 (out of 100) or 4.7
  suspensionReason?: string;
  onboardingProgress?: number; // 1-4 Ascension Line steps
  activeOrdersCount?: number;
  completedOrdersCount?: number;
  mergedIntoSupplierId?: string;
  catalog: SupplierCatalogItem[];
  createdAt?: string;
}

export interface POLineItem {
  itemId: string;
  itemName: string;
  category?: string;
  quantity: number;
  catalogPrice: number; // Current supplier catalog price
  agreedUnitPrice: number; // Unit price on PO
  quotedUnitPrice?: number; // Baseline locked at deal quotation time
  totalPrice: number;
  priceDiscrepancyFlag?: boolean; // Flagged if higher than quoted/catalog tolerance
  itemStatus?: 'In Production' | 'Ready to Ship' | 'Shipped' | 'Delivered';
}

export interface POStatusHistoryEntry {
  status: 'Draft' | 'Sent' | 'Acknowledged' | 'In Production' | 'Ready to Ship' | 'Shipped' | 'Delivered' | 'Cancelled';
  timestamp: string;
  updatedBy: string;
  note?: string;
}

export interface PurchaseOrder {
  id: string;
  linkedDealId: string;
  customerName: string;
  siteLocation: string;
  supplierId: string;
  supplierName: string;
  lineItems: POLineItem[];
  subtotalAmount: number;
  gstRate: number; // e.g. 18
  gstAmount: number;
  totalAmount: number;
  expectedDeliveryDate: string;
  status: 'Draft' | 'Sent' | 'Acknowledged' | 'In Production' | 'Ready to Ship' | 'Shipped' | 'Delivered' | 'Cancelled';
  approvalRequired?: boolean;
  approvalReason?: string;
  hasPriceDiscrepancy?: boolean;
  discrepancyNote?: string;
  createdFromDealClosureAt?: string;
  sentAt?: string;
  notes?: string;
  communicationThreadRef?: string;
  splitPoGroupRef?: string; // Group ID if deal was split into multiple supplier POs
  delayRiskFlag?: boolean;
  delayRiskReason?: string;
  actualStatusUpdateTimestamp?: string;
  statusHistory?: POStatusHistoryEntry[];
}

export interface AutoPoTriggerRule {
  id: string;
  ruleName: string;
  triggerCondition: 'immediately_on_countersignature' | 'after_advance_payment_clears' | 'after_site_readiness_approved';
  weights: {
    priceWeight: number; // 0-100%
    deliverySpeedWeight: number; // 0-100%
    performanceScoreWeight: number; // 0-100%
    regionProximityWeight: number; // 0-100%
  };
  approvalThresholdAmount: number; // e.g. 500000
  requireApprovalIfDiscrepancy: boolean;
  ruleActiveFlag: boolean;
  updatedAt: string;
  updatedBy: string;
  lastSimulatedResult?: {
    simulatedAt: string;
    sampleConfig: string;
    selectedSupplierId: string;
    selectedSupplierName: string;
    calculatedScore: number;
    runnerUpSupplierName?: string;
    concentrationWarning?: string;
  };
}

export interface Territory {
  id: string;
  name: string;
  polygonCoordinates: { lat: number; lng: number }[];
  assignedSurveyorIds: string[];
  monthlyLeadTarget: number;
  monthlyLeadsCaptured?: number;
  conversionRate?: number;
  color?: string;
}

export interface SiteVisit {
  id: string;
  leadId: string;
  leadName: string;
  claimedAddress: string;
  surveyorId: string;
  surveyorName: string;
  timestamp: string;
  photoUrl: string;
  capturedLatLng: { lat: number; lng: number };
  deviceGpsAccuracyRadius: number; // in meters
  geoMatchConfidence: number; // percentage (0 to 100)
  status: 'pending' | 'approved' | 'flagged';
  flagReason?: string;
  notes?: string;
}

export type EscalationStatus = 'received' | 'acknowledged' | 'resolved';

export interface EmergencyAlert {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: 'surveyor' | 'technician';
  staffPhone: string;
  staffAvatarUrl?: string;
  alertType: 'site_accident' | 'safety_concern' | 'aggressive_customer' | 'vehicle_breakdown';
  alertLocation: string;
  lat: number;
  lng: number;
  escalationStatus: EscalationStatus;
  receivedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  isArchived: boolean;
  cancelledAt?: string; // If triggered accidentally and within 10s cancel window
  escalatedToBackupAt?: string; // If backup SMS channel triggered
}

// Prompt 096: Manufacturer Production Status
export interface StageEvidenceUpload {
  id: string;
  stageName: string;
  fileName: string;
  fileUrl?: string;
  uploadedAt: string;
  uploadedBy: string;
  note?: string;
}

export interface ProductionStageHistory {
  stageName: string;
  timestamp: string;
  updatedBy: string;
  note?: string;
  completionPercentage: number;
  isRegression?: boolean;
}

export interface ProductionStatusRecord {
  id: string;
  poId: string;
  supplierId: string;
  supplierName: string;
  isManufacturer: boolean; // Only manufacturers tracked
  componentName: string;
  batchNumber?: string;
  productionStage: 'Raw Material Sourced' | 'Custom Fabrication' | 'Quality & Testing' | 'Packaging & Dispatch' | 'Rework Required';
  completionPercentage: number; // 0 - 100
  stalledFlag: boolean;
  stalledReason?: string;
  stalledSinceDays?: number;
  estimatedCompletionDate: string;
  stageEvidenceUploads: StageEvidenceUpload[];
  stageHistory: ProductionStageHistory[];
  sharedBatchPoIds?: string[]; // If produced in batch across multiple POs
  updatedAt: string;
}

// Prompt 097: Supplier Rating & Quality Scorecard
export interface OrderRatingEntry {
  id: string;
  orderId: string; // PO ID
  supplierId: string;
  supplierName: string;
  overallRating: number; // 1.0 to 5.0
  deliveryTimelinessDays: number; // 0 = on time, +2 = 2 days late, -1 = early
  qualityDefectLogged: boolean;
  defectNotes?: string;
  attributedTo: 'supplier_part' | 'technician_installation_error' | 'transit_damage';
  completedDate: string;
  disputeStatus: 'none' | 'disputed' | 'under_review' | 'resolved_upheld' | 'resolved_corrected';
  disputeReason?: string;
  disputeAdminNote?: string;
  disputeSubmittedAt?: string;
  disputeResolvedAt?: string;
}

export interface SupplierScorecardDetail {
  supplierId: string;
  supplierName: string;
  overallScore: number; // 0 - 100
  deliveryScore: number; // 0 - 100
  qualityScore: number; // 0 - 100
  commercialScore: number; // 0 - 100
  responsivenessScore: number; // 0 - 100
  scoreTrend: 'improving' | 'stable' | 'declining';
  adminContextNote?: string; // e.g., "Regional logistics disruption during MH monsoon"
  ratingsHistory: OrderRatingEntry[];
}

// Prompt 098: Supplier Contract & SLA
export interface ContractAmendment {
  id: string;
  title: string;
  effectiveDate: string;
  summary: string;
  documentUrl?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface SupplierContractSlaRecord {
  id: string;
  supplierId: string;
  supplierName: string;
  contractTitle: string;
  status: 'active' | 'renewal_due' | 'lapsed' | 'terminated';
  paymentTermsDays: number; // e.g. 30
  paymentTermsDescription: string;
  deliverySlaDays: number; // e.g. 14
  qualityStandardsExpected: string[];
  noLiabilityWarrantyTerms: string;
  agreementStartDate: string;
  agreementExpiryDate: string;
  amendmentHistory: ContractAmendment[];
  agreementDocumentUrl?: string;
  lastRenewedAt?: string;
}

// Prompt 099: Supplier Communication Thread Screen
export interface SupplierChatMessage {
  id: string;
  senderRole: 'admin' | 'supplier' | 'bot' | 'system_log';
  senderName: string;
  senderAvatar?: string;
  timestamp: string;
  text: string;
  attachments?: {
    id: string;
    fileName: string;
    fileType: 'pdf' | 'doc' | 'image' | 'po_link';
    fileUrl: string;
    fileSize?: string;
  }[];
  isRead?: boolean;
  isExternalLog?: boolean; // Logged phone call or email
  externalType?: 'phone_call' | 'email' | 'whatsapp';
  flaggedForScorecard?: boolean;
  scorecardNote?: string;
}

export interface SupplierCommunicationThread {
  id: string;
  supplierId: string;
  supplierName: string;
  relatedPoId?: string;
  topicTitle: string;
  status: 'active' | 'resolved' | 'escalated_unresponsive';
  unresponsiveFlag: boolean;
  unresponsiveWindowHours: number;
  lastResponseTimestamp: string;
  lastMessageText: string;
  unreadCount: number;
  messages: SupplierChatMessage[];
}

// Prompt 100: Supplier Payment Terms Configuration
export interface MilestoneSplitConfig {
  advancePct: number; // e.g. 20
  dispatchDeliveryPct: number; // e.g. 70
  retentionPct: number; // e.g. 10 (held until QC handover)
}

export interface SupplierPaymentTermsConfig {
  id: string;
  supplierId?: string; // If undefined, applies to tier default
  tierLevel?: 'tier_1_preferred' | 'tier_2_approved' | 'tier_3_probationary';
  supplierName?: string;
  termType: 'net_15' | 'net_30' | 'net_45' | 'milestone_split' | 'advance_required';
  milestoneSplit: MilestoneSplitConfig;
  retentionPct: number; // Retention held pending installation QC
  autoReleaseRetentionDaysAfterHandover: number; // e.g. 14 days
  advanceRequiredFlag: boolean;
  creditLimitINR: number;
  isCustomOverride: boolean;
  graduationScoreThreshold: number; // Scorecard score needed to graduate (e.g. 90+)
  lastUpdatedBy: string;
  updatedAt: string;
  notes?: string;
}

// Prompt 101: Delivery Scheduling Screen
export interface SiteReadinessChecklist {
  shaftCivilWorkComplete: boolean;
  unloadingAreaClear: boolean;
  powerSupply3PhaseReady: boolean;
  siteEngineerSignoff: boolean;
  craneScaffoldingAvailable: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface DeliverySchedule {
  id: string;
  poId: string;
  supplierId: string;
  supplierName: string;
  customerName: string;
  siteAddress: string;
  itemSummary: string;
  prerequisitePoId?: string;
  scheduledDeliveryDate: string;
  deliveryTimeWindow: string;
  siteReadinessConfirmedFlag: boolean;
  siteReadinessChecklist: SiteReadinessChecklist;
  status: 'pending_site_readiness' | 'scheduled_locked' | 'technician_assigned' | 'in_transit' | 'delivery_attempt_failed' | 'completed' | 'rescheduled';
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  rescheduledReason?: string;
  rescheduleHistory?: {
    previousDate: string;
    newDate: string;
    reason: string;
    requestedBy: string;
    timestamp: string;
  }[];
  attemptedFailureNote?: string;
  supplierAvailableWindows?: string[];
  createdAt: string;
  updatedAt: string;
}

// Prompt 102: Live Shipment Tracking Screen
export interface ShipmentTrackingLeg {
  legId: string;
  poId: string;
  legTitle: string;
  supplierId: string;
  supplierName: string;
  driverName: string;
  driverPhone: string;
  vehicleNumber: string;
  vehicleType: string;
  hasLiveGps: boolean;
  currentLatLng?: { lat: number; lng: number };
  lastLocationTimestamp?: string;
  speedKmph?: number;
  distanceRemainingKm?: number;
  etaEstimate: string;
  transitMilestone: 'dispatched' | 'in_transit' | 'nearby' | 'arrived' | 'attempted_failed';
  customerNotifiedFlag: boolean;
  whatsappNotificationLog?: {
    sentAt: string;
    messageText: string;
    status: 'delivered' | 'read';
  }[];
  milestoneHistory: {
    milestone: string;
    timestamp: string;
    locationName?: string;
    note?: string;
  }[];
}

export interface LiveShipmentTracker {
  id: string;
  poId: string;
  customerName: string;
  customerPhone: string;
  siteAddress: string;
  siteLatLng: { lat: number; lng: number };
  legs: ShipmentTrackingLeg[];
  activeLegId: string;
  status: 'in_transit' | 'delivered' | 'delayed' | 'fallback_milestones';
  updatedAt: string;
}

// Prompt 103: Site Delivery Checklist Screen
export interface SiteDeliveryChecklistItem {
  id: string;
  itemName: string;
  partNumber?: string;
  expectedQty: number;
  receivedQty: number;
  condition: 'good' | 'minor_scratches' | 'damaged' | 'missing';
  photos: string[];
  verified: boolean;
  notes?: string;
  isMandatory: boolean;
}

export interface DiscrepancyReport {
  id: string;
  poId: string;
  supplierId: string;
  supplierName: string;
  customerName: string;
  itemNames: string[];
  issueSummary: string;
  photos: string[];
  status: 'open_investigating' | 'supplier_replacing' | 'credit_note_issued' | 'resolved';
  reportedAt: string;
  resolutionNote?: string;
}

export interface SiteDeliveryChecklist {
  id: string;
  poId: string;
  supplierId: string;
  supplierName: string;
  customerName: string;
  siteAddress: string;
  items: SiteDeliveryChecklistItem[];
  receivedBy: string;
  receiverRole: 'technician' | 'site_engineer' | 'customer_rep';
  receiverPhone: string;
  deliveryType: 'full' | 'partial';
  discrepancyFlag: boolean;
  discrepancyReportId?: string;
  status: 'draft' | 'in_progress' | 'completed' | 'discrepancy_filed';
  completedAt?: string;
  paymentTriggered: boolean;
  createdAt: string;
  updatedAt: string;
}

// Prompt 104: Material Received Confirmation Screen
export interface ConfirmingParty {
  role: 'technician' | 'customer' | 'site_engineer';
  name: string;
  phone: string;
  signatureDataUrl?: string;
  signedAt: string;
}

export interface MaterialReceivedConfirmation {
  id: string;
  poId: string;
  checklistId: string;
  customerName: string;
  siteAddress: string;
  deliverySummary: string;
  totalItemsChecked: number;
  totalQtyReceived: number;
  discrepancySummary?: string;
  linkedDiscrepancies: string[];
  confirmingParties: ConfirmingParty[];
  customerPresentFlag: boolean;
  technicianOnlyNote?: string;
  documentRefCode: string;
  paymentStageDueTriggered: boolean;
  paymentStageName: string;
  amountDueNow: number;
  status: 'signed_and_locked' | 'queued_offline';
  timestamp: string;
}

// Prompt 105: Delivery Delay Alert & Escalation Screen
export interface DeliveryDelayAlert {
  id: string;
  poId: string;
  supplierId: string;
  supplierName: string;
  customerName: string;
  customerPhone: string;
  committedInstallDate: string;
  originalEta: string;
  currentEta: string;
  etaGapDays: number;
  severity: 'critical' | 'high' | 'medium';
  rootCauseTag: 'supplier_production' | 'transit_logistics' | 'customs_doc' | 'external_force_majeure' | 'site_unready';
  isExternalDisruption: boolean;
  customerNotifiedFlag: boolean;
  customerNotificationLog?: {
    sentAt: string;
    channel: 'whatsapp' | 'sms';
    message: string;
  }[];
  supplierThreadId?: string;
  status: 'active_alert' | 'customer_notified' | 'escalated_to_srm' | 'resolved_auto_cleared';
  updatedAt: string;
}

// Prompt 106: Inventory / Stock-in-Transit Screen
export interface StockInTransitItem {
  id: string;
  poId: string;
  componentCategory: 'traction_machine' | 'control_panels' | 'cabin_panels' | 'guide_rails' | 'door_headers' | 'cop_lop_fixtures' | 'electrical_harness';
  componentName: string;
  inTransitValue: number;
  expectedArrivalWindow: string;
  destinationDealId: string;
  destinationCustomerName: string;
  destinationSiteAddress: string;
  supplierId: string;
  supplierName: string;
  carrierName: string;
  trackingNumber: string;
  quantity: number;
  unitOfMeasure: string;
  status: 'in_transit' | 'delayed' | 'customs_hold' | 'approaching_site' | 'delivered';
  orphanedFlag: boolean;
  orphanedReason?: string;
  macroDelayWarning?: string;
  updatedAt: string;
}

// Prompt 107: Delivery SOP Checklist Screen (Master Template Config)
export interface DeliverySopStep {
  id: string;
  title: string;
  instruction: string;
  isMandatory: boolean;
  requiresPhoto: boolean;
  requiresQuantityVerification: boolean;
  fragilityCheck: boolean;
  safetyCritical: boolean;
  categorySpecificNote?: string;
}

export interface DeliverySopVersionRecord {
  version: string;
  effectiveDate: string;
  changedBy: string;
  notes: string;
  stepsCount: number;
}

export interface DeliverySopTemplate {
  id: string;
  componentCategory: 'cabin_panels' | 'traction_machine' | 'control_panels' | 'guide_rails' | 'door_headers' | 'cop_lop_fixtures' | 'electrical_harness';
  categoryName: string;
  sopVersion: string;
  effectiveDate: string;
  description: string;
  isActive: boolean;
  steps: DeliverySopStep[];
  versionHistory: DeliverySopVersionRecord[];
  updatedAt: string;
}

// Prompt 108: Damaged/Missing Parts Report Screen
export interface DamagedItemDetail {
  id: string;
  itemName: string;
  partNumber?: string;
  expectedQty: number;
  actualQty: number;
  discrepancyType: 'damaged' | 'missing' | 'wrong_spec' | 'incomplete_assembly';
  conditionDescription: string;
  photos: string[];
}

export interface DamagedMissingPartsReport {
  id: string;
  poId: string;
  supplierId: string;
  supplierName: string;
  customerName: string;
  customerPhone: string;
  destinationDealId: string;
  siteAddress: string;
  affectedItems: DamagedItemDetail[];
  urgencyFlag: boolean;
  techNotes: string;
  faultAttribution: 'supplier_factory_fault' | 'transit_courier_damage' | 'site_handling_ambiguous' | 'under_investigation';
  resolutionStatus: 'replacement_requested' | 'replacement_shipped' | 'resolved' | 'credited';
  scheduleImpactDays: number;
  adminReviewStatus: 'pending_admin_approval' | 'routed_to_supplier_thread' | 'payment_held' | 'claim_approved';
  linkedSupplierThreadId?: string;
  reportedByTechName: string;
  reportedByTechPhone: string;
  createdAt: string;
  updatedAt: string;
}

// Prompt 109: Delivery Partner Management Screen
export interface RateCardEntry {
  id: string;
  lane: string; // e.g. "Pune -> Mumbai Metro", "Ahmedabad -> Pune"
  vehicleType: string; // e.g. "14ft Open Truck", "32ft Container MX", "E-Cargo PickUp"
  baseRateINR: number;
  estTransitHours: number;
}

export interface DeliveryPartner {
  id: string;
  name: string;
  code: string;
  contactPhone: string;
  contactEmail: string;
  serviceAreas: string[]; // e.g. ['MH_Pune', 'MH_Mumbai', 'GJ_Ahmedabad', 'KA_Bangalore']
  liveTrackingSupportedFlag: boolean;
  apiIntegrationStatus: 'active_live' | 'degraded_milestone_fallback' | 'manual_only';
  onTimeRatePct: number;
  damagedTripRatePct: number;
  avgDelayDays: number;
  completedTripsCount: number;
  rating: number; // 1-5 scale, 3.5 neutral for unproven
  isUnprovenPartner: boolean;
  rateCard: RateCardEntry[];
  isActive: boolean;
  notes?: string;
  updatedAt: string;
}

// Prompt 110: Delivery Analytics Screen
export interface RegionalTransitBenchmark {
  regionCode: string;
  regionName: string;
  avgDays: number;
  sampleSize: number;
  isEmergingData: boolean;
  recommendationQuoteWindow: string; // e.g. "2-3 Days"
}

export interface SupplierPartnerPerformanceBreakdown {
  id: string;
  name: string;
  type: 'supplier' | 'logistics_partner';
  onTimePct: number;
  delayDaysAvg: number;
  totalShipments: number;
  damageIncidentRatePct: number;
}

export interface MacroDisruptionRecord {
  id: string;
  period: string; // e.g. "Jul 2026"
  region: string; // e.g. "Konkan Coast & Western Ghats"
  eventName: string; // e.g. "Heavy Monsoon Flooding & Expressway Landslide"
  impactDays: number;
  description: string;
}

export interface LogisticsCostImpactCategory {
  category: string;
  costINR: number;
  incidentCount: number;
  description: string;
}

export interface DeliveryAnalyticsSummary {
  overallOnTimeRatePct: number;
  onTimeTrendPct: number; // e.g. +3.2%
  avgTransitDaysOverall: number;
  avgTransitTrendDays: number; // e.g. -0.4 days
  discrepancyRatePct: number;
  discrepancyTrendPct: number; // e.g. -1.1%
  totalLogisticsIssueCostINR: number;
  regionalBenchmarks: RegionalTransitBenchmark[];
  entityBreakdowns: SupplierPartnerPerformanceBreakdown[];
  macroDisruptions: MacroDisruptionRecord[];
  costImpacts: LogisticsCostImpactCategory[];
  periodLabel: string;
  updatedAt: string;
}

// Prompt 111 & 112: Supplier Payment Processing
export interface PaymentMilestoneItem {
  id: string;
  milestoneKey: 'po_issued' | 'advance_due' | 'delivery_confirmed' | 'installation_qc_passed' | 'retention_elapsed' | 'manual_override';
  milestoneTitle: string;
  percentage: number; // e.g. 50%, 40%, 10%
  amountINR: number;
  status: 'pending' | 'triggered' | 'approved' | 'held' | 'released' | 'cancelled';
  triggeredAt?: string;
  triggeredByEvent?: string; // e.g. "Site Delivery Sign-off #DEL-8821"
  triggerEvidenceRef?: string;
  evidenceType?: 'delivery_signoff' | 'qc_inspection' | 'timer' | 'admin_override';
  isOverride?: boolean;
  overrideReason?: string;
  overrideBy?: string;
}

export interface PaymentOverrideRecord {
  id: string;
  timestamp: string;
  adminName: string;
  actionType: 'split_percentage_adjustment' | 'milestone_force_release' | 'milestone_hold' | 'reversal_cancellation';
  previousValue: string;
  newValue: string;
  reason: string;
}

export interface SupplierPaymentRecord {
  id: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierBankName: string;
  supplierAccountNo: string;
  supplierIfsc: string;
  totalPoAmountINR: number;
  triggerMilestone: string; // e.g. "Delivery Confirmed (40% Split Due)"
  triggerMilestoneKey: 'advance_due' | 'delivery_confirmed' | 'retention_elapsed' | 'manual_override';
  dueAmountINR: number;
  approvalStatus: 'ready_for_approval' | 'approved_pending_transfer' | 'held' | 'released' | 'reversed';
  holdReason?: string;
  hasOpenDiscrepancyFlag: boolean;
  linkedDiscrepancyReportId?: string;
  linkedDiscrepancySummary?: string;
  milestoneChain: PaymentMilestoneItem[];
  currentMilestoneIndex: number;
  overrideLog: PaymentOverrideRecord[];
  approvalReversalExpiry?: string; // Short reversal window ISO timestamp
  approvedAt?: string;
  approvedBy?: string;
  batchId?: string;
  riskTier: 'low_risk_routine' | 'medium_risk' | 'high_risk_discrepancy';
  createdAt: string;
  updatedAt: string;
}

// Prompt 113: Supplier Invoice Matching
export interface SupplierInvoiceLineItem {
  id: string;
  itemCode: string;
  description: string;
  invoicedQty: number;
  invoicedUnitPriceINR: number;
  invoicedTotalINR: number;
  poQty: number;
  poUnitPriceINR: number;
  receivedQty: number;
}

export interface ThreeWayMatchResult {
  poId: string;
  poTotalINR: number;
  receiptId?: string;
  receiptDate?: string;
  receiptConfirmedQty: number;
  matchedQtyCheck: 'pass' | 'fail_qty_mismatch' | 'partial_delivery_ok' | 'missing_receipt';
  matchedPriceCheck: 'pass' | 'fail_price_mismatch' | 'approved_exception';
  matchStatus: 'perfect_match' | 'mismatch_qty' | 'mismatch_price' | 'missing_invoice' | 'approved_exception' | 'partial_match';
  qtyDifference: number;
  priceDifferenceINR: number;
  discrepancyNote?: string;
}

export interface SupplierInvoiceDoc {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  poId: string;
  poNumber: string;
  invoiceDate: string;
  totalInvoicedAmountINR: number;
  taxAmountINR: number;
  fileUrl?: string;
  status: 'submitted' | 'matched' | 'mismatch_flagged' | 'exception_approved' | 'rejected' | 'missing_doc';
  submissionMethod: 'supplier_direct' | 'admin_upload' | 'email_ingest';
  lineItems: SupplierInvoiceLineItem[];
  matchResult?: ThreeWayMatchResult;
  approvedExceptionReason?: string;
  approvedExceptionBy?: string;
  createdAt: string;
  updatedAt: string;
}

// Prompt 114: Supplier Payment Schedule
export interface ScheduledPaymentEntry {
  id: string;
  paymentId: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  paymentType: 'advance' | 'milestone' | 'retention';
  milestoneTitle: string;
  amountINR: number;
  expectedDate: string; // ISO date string (YYYY-MM-DD)
  status: 'scheduled' | 'overdue' | 'pushed_delay' | 'paid' | 'cancelled';
  delayReason?: string;
  riskConcentrationFlag?: boolean;
  linkedJobTitle?: string;
}

// Prompt 115: Supplier Payment History
export interface PaymentHistoryRecord {
  id: string;
  paymentId: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  paymentType: 'advance' | 'milestone' | 'retention';
  milestoneTitle: string;
  amountINR: number;
  paymentDate: string; // ISO date string
  utrNumber: string; // UTR reference #
  paymentMethod: 'NEFT' | 'RTGS' | 'IMPS' | 'Direct Transfer';
  linkedInvoiceNo: string;
  status: 'completed' | 'reversed' | 'adjusted';
  adjustmentNote?: string;
  reconciliationStatus: 'reconciled' | 'pending_bank_statement';
  receiptFileUrl?: string;
}

// Prompt 116: Tax/GST Compliance
export interface SupplierGstinStatusRecord {
  supplierId: string;
  supplierName: string;
  gstin: string;
  registeredState: string; // e.g. "Maharashtra (27)", "Gujarat (24)"
  filingStatus: 'active_verified' | 'lapsed_compliance_risk' | 'pending_verification';
  lastFilingPeriod: string; // e.g. "GSTR-3B Jul 2026 Filed"
  eligibleInputCreditINR: number;
  jeopardizedCreditINR: number;
  complianceAlertFlag: boolean;
  alertNote?: string;
}

export interface TaxGstComplianceRecord {
  period: string; // e.g. "Q2 FY 2026-27 (Jul-Sep 2026)"
  totalProcurementInvoices: number;
  inputGstCreditAvailableINR: number;
  cgstInputINR: number;
  sgstInputINR: number;
  igstInputINR: number;
  outputGstChargedINR: number;
  cgstOutputINR: number;
  sgstOutputINR: number;
  igstOutputINR: number;
  netGstLiabilityINR: number;
  atRiskInputCreditINR: number;
  supplierGstinStatuses: SupplierGstinStatusRecord[];
  accountantSummaryExportedAt?: string;
  updatedAt: string;
}

// Prompt 117: Supplier Dispute Resolution
export interface DisputeAuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  notes: string;
}

export interface SupplierDisputeRecord {
  id: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  disputeType: 'invoice_mismatch' | 'retention_delay' | 'damaged_parts_deduction' | 'price_escalation_claim';
  disputeTitle: string;
  supplierPosition: string;
  supplierClaimAmountINR: number;
  aiecPosition: string;
  aiecEvidenceDocUrl?: string;
  slaStatus: 'within_sla' | 'sla_breached' | 'urgent_relationship_risk';
  slaDueDate: string;
  relationshipRiskLevel: 'low' | 'medium' | 'high_threat_order_halt';
  supplierScorecardRating: number; // e.g. 4.8 / 5
  status: 'open_under_review' | 'resolved_supplier_favor' | 'resolved_aiec_upheld' | 'resolved_partial_adjustment' | 'reopened';
  resolutionDecisionNote?: string;
  resolutionAmountINR?: number;
  resolvedBy?: string;
  resolvedAt?: string;
  auditTrail: DisputeAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

// Prompt 118: Advance Payment & Retention
export interface AdvanceExposureRecord {
  id: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  advanceAmountINR: number;
  disbursementDate: string;
  expectedDeliveryDate: string;
  daysOutstanding: number;
  agingStatus: 'normal_in_transit' | 'delayed_aging_risk' | 'critical_overdue_escalation';
  linkedJobTitle: string;
}

export interface RetentionHoldRecord {
  id: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  retentionPercent: number;
  retentionAmountINR: number;
  retentionStage: 'site_delivery' | 'installation' | 'handover_dlp';
  retentionStatus: 'held_in_escrow' | 'eligible_for_release' | 'released_disbursed' | 'partially_forfeited';
  heldDate: string;
  holdStartDate?: string;
  expectedReleaseDate?: string;
  readinessStatus?: string;
  dlpExpiryDate: string;
  defectClearanceSignoff: boolean;
  qcInspectionPass?: boolean;
  linkedQcRecordId?: string;
  hasOpenDispute?: boolean;
  hasOpenDamageReport?: boolean;
  linkedJobTitle?: string;
  releasedAmountINR?: number;
  releasedAt?: string;
  notes?: string;
}

// Prompt 119: Supplier Payment Analytics
export interface SupplierSpendBreakdown {
  supplierId: string;
  supplierName: string;
  category: string;
  spendINR: number;
  sharePercent: number;
  avgDaysToPay: number;
  disputeRatePercent: number;
  avgDisputeResolveDays: number;
  relationshipRiskFlag?: boolean;
  riskReason?: string;
}

export interface SupplierPaymentAnalyticsRecord {
  period: string;
  totalSpendINR: number;
  previousPeriodSpendINR: number;
  spendTrendPercent: number;
  avgDaysToDisbursement: number;
  retentionHeldTotalINR: number;
  retentionReleasedTotalINR: number;
  spendBySupplier: SupplierSpendBreakdown[];
  spendByCategory: { category: string; spendINR: number; count: number }[];
  retentionTrend: { month: string; heldINR: number; releasedINR: number }[];
  updatedAt: string;
}

// Prompt 120: Auto-Reconciliation
export interface UnmatchedTransaction {
  id: string;
  txDate: string;
  bankTxId: string;
  bankDescription: string;
  bankAmountINR: number;
  type: 'debit_supplier_outflow' | 'credit_customer_inflow' | 'debit_bank_fee';
  mismatchType: 'unrecorded_bank_fee' | 'amount_variance' | 'missing_app_record' | 'duplicate_payout_risk';
  suggestedAppRecord?: string;
  status: 'unmatched_action_required' | 'manually_reconciled' | 'escalated_high_priority';
  manualReason?: string;
  reconciledBy?: string;
  reconciledAt?: string;
}

export interface ReconciliationRunRecord {
  id: string;
  runDate: string;
  status: 'pass_all_matched' | 'action_required_mismatch' | 'bank_feed_unavailable';
  totalBankTxCount: number;
  matchedCount: number;
  unmatchedCount: number;
  totalMatchedAmountINR: number;
  unmatchedTransactions: UnmatchedTransaction[];
  bankFeedSource: string;
  notes?: string;
}

// Prompt 121 & 122: Installation & Technician Module
export interface AssignedTeamMember {
  techId: string;
  name: string;
  role: 'lead_technician' | 'assistant_technician' | 'specialist_installer' | 'electrical_expert';
  phone: string;
  isLead: boolean;
}

export interface ElevatorJobSpec {
  modelName: string;
  capacityKg: number;
  passengers: number;
  stops: number;
  speedMs: number;
  driveType: string;
  doorType: string;
  cabinFinish: string;
  pitDepthMm: number;
  overheadMm: number;
  lockedQuotationRef: string;
  specLastUpdatedAt: string;
}

export interface JobMaterialCheckItem {
  id: string;
  componentCategory: string;
  itemName: string;
  quantity: number;
  isReadyOnSite: boolean;
  deliveredAt?: string;
  receivedVerificationSignoff: boolean;
}

export interface SurveyNoteRecord {
  id: string;
  timestamp: string;
  authorName: string;
  authorRole: string;
  noteText: string;
  isOutdated?: boolean;
}

export interface TechnicianJob {
  id: string;
  dealId: string;
  poNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  siteAddress: string;
  siteCity: string;
  latitude: number;
  longitude: number;
  scheduledDate: string;
  scheduledTimeSlot: string;
  sopStage: string;
  sopProgressPercent: number;
  status: 'scheduled' | 'in_progress' | 'pending_qc' | 'completed' | 'conflict_flagged';
  conflictReason?: string;
  userRoleInJob: 'lead_technician' | 'assistant_technician' | 'specialist_installer';
  assignedTeam: AssignedTeamMember[];
  elevatorSpec: ElevatorJobSpec;
  materialsStatus: JobMaterialCheckItem[];
  surveyNotes: SurveyNoteRecord[];
  estimatedHours: number;
  payoutAmountINR: number;
}

export interface TechnicianProfileSummary {
  technicianId: string;
  name: string;
  phone: string;
  monthlyCompletedCount: number;
  currentQualityScore: number;
  pendingPayoutINR: number;
  safetyAlertActive: boolean;
}

// Prompts 123, 124, 125: Installation SOP, Evidence & Check-in
export interface InstallationEvidenceItem {
  id: string;
  jobId: string;
  sopStepId: string;
  sopStepTitle: string;
  evidenceType: 'photo' | 'video';
  mediaUrl: string;
  captureTimestamp: string;
  caption?: string;
  isDefectFlagged?: boolean;
  defectNotes?: string;
  gpsLat?: number;
  gpsLng?: number;
  uploadStatus: 'uploaded' | 'uploading' | 'queued_offline';
}

export interface InstallationSopStep {
  id: string;
  jobId: string;
  phase: 'Site & Shaft Prep' | 'Guide Rails & Brackets' | 'Car Frame & Cabin' | 'Wiring & Control Panel' | 'Safety Devices (Governor/Buffers/ARD)' | 'Final Adjustment & Testing';
  stepNumber: number;
  title: string;
  description: string;
  isSafetyCritical: boolean;
  requiresPhotoEvidence: boolean;
  requiresVideoEvidence: boolean;
  status: 'pending' | 'completed' | 'na_confirmed';
  naReason?: string;
  completedAt?: string;
  completedByTechName?: string;
  evidenceList: InstallationEvidenceItem[];
}

export interface TechnicianCheckInRecord {
  id: string;
  jobId: string;
  technicianId: string;
  technicianName: string;
  checkInTimestamp: string;
  checkInLat: number;
  checkInLng: number;
  checkInDistanceMeters: number;
  checkOutTimestamp?: string;
  checkOutLat?: number;
  checkOutLng?: number;
  onsiteDurationMinutes?: number;
  hasIncompleteSopAtCheckOut?: boolean;
  checkOutNotes?: string;
  status: 'active_onsite' | 'checked_out';
}

export interface SafetyComplianceItem {
  id: string;
  jobId: string;
  category: 'Over-Speed Governor & Safety Gear' | 'Buffers & Pit Equipment' | 'Emergency Alarm & ARD' | 'IR Door Curtain & Interlocks' | 'Load Weighing & Overload Sensor' | 'No-Load & Full-Load Trial Run';
  title: string;
  description: string;
  indianStandardRef: string;
  isGovernmentInspectorRequired: boolean;
  status: 'passed' | 'failed' | 'pending';
  failureReason?: string;
  retestCount?: number;
  overrideReason?: string;
  overrideByAdmin?: string;
  evidenceUrl?: string;
  testedAt?: string;
  testedByTechName?: string;
}

export interface TechnicianIssueReport {
  id: string;
  jobId: string;
  title: string;
  issueCategory: 'missing_defective_parts' | 'site_unpreparedness' | 'customer_client_delay' | 'safety_hazard' | 'sop_template_gap';
  severity: 'minor_noted' | 'blocking_paused' | 'critical_safety';
  description: string;
  evidenceUrls: string[];
  reportedByTechId: string;
  reportedByTechName: string;
  reportedAt: string;
  status: 'open_investigating' | 'resolved_resumed' | 'escalated_to_admin';
  resolutionNotes?: string;
  linkedReportId?: string;
}

export interface MaterialUsageLogItem {
  id: string;
  jobId: string;
  partName: string;
  partCategory: 'Guide Rails & Brackets' | 'Machine & Traction' | 'Control Panel & Cables' | 'Cabin & Fixtures' | 'Doors & Hardware' | 'Fasteners & Consumables';
  plannedQuantity: number;
  usedQuantity: number;
  unit: string;
  serialOrBatchNumber: string;
  hasDeviation: boolean;
  deviationReason?: 'defective_replaced_from_spare' | 'site_custom_bracket_added' | 'spare_tech_stock_used' | 'extra_length_required' | 'not_required';
  returnToReusablePool: boolean;
  loggedAt?: string;
}

// Module 14: Quality Check & Handover Types
export interface QcInspectorAssignmentRecord {
  id: string;
  jobId: string;
  assignedInspectorId: string;
  assignedInspectorName: string;
  assignedInspectorPhone: string;
  assignedInspectorRole: 'qc_inspector' | 'admin_exception' | 'senior_lead_auditor';
  qcScheduledDate: string;
  qcScheduledTimeSlot: string;
  assignmentStatus: 'unassigned' | 'pending_confirmation' | 'scheduled' | 'in_progress' | 'completed' | 'conflict_flagged';
  eligibilityCheckPassed: boolean;
  matchingSkillTags: string[];
  conflictOfIndependenceFlag: boolean;
  conflictDetails?: string;
  adminOverrideReason?: string;
  customerPreferredTiming?: string;
  customerConfirmedSlot?: boolean;
  autoNotificationSentAt?: string;
  assignedAt: string;
}

export interface QcMechanicalCheckItem {
  id: string;
  jobId: string;
  itemKey: 'guide_rail_plumb' | 'car_counterweight_balance' | 'ride_smoothness_vibration' | 'floor_leveling_accuracy' | 'door_mechanism_smoothness';
  title: string;
  category: 'Guide Rails' | 'Car & Counterweight' | 'Ride Quality' | 'Floor Leveling' | 'Door Mechanism';
  toleranceStandard: string; // e.g. "Plumb within 1mm per 10m height", "Leveling within +/- 3mm", "Peak acceleration < 1.2 m/s²"
  result: 'passed' | 'failed' | 'pass_with_exception' | 'pending';
  exceptionNotes?: string;
  failReason?: string;
  inspectorEvidenceUrls: string[];
  installEvidenceRefUrl?: string;
  installEvidenceDiscrepancyFlag?: boolean;
  discrepancyNotes?: string;
  inspectedAt?: string;
  reworkRequiredFlag?: boolean;
}

export interface QcMechanicalReport {
  id: string;
  jobId: string;
  inspectorId: string;
  inspectorName: string;
  overallStatus: 'pending' | 'passed' | 'passed_with_exceptions' | 'failed_rework_needed';
  totalCheckItems: number;
  passedCount: number;
  exceptionsCount: number;
  failedCount: number;
  overallComments?: string;
  signedOffAt?: string;
  reworkTaskRefId?: string;
  items: QcMechanicalCheckItem[];
}

export interface InstallationProgressMilestone {
  id: string;
  jobId: string;
  stageName: string;
  percentWeight: number;
  status: 'completed' | 'in_progress' | 'upcoming' | 'blocked';
  completedAt?: string;
  leadTechName?: string;
  keyNote?: string;
}

export interface TechnicianCoordinationRecord {
  id: string;
  jobId: string;
  memberId?: string;
  leadTechnicianId: string;
  assistantIds: string[];
  scheduledShiftDate: string;
  safetyBriefingAcknowledged: boolean;
  locationPingTimestamp?: string;
  lastCommunicationNote?: string;
  // Subcontractor support fields
  memberName?: string;
  memberRole?: string;
  phone?: string;
  isSubcontractor?: boolean;
  assignedTaskScope?: string;
  safetyBriefingSigned?: boolean;
  checkInStatus?: 'assigned' | 'onsite_active' | 'completed';
  subcontractorFirmName?: string;
  handoverSignoffCompleted?: boolean;
}

export interface QcElectricalRetestHistory {
  attemptNumber: number;
  result: 'failed' | 'passed';
  dateAt: string;
  note?: string;
  evidenceUrl?: string;
}

export interface QcElectricalTrialRunData {
  loadCondition: 'no_load' | 'full_load_100' | 'overload_110';
  voltageVolts: number;
  currentAmps: number;
  speedMps: number;
  ardResponseTimeSeconds: number;
  levelingAccuracyMm: number;
  vibrationDb: number;
  passed: boolean;
}

export interface QcElectricalSafetyCheckItem {
  id: string;
  jobId: string;
  itemKey: 'wiring_grounding_verification' | 'control_panel_function' | 'overspeed_governor_test' | 'buffer_function' | 'ard_simulated_power_failure' | 'door_safety_sensor_test' | 'overload_device_test' | 'emergency_alarm_communication' | 'no_load_full_load_trial_run';
  title: string;
  category: 'Wiring & Earthing' | 'Control Panel' | 'Safety Devices' | 'Emergency & ARD' | 'Trial Run Performance';
  bisStandardRef: string;
  result: 'passed' | 'failed' | 'pending';
  hardBlockActive: boolean;
  failReason?: string;
  intermittentIssueFlag?: boolean;
  inspectorEvidenceUrls: string[];
  trialRunData?: QcElectricalTrialRunData;
  retestHistory: QcElectricalRetestHistory[];
  inspectedAt?: string;
}

export interface QcElectricalReport {
  id: string;
  jobId: string;
  inspectorId: string;
  inspectorName: string;
  overallStatus: 'pending' | 'passed' | 'failed_hard_blocked';
  totalCheckItems: number;
  passedCount: number;
  failedCount: number;
  hardBlockActive: boolean;
  signedOffAt?: string;
  items: QcElectricalSafetyCheckItem[];
}

export interface GovernmentApplicationGuidance {
  licensingAuthority: string;
  formName: string;
  requiredAttachments: string[];
  stateFeeEstimateRs: number;
  nextStepInstructions: string;
}

export interface ComplianceCertificateRecord {
  id: string;
  jobId: string;
  certificateNumber: string;
  buildingName: string;
  customerName: string;
  applicableIsStandard: 'IS 14665 (Electric Traction Lifts)' | 'IS 15259 (Hydraulic Lifts)' | 'IS 14671 (Lifts for Persons with Disabilities)' | 'State Lift Act Special Standards';
  driveType: 'mrl_gearless' | 'geared_traction' | 'hydraulic' | 'home_lift';
  floorsCount: number;
  ratedCapacityKg: number;
  stateJurisdiction: string;
  governmentApplicationGuidance: GovernmentApplicationGuidance;
  documentPackageRef: {
    mechanicalQcReportId: string;
    electricalQcReportId: string;
    trialRunLogId: string;
    drawingApprovalRef: string;
    earthingTestCertificateRef: string;
  };
  issuedTimestamp: string;
  issuedByInspectorName: string;
  isLockedImmutable: boolean;
  isReissued: boolean;
  originalCertificateRefId?: string;
  reissueReason?: string;
}

export interface DefectSnagRecord {
  id: string;
  jobId: string;
  snagCode: string;
  title: string;
  description: string;
  sourceChecklist: 'mechanical' | 'electrical_safety' | 'customer_walkthrough';
  sourceChecklistItemKey: string;
  severity: 'safety_critical' | 'functional' | 'cosmetic';
  assignedTechnicianId: string;
  assignedTechnicianName: string;
  resolutionStatus: 'open' | 'rework_in_progress' | 'pending_qc_reverification' | 'qc_verified_closed' | 'customer_waived_cosmetic' | 'admin_escalated';
  hardBlockHandoverFlag: boolean;
  photos: string[];
  reworkNotes?: string;
  reverifiedByInspectorName?: string;
  reverifiedAt?: string;
  linkedSnagIds?: string[];
  customerWaivedReason?: string;
  adminEscalationNote?: string;
  createdAt: string;
}

export interface ReworkAssignmentRecord {
  id: string;
  jobId: string;
  linkedSnagId: string;
  snagCode: string;
  title: string;
  assignedTechnicianId: string;
  assignedTechnicianName: string;
  dueUrgency: 'immediate_urgent' | 'high_priority' | 'normal';
  dueDate: string;
  qcOriginalNote: string;
  qcOriginalEvidenceUrls: string[];
  reworkCompletionEvidenceUrls: string[];
  technicianFixNotes?: string;
  status: 'assigned' | 'in_progress' | 'pending_qc_reverification' | 'completed_closed';
  replacementPartsNeeded?: boolean;
  partOrderRef?: string;
  escalatedBiggerIssue?: boolean;
  escalationNote?: string;
  updatedAt: string;
}

export interface FinalHandoverChecklistRecord {
  id: string;
  jobId: string;
  allSnagsResolvedFlag: boolean;
  complianceCertIssuedFlag: boolean;
  documentationPackageReadyFlag: boolean;
  adminFinalReviewApproved: boolean;
  handoverReadyStatus: 'blocked' | 'ready_for_walkthrough' | 'walkthrough_completed';
  blockingReasons: string[];
  checkedByInspectorName: string;
  checkedAt: string;
}

export interface CustomerHandoverWalkthroughRecord {
  id: string;
  jobId: string;
  walkthroughConductedBy: string;
  walkthroughMode: 'in_person' | 'video_call_remote' | 'site_representative';
  repNameIfApplicable?: string;
  demonstratedItems: {
    normalOperation: boolean;
    ardEmergencyProcedure: boolean;
    alarmAndIntercom: boolean;
    cleaningAndCare: boolean;
  };
  customerSignatureUrl?: string;
  customerSignoffTimestamp?: string;
  documentsProvided: string[];
  amcOptionEnrolled: boolean;
  amcPlanSelected?: string;
  immediateFeedbackScore: number;
  customerFeedbackComments?: string;
  followupQuestions?: string;
}

export interface AsInstalledComponentWarranty {
  componentName: string;
  serialNumber?: string;
  isSubstitution?: boolean;
  originalPartName?: string;
  warrantyCoverageDetails: string;
}

export interface RenewalReminderItem {
  reminderDate: string;
  channel: 'whatsapp' | 'email' | 'call';
  reminderType: 'first_quarterly_service' | 'renewal_60_days' | 'renewal_30_days' | 'renewal_7_days';
  status: 'scheduled' | 'sent';
}

export interface WarrantyAmcRegistrationRecord {
  id: string;
  jobId: string;
  customerName: string;
  siteAddress: string;
  installationDate: string;
  manufacturerPartsWarrantyMonths: number;
  aiecLaborWarrantyMonths: number;
  asInstalledMaterialList: AsInstalledComponentWarranty[];
  amcTierSelected: 'silver_basic' | 'gold_comprehensive' | 'platinum_priority' | 'opted_out_declined';
  amcPricePerYear: number;
  amcCustomizationNotes?: string;
  amcCoverageScope: string[];
  amcStartDate: string;
  amcEndDate: string;
  renewalReminderSchedule: RenewalReminderItem[];
  declinedReengagementSequenceActive?: boolean;
  registeredAt: string;
  registeredBy: string;
}

export interface LinkedCertificateDocument {
  id: string;
  title: string;
  docType: 'qa_cert' | 'warranty_card' | 'amc_contract' | 'user_manual' | 'lift_license_doc';
  fileUrl: string;
  dateAdded: string;
}

export interface StaffLifecyclePayout {
  staffId: string;
  staffName: string;
  role: string;
  payoutAmount: number;
  status: 'triggered_and_disbursed' | 'hold_admin_review';
}

export interface HandoverCompletionCertificateRecord {
  id: string;
  certificateNumber: string;
  jobId: string;
  customerName: string;
  buildingName: string;
  siteAddress: string;
  elevatorSpecsSummary: string;
  completionDate: string;
  complianceCertRef: string;
  warrantyAndAmcRef: string;
  linkedDocuments: LinkedCertificateDocument[];
  lifecycleMilestones: {
    stageName: string;
    completedDate: string;
    leadStaffName: string;
    status: 'completed';
  }[];
  payoutsTriggeredFlag: boolean;
  payoutsBreakdown: StaffLifecyclePayout[];
  lateDefectPolicyNotes?: string;
  issuedByAdminName: string;
  issuedAt: string;
}

export interface ApplicantReferenceContact {
  id: string;
  name: string;
  phone: string;
  relation: string;
  verificationStatus: 'unverified' | 'contacted' | 'verified' | 'unreachable';
  notes?: string;
}

export interface ApplicantScreeningScore {
  totalScore: number; // 0 - 100
  completenessScore: number; // 0 - 30
  experienceScore: number; // 0 - 35
  territoryNeedScore: number; // 0 - 35
  scoreBreakdownSummary: string;
  overriddenByAdmin?: boolean;
  overriddenScore?: number;
  overrideReason?: string;
  decisionNote?: string;
}

export interface ApplicantInterviewRecord {
  id: string;
  slotDateTime: string; // ISO or human format
  mode: 'phone' | 'video' | 'in_person';
  locationOrLink?: string;
  interviewerName: string;
  status: 'scheduled' | 'completed' | 'missed' | 'rescheduled' | 'cancelled';
  notes?: string;
  qualitativeRating?: 'excellent' | 'adequate' | 'concerns' | 'unfavorable';
  outcome?: 'passed' | 'rejected' | 'needs_followup' | 'pending';
  reminderSent?: boolean;
  rescheduleReason?: string;
}

export interface ApplicantVerificationCheck {
  id: string;
  itemKey: 'aadhaar_id' | 'wireman_license' | 'gstin_proof' | 'reference_check' | 'bank_mandate' | 'safety_cert';
  label: string;
  requiredForRoles: ('surveyor' | 'technician' | 'supplier' | 'sales_rep')[];
  method: 'third_party_api' | 'manual_admin' | 'field_agent';
  status: 'pending' | 'passed' | 'failed' | 'conditional_approval';
  verifiedBy?: string;
  verifiedAt?: string;
  conditionalDeadline?: string;
  notes?: string;
  documentRefUrl?: string;
}

export interface RecruitmentApplicantRecord {
  id: string;
  applicantName: string;
  applicantPhone: string;
  interestedRoles: ('surveyor' | 'technician' | 'supplier' | 'sales_rep')[];
  primaryRole: 'surveyor' | 'technician' | 'supplier' | 'sales_rep';
  applicationSource: 'qr_flyer' | 'whatsapp_referral' | 'social_media' | 'field_agent' | 'direct_search' | 'other';
  sourceDetails?: string;
  initialInterestTimestamp: string;
  
  // Follow-up Data Collection
  dob?: string;
  fullAddress?: string;
  pincode?: string;
  experienceYears?: number;
  experienceSummary?: string; // Free text for informal experience
  hasPriorElevatorExperience?: boolean;
  territoryPreferences?: string[]; // Preferred zones e.g., ['Pune West', 'PCMC']
  availabilityTimeframe?: 'immediate' | '1_2_weeks' | '1_month';
  referenceContacts?: ApplicantReferenceContact[];
  
  // Documents & Status
  idProofUploaded?: boolean;
  licenseUploaded?: boolean;
  bankDetailsProvided?: boolean;
  
  // Screening, Interview & Verification
  screeningScore?: ApplicantScreeningScore;
  interviewRecord?: ApplicantInterviewRecord;
  verificationChecks?: ApplicantVerificationCheck[];
  
  status: 'draft' | 'submitted' | 'under_review' | 'interview_scheduled' | 'approved' | 'rejected' | 'activated';
  lastSavedAt?: string;
  assignedRecruiterName?: string;
  rejectionReason?: string;
}

export interface RoleSpecificAgreementTerms {
  commissionStructure: string;
  territoryAssigned: string;
  sopLiabilityTerms: string;
  insuranceTerms: string;
  customAddendumNote?: string;
  version: string;
}

export interface AgreementSignatureData {
  signedByName: string;
  signedPhone: string;
  otpVerified: boolean;
  otpVerifiedAt?: string;
  signatureDataUrl?: string;
  signedAt?: string;
}

export interface OfferAgreementRecord {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantPhone: string;
  role: 'surveyor' | 'technician' | 'supplier' | 'sales_rep';
  agreementTitle: string;
  agreementDocumentText: string;
  roleSpecificTerms: RoleSpecificAgreementTerms;
  signatureData?: AgreementSignatureData;
  status: 'draft' | 'pending_signature' | 'signed_active' | 'custom_term_review';
  activationTriggeredFlag: boolean;
  activatedAt?: string;
  createdDate: string;
  customAddendumApprovedByAdmin?: boolean;
}

export interface PartnerTierCriteriaMet {
  jobsCompletedCount: number;
  safetyRating: number;
  slaCompliancePercent: number;
  certificationsVerifiedCount: number;
  yearsInTrade: number;
}

export interface PartnerTierDefaults {
  commissionRateMultiplier: number; // e.g. 1.0, 1.15, 1.25
  paymentTerms: string; // e.g. 'Immediate Net-0 on QC Signoff', 'Net-7 Weekly Batch'
  autonomyLevel: string; // e.g. 'Requires Supervisor Check', 'Independent Signoff up to ₹2L'
}

export interface PartnerTierChangeHistory {
  id: string;
  fromTier: string;
  toTier: string;
  effectiveDate: string;
  reason: string;
  assignedBy: string;
}

export interface PartnerTierAssignmentRecord {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerPhone: string;
  role: 'surveyor' | 'technician' | 'supplier' | 'sales_rep';
  assignedTier: 'tier_1_bronze' | 'tier_2_silver' | 'tier_3_gold' | 'tier_4_master';
  criteriaMet: PartnerTierCriteriaMet;
  tierDefaults: PartnerTierDefaults;
  changeHistory: PartnerTierChangeHistory[];
  effectiveDate: string;
  judgmentCallHold?: {
    holdActive: boolean;
    incidentReason?: string;
    investigationStatus?: string;
  };
  disputeStatus?: {
    hasDispute: boolean;
    partnerNote?: string;
    resolutionNote?: string;
  };
  lastUpdated: string;
}

export interface RecruitmentFunnelStageMetrics {
  stage: 'applied' | 'screening' | 'interviewing' | 'verifying' | 'offered' | 'activated';
  label: string;
  applicantCount: number;
  dropOffRatePercent: number;
  avgDaysInStage: number;
}

export interface MasterPartnerDirectoryRecord {
  id: string;
  partnerName: string;
  partnerPhone: string;
  email?: string;
  roles: ('surveyor' | 'technician' | 'supplier' | 'sales_rep')[];
  primaryRole: 'surveyor' | 'technician' | 'supplier' | 'sales_rep';
  role?: UserRole;
  primaryTerritory?: string;
  activeStatus: 'active' | 'suspended' | 'deactivated' | 'exit_in_progress';
  tier: 'tier_1_bronze' | 'tier_2_silver' | 'tier_3_gold' | 'tier_4_master';
  territoryOrSpecialty: string;
  zone: string;
  rating: number;
  completedJobsCount: number;
  activeJobsCount: number;
  activeLeadsCount: number;
  activePosCount: number;
  joinedDate: string;
  lastActive: string;
  kycVerified: boolean;
  wiremanLicenseVerified?: boolean;
  bankAccountVerified?: boolean;
}

export interface PartnerReassignmentAction {
  id: string;
  type: 'lead' | 'job' | 'po';
  itemId: string;
  itemTitle: string;
  currentRole: string;
  assignedToPartnerId?: string;
  assignedToPartnerName?: string;
  handoffNotes?: string;
  status: 'pending' | 'reassigned' | 'cancelled';
}

export interface PartnerFinalSettlement {
  pendingCommissionsAmount: number;
  retentionHoldDeduction: number;
  damageDeductions: number;
  netSettlementAmount: number;
  calculationBreakdownNote: string;
  isDisputed: boolean;
  disputeNote?: string;
  settlementStatus: 'calculated' | 'approved' | 'disputed' | 'paid_and_settled';
  payoutTransactionRef?: string;
  settledAt?: string;
}

export interface PartnerExitInterviewFeedback {
  satisfactionScore?: number;
  reasonsForLeaving?: string;
  suggestionsNote?: string;
  wouldRecommendAiec?: boolean;
}

export interface PartnerDeactivationExitRecord {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerPhone: string;
  roles: string[];
  exitType: 'voluntary' | 'performance_deactivation' | 'safety_violation' | 'administrative';
  exitReason: string;
  involuntaryFlag: boolean;
  immediateAccessRevocation: boolean;
  reassignmentActions: PartnerReassignmentAction[];
  finalSettlement: PartnerFinalSettlement;
  exitInterviewFeedback?: PartnerExitInterviewFeedback;
  accessRevokedTimestamp?: string;
  status: 'exit_initiated' | 'reassignments_pending' | 'settlement_pending' | 'fully_deactivated';
  createdDate: string;
}

// Module 16: Training & SOP Library Types (Prompts 151 & 152)
export interface TrainingKnowledgeCheck {
  id: string;
  timestampSeconds: number;
  question: string;
  questionHi?: string;
  questionMr?: string;
  options: string[];
  optionsHi?: string[];
  optionsMr?: string[];
  correctOptionIndex: number;
  explanation: string;
}

export interface TrainingLesson {
  id: string;
  trainingModuleId: string;
  lessonTitle: string;
  lessonTitleHi?: string;
  lessonTitleMr?: string;
  description: string;
  durationMinutes: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  referenceSheetTitle: string;
  referenceSheetContent: string;
  knowledgeChecks: TrainingKnowledgeCheck[];
  languageTracks: ('en' | 'hi' | 'mr')[];
  version: string;
}

export interface TerritoryNeedCoverageData {
  zoneId?: string;
  zoneName?: string;
  territory?: string;
  needLevel?: string;
  urgencyLevel?: 'high' | 'medium' | 'low';
  requiredRole?: string;
  requiredCount?: number;
  activeCount?: number;
  activePartnerCount?: number;
  gapCount?: number;
  openJobsCount?: number;
  applicantsInQueue?: number;
}

export interface TrainingModule {
  id: string;
  moduleTitle: string;
  moduleTitleHi?: string;
  moduleTitleMr?: string;
  topic: 'onboarding_basics' | 'safety_procedures' | 'customer_interaction' | 'product_knowledge';
  requiredForRoles: ('surveyor' | 'technician' | 'supplier' | 'sales_rep')[];
  isSafetyCritical: boolean;
  sequenceLockDependency?: string; // module_id that must be completed first
  sequenceLockDependencyTitle?: string;
  version: string;
  lessons: TrainingLesson[];
  estimatedMinutes: number;
  downloadableContentAvailable: boolean;
}

export interface PartnerLessonProgress {
  lessonId: string;
  playbackProgressSeconds: number;
  completed: boolean;
  knowledgeCheckResponses: Record<string, number>; // checkId -> selected option index
  completedAt?: string;
}

export interface PartnerModuleProgress {
  partnerId: string;
  moduleId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completionPercent: number;
  lessonProgress: Record<string, PartnerLessonProgress>;
  lastAccessedAt: string;
}

// Module 16: Prompt 153 - SOP Document Repository Types
export interface SopSection {
  sectionTitle: string;
  content: string;
  keyCheckpoints?: string[];
}

export interface SopVersionRecord {
  version: string;
  releaseDate: string;
  summaryOfChanges: string;
  author: string;
}

export interface SopDocument {
  id: string;
  sopCode: string;
  title: string;
  titleHi?: string;
  titleMr?: string;
  category: 'installation' | 'delivery' | 'safety' | 'shaft_survey' | 'emergency';
  currentVersion: string;
  effectiveDate: string;
  lastReviewedBy: string;
  downloadAvailableFlag: boolean;
  summary: string;
  sections: SopSection[];
  versionHistory: SopVersionRecord[];
  isBookmarked?: boolean;
  isDownloadedOffline?: boolean;
}

// Module 16: Prompt 154 - Quiz & Certification Test Types
export interface QuizQuestion {
  id: string;
  questionText: string;
  questionTextHi?: string;
  questionTextMr?: string;
  options: string[];
  optionsHi?: string[];
  optionsMr?: string[];
  correctOptionIndex: number;
  explanation: string;
}

export interface CertificationAssessment {
  id: string;
  moduleId: string;
  badgeIdToAward: string;
  title: string;
  titleHi?: string;
  titleMr?: string;
  passThresholdPercent: number;
  timeLimitMinutes: number;
  questions: QuizQuestion[];
  retakeCooldownHours: number;
  isSafetyCritical: boolean;
}

export interface AssessmentAttemptResult {
  id: string;
  assessmentId: string;
  partnerId: string;
  attemptNumber: number;
  scoreAchievedPercent: number;
  passed: boolean;
  answers: Record<string, number>;
  completedAt: string;
  nextRetakeAllowedAt?: string;
  flaggedDispute?: boolean;
  disputeReason?: string;
}

// Module 16: Prompt 155 - Certification Badge & Progress Types
export interface CertificationBadge {
  id: string;
  badgeCode: string;
  badgeName: string;
  badgeNameHi?: string;
  badgeNameMr?: string;
  category: 'safety' | 'technical' | 'survey' | 'quality';
  iconName: string;
  unlockedSkillTag: string;
  isTimeLimited: boolean;
  validityMonths?: number;
  description: string;
}

export interface PartnerBadgeRecord {
  id: string;
  partnerId: string;
  partnerName: string;
  badgeId: string;
  issueDate: string;
  expiryDate?: string;
  renewalStatus: 'active' | 'expiring_soon' | 'expired' | 'renewal_in_progress';
  certificateNumber: string;
}

// Module 16: Prompt 157 - Skill Matrix & Gap Analysis Types
export interface SkillCapabilityCategory {
  id: string;
  skillName: string;
  skillNameHi?: string;
  skillNameMr?: string;
  driveTypeTag: string;
  qualifiedTechniciansCount: number;
  pipelineDemandCount: number;
  demandVsSupplyRatio: number;
  trendDirection: 'improving' | 'stable' | 'declining' | 'critical_gap';
  isDecliningPriority?: boolean;
  recommendedTrainingModuleId?: string;
  category: 'drive_tech' | 'safety' | 'electronics' | 'structural' | 'survey';
}

export interface TechnicianSkillMatrixRow {
  partnerId: string;
  partnerName: string;
  role: UserRole;
  territory: string;
  mobileNumber?: string;
  skillProficiencies: Record<string, 'expert' | 'certified' | 'in_training' | 'gap' | 'exempt'>; // skillId -> proficiency
}

// Module 16: Prompt 158 - Training Compliance Tracker Types
export interface PartnerComplianceRecord {
  id: string;
  partnerId: string;
  partnerName: string;
  role: UserRole;
  territory: string;
  complianceStatus: 'fully_compliant' | 'non_compliant' | 'grace_period';
  nonComplianceReason: 'never_started' | 'failed_needs_coaching' | 'refresher_lapsed' | 'none';
  uncompletedModuleTitle?: string;
  uncompletedModuleId?: string;
  isSafetyCritical: boolean;
  dueDate?: string;
  lastReminderSentAt?: string;
  cohortGroupId?: string;
}

export interface ComplianceTrendMetric {
  month: string;
  complianceRatePercent: number;
  totalActiveTechnicians: number;
  compliantCount: number;
}

// Module 16: Prompt 159 - New SOP Rollout Notification Types
export interface SopRolloutNotification {
  id: string;
  sopDocumentId: string;
  sopCode: string;
  sopTitle: string;
  sopTitleHi?: string;
  sopTitleMr?: string;
  versionNumber: string;
  effectiveDate: string;
  affectedPartnerRoles: (UserRole | string)[];
  summaryOfChange: string;
  summaryOfChangeHi?: string;
  summaryOfChangeMr?: string;
  quizIdOnChangedPortion?: string;
  isUrgentExpedited: boolean;
  status: 'draft' | 'published' | 'rolled_back';
  createdDate: string;
  acknowledgedCount: number;
  totalAffectedPartners: number;
}

export interface PartnerRolloutAcknowledgment {
  id: string;
  rolloutId: string;
  partnerId: string;
  partnerName: string;
  partnerRole: UserRole;
  territory: string;
  status: 'pending' | 'acknowledged' | 'quiz_passed' | 'exempt_on_leave';
  acknowledgedAt?: string;
  quizScorePercent?: number;
}

// Module 16: Prompt 160 - Training Feedback Types
export interface TrainingModuleFeedback {
  id: string;
  trainingModuleId: string;
  trainingModuleTitle: string;
  partnerId: string;
  partnerName: string;
  partnerRole: UserRole;
  isAnonymous: boolean;
  clarityRating: number; // 1 to 5 stars
  relevanceRating: number; // 1 to 5 stars
  commentText: string;
  isCriticalSafetyIssue: boolean; // Flagged with elevated urgency for immediate Admin review
  disputedQuestionId?: string; // Optional direct link from quiz question dispute
  disputedQuestionText?: string;
  status: 'submitted' | 'under_review' | 'addressed_in_revision' | 'dismissed';
  createdAt: string;
  moderationFlag?: 'clean' | 'flagged_abusive' | 'hidden';
}

export interface TrainingFeedbackSummary {
  trainingModuleId: string;
  trainingModuleTitle: string;
  totalFeedbackCount: number;
  averageClarityRating: number;
  averageRelevanceRating: number;
  criticalSafetyIssueCount: number;
  responseRatePercent: number; // e.g. 34%
  totalLearnersCompleted: number;
  qualityStatus: 'excellent' | 'needs_revision' | 'critical_review_required';
}

// Module 17: Prompt 161 & 162 - Commission, Rewards & Payouts Types
export interface CommissionRule {
  id: string; // commission_rule_id
  ruleName: string;
  triggerEvent: 'surveyor_lead_capture' | 'deal_conversion' | 'technician_job_completion' | 'qc_inspection_passed' | 'referral_bonus' | 'maintenance_contract_renewed';
  triggerEventLabel: string;
  calculationType: 'fixed_amount' | 'percentage_of_value' | 'tiered_milestone';
  baseRateOrAmount: number; // e.g. 1500 for fixed, or 2.5 for percentage
  applicablePartnerTier: 'all' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  tierBonusMultiplier: number; // e.g. 1.0 for bronze, 1.15 for silver, 1.25 for gold, 1.4 for platinum, 1.5 for diamond
  ruleVersion: string; // e.g. "v2.1"
  isActive: boolean;
  stackingRule: 'stacks_with_others' | 'mutually_exclusive' | 'higher_takes_precedence';
  effectiveFromDate: string;
  advanceNoticeSent?: boolean;
  noticeNotes?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface CommissionRuleVersionHistory {
  id: string;
  ruleId: string;
  ruleName: string;
  ruleVersion: string;
  baseRateOrAmount: number;
  calculationType: 'fixed_amount' | 'percentage_of_value' | 'tiered_milestone';
  changedBy: string;
  changedAt: string;
  changeReason: string;
}

export interface CommissionPayoutEntry {
  id: string; // payout_entry_id
  partnerId: string;
  partnerName: string;
  partnerRole: UserRole;
  partnerTier?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  triggerType: 'surveyor_lead_capture' | 'deal_conversion' | 'technician_job_completion' | 'qc_inspection_passed' | 'referral_bonus' | 'maintenance_contract_renewed' | 'dispute_adjustment_credit';
  triggerTypeLabel: string;
  referenceDocNo: string; // Deal ID, Job ID, or Referral Code
  referenceDocId?: string;
  dealOrJobValue?: number;
  amount: number;
  status: 'pending_approval' | 'approved_pending_payout' | 'paid' | 'held_dispute' | 'rejected';
  appliedRuleId: string;
  appliedRuleVersion: string;
  earnedAt: string;
  approvedAt?: string;
  paidAt?: string;
  payoutBatchId?: string;
  notes?: string;
  isStatisticalAnomaly?: boolean;
  anomalyNote?: string;
  relatedOpenQcIssue?: string;
  relatedDisputeId?: string;
  isExpeditedHardship?: boolean;
}

export interface AutomatedDisbursementRecord {
  id: string; // disbursement_id
  payoutEntryIds: string[];
  partnerId: string;
  partnerName: string;
  partnerRole: UserRole;
  bankAccountMasked: string;
  ifscCode: string;
  upiId?: string;
  disbursementMethod: 'bank_neft' | 'bank_rtgs' | 'upi_instant';
  amount: number;
  status: 'initiated' | 'processing' | 'completed' | 'failed';
  failureReason?: string;
  batchId: string;
  initiatedAt: string;
  completedAt?: string;
  retryCount: number;
}

export interface CompetitionContest {
  id: string; // contest_id
  title: string;
  description: string;
  category: 'surveyor' | 'technician' | 'all_partners';
  metricType: 'conversion_value' | 'lead_count' | 'zero_defect_jobs' | 'speed_score';
  metricUnit: string;
  rewardPool: string;
  firstPrize: string;
  secondPrize: string;
  thirdPrize: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  participantsCount: number;
}

export interface LeaderboardEntry {
  id: string;
  contestId: string;
  rank: number;
  partnerId: string;
  partnerName: string;
  partnerRole: UserRole;
  partnerTier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  scoreValue: number;
  scoreUnit: string;
  gapToNextRank: number;
  trend: 'up' | 'down' | 'same';
  lastUpdated: string;
}

export interface UnifiedBadgeMilestone {
  id: string;
  badgeCode: string;
  badgeName: string;
  badgeNameHi?: string;
  badgeNameMr?: string;
  category: 'performance' | 'training' | 'tenure' | 'safety' | 'quality';
  rarityTier: 'legendary' | 'epic' | 'rare' | 'common';
  rarityPercent: number; // e.g. 4.2% of partner base holds this
  iconName: string;
  description: string;
  isEarned: boolean;
  earnedDate?: string;
  certificateNumber?: string;
  currentProgress: number;
  targetProgress: number;
  unitLabel: string;
  earningCriteriaVersion?: string;
}

export interface CustomerProjectSummary {
  id: string;
  customerId: string;
  customerName: string;
  projectName: string;
  siteAddress: string;
  buildingType: string;
  elevatorType: string;
  projectMode: 'active_installation' | 'ongoing_amc';
  currentStageCode: string;
  currentStageName: string;
  overallProgressPercent: number;
  statusTone: 'normal' | 'delayed' | 'paused' | 'ahead';
  statusMessage: string;
  nextMilestoneName: string;
  nextMilestoneDueDate: string;
  nextPaymentDueAmount: number;
  nextPaymentDueDate: string;
  nextPaymentTitle: string;
  unreadNotificationCount: number;
  assignedLeadManagerName: string;
  assignedLeadManagerPhone: string;
  contractDocUrl?: string;
  quotationDocUrl?: string;
  installationMilestones: {
    id: string;
    stageCode: string;
    stageName: string;
    description: string;
    status: 'completed' | 'in_progress' | 'upcoming' | 'delayed';
    estimatedDate: string;
    actualDate?: string;
    completedByTechName?: string;
    photoHighlights?: { title: string; url: string; caption: string; geotag: string; date: string }[];
    technicalDetails?: string[];
    linkedDocTitle?: string;
  }[];
  amcInfo?: {
    planName: string;
    contractEndDate: string;
    nextRoutineServiceDate: string;
    lastServiceDate: string;
    breakdownTicketsCount: number;
  };
}

export interface PayoutStatementSummary {
  partnerId: string;
  partnerName: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  totalEarned: number;
  totalDisbursed: number;
  pendingPayout: number;
  tdsDeducted: number;
  netDisbursed: number;
  entriesCount: number;
}

export interface TdsStatementRecord {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerPan: string;
  finYear: string; // e.g. "FY 2026-27"
  quarterLabel: string; // e.g. "Q1 (Apr-Jun)", "Q2 (Jul-Sep)", "Annual FY26"
  applicableSection: string; // e.g. "Sec 194H (Commission)" or "Sec 194C (Contractor)"
  applicableRatePercent: number; // e.g. 5.0
  grossPayoutAmount: number;
  tdsDeductedAmount: number;
  exemptionThreshold: number; // e.g. 15000
  isBelowThreshold: boolean;
  form16aCertificateNo?: string;
  issuedDate?: string;
  aiEcTanNumber: string; // "PNEA12345B"
  status: 'filed_certificate_issued' | 'pending_quarterly_filing' | 'threshold_exempt';
}

export interface PayoutDisputeRecord {
  id: string;
  payoutEntryId: string;
  payoutReferenceNo: string;
  partnerId: string;
  partnerName: string;
  partnerRole: UserRole;
  disputeSubject: string;
  partnerQueryText: string;
  disputedAmount: number;
  status: 'open_pending_review' | 'under_investigation' | 'adjustment_approved' | 'explanation_provided' | 'escalated';
  slaDeadline: string;
  isSlaBreached?: boolean;
  resolutionType?: 'adjustment_approved' | 'explanation_provided' | 'escalated' | 'dismissed';
  resolutionNotes?: string;
  correctiveAdjustmentAmount?: number;
  isSystemicRuleIssue?: boolean;
  createdAt: string;
  resolvedAt?: string;
  auditMessages: {
    senderName: string;
    senderRole: string;
    timestamp: string;
    messageText: string;
  }[];
}

export interface CustomerVaultDocument {
  id: string;
  customerId: string;
  projectId: string;
  projectName: string;
  documentTitle: string;
  category: 'quotation' | 'contract' | 'invoice_receipt' | 'compliance_license' | 'warranty_amc' | 'handover_cert' | 'survey_spec';
  fileSize: string;
  issueDate: string;
  validUntilDate?: string;
  downloadUrl: string;
  isSuperseded?: boolean;
  supersededByDocTitle?: string;
  versionTag: string;
  verificationHash: string;
}

export interface CustomerPaymentInstallment {
  id: string;
  customerId: string;
  projectId: string;
  projectName: string;
  stageCode: string;
  stageTitle: string;
  milestoneTrigger: string;
  percentageShare: number;
  amount: number;
  dueDate: string;
  status: 'paid' | 'due' | 'upcoming' | 'under_reconciliation' | 'disputed';
  paidDate?: string;
  paymentMethod?: string;
  transactionRef?: string;
  receiptDocTitle?: string;
  loanOptionEligible?: boolean;
  disputeNotes?: string;
}

export interface CustomerSupportTicket {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  projectId: string;
  projectName: string;
  category: 'emergency_safety' | 'breakdown_malfunction' | 'noise_vibration' | 'routine_service' | 'billing_payment' | 'general_inquiry';
  urgency: 'critical_emergency' | 'high' | 'normal' | 'low';
  subject: string;
  description: string;
  status: 'submitted' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  estimatedResponseTime: string;
  createdAt: string;
  assignedTechName?: string;
  assignedTechPhone?: string;
  attachments?: { name: string; url: string; type: 'image' | 'video' | 'pdf' }[];
  activityLog: { timestamp: string; author: string; role: string; message: string }[];
}

export interface CustomerSupportChatMessage {
  id: string;
  sender: 'customer' | 'bot' | 'human_agent';
  senderName: string;
  messageText: string;
  timestamp: string;
  quickReplyOptions?: string[];
}

export interface CustomerSupportChatThread {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  projectId: string;
  projectName: string;
  status: 'bot_handling' | 'human_assigned' | 'resolved';
  assignedAgentName?: string;
  assignedAgentAvatar?: string;
  contextSnapshot: {
    projectStage: string;
    amcStatus: string;
    pendingDueAmount: number;
    openTicketsCount: number;
  };
  messages: CustomerSupportChatMessage[];
}

export interface CustomerFeedbackEntry {
  id: string;
  customerId: string;
  customerName: string;
  projectId: string;
  projectName: string;
  interactionContext: 'post_handover' | 'post_service_visit' | 'amc_periodic' | 'installation_phase';
  overallScore: number;
  ratings: {
    installationQuality: number;
    communication: number;
    timeliness: number;
    valueForMoney: number;
  };
  commentText: string;
  flaggedTechName?: string;
  adminOutreachRequired: boolean;
  createdAt: string;
}

export interface CustomerAmcBooking {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  projectName: string;
  siteCity?: string;
  liftModelName?: string;
  planName?: string;
  annualFeeAmount?: number;
  startDate?: string;
  expiryDate?: string;
  paymentStatus?: 'paid' | 'pending' | 'failed';
  status: 'active' | 'scheduled_renewal' | 'expired' | 'confirmed';
  breakdownVisitsIncluded?: number;
  breakdownVisitsUsed?: number;
  
  // Optional booking interaction fields
  projectId?: string;
  siteAddress?: string;
  amcPlanName?: string;
  amcCoverageStatus?: string;
  amcExpiryDate?: string;
  bookingType?: 'routine_preventive' | 'emergency_breakdown' | 'annual_audit' | 'safety_governor_inspection';
  preferredDate?: string;
  preferredTimeSlot?: string;
  assignedTechId?: string;
  assignedTechName?: string;
  assignedTechPhone?: string;
  assignedTechPhoto?: string;
  technicianEtaMinutes?: number;
  specialNotes?: string;
  createdAt?: string;
}

export interface CommissionPayoutSummary {
  partnerId?: string;
  periodLabel?: string;
  grossEarned?: number;
  tdsDeducted?: number;
  disputeHolds?: number;
  netPayable?: number;
  paidAmount?: number;
  pendingAmount?: number;
  totalPendingAmount?: number;
  totalPendingCount?: number;
  totalApprovedAmount?: number;
  totalApprovedCount?: number;
  totalPaidThisMonth?: number;
  totalPaidCount?: number;
  heldDisputeCount?: number;
  categoryBreakdown?: any[];
  breakdownByStage?: any[];
}

export interface CustomerReferralEntry {
  id: string;
  customerId: string;
  customerName: string;
  referralCode: string;
  referredName: string;
  referredPhone: string;
  referredCity: string;
  referredProjectName?: string;
  status: 'invited' | 'survey_completed' | 'converted' | 'reward_issued';
  estimatedCommissionReward: number;
  paidCommissionReward: number;
  createdAt: string;
  convertedAt?: string;
}

export interface CustomerInAppNotification {
  id: string;
  customerId: string;
  title: string;
  message: string;
  category: 'payment_reminder' | 'milestone_update' | 'delivery_tracking' | 'support_ticket' | 'amc_renewal' | 'promotional';
  readStatus: boolean;
  timestamp: string;
  relatedScreenDeeplink: string;
  isTransactional: boolean;
}

export interface CustomerNotificationPreferences {
  customerId: string;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  allowPromotional: boolean;
  allowMilestones: boolean;
  allowPaymentReminders: boolean; // transactional
}

export interface AutomationRuleCategorySummary {
  id: string;
  categoryName: string;
  categoryKey: 'communication_sequences' | 'payment_reminders' | 'auto_po_triggers' | 'training_refreshers' | 'contest_lifecycle' | 'custom_workflows';
  activeRulesCount: number;
  healthStatus: 'healthy' | 'degraded' | 'paused' | 'critical';
  executionsToday: number;
  successRatePercent: number;
  isPausedGlobally: boolean;
  lastTriggeredAt: string;
  description: string;
}

export interface AutomationRuleActivityLog {
  id: string;
  ruleCategoryKey: string;
  ruleName: string;
  triggerEvent: string;
  actionTaken: string;
  targetEntity: string;
  status: 'success' | 'failed' | 'paused_skipped' | 'warning';
  timestamp: string;
  latencyMs: number;
}

export interface CustomWorkflowTriggerRule {
  id: string;
  name: string;
  description: string;
  triggerEvent: string;
  conditions: { field: string; operator: 'equals' | 'greater_than' | 'contains' | 'is_true'; value: string }[];
  actions: { type: 'send_whatsapp' | 'notify_admin' | 'auto_reassign' | 'create_escalation' | 'trigger_po_draft'; details: string }[];
  status: 'active' | 'draft' | 'paused' | 'archived';
  executionsCount: number;
  lastExecutedAt?: string;
  createdAt: string;
}

export interface TechnicalIncidentLog {
  id: string;
  integrationName: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  status: 'investigating' | 'identified' | 'resolved';
  summary: string;
  queuedRequestsReprocessingNeeded: boolean;
}

export interface IntegrationTechnicalHealth {
  id: string;
  integrationName: string;
  providerCategory: 'payment_gateway' | 'whatsapp_api' | 'maps_geolocation' | 'loan_partner_api' | 'sms_gateway' | 'cloud_database';
  technicalStatus: 'operational' | 'degraded' | 'down';
  providerReportedStatus: 'operational' | 'degraded' | 'down';
  providerStatusUrl: string;
  uptimePct: number;
  recentErrorRate: number;
  aiecObservedErrorRate: number;
  lastIncidentTimestamp: string;
  activeIncidentsCount: number;
}

export interface AutomatedActionAuditEntry {
  auditEntryId: string;
  automationSource: string;
  ruleId: string;
  ruleName: string;
  triggeringCondition: string;
  actionTaken: string;
  affectedRecordId: string;
  category: 'message_sent' | 'po_drafted' | 'payout_initiated' | 'stage_transitioned' | 'escalation_triggered' | 'manual_override';
  timestamp: string;
  payloadDetails: string;
  executionStatus: 'success' | 'failed' | 'overridden';
  wasManualOverride: boolean;
  overrideReason?: string;
}

export interface ManualOverrideLogEntry {
  overrideId: string;
  targetRecordId: string;
  targetModule: 'crm_leads' | 'partner_payouts' | 'qc_inspection' | 'po_procurement' | 'sla_timers';
  overrideAction: string;
  mandatoryReason: string;
  adminId: string;
  adminName: string;
  previousState: string;
  forcedNextState: string;
  timestamp: string;
  isSafetyCriticalBlocked: boolean;
  downstreamEffectsPreview: string[];
}

export interface ApiIntegrationConfig {
  id: string;
  integrationName: string;
  providerCategory: 'payment_gateway' | 'whatsapp_api' | 'sms_gateway' | 'maps_geolocation' | 'loan_partner_api' | 'banking_disbursement_rails' | 'cloud_database';
  connectionStatus: 'connected' | 'degraded' | 'disconnected' | 'testing';
  lastSyncTimestamp: string;
  credentialLastRotated: string;
  sandboxModeEnabled: boolean;
  maskedApiKey: string;
  maskedSecretKey: string;
  webhookEndpointUrl: string;
  environmentLabel: string;
  syncHealthPct: number;
  rotationInProgress?: boolean;
}

export interface AutomationTestScenario {
  testScenarioId: string;
  scenarioTitle: string;
  scenarioCategory: 'crm_lead_intake' | 'overdue_payment' | 'delivery_delay' | 'po_auto_draft' | 'payout_commission';
  sampleDataDescription: string;
  samplePayloadJson: string;
  testedRuleReference: string;
  testedRuleName: string;
  expectedOutcome: string;
  simulatedOutcome: string;
  expectedVsActualMatch: boolean;
  promotionStatus: 'draft_in_sandbox' | 'tested_passed' | 'promoted_to_production';
  lastTestedAt: string;
  testRunLog: string[];
}

export interface BrandVersionRecord {
  versionId: string;
  updatedAt: string;
  updatedBy: string;
  companyName: string;
  ownerName: string;
  gstin: string;
  registeredAddress: string;
  logoAssetUrl: string;
  changeSummary: string;
}

export interface CompanyProfileConfig {
  companyName: string;
  ownerName: string;
  tagline: string;
  gstin: string;
  registeredAddress: string;
  supportPhone: string;
  supportEmail: string;
  websiteUrl: string;
  logoAssetUrl: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  activeThemeMode: string;
  versionHistory: BrandVersionRecord[];
}

export interface PermissionModuleAction {
  moduleId: string;
  moduleName: string;
  canRead: boolean;
  canWrite: boolean;
  canApprove: boolean;
  canOverride: boolean;
  canExport: boolean;
}

export interface RolePermissionConfig {
  roleId: string;
  roleName: string;
  roleDescription: string;
  isSystemProtectedRole: boolean;
  userCount: number;
  modulePermissions: PermissionModuleAction[];
  updatedAt: string;
  updatedBy: string;
}

export interface UserPermissionOverride {
  overrideId: string;
  userId: string;
  userName: string;
  userRole: string;
  grantedModuleId: string;
  grantedAction: 'canRead' | 'canWrite' | 'canApprove' | 'canOverride' | 'canExport';
  mandatoryReason: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
  isActive: boolean;
}

export interface PermissionChangeAuditEntry {
  auditId: string;
  timestamp: string;
  changedByAdmin: string;
  targetRoleOrUser: string;
  changeType: 'role_permission_updated' | 'user_override_granted' | 'user_override_revoked';
  description: string;
  previousPermissionState: string;
  newPermissionState: string;
}

// Single-Person Monitor Control Panel Interfaces
export interface MonitorSignalConfig {
  signalId: string;
  title: string;
  category: 'business_health' | 'automation_health' | 'financial_health' | 'workforce_health' | 'critical_alerts';
  currentValue: string;
  targetValue: string;
  trendDirection: 'up' | 'down' | 'stable';
  trendPercentage: string;
  status: 'healthy' | 'warning' | 'critical';
  isConfiguredActive: boolean;
  targetScreenTab: string;
  lastUpdated: string;
  description: string;
}

export interface DailyMonitorCheckLog {
  checkLogId: string;
  timestamp: string;
  checkedByAdmin: string;
  note: string;
  allClearAcknowledged: boolean;
  criticalSignalsCountAtCheck: number;
}

export interface BackupMonitorContact {
  backupId: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  isEmergencyViewGranted: boolean;
  grantedUntil?: string;
  notes: string;
}

// Data Privacy & Consent Management Interfaces
export interface DataSubjectConsentRecord {
  subjectId: string;
  subjectName: string;
  subjectType: 'customer' | 'partner_technician' | 'surveyor' | 'supplier';
  marketingOptIn: boolean;
  gpsTrackingConsent: boolean;
  documentProcessingConsent: boolean;
  thirdPartySharingConsent: boolean;
  consentTimestamp: string;
  ipAddress: string;
}

export interface DataSubjectRequest {
  requestId: string;
  subjectName: string;
  subjectEmail: string;
  subjectPhone: string;
  requestType: 'data_access' | 'data_rectification' | 'data_erasure_deletion' | 'consent_withdrawal';
  status: 'received' | 'under_review' | 'partially_fulfilled' | 'completed' | 'rejected_legal_retention';
  requestDetails: string;
  legalRetentionExemptionNote?: string;
  receivedAt: string;
  responseDueDate: string;
  resolvedAt?: string;
}

export interface DataRetentionCategoryConfig {
  categoryId: string;
  categoryName: string;
  retentionPeriodMonths: number;
  legalBasis: string;
  autoPurgeEnabled: boolean;
  totalRecordsAffected: number;
}

export interface PrivacyPolicyVersionRecord {
  versionId: string;
  versionTag: string;
  effectiveDate: string;
  publishedBy: string;
  changesSummary: string;
  documentUrl: string;
}

// Security & Session Management Interfaces
export interface RoleTwoFactorPolicy {
  roleId: string;
  roleName: string;
  enforcementMode: 'mandatory' | 'optional' | 'disabled';
  method: 'authenticator_app' | 'sms_otp' | 'email_otp';
  userCount: number;
  compliantUserCount: number;
}

export interface ActiveUserSession {
  sessionId: string;
  userId: string;
  userName: string;
  userRole: string;
  deviceModel: string;
  browserOs: string;
  ipAddress: string;
  locationCity: string;
  loginTimestamp: string;
  lastActiveTimestamp: string;
  isCurrentSession: boolean;
  isSuspiciousLocation: boolean;
}

export interface SecurityEventLog {
  eventId: string;
  timestamp: string;
  userId: string;
  userName: string;
  eventType: 'failed_login' | 'unusual_location' | 'session_revoked' | 'password_reset' | 'mfa_bypassed_exception';
  severity: 'info' | 'warning' | 'critical';
  ipAddress: string;
  details: string;
  resolvedStatus: 'unresolved' | 'investigated_cleared' | 'blocked';
}

export interface PasswordPolicyConfig {
  minLength: number;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  mandatoryRotationDays: number;
  maxFailedAttemptsBeforeLockout: number;
}

// Backup & Data Export Interfaces
export interface DatabaseBackupRunRecord {
  backupRunId: string;
  timestamp: string;
  status: 'completed_success' | 'failed_infrastructure' | 'in_progress';
  backupSizeBytes: string;
  storageLocation: string;
  type: 'automated_daily' | 'manual_snapshot' | 'pre_deployment';
  checksumHash: string;
  errorMessage?: string;
}

export interface DataExportJobRecord {
  exportJobId: string;
  requestedBy: string;
  category: 'full_database' | 'accounting_gst' | 'customer_leads' | 'site_qc_inspections';
  format: 'csv_spreadsheet' | 'json_structured' | 'pdf_archive';
  status: 'queued' | 'processing' | 'ready_for_download' | 'failed';
  progressPercent: number;
  fileSizeBytes: string;
  downloadUrl?: string;
  requestedAt: string;
  expiresAt: string;
}

export interface DisasterRestorePointInfo {
  lastRestorePointTimestamp: string;
  rpoMinutes: number;
  rtoMinutes: number;
  autoBackupScheduleCron: string;
  totalBackupsRetained: number;
  isDisasterRecoveryTested: boolean;
  lastDrTestDate: string;
}

// Subscription/Billing (SaaS Ops) Interfaces
export interface SaaSUsageServiceConfig {
  serviceId: string;
  serviceName: string;
  category: 'cloud_hosting' | 'messaging_api' | 'payment_gateway' | 'ai_studio_gemini';
  currentTier: string;
  monthlyCostInr: number;
  monthlyUsageMetric: string;
  usagePercent: number;
  renewalDate: string;
  paymentStatus: 'active_auto_debit' | 'card_expiring_soon' | 'billing_failed_alert';
  costOptimizationAdvice: string;
}

export interface SaaSBillingInvoiceRecord {
  invoiceId: string;
  serviceName: string;
  billingPeriod: string;
  amountInr: number;
  gstinNumber: string;
  taxInvoiceUrl: string;
  paymentStatus: 'paid' | 'pending' | 'failed';
  paidAt: string;
}

// Legal/Contract Templates Repository Interfaces
export interface LegalContractTemplateRecord {
  templateId: string;
  title: string;
  category: 'customer_installation' | 'amc_service' | 'supplier_sla' | 'partner_onboarding' | 'nda_privacy';
  currentVersion: string;
  effectiveDate: string;
  lastLegalReviewDate: string;
  reviewedByCounsel: string;
  applicableStates: string[];
  isActiveDefault: boolean;
  bodyTextSnippet: string;
}

export interface StateLiftActClauseItem {
  clauseId: string;
  stateName: string;
  actReferenceSection: string;
  clauseTitle: string;
  mandatoryRequirement: string;
  clauseText: string;
  lastUpdated: string;
}

export interface LegalReviewAuditLog {
  reviewId: string;
  templateId: string;
  reviewDate: string;
  counselName: string;
  reviewStatus: 'approved_unconditional' | 'modifications_required' | 'superseded';
  comments: string;
}

// Help, FAQ & Support Interfaces (Prompt 199)
export interface HelpArticleItem {
  id: string;
  title: string;
  category: 'leads_crm' | 'installation_sop' | 'amc_breakdown' | 'payments_gst' | 'system_portal' | 'general';
  relevantRoles: ('admin' | 'surveyor' | 'technician' | 'customer' | 'supplier' | 'partner' | 'qc_inspector')[];
  content: string;
  version: string;
  lastReviewedDate: string;
  helpfulCount: number;
  notHelpfulCount: number;
  tags: string[];
}

export interface SupportTicketOrChatEscalation {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  subject: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'escalated_to_phone';
  createdAt: string;
  messages: { sender: string; timestamp: string; text: string; isAdminResponse?: boolean }[];
}

export interface HelpTopicSuggestion {
  id: string;
  suggestedByRole: string;
  suggestedTopicTitle: string;
  description: string;
  status: 'pending_review' | 'added_to_kb' | 'declined';
  submittedAt: string;
}

// App Version, Changelog & Feedback Interfaces (Prompt 200)
export interface AppChangelogEntry {
  id: string;
  version: string;
  releaseDate: string;
  title: string;
  summary: string;
  type: 'workflow_change' | 'new_feature' | 'security_hardening' | 'bug_fix' | 'performance_boost';
  impactedRoles: string[];
  detailedPoints: string[];
  compatibilityNotes?: string;
}

export interface AppFeedbackSubmission {
  id: string;
  submittedByUserId: string;
  submittedByUserName: string;
  userRole: string;
  category: 'ui_ux_improvement' | 'feature_request' | 'performance' | 'bug_report' | 'general_idea';
  title: string;
  description: string;
  ratingStars: number;
  submittedAt: string;
  adminStatus: 'new' | 'under_review' | 'planned' | 'duplicate_merged' | 'completed';
  duplicateTag?: string;
}

export interface AppVersionStatus {
  currentVersion: string;
  latestAvailableVersion: string;
  isUpdateAvailable: boolean;
  lastCheckedTimestamp: string;
  minSupportedOS: string;
  deviceCompatibilityStatus: 'compatible_optimal' | 'compatible_legacy' | 'unsupported_device';
}


























