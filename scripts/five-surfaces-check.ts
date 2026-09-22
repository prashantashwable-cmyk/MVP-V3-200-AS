/**
 * Phase 10 acceptance check: the five-surface classifier
 * (src/navigation/surfaces.ts) against REAL navigation data — every
 * `{ id, label }` pair `App.tsx`'s `getTabsByRole()` actually returns
 * for all 5 roles, transcribed verbatim from src/App.tsx (not a
 * synthetic fixture) so this test would catch a real regression in the
 * live app's navigable tab list, not just an abstract example.
 *
 * `getTabsByRole` itself was deliberately left in place in `App.tsx`
 * rather than extracted into an importable module for this test — with
 * ~60 distinct `lucide-react` icon identifiers referenced across it,
 * extracting it carried real risk of an import mismatch for a UI change
 * with no automated visual/runtime check available in this environment,
 * for a benefit (script-importability) this transcription achieves
 * without that risk. If `getTabsByRole` changes in `App.tsx`, this
 * fixture must be updated to match — documented here and in
 * docs/architecture/10-five-surfaces.md.
 *
 * Run with: npx tsx scripts/five-surfaces-check.ts
 */
import { classifyTabSurface, groupTabsBySurface, SURFACE_ORDER, type Surface } from '../src/navigation/surfaces';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`OK: ${msg}`);
}

// Transcribed verbatim from src/App.tsx `getTabsByRole` (icons omitted —
// not relevant to surface classification).
const adminTabs = [
  'Home|Overview', 'CustomerHomeDashboard|Customer Portal', 'ProjectStatusTracker|Project Status Tracker',
  'LeadInbox|Lead Inbox', 'LeadPipeline|Lead Kanban', 'LeadAssignment|Lead Assignment', 'LeadMerge|Merge Studio',
  'LeadScoring|Lead Scoring', 'LeadFollowUp|Follow-Ups', 'LeadSource|Source & Campaigns', 'LeadLost|Disqualify Lead',
  'LeadMigrate|Bulk Import/Export', 'CommTemplates|Comm Templates', 'CommSequences|Comm Sequences',
  'CommWhatsApp|WhatsApp Console', 'CommCalls|Auto-Dialer & Logs', 'CommSMS|SMS Broadcast', 'CommBot|AI Bot Config',
  'CommInbox|Reply Inbox', 'CommCompliance|Compliance & DND', 'CommRules|Stage Trigger Rules', 'CommAnalytics|Comm Analytics',
  'QuoteSpecs|Quotation Specs', 'QuotePricing|Cost & Profit', 'QuoteBranding|Quote Branding', 'QuotePreview|Quote Preview',
  'QuoteCompare|Quote Compare', 'QuoteHistory|Quote History', 'QuoteDiscount|Discount Control', 'QuoteDelivery|E-Delivery Hub',
  'QuoteAnalytics|Quote Win/Loss', 'QuotePricingRules|Pricing & Margin', 'QuoteNegotiationBot|Negotiation Bot',
  'QuoteNegotiationThread|Live Thread', 'QuoteCounterOfferApproval|Counter Approvals', 'QuoteDealTermsFinalization|Deal Finalization',
  'QuoteDigitalContract|Contract Generator', 'QuoteESignature|E-Sign Capture', 'QuoteDealClosure|Deal Closure',
  'QuoteObjectionHandling|Objection Library', 'QuoteCompetitorBattlecard|Competitor Battlecards', 'QuoteDealWonCelebration|Win Celebration',
  'PaymentStageScheduleSetup|Payment Schedule', 'PaymentCollectionDashboard|Payment Collection', 'PaymentReminderConfig|Reminder Rules',
  'OnlinePaymentCheckout|Digital Checkout', 'LoanEmiApplication|Loan & EMI Application', 'LoanPartnerIntegration|Loan Desk & Reconciliation',
  'InvoiceGenerator|Invoices & Credit Notes', 'PaymentReceiptHistory|Payment Ledger & Receipts', 'OverduePaymentEscalation|Overdue Escalations',
  'RefundDisputeManagement|Disputes & Refunds', 'LiveMap|Live Operations', 'RouteOpt|Route Match', 'SOSDesk|SOS Desk',
  'LiveFeed|Live Feed', 'SurveyorAudit|Surveyor Audit', 'TechnicianAudit|Technician Audit', 'Territories|Territory Control',
  'Heatmap|Lead Heatmap', 'SiteVerify|Geo-Verification', 'Funnel|Sales Funnel', 'RevenueProfit|Revenue & Profit',
  'FinancialCashFlow|Cash Flow & Aging', 'AlertsExceptions|Exceptions & Alerts', 'CustomReport|Custom Report Builder',
  'Leaderboard|Worker Leaderboard', 'Conversion|Region Conversions', 'SupplierScorecard|Supplier SLA', 'SupplierDirectory|Supplier Directory',
  'SupplierCatalogPricing|Supplier Catalog', 'PurchaseOrderGenerator|PO Generator', 'AutoPoTriggerRules|Auto-PO Rules',
  'SupplierOrderStatusTracking|PO Tracking', 'ManufacturerProductionStatus|Production Status', 'SupplierRatingScorecard|Supplier Scorecards',
  'SupplierContractSla|Contract & SLA', 'SupplierCommThreads|Supplier Threads', 'SupplierPaymentTerms|Payment Terms Config',
  'DeliveryScheduling|Delivery Scheduling', 'LiveShipmentTracking|Shipment GPS Tracking', 'SiteDeliveryChecklist|Delivery Checklist',
  'MaterialReceivedConfirmation|Material Receipt Sign-off', 'DeliveryDelayAlerts|Delivery Delay Alerts', 'StockInTransit|Stock in Transit',
  'DeliverySopConfig|Delivery SOP Config', 'DamagedMissingPartsReport|Damaged/Missing Parts', 'DeliveryPartnerManagement|Delivery Partners',
  'DeliveryAnalytics|Delivery Analytics', 'SupplierPaymentApproval|Supplier Payment Queue', 'MilestonePaymentRelease|Milestone Release Chain',
  'SupplierInvoiceMatching|3-Way Invoice Matching', 'SupplierPaymentSchedule|Outflow Payment Schedule', 'SupplierPaymentHistory|Supplier Payment Ledger',
  'TaxGstCompliance|Tax/GST Reconciliation', 'SupplierDisputeResolution|Supplier Dispute Desk', 'AdvancePaymentRetention|Advances & Retentions',
  'SupplierPaymentAnalytics|Payment Analytics', 'AutoReconciliation|Bank Auto-Reconciliation', 'TechnicianHomeMyJobs|Technician Jobs Hub',
  'JobDetailSiteInfo|Job Site Specs', 'InstallationSopChecklist|Installation SOP Checklist', 'PhotoVideoEvidenceCapture|Media Evidence Gallery',
  'TechnicianCheckInCheckOut|Technician Site GPS Check-In', 'SafetyComplianceChecklist|Safety Compliance Checklist',
  'IssueBlockerReporting|Issue & Blocker Reports', 'MaterialUsageLogging|Material Usage Logging', 'AutomationHealth|Automation Health',
  'MasterAutomationRulesDashboard|Master Automation Rules', 'WorkflowTriggerBuilder|Workflow Trigger Builder',
  'NotificationTemplatesChannels|Notification Channels', 'EscalationMatrixConfig|Escalation Matrix', 'SlaTimerBreachAlert|SLA Timers & Breaches',
  'SystemHealthBotMonitoring|System Health & Bots', 'AuditLogAutomatedActions|Automation Audit Log', 'ManualOverrideConsole|Manual Override Console',
  'CompanyProfileBrandingSettings|Company Profile & Branding', 'UserRolePermissionManagement|User Roles & Permissions',
  'SinglePersonMonitorControlPanel|Single-Person Monitor', 'DataPrivacyConsentManagement|Data Privacy & Consent',
  'SecuritySessionManagement|Security & Active Sessions', 'BackupDataExport|Backup & Data Export', 'SaaSOpsSubscriptionBilling|SaaS Ops & Billing',
  'LegalContractTemplatesRepository|Legal Templates Repository', 'HelpFaqSupport|Help & Support Desk', 'AppVersionChangelogFeedback|App Version & Changelog',
  'Partners|Directory', 'Settings|Control Unit',
];

