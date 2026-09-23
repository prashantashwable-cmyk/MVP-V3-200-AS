import React, { Suspense } from 'react';
import { Settings } from 'lucide-react';
import { User } from '../types';
import { DbManager } from '../lib/db';
const AdminDashboard = React.lazy(() => import('../components/Dashboards').then(m => ({ default: m.AdminDashboard })));
const AdminRoleManagement = React.lazy(() => import('../components/RoleSelectionWizard').then(m => ({ default: m.AdminRoleManagement })));
import { Button, Card } from '../components/Common';
const AlertsExceptionsDashboard = React.lazy(() => import('../components/AlertsExceptionsDashboard').then(m => ({ default: m.AlertsExceptionsDashboard })));
const AutoNegotiationBotConfig = React.lazy(() => import('../components/AutoNegotiationBotConfig').then(m => ({ default: m.AutoNegotiationBotConfig })));
const AutoPoTriggerRules = React.lazy(() => import('../components/AutoPoTriggerRules').then(m => ({ default: m.AutoPoTriggerRules })));
const AutomatedSequenceBuilder = React.lazy(() => import('../components/AutomatedSequenceBuilder').then(m => ({ default: m.AutomatedSequenceBuilder })));
const AutomationHealthMonitor = React.lazy(() => import('../components/AutomationHealthMonitor').then(m => ({ default: m.AutomationHealthMonitor })));
const BulkLeadImportExport = React.lazy(() => import('../components/BulkLeadImportExport').then(m => ({ default: m.BulkLeadImportExport })));
const CallLogAutoDialer = React.lazy(() => import('../components/CallLogAutoDialer').then(m => ({ default: m.CallLogAutoDialer })));
const CommAnalytics = React.lazy(() => import('../components/CommAnalytics').then(m => ({ default: m.CommAnalytics })));
const CommComplianceManager = React.lazy(() => import('../components/CommComplianceManager').then(m => ({ default: m.CommComplianceManager })));
const CommunicationTemplatesLibrary = React.lazy(() => import('../components/CommunicationTemplatesLibrary').then(m => ({ default: m.CommunicationTemplatesLibrary })));
const CompetitorBattlecard = React.lazy(() => import('../components/CompetitorBattlecard').then(m => ({ default: m.CompetitorBattlecard })));
const ConversationAIBotConfig = React.lazy(() => import('../components/ConversationAIBotConfig').then(m => ({ default: m.ConversationAIBotConfig })));
const ConversionRateAnalytics = React.lazy(() => import('../components/ConversionRateAnalytics').then(m => ({ default: m.ConversionRateAnalytics })));
const CounterOfferApproval = React.lazy(() => import('../components/CounterOfferApproval').then(m => ({ default: m.CounterOfferApproval })));
const CustomerObjectionHandling = React.lazy(() => import('../components/CustomerObjectionHandling').then(m => ({ default: m.CustomerObjectionHandling })));
const CustomerReplyInbox = React.lazy(() => import('../components/CustomerReplyInbox').then(m => ({ default: m.CustomerReplyInbox })));
const DealClosureConfirmation = React.lazy(() => import('../components/DealClosureConfirmation').then(m => ({ default: m.DealClosureConfirmation })));
const DealTermsFinalization = React.lazy(() => import('../components/DealTermsFinalization').then(m => ({ default: m.DealTermsFinalization })));
const DealWonCelebration = React.lazy(() => import('../components/DealWonCelebration').then(m => ({ default: m.DealWonCelebration })));
const DeliveryAnalyticsScreen = React.lazy(() => import('../components/DeliveryAnalyticsScreen').then(m => ({ default: m.DeliveryAnalyticsScreen })));
const DeliveryDelayAlertEscalationScreen = React.lazy(() => import('../components/DeliveryDelayAlertEscalationScreen').then(m => ({ default: m.DeliveryDelayAlertEscalationScreen })));
const DeliveryPartnerManagementScreen = React.lazy(() => import('../components/DeliveryPartnerManagementScreen').then(m => ({ default: m.DeliveryPartnerManagementScreen })));
const DeliverySopConfigScreen = React.lazy(() => import('../components/DeliverySopConfigScreen').then(m => ({ default: m.DeliverySopConfigScreen })));
const DigitalContractGenerator = React.lazy(() => import('../components/DigitalContractGenerator').then(m => ({ default: m.DigitalContractGenerator })));
const DiscountApprovalWorkflow = React.lazy(() => import('../components/DiscountApprovalWorkflow').then(m => ({ default: m.DiscountApprovalWorkflow })));
const ESignatureCapture = React.lazy(() => import('../components/ESignatureCapture').then(m => ({ default: m.ESignatureCapture })));
const EmergencyEscalationAlert = React.lazy(() => import('../components/EmergencyEscalationAlert').then(m => ({ default: m.EmergencyEscalationAlert })));
const FinancialCashFlowReceivables = React.lazy(() => import('../components/FinancialCashFlowReceivables').then(m => ({ default: m.FinancialCashFlowReceivables })));
const FollowUpStageRules = React.lazy(() => import('../components/FollowUpStageRules').then(m => ({ default: m.FollowUpStageRules })));
const GeofenceTerritoryManagement = React.lazy(() => import('../components/GeofenceTerritoryManagement').then(m => ({ default: m.GeofenceTerritoryManagement })));
const LeadAssignment = React.lazy(() => import('../components/LeadAssignment').then(m => ({ default: m.LeadAssignment })));
const LeadDensityHeatmap = React.lazy(() => import('../components/LeadDensityHeatmap').then(m => ({ default: m.LeadDensityHeatmap })));
const LeadFollowUpScheduler = React.lazy(() => import('../components/LeadFollowUpScheduler').then(m => ({ default: m.LeadFollowUpScheduler })));
const LeadInbox = React.lazy(() => import('../components/LeadInbox').then(m => ({ default: m.LeadInbox })));
const LeadKanban = React.lazy(() => import('../components/LeadKanban').then(m => ({ default: m.LeadKanban })));
const LeadMergeResolution = React.lazy(() => import('../components/LeadMergeResolution').then(m => ({ default: m.LeadMergeResolution })));
const LeadScoring = React.lazy(() => import('../components/LeadScoring').then(m => ({ default: m.LeadScoring })));
const LeadSourceAttribution = React.lazy(() => import('../components/LeadSourceAttribution').then(m => ({ default: m.LeadSourceAttribution })));
const LiveActivityFeed = React.lazy(() => import('../components/LiveActivityFeed').then(m => ({ default: m.LiveActivityFeed })));
const LiveMapDashboard = React.lazy(() => import('../components/LiveMapDashboard').then(m => ({ default: m.LiveMapDashboard })));
const LiveNegotiationThread = React.lazy(() => import('../components/LiveNegotiationThread').then(m => ({ default: m.LiveNegotiationThread })));
const LoanPartnerIntegration = React.lazy(() => import('../components/LoanPartnerIntegration').then(m => ({ default: m.LoanPartnerIntegration })));
const LostLeadDisqualification = React.lazy(() => import('../components/LostLeadDisqualification').then(m => ({ default: m.LostLeadDisqualification })));
const MilestonePaymentReleaseScreen = React.lazy(() => import('../components/MilestonePaymentReleaseScreen').then(m => ({ default: m.MilestonePaymentReleaseScreen })));
const MultiOptionComparison = React.lazy(() => import('../components/MultiOptionComparison').then(m => ({ default: m.MultiOptionComparison })));
const OverduePaymentEscalation = React.lazy(() => import('../components/OverduePaymentEscalation').then(m => ({ default: m.OverduePaymentEscalation })));
const PaymentCollectionDashboard = React.lazy(() => import('../components/PaymentCollectionDashboard').then(m => ({ default: m.PaymentCollectionDashboard })));
const PaymentReminderConfig = React.lazy(() => import('../components/PaymentReminderConfig').then(m => ({ default: m.PaymentReminderConfig })));
const PaymentStageScheduleSetup = React.lazy(() => import('../components/PaymentStageScheduleSetup').then(m => ({ default: m.PaymentStageScheduleSetup })));
const PricingRulesMarginConfig = React.lazy(() => import('../components/PricingRulesMarginConfig').then(m => ({ default: m.PricingRulesMarginConfig })));
const QuotationAnalyticsWinLoss = React.lazy(() => import('../components/QuotationAnalyticsWinLoss').then(m => ({ default: m.QuotationAnalyticsWinLoss })));
const QuotationInputSpecs = React.lazy(() => import('../components/QuotationInputSpecs').then(m => ({ default: m.QuotationInputSpecs })));
const QuotationPreview = React.lazy(() => import('../components/QuotationPreview').then(m => ({ default: m.QuotationPreview })));
const QuotationSendEDelivery = React.lazy(() => import('../components/QuotationSendEDelivery').then(m => ({ default: m.QuotationSendEDelivery })));
const QuotationTemplateBranding = React.lazy(() => import('../components/QuotationTemplateBranding').then(m => ({ default: m.QuotationTemplateBranding })));
const QuotationVersionHistory = React.lazy(() => import('../components/QuotationVersionHistory').then(m => ({ default: m.QuotationVersionHistory })));
const QuotePricing = React.lazy(() => import('../components/QuotePricing').then(m => ({ default: m.QuotePricing })));
const RefundDisputeManagement = React.lazy(() => import('../components/RefundDisputeManagement').then(m => ({ default: m.RefundDisputeManagement })));
const RevenueProfitAnalytics = React.lazy(() => import('../components/RevenueProfitAnalytics').then(m => ({ default: m.RevenueProfitAnalytics })));
const RouteOptimizationSuggestion = React.lazy(() => import('../components/RouteOptimizationSuggestion').then(m => ({ default: m.RouteOptimizationSuggestion })));
const SMSBroadcastDeliveryReport = React.lazy(() => import('../components/SMSBroadcastDeliveryReport').then(m => ({ default: m.SMSBroadcastDeliveryReport })));
const SalesFunnelAnalytics = React.lazy(() => import('../components/SalesFunnelAnalytics').then(m => ({ default: m.SalesFunnelAnalytics })));
const SiteVisitVerification = React.lazy(() => import('../components/SiteVisitVerification').then(m => ({ default: m.SiteVisitVerification })));
const StockInTransitScreen = React.lazy(() => import('../components/StockInTransitScreen').then(m => ({ default: m.StockInTransitScreen })));
const SupplierPaymentApprovalScreen = React.lazy(() => import('../components/SupplierPaymentApprovalScreen').then(m => ({ default: m.SupplierPaymentApprovalScreen })));
const SupplierPerformanceScorecard = React.lazy(() => import('../components/SupplierPerformanceScorecard').then(m => ({ default: m.SupplierPerformanceScorecard })));
const SurveyorLiveTrackingDetailView = React.lazy(() => import('../components/SurveyorLiveTrackingDetailView').then(m => ({ default: m.SurveyorLiveTrackingDetailView })));
const TechnicianLiveTrackingDetailView = React.lazy(() => import('../components/TechnicianLiveTrackingDetailView').then(m => ({ default: m.TechnicianLiveTrackingDetailView })));
const WhatsAppBusinessChatConsole = React.lazy(() => import('../components/WhatsAppBusinessChatConsole').then(m => ({ default: m.WhatsAppBusinessChatConsole })));
const WorkerPerformanceLeaderboard = React.lazy(() => import('../components/WorkerPerformanceLeaderboard').then(m => ({ default: m.WorkerPerformanceLeaderboard })));

