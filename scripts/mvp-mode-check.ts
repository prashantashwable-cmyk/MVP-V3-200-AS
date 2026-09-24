/**
 * MVP_MODE check (Step 04, D-22): the allow-list per role exposes only MVP screens, every
 * legacy tab id is refused (so hidden screens can't be reached by id), and the legacy
 * navigation in App.tsx is unchanged for MVP_MODE off.
 * Run with: npx tsx scripts/mvp-mode-check.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { check, done } from './mvp/fixtures';
import { MVP_TABS, isAllowedTab, homeTabFor, mvpTabsFor } from '../src/mvp/mvpMode';

// The 140 legacy tab ids at the baseline commit (fc505b8), for the "off = unchanged" check.
const LEGACY_TABS = 'AdvancePaymentRetention AlertsExceptions AppVersionChangelogFeedback AuditLogAutomatedActions AutoPoTriggerRules AutoReconciliation AutomationHealth BackupDataExport CommAnalytics CommBot CommCalls CommCompliance CommInbox CommRules CommSMS CommSequences CommTemplates CommWhatsApp CompanyProfileBrandingSettings Conversion CustomReport CustomerAmcBooking CustomerDocumentVault CustomerFeedbackRating CustomerHomeDashboard CustomerLiveSupportChat CustomerNotificationCenter CustomerPaymentInstallments CustomerReferralProgram CustomerSupportTicket DamagedMissingPartsReport DataPrivacyConsentManagement DeliveryAnalytics DeliveryDelayAlerts DeliveryPartnerManagement DeliveryScheduling DeliverySopConfig EscalationMatrixConfig FinancialCashFlow Funnel Heatmap HelpFaqSupport Home Incentives InstallationSopChecklist InvoiceGenerator IssueBlockerReporting JobDetailSiteInfo LeadAssignment LeadFollowUp LeadInbox LeadLost LeadMerge LeadMigrate LeadPipeline LeadScoring LeadSource Leaderboard LegalContractTemplatesRepository LiveFeed LiveMap LiveShipmentTracking LoanEmiApplication LoanPartnerIntegration ManualOverrideConsole ManufacturerProductionStatus MasterAutomationRulesDashboard MaterialReceivedConfirmation MaterialUsageLogging MilestonePaymentRelease NotificationTemplatesChannels OnlinePaymentCheckout OperatingSurfaces OverduePaymentEscalation Partners PaymentCollectionDashboard PaymentReceiptHistory PaymentReminderConfig PaymentStageScheduleSetup PhotoVideoEvidenceCapture ProjectOperatingView ProjectStatusTracker PurchaseOrderGenerator QuoteAnalytics QuoteBranding QuoteCompare QuoteCompetitorBattlecard QuoteCounterOfferApproval QuoteDealClosure QuoteDealTermsFinalization QuoteDealWonCelebration QuoteDelivery QuoteDigitalContract QuoteDiscount QuoteESignature QuoteHistory QuoteNegotiationBot QuoteNegotiationThread QuoteObjectionHandling QuotePreview QuotePricing QuotePricingRules QuoteSpecs RefundDisputeManagement RevenueProfit RouteOpt SOSDesk SaaSOpsSubscriptionBilling SafetyComplianceChecklist SecuritySessionManagement Settings SinglePersonMonitorControlPanel SiteDeliveryChecklist SiteVerify SlaTimerBreachAlert StockInTransit SupplierCatalogPricing SupplierCommThreads SupplierContractSla SupplierDirectory SupplierDisputeResolution SupplierInvoiceMatching SupplierOrderStatusTracking SupplierPaymentAnalytics SupplierPaymentApproval SupplierPaymentHistory SupplierPaymentSchedule SupplierPaymentTerms SupplierRatingScorecard SupplierScorecard SurveyorAudit SystemHealthBotMonitoring TaxGstCompliance TechnicianAudit TechnicianCheckInCheckOut TechnicianHomeMyJobs Territories UserRolePermissionManagement WorkQueue WorkflowTriggerBuilder'.split(' ');

const roles = Object.keys(MVP_TABS);
check(roles.length === 8, 'allow-list covers the 8 MVP roles');
for (const role of roles) {
  const tabs = mvpTabsFor(role);
  check(tabs.every(t => t.id.startsWith('Mvp')), `${role}: only MVP tabs (${tabs.map(t => t.id).join(', ')})`);
  check(isAllowedTab(role, homeTabFor(role)), `${role}: home tab is allowed`);
  const leaked = LEGACY_TABS.filter(id => isAllowedTab(role, id));
  check(leaked.length === 0, `${role}: no legacy tab id is reachable in MVP_MODE`);
}
check(!isAllowedTab('customer', 'MvpDashboard') && !isAllowedTab('technician', 'MvpDashboard'), 'the dashboard is admin/owner only');
check(isAllowedTab('customer', 'MvpOrder') && isAllowedTab('technician', 'MvpOrder'), 'the Order View is reachable from lists');
check(mvpTabsFor('pending_selection').every(t => t.id === 'MvpSettings'), 'an unknown role sees only Settings');

// MVP_MODE off: App.tsx keeps every legacy tab id exactly as at baseline.
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
const start = app.indexOf('const getTabsByRole');
const block = app.slice(start, app.indexOf('const TAB_LABEL_OVERRIDES', start) > 0 ? app.indexOf('const TAB_LABEL_OVERRIDES', start) : start + 40000);
const current = new Set([...block.matchAll(/id: '([A-Za-z0-9_]+)'/g)].map(m => m[1]));
const missing = LEGACY_TABS.filter(id => !current.has(id));
check(missing.length === 0, `legacy navigation unchanged when MVP_MODE is off (${LEGACY_TABS.length} tab ids present)`);
check(/if \(mvpMode\) \{\s*return mvpTabsFor\(role\)/.test(app), 'App.tsx filters navigation through the MVP allow-list when MVP_MODE is on');
check(/mvpMode \? \(\s*<MvpRouter/.test(app), 'App.tsx mounts only MvpRouter (no legacy routers) when MVP_MODE is on');
const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'serverApp.ts'), 'utf8');
check(/app\.use\(\['\/api\/gemini', '\/api\/maps', '\/api\/db'\]/.test(server), 'server hides Gemini/maps/db APIs in MVP_MODE (R-8)');

done('mvp-mode-check');