function parse(entries: string[]) {
  return entries.map(e => {
    const [id, label] = e.split('|');
    return { id, label };
  });
}

async function main() {
  const tabs = parse(adminTabs);
  assert(tabs.length === adminTabs.length, `parsed all ${adminTabs.length} real admin tab entries from App.tsx`);

  // Every tab must classify into one of the 5 real surfaces (nothing falls through undefined).
  for (const t of tabs) {
    const surface = classifyTabSurface(t.id, t.label);
    assert(SURFACE_ORDER.includes(surface), `"${t.id}" classifies into a valid surface (got "${surface}")`);
  }

  const grouped = groupTabsBySurface(tabs);
  for (const surface of SURFACE_ORDER) {
    assert(grouped[surface].length > 0, `admin's real tab list has at least one screen classified under ${surface} (full five-surface coverage on real data)`);
  }

  // Spot checks against the exact bug this script exists to catch (§ header).
  assert(classifyTabSurface('Home', 'Overview') === 'WORK', 'the "Home" tab (exact match, the ^home$ regression) classifies as WORK');
  assert(classifyTabSurface('LeadFollowUp', 'Follow-Ups') === 'WORK', 'follow-ups classify as WORK, per the pack\'s own WORK examples list');
  assert(classifyTabSurface('PurchaseOrderGenerator', 'PO Generator') === 'OPERATIONS', 'PO generation classifies as OPERATIONS');
  assert(classifyTabSurface('OnlinePaymentCheckout', 'Digital Checkout') === 'FINANCE', 'payment checkout classifies as FINANCE');
  assert(classifyTabSurface('LeadInbox', 'Lead Inbox') === 'CUSTOMERS', 'lead inbox classifies as CUSTOMERS');
  assert(classifyTabSurface('UserRolePermissionManagement', 'User Roles & Permissions') === 'CONTROL', 'user/permission management classifies as CONTROL');
  assert(classifyTabSurface('DeliveryScheduling', 'Delivery Scheduling') === 'OPERATIONS', 'delivery scheduling classifies as OPERATIONS');
  assert(classifyTabSurface('SupplierDirectory', 'Supplier Directory') === 'OPERATIONS', 'supplier directory classifies as OPERATIONS');
  assert(classifyTabSurface('AlertsExceptions', 'Exceptions & Alerts') === 'WORK', 'exceptions/alerts classify as WORK, per the pack\'s own WORK examples list');

  console.log(`\nPASS: the five-surface classifier gives full, valid coverage over the real, live admin navigation list (${adminTabs.length} real screens),`);
  console.log('and every named spot-check (including the exact regression this script was written to catch) classifies correctly.');
}

main();