interface AdminRouterProps {
  currentUser: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  appLanguage: string;
  googleMapsApiKey: string;
  hasValidGoogleMapsKey: boolean;
  selectedPaymentId: string;
  setSelectedPaymentId: (id: string) => void;
  setTrackingPoId: (id: string | undefined) => void;
  handleLogout: () => void;
  renderPreferencesSection: () => React.ReactNode;
}

export function AdminRouter({ currentUser, activeTab, setActiveTab, appLanguage, googleMapsApiKey, hasValidGoogleMapsKey, selectedPaymentId, setSelectedPaymentId, setTrackingPoId, handleLogout, renderPreferencesSection }: AdminRouterProps) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-warmgray">Loading…</div>}>
          {currentUser.role === 'admin' && activeTab === 'Home' && <AdminDashboard user={currentUser} />}
          {currentUser.role === 'admin' && activeTab === 'LeadInbox' && (
            <LeadInbox user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'LeadPipeline' && (
            <LeadKanban user={currentUser} onBackToInbox={() => setActiveTab('LeadInbox')} />
          )}
          {currentUser.role === 'admin' && activeTab === 'LeadAssignment' && (
            <LeadAssignment user={currentUser} onBack={() => setActiveTab('LeadInbox')} />
          )}
          {currentUser.role === 'admin' && activeTab === 'LeadMerge' && (
            <LeadMergeResolution user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'LeadScoring' && (
            <LeadScoring user={currentUser} onBack={() => setActiveTab('LeadInbox')} />
          )}
          {currentUser.role === 'admin' && activeTab === 'LiveMap' && (
            <LiveMapDashboard user={currentUser} apiKey={googleMapsApiKey} hasValidKey={hasValidGoogleMapsKey} />
          )}
          {currentUser.role === 'admin' && activeTab === 'RouteOpt' && (
            <RouteOptimizationSuggestion user={currentUser} apiKey={googleMapsApiKey} hasValidKey={hasValidGoogleMapsKey} />
          )}
          {currentUser.role === 'admin' && activeTab === 'SOSDesk' && (
            <EmergencyEscalationAlert user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'LiveFeed' && (
            <LiveActivityFeed user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'SurveyorAudit' && (
            <SurveyorLiveTrackingDetailView user={currentUser} onBack={() => setActiveTab('LiveMap')} />
          )}
          {currentUser.role === 'admin' && activeTab === 'TechnicianAudit' && (
            <TechnicianLiveTrackingDetailView user={currentUser} onBack={() => setActiveTab('LiveMap')} />
          )}
          {currentUser.role === 'admin' && activeTab === 'Territories' && (
            <GeofenceTerritoryManagement user={currentUser} apiKey={googleMapsApiKey} hasValidKey={hasValidGoogleMapsKey} />
          )}
          {currentUser.role === 'admin' && activeTab === 'Heatmap' && (
            <LeadDensityHeatmap user={currentUser} apiKey={googleMapsApiKey} hasValidKey={hasValidGoogleMapsKey} />
          )}
          {currentUser.role === 'admin' && activeTab === 'SiteVerify' && (
            <SiteVisitVerification user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'Funnel' && (
            <SalesFunnelAnalytics user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'RevenueProfit' && (
            <RevenueProfitAnalytics user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'FinancialCashFlow' && (
            <FinancialCashFlowReceivables user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'AlertsExceptions' && (
            <AlertsExceptionsDashboard user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'Leaderboard' && (
            <WorkerPerformanceLeaderboard user={currentUser} language={appLanguage} />
          )}
          {currentUser.role === 'admin' && activeTab === 'Conversion' && (
            <ConversionRateAnalytics user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'SupplierScorecard' && (
            <SupplierPerformanceScorecard user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'AutomationHealth' && (
            <AutomationHealthMonitor user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'Partners' && (
            <AdminRoleManagement currentAdmin={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'LeadFollowUp' && (
            <LeadFollowUpScheduler user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'LeadSource' && (
            <LeadSourceAttribution user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'LeadLost' && (
            <LostLeadDisqualification user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'LeadMigrate' && (
            <BulkLeadImportExport user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'CommTemplates' && (
            <CommunicationTemplatesLibrary user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'CommSequences' && (
            <AutomatedSequenceBuilder user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'CommWhatsApp' && (
            <WhatsAppBusinessChatConsole user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'CommCalls' && (
            <CallLogAutoDialer user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'CommSMS' && (
            <SMSBroadcastDeliveryReport user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'CommBot' && (
            <ConversationAIBotConfig user={currentUser} />
          )}
           {currentUser.role === 'admin' && activeTab === 'CommInbox' && (
            <CustomerReplyInbox user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'CommCompliance' && (
            <CommComplianceManager user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'CommRules' && (
            <FollowUpStageRules user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'CommAnalytics' && (
            <CommAnalytics user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteSpecs' && (
            <QuotationInputSpecs 
              user={currentUser} 
              onNavigateToPricing={(specs) => {
                setActiveTab('QuotePricing');
              }} 
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuotePricing' && (
            <QuotePricing user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteBranding' && (
            <QuotationTemplateBranding user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuotePreview' && (
            <QuotationPreview user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteCompare' && (
            <MultiOptionComparison user={currentUser} onSelectPackage={(tierId, finalPrice) => {
              setActiveTab('QuotePreview');
            }} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteHistory' && (
            <QuotationVersionHistory user={currentUser} onSelectActiveVersion={(version) => {
              setActiveTab('QuotePreview');
            }} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteDiscount' && (
            <DiscountApprovalWorkflow user={currentUser} onNavigateToPreview={() => {
              setActiveTab('QuotePreview');
            }} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteDelivery' && (
            <QuotationSendEDelivery user={currentUser} onSendComplete={() => {
              setActiveTab('QuotePreview');
            }} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteAnalytics' && (
            <QuotationAnalyticsWinLoss user={currentUser} onNavigateToQuote={(id) => {
              setActiveTab('QuotePreview');
            }} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuotePricingRules' && (
            <PricingRulesMarginConfig user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteNegotiationBot' && (
            <AutoNegotiationBotConfig 
              user={currentUser} 
              onNavigateToPreview={() => setActiveTab('QuotePreview')}
              onNavigateToThread={() => setActiveTab('QuoteNegotiationThread')}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteNegotiationThread' && (
            <LiveNegotiationThread user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteCounterOfferApproval' && (
            <CounterOfferApproval user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteDealTermsFinalization' && (
            <DealTermsFinalization user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteDigitalContract' && (
            <DigitalContractGenerator user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteESignature' && (
            <ESignatureCapture user={currentUser} onGoToNext={() => setActiveTab('QuoteDealClosure')} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteDealClosure' && (
            <DealClosureConfirmation user={currentUser} onBackToStart={() => setActiveTab('QuoteDigitalContract')} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteObjectionHandling' && (
            <CustomerObjectionHandling user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteCompetitorBattlecard' && (
            <CompetitorBattlecard user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'QuoteDealWonCelebration' && (
            <DealWonCelebration user={currentUser} onBackToStart={() => setActiveTab('QuoteDealClosure')} />
          )}
          {currentUser.role === 'admin' && activeTab === 'PaymentStageScheduleSetup' && (
            <PaymentStageScheduleSetup user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'PaymentCollectionDashboard' && (
            <PaymentCollectionDashboard 
              user={currentUser} 
              onNavigateToConfig={() => setActiveTab('PaymentReminderConfig')}
              onNavigateToEscalation={() => setActiveTab('OverduePaymentEscalation')}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'PaymentReminderConfig' && (
            <PaymentReminderConfig 
              user={currentUser} 
              onNavigateToCollection={() => setActiveTab('PaymentCollectionDashboard')}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'LoanPartnerIntegration' && (
            <LoanPartnerIntegration 
              user={currentUser}
              onNavigateToCollection={() => setActiveTab('PaymentCollectionDashboard')}
              onNavigateToEscalation={() => setActiveTab('OverduePaymentEscalation')}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'OverduePaymentEscalation' && (
            <OverduePaymentEscalation 
              user={currentUser}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'RefundDisputeManagement' && (
            <RefundDisputeManagement 
              user={currentUser}
              onNavigateToInvoices={() => setActiveTab('InvoiceGenerator')}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'AutoPoTriggerRules' && (
            <AutoPoTriggerRules 
              user={currentUser}
              onNavigateToPOs={() => setActiveTab('PurchaseOrderGenerator')}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'DeliveryDelayAlerts' && (
            <DeliveryDelayAlertEscalationScreen 
              user={currentUser} 
              onNavigateToThread={() => setActiveTab('SupplierCommThreads')}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'StockInTransit' && (
            <StockInTransitScreen 
              user={currentUser} 
              onNavigateToPo={(poId) => {
                setTrackingPoId(poId);
                setActiveTab('PurchaseOrderGenerator');
              }}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'DeliverySopConfig' && (
            <DeliverySopConfigScreen user={currentUser} />
          )}
          {currentUser.role === 'admin' && activeTab === 'DeliveryPartnerManagement' && (
            <DeliveryPartnerManagementScreen 
              user={currentUser} 
              onNavigateToPo={(poId) => {
                setTrackingPoId(poId);
                setActiveTab('PurchaseOrderGenerator');
              }}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'DeliveryAnalytics' && (
            <DeliveryAnalyticsScreen 
              user={currentUser} 
              onNavigateToSrm={() => setActiveTab('SupplierScorecard')}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'SupplierPaymentApproval' && (
            <SupplierPaymentApprovalScreen 
              user={currentUser}
              onNavigateToReleaseDetail={(paymentId) => {
                setSelectedPaymentId(paymentId);
                setActiveTab('MilestonePaymentRelease');
              }}
              onNavigateToDiscrepancyReport={(reportId) => {
                setActiveTab('DamagedMissingPartsReport');
              }}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'MilestonePaymentRelease' && (
            <MilestonePaymentReleaseScreen 
              user={currentUser}
              paymentId={selectedPaymentId}
              onBack={() => setActiveTab('SupplierPaymentApproval')}
              onNavigateToDiscrepancyReport={(reportId) => {
                setActiveTab('DamagedMissingPartsReport');
              }}
            />
          )}
          {currentUser.role === 'admin' && activeTab === 'Settings' && (
            <Card className="p-6 max-w-lg mx-auto text-center space-y-4">
              <Settings className="w-12 h-12 text-antiquegold mx-auto" />
              <h3 className="font-serif text-xl font-bold text-charcoal">Demo Control Center</h3>
              <p className="text-sm text-warmgray">Manage seeded documents and simulation rules in LocalStorage database.</p>
              <div className="pt-2 flex flex-col gap-2">
                <Button variant="primary" onClick={() => {
                  DbManager.resetToSeeds();
                  alert('Database state has been successfully reset to raw seeds!');
                }}>Reset Local DB to Raw Seeds</Button>
                <Button variant="secondary" onClick={handleLogout}>Switch Role / Logout</Button>
              </div>
              {renderPreferencesSection()}
            </Card>
          )}
    </Suspense>
  );
}
