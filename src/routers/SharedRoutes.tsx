import React, { Suspense } from 'react';
import { Settings } from 'lucide-react';
import { User } from '../types';
import { Button, Card } from '../components/Common';
const AdvancePaymentRetentionScreen = React.lazy(() => import('../components/AdvancePaymentRetentionScreen').then(m => ({ default: m.AdvancePaymentRetentionScreen })));
const ApiIntegrationManagementScreen = React.lazy(() => import('../components/ApiIntegrationManagementScreen').then(m => ({ default: m.ApiIntegrationManagementScreen })));
const AppVersionChangelogFeedbackScreen = React.lazy(() => import('../components/AppVersionChangelogFeedbackScreen').then(m => ({ default: m.AppVersionChangelogFeedbackScreen })));
const ApplicantDataCollectionScreen = React.lazy(() => import('../components/ApplicantDataCollectionScreen').then(m => ({ default: m.ApplicantDataCollectionScreen })));
const ApplicantScreeningScreen = React.lazy(() => import('../components/ApplicantScreeningScreen').then(m => ({ default: m.ApplicantScreeningScreen })));
const AuditLogAutomatedActionsScreen = React.lazy(() => import('../components/AuditLogAutomatedActionsScreen').then(m => ({ default: m.AuditLogAutomatedActionsScreen })));
const AutoReconciliationScreen = React.lazy(() => import('../components/AutoReconciliationScreen').then(m => ({ default: m.AutoReconciliationScreen })));
const AutomatedPayoutDisbursementScreen = React.lazy(() => import('../components/AutomatedPayoutDisbursementScreen').then(m => ({ default: m.AutomatedPayoutDisbursementScreen })));
const AutomationTestingSandboxScreen = React.lazy(() => import('../components/AutomationTestingSandboxScreen').then(m => ({ default: m.AutomationTestingSandboxScreen })));
const BackgroundVerificationScreen = React.lazy(() => import('../components/BackgroundVerificationScreen').then(m => ({ default: m.BackgroundVerificationScreen })));
const BackupDataExportScreen = React.lazy(() => import('../components/BackupDataExportScreen').then(m => ({ default: m.BackupDataExportScreen })));
const BadgesMilestonesScreen = React.lazy(() => import('../components/BadgesMilestonesScreen').then(m => ({ default: m.BadgesMilestonesScreen })));
const CertificationBadgeProgressScreen = React.lazy(() => import('../components/CertificationBadgeProgressScreen').then(m => ({ default: m.CertificationBadgeProgressScreen })));
const CommissionRulesEngineScreen = React.lazy(() => import('../components/CommissionRulesEngineScreen').then(m => ({ default: m.CommissionRulesEngineScreen })));
const CompanyProfileBrandingSettingsScreen = React.lazy(() => import('../components/CompanyProfileBrandingSettingsScreen').then(m => ({ default: m.CompanyProfileBrandingSettingsScreen })));
const ComplianceCertificationScreen = React.lazy(() => import('../components/ComplianceCertificationScreen').then(m => ({ default: m.ComplianceCertificationScreen })));
const ContestConfigurationScreen = React.lazy(() => import('../components/ContestConfigurationScreen').then(m => ({ default: m.ContestConfigurationScreen })));
const CustomerAmcBookingScreen = React.lazy(() => import('../components/CustomerAmcBookingScreen').then(m => ({ default: m.CustomerAmcBookingScreen })));
const CustomerDocumentVaultScreen = React.lazy(() => import('../components/CustomerDocumentVaultScreen').then(m => ({ default: m.CustomerDocumentVaultScreen })));
const CustomerFeedbackRatingScreen = React.lazy(() => import('../components/CustomerFeedbackRatingScreen').then(m => ({ default: m.CustomerFeedbackRatingScreen })));
const CustomerHandoverWalkthroughScreen = React.lazy(() => import('../components/CustomerHandoverWalkthroughScreen').then(m => ({ default: m.CustomerHandoverWalkthroughScreen })));
const CustomerHomeDashboardScreen = React.lazy(() => import('../components/CustomerHomeDashboardScreen').then(m => ({ default: m.CustomerHomeDashboardScreen })));
const CustomerLiveSupportChatScreen = React.lazy(() => import('../components/CustomerLiveSupportChatScreen').then(m => ({ default: m.CustomerLiveSupportChatScreen })));
const CustomerNotificationCenterScreen = React.lazy(() => import('../components/CustomerNotificationCenterScreen').then(m => ({ default: m.CustomerNotificationCenterScreen })));
const CustomerPaymentInstallmentsScreen = React.lazy(() => import('../components/CustomerPaymentInstallmentsScreen').then(m => ({ default: m.CustomerPaymentInstallmentsScreen })));
const CustomerReferralProgramScreen = React.lazy(() => import('../components/CustomerReferralProgramScreen').then(m => ({ default: m.CustomerReferralProgramScreen })));
const CustomerSupportTicketScreen = React.lazy(() => import('../components/CustomerSupportTicketScreen').then(m => ({ default: m.CustomerSupportTicketScreen })));
const DamagedMissingPartsReportScreen = React.lazy(() => import('../components/DamagedMissingPartsReportScreen').then(m => ({ default: m.DamagedMissingPartsReportScreen })));
const DataPrivacyConsentManagementScreen = React.lazy(() => import('../components/DataPrivacyConsentManagementScreen').then(m => ({ default: m.DataPrivacyConsentManagementScreen })));
const DefectSnagListScreen = React.lazy(() => import('../components/DefectSnagListScreen').then(m => ({ default: m.DefectSnagListScreen })));
const DeliverySchedulingScreen = React.lazy(() => import('../components/DeliverySchedulingScreen').then(m => ({ default: m.DeliverySchedulingScreen })));
const EscalationMatrixConfigScreen = React.lazy(() => import('../components/EscalationMatrixConfigScreen').then(m => ({ default: m.EscalationMatrixConfigScreen })));
const FinalHandoverChecklistScreen = React.lazy(() => import('../components/FinalHandoverChecklistScreen').then(m => ({ default: m.FinalHandoverChecklistScreen })));
const HandoverCompletionCertificateScreen = React.lazy(() => import('../components/HandoverCompletionCertificateScreen').then(m => ({ default: m.HandoverCompletionCertificateScreen })));
const HelpFaqSupportScreen = React.lazy(() => import('../components/HelpFaqSupportScreen').then(m => ({ default: m.HelpFaqSupportScreen })));
const InstallationProgressTimelineScreen = React.lazy(() => import('../components/InstallationProgressTimelineScreen').then(m => ({ default: m.InstallationProgressTimelineScreen })));
const InstallationSopChecklistScreen = React.lazy(() => import('../components/InstallationSopChecklistScreen').then(m => ({ default: m.InstallationSopChecklistScreen })));
const InterviewSchedulingScreen = React.lazy(() => import('../components/InterviewSchedulingScreen').then(m => ({ default: m.InterviewSchedulingScreen })));
const InvoiceGenerator = React.lazy(() => import('../components/InvoiceGenerator').then(m => ({ default: m.InvoiceGenerator })));
const IssueBlockerReportingScreen = React.lazy(() => import('../components/IssueBlockerReportingScreen').then(m => ({ default: m.IssueBlockerReportingScreen })));
const JobDetailSiteInfoScreen = React.lazy(() => import('../components/JobDetailSiteInfoScreen').then(m => ({ default: m.JobDetailSiteInfoScreen })));
const LegalContractTemplatesRepositoryScreen = React.lazy(() => import('../components/LegalContractTemplatesRepositoryScreen').then(m => ({ default: m.LegalContractTemplatesRepositoryScreen })));
const LiveShipmentTrackingScreen = React.lazy(() => import('../components/LiveShipmentTrackingScreen').then(m => ({ default: m.LiveShipmentTrackingScreen })));
const LoanEmiApplication = React.lazy(() => import('../components/LoanEmiApplication').then(m => ({ default: m.LoanEmiApplication })));
const ManualOverrideConsoleScreen = React.lazy(() => import('../components/ManualOverrideConsoleScreen').then(m => ({ default: m.ManualOverrideConsoleScreen })));
const ManufacturerProductionStatus = React.lazy(() => import('../components/ManufacturerProductionStatus').then(m => ({ default: m.ManufacturerProductionStatus })));
const MasterAutomationRulesDashboardScreen = React.lazy(() => import('../components/MasterAutomationRulesDashboardScreen').then(m => ({ default: m.MasterAutomationRulesDashboardScreen })));
const MaterialReceivedConfirmationScreen = React.lazy(() => import('../components/MaterialReceivedConfirmationScreen').then(m => ({ default: m.MaterialReceivedConfirmationScreen })));
const MaterialUsageLoggingScreen = React.lazy(() => import('../components/MaterialUsageLoggingScreen').then(m => ({ default: m.MaterialUsageLoggingScreen })));
const NewPartnerAggregationDashboardScreen = React.lazy(() => import('../components/NewPartnerAggregationDashboardScreen').then(m => ({ default: m.NewPartnerAggregationDashboardScreen })));
const NewSopRolloutNotificationScreen = React.lazy(() => import('../components/NewSopRolloutNotificationScreen').then(m => ({ default: m.NewSopRolloutNotificationScreen })));
const NotificationTemplatesChannelsScreen = React.lazy(() => import('../components/NotificationTemplatesChannelsScreen').then(m => ({ default: m.NotificationTemplatesChannelsScreen })));
const OfferOnboardingAgreementScreen = React.lazy(() => import('../components/OfferOnboardingAgreementScreen').then(m => ({ default: m.OfferOnboardingAgreementScreen })));
const OnlinePaymentCheckout = React.lazy(() => import('../components/OnlinePaymentCheckout').then(m => ({ default: m.OnlinePaymentCheckout })));
const PartnerDeactivationExitScreen = React.lazy(() => import('../components/PartnerDeactivationExitScreen').then(m => ({ default: m.PartnerDeactivationExitScreen })));
const PartnerDirectoryScreen = React.lazy(() => import('../components/PartnerDirectoryScreen').then(m => ({ default: m.PartnerDirectoryScreen })));
const PartnerTierCategoryAssignmentScreen = React.lazy(() => import('../components/PartnerTierCategoryAssignmentScreen').then(m => ({ default: m.PartnerTierCategoryAssignmentScreen })));
const PaymentReceiptHistory = React.lazy(() => import('../components/PaymentReceiptHistory').then(m => ({ default: m.PaymentReceiptHistory })));
const PayoutApprovalQueueScreen = React.lazy(() => import('../components/PayoutApprovalQueueScreen').then(m => ({ default: m.PayoutApprovalQueueScreen })));
const PayoutDisputeQueryScreen = React.lazy(() => import('../components/PayoutDisputeQueryScreen').then(m => ({ default: m.PayoutDisputeQueryScreen })));
const PayoutHistoryStatementsScreen = React.lazy(() => import('../components/PayoutHistoryStatementsScreen').then(m => ({ default: m.PayoutHistoryStatementsScreen })));
const PhotoVideoEvidenceCaptureScreen = React.lazy(() => import('../components/PhotoVideoEvidenceCaptureScreen').then(m => ({ default: m.PhotoVideoEvidenceCaptureScreen })));
const ProjectStatusTrackerScreen = React.lazy(() => import('../components/ProjectStatusTrackerScreen').then(m => ({ default: m.ProjectStatusTrackerScreen })));
const PurchaseOrderGenerator = React.lazy(() => import('../components/PurchaseOrderGenerator').then(m => ({ default: m.PurchaseOrderGenerator })));
const QcInspectorAssignmentScreen = React.lazy(() => import('../components/QcInspectorAssignmentScreen').then(m => ({ default: m.QcInspectorAssignmentScreen })));
const QualityChecklistElectricalScreen = React.lazy(() => import('../components/QualityChecklistElectricalScreen').then(m => ({ default: m.QualityChecklistElectricalScreen })));
const QualityChecklistMechanicalScreen = React.lazy(() => import('../components/QualityChecklistMechanicalScreen').then(m => ({ default: m.QualityChecklistMechanicalScreen })));
const QuizCertificationTestScreen = React.lazy(() => import('../components/QuizCertificationTestScreen').then(m => ({ default: m.QuizCertificationTestScreen })));
const RecruitmentLandingScreen = React.lazy(() => import('../components/RecruitmentLandingScreen').then(m => ({ default: m.RecruitmentLandingScreen })));
const RewardsLeaderboardScreen = React.lazy(() => import('../components/RewardsLeaderboardScreen').then(m => ({ default: m.RewardsLeaderboardScreen })));
const ReworkAssignmentScreen = React.lazy(() => import('../components/ReworkAssignmentScreen').then(m => ({ default: m.ReworkAssignmentScreen })));
const SaaSOpsSubscriptionBillingScreen = React.lazy(() => import('../components/SaaSOpsSubscriptionBillingScreen').then(m => ({ default: m.SaaSOpsSubscriptionBillingScreen })));
const SafetyComplianceChecklistScreen = React.lazy(() => import('../components/SafetyComplianceChecklistScreen').then(m => ({ default: m.SafetyComplianceChecklistScreen })));
const SecuritySessionManagementScreen = React.lazy(() => import('../components/SecuritySessionManagementScreen').then(m => ({ default: m.SecuritySessionManagementScreen })));
const SinglePersonMonitorControlPanelScreen = React.lazy(() => import('../components/SinglePersonMonitorControlPanelScreen').then(m => ({ default: m.SinglePersonMonitorControlPanelScreen })));
const SiteDeliveryChecklistScreen = React.lazy(() => import('../components/SiteDeliveryChecklistScreen').then(m => ({ default: m.SiteDeliveryChecklistScreen })));
const SkillMatrixGapAnalysisScreen = React.lazy(() => import('../components/SkillMatrixGapAnalysisScreen').then(m => ({ default: m.SkillMatrixGapAnalysisScreen })));
const SlaTimerBreachAlertScreen = React.lazy(() => import('../components/SlaTimerBreachAlertScreen').then(m => ({ default: m.SlaTimerBreachAlertScreen })));
const SopDocumentRepositoryScreen = React.lazy(() => import('../components/SopDocumentRepositoryScreen').then(m => ({ default: m.SopDocumentRepositoryScreen })));
const StageWisePayoutTrackerScreen = React.lazy(() => import('../components/StageWisePayoutTrackerScreen').then(m => ({ default: m.StageWisePayoutTrackerScreen })));
const SupplierCatalogPricing = React.lazy(() => import('../components/SupplierCatalogPricing').then(m => ({ default: m.SupplierCatalogPricing })));
const SupplierCommunicationThreads = React.lazy(() => import('../components/SupplierCommunicationThreads').then(m => ({ default: m.SupplierCommunicationThreads })));
const SupplierContractSla = React.lazy(() => import('../components/SupplierContractSla').then(m => ({ default: m.SupplierContractSla })));
const SupplierDirectory = React.lazy(() => import('../components/SupplierDirectory').then(m => ({ default: m.SupplierDirectory })));
const SupplierDisputeResolutionScreen = React.lazy(() => import('../components/SupplierDisputeResolutionScreen').then(m => ({ default: m.SupplierDisputeResolutionScreen })));
const SupplierInvoiceMatchingScreen = React.lazy(() => import('../components/SupplierInvoiceMatchingScreen').then(m => ({ default: m.SupplierInvoiceMatchingScreen })));
const SupplierOrderStatusTracking = React.lazy(() => import('../components/SupplierOrderStatusTracking').then(m => ({ default: m.SupplierOrderStatusTracking })));
const SupplierPaymentAnalyticsScreen = React.lazy(() => import('../components/SupplierPaymentAnalyticsScreen').then(m => ({ default: m.SupplierPaymentAnalyticsScreen })));
const SupplierPaymentHistoryScreen = React.lazy(() => import('../components/SupplierPaymentHistoryScreen').then(m => ({ default: m.SupplierPaymentHistoryScreen })));
const SupplierPaymentScheduleScreen = React.lazy(() => import('../components/SupplierPaymentScheduleScreen').then(m => ({ default: m.SupplierPaymentScheduleScreen })));
const SupplierPaymentTermsConfigScreen = React.lazy(() => import('../components/SupplierPaymentTermsConfigScreen').then(m => ({ default: m.SupplierPaymentTermsConfigScreen })));
const SupplierRatingScorecard = React.lazy(() => import('../components/SupplierRatingScorecard').then(m => ({ default: m.SupplierRatingScorecard })));
const SystemHealthBotMonitoringScreen = React.lazy(() => import('../components/SystemHealthBotMonitoringScreen').then(m => ({ default: m.SystemHealthBotMonitoringScreen })));
const TaxDeductionStatementScreen = React.lazy(() => import('../components/TaxDeductionStatementScreen').then(m => ({ default: m.TaxDeductionStatementScreen })));
const TaxGstComplianceScreen = React.lazy(() => import('../components/TaxGstComplianceScreen').then(m => ({ default: m.TaxGstComplianceScreen })));
const TechnicianCheckInCheckOutScreen = React.lazy(() => import('../components/TechnicianCheckInCheckOutScreen').then(m => ({ default: m.TechnicianCheckInCheckOutScreen })));
const TechnicianHomeMyJobsScreen = React.lazy(() => import('../components/TechnicianHomeMyJobsScreen').then(m => ({ default: m.TechnicianHomeMyJobsScreen })));
const TechnicianTeamCoordinationScreen = React.lazy(() => import('../components/TechnicianTeamCoordinationScreen').then(m => ({ default: m.TechnicianTeamCoordinationScreen })));
const TrainingComplianceTrackerScreen = React.lazy(() => import('../components/TrainingComplianceTrackerScreen').then(m => ({ default: m.TrainingComplianceTrackerScreen })));
const TrainingFeedbackScreen = React.lazy(() => import('../components/TrainingFeedbackScreen').then(m => ({ default: m.TrainingFeedbackScreen })));
const TrainingModuleLibraryScreen = React.lazy(() => import('../components/TrainingModuleLibraryScreen').then(m => ({ default: m.TrainingModuleLibraryScreen })));
const UserRolePermissionManagementScreen = React.lazy(() => import('../components/UserRolePermissionManagementScreen').then(m => ({ default: m.UserRolePermissionManagementScreen })));
const VideoInteractiveLessonPlayerScreen = React.lazy(() => import('../components/VideoInteractiveLessonPlayerScreen').then(m => ({ default: m.VideoInteractiveLessonPlayerScreen })));
const WarrantyAmcRegistrationScreen = React.lazy(() => import('../components/WarrantyAmcRegistrationScreen').then(m => ({ default: m.WarrantyAmcRegistrationScreen })));
const WorkflowTriggerBuilderScreen = React.lazy(() => import('../components/WorkflowTriggerBuilderScreen').then(m => ({ default: m.WorkflowTriggerBuilderScreen })));

interface SharedRoutesProps {
  currentUser: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  appLanguage: string;
  handleLogout: () => void;
  renderPreferencesSection: () => React.ReactNode;
  selectedTechJobId: string;
  setSelectedTechJobId: (id: string) => void;
  selectedApplicantId: string;
  setSelectedApplicantId: (id: string) => void;
  selectedSopStepId: string | undefined;
  setSelectedSopStepId: (id: string | undefined) => void;
  trackingPoId: string | undefined;
  setTrackingPoId: (id: string | undefined) => void;
  selectedPaymentId: string;
  setSelectedPaymentId: (id: string) => void;
  selectedTrainingModuleId: string;
  setSelectedTrainingModuleId: (id: string) => void;
  selectedTrainingLessonId: string;
  setSelectedTrainingLessonId: (id: string) => void;
  selectedAssessmentId: string;
  setSelectedAssessmentId: (id: string) => void;
}

export function SharedRoutes({ currentUser, activeTab, setActiveTab, appLanguage, handleLogout, renderPreferencesSection, selectedTechJobId, setSelectedTechJobId, selectedApplicantId, setSelectedApplicantId, selectedSopStepId, setSelectedSopStepId, trackingPoId, setTrackingPoId, selectedPaymentId, setSelectedPaymentId, selectedTrainingModuleId, setSelectedTrainingModuleId, selectedTrainingLessonId, setSelectedTrainingLessonId, selectedAssessmentId, setSelectedAssessmentId }: SharedRoutesProps) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-warmgray">Loading…</div>}>
          {activeTab === 'OnlinePaymentCheckout' && (
            <OnlinePaymentCheckout 
              user={currentUser}
              onNavigateToLoan={() => setActiveTab('LoanEmiApplication')}
              onSuccess={() => setActiveTab('PaymentReceiptHistory')}
            />
          )}
          {activeTab === 'LoanEmiApplication' && (
            <LoanEmiApplication 
              user={currentUser}
              onNavigateToCheckout={() => setActiveTab('OnlinePaymentCheckout')}
              onNavigateToStatus={() => setActiveTab('LoanPartnerIntegration')}
            />
          )}
          {activeTab === 'InvoiceGenerator' && (
            <InvoiceGenerator 
              user={currentUser}
              onNavigateToReceipts={() => setActiveTab('PaymentReceiptHistory')}
            />
          )}
          {activeTab === 'PaymentReceiptHistory' && (
            <PaymentReceiptHistory 
              user={currentUser}
              onNavigateToInvoice={(id) => setActiveTab('InvoiceGenerator')}
              onNavigateToCheckout={() => setActiveTab('OnlinePaymentCheckout')}
            />
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'supplier') && activeTab === 'SupplierDirectory' && (
            <SupplierDirectory 
              user={currentUser}
              onNavigateToPO={(supplierId) => {
                setActiveTab('PurchaseOrderGenerator');
              }}
            />
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'supplier') && activeTab === 'SupplierCatalogPricing' && (
            <SupplierCatalogPricing 
              user={currentUser}
              onNavigateToPO={() => setActiveTab('PurchaseOrderGenerator')}
            />
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'supplier') && activeTab === 'PurchaseOrderGenerator' && (
            <PurchaseOrderGenerator 
              user={currentUser}
              onNavigateToSuppliers={() => {
                setActiveTab('SupplierDirectory');
              }}
            />
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'supplier') && activeTab === 'SupplierOrderStatusTracking' && (
            <SupplierOrderStatusTracking 
              user={currentUser}
              onNavigateToPOGenerator={() => setActiveTab('PurchaseOrderGenerator')}
            />
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'supplier') && activeTab === 'ManufacturerProductionStatus' && (
            <ManufacturerProductionStatus 
              user={currentUser}
              onNavigateToPO={(poId) => setActiveTab('PurchaseOrderGenerator')}
              onNavigateToTracking={() => setActiveTab('SupplierOrderStatusTracking')}
            />
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'supplier') && (activeTab === 'SupplierRatingScorecard' || activeTab === 'SupplierScorecard') && (
            <SupplierRatingScorecard 
              user={currentUser}
              onNavigateToPO={(poId) => setActiveTab('PurchaseOrderGenerator')}
              onNavigateToContracts={() => setActiveTab('SupplierContractSla')}
            />
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'supplier') && activeTab === 'SupplierContractSla' && (
            <SupplierContractSla 
              user={currentUser}
              onNavigateToPOGenerator={() => setActiveTab('PurchaseOrderGenerator')}
              onNavigateToScorecard={() => setActiveTab('SupplierRatingScorecard')}
            />
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'supplier') && activeTab === 'SupplierCommThreads' && (
            <SupplierCommunicationThreads user={currentUser} />
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'supplier') && activeTab === 'SupplierPaymentTerms' && (
            <SupplierPaymentTermsConfigScreen user={currentUser} />
          )}
          {(currentUser.role === 'admin' || currentUser.role === 'supplier') && activeTab === 'DeliveryScheduling' && (
            <DeliverySchedulingScreen 
              user={currentUser} 
              onNavigateToTracking={(poId) => {
                setTrackingPoId(poId);
                setActiveTab('LiveShipmentTracking');
              }}
            />
          )}
          {activeTab === 'LiveShipmentTracking' && (
            <LiveShipmentTrackingScreen 
              user={currentUser} 
              selectedPoId={trackingPoId}
              onBackToSchedules={() => setActiveTab('DeliveryScheduling')}
            />
          )}
          {activeTab === 'SiteDeliveryChecklist' && (
            <SiteDeliveryChecklistScreen 
              user={currentUser} 
              selectedPoId={trackingPoId}
              onNavigateToConfirmation={(poId) => {
                setTrackingPoId(poId);
                setActiveTab('MaterialReceivedConfirmation');
              }}
            />
          )}
          {activeTab === 'MaterialReceivedConfirmation' && (
            <MaterialReceivedConfirmationScreen 
              user={currentUser} 
              selectedPoId={trackingPoId}
              onBackToChecklist={() => setActiveTab('SiteDeliveryChecklist')}
              onNavigateToPayment={() => setActiveTab('OnlinePaymentCheckout')}
            />
          )}
          {activeTab === 'DamagedMissingPartsReport' && (
            <DamagedMissingPartsReportScreen 
              user={currentUser} 
              selectedPoId={trackingPoId}
              onNavigateToThread={() => setActiveTab('SupplierCommThreads')}
            />
          )}
          {activeTab === 'SupplierInvoiceMatching' && (
            <SupplierInvoiceMatchingScreen 
              user={currentUser}
              onNavigateToApprovalQueue={() => setActiveTab('SupplierPaymentApproval')}
            />
          )}
          {activeTab === 'SupplierPaymentSchedule' && (
            <SupplierPaymentScheduleScreen 
              user={currentUser}
              onNavigateToReleaseDetail={(paymentId) => {
                setSelectedPaymentId(paymentId);
                setActiveTab('MilestonePaymentRelease');
              }}
              onNavigateToApprovalQueue={() => setActiveTab('SupplierPaymentApproval')}
            />
          )}
          {activeTab === 'SupplierPaymentHistory' && (
            <SupplierPaymentHistoryScreen 
              user={currentUser}
              onNavigateToInvoiceMatching={() => setActiveTab('SupplierInvoiceMatching')}
              onNavigateToApprovalQueue={() => setActiveTab('SupplierPaymentApproval')}
            />
          )}
          {activeTab === 'TaxGstCompliance' && (
            <TaxGstComplianceScreen 
              user={currentUser}
              onNavigateToInvoiceMatching={() => setActiveTab('SupplierInvoiceMatching')}
              onNavigateToDisputeResolution={() => setActiveTab('SupplierDisputeResolution')}
            />
          )}
          {activeTab === 'SupplierDisputeResolution' && (
            <SupplierDisputeResolutionScreen 
              user={currentUser}
              onNavigateToPaymentApproval={() => setActiveTab('SupplierPaymentApproval')}
              onNavigateToPaymentHistory={() => setActiveTab('SupplierPaymentHistory')}
            />
          )}
          {activeTab === 'AdvancePaymentRetention' && (
            <AdvancePaymentRetentionScreen 
              user={currentUser}
              onNavigateToMilestoneRelease={(poId) => {
                if (poId) setSelectedPaymentId('pay_' + poId);
                setActiveTab('MilestonePaymentRelease');
              }}
              onNavigateToDisputeResolution={() => setActiveTab('SupplierDisputeResolution')}
            />
          )}
          {activeTab === 'SupplierPaymentAnalytics' && (
            <SupplierPaymentAnalyticsScreen 
              user={currentUser}
              onNavigateToDisputeResolution={() => setActiveTab('SupplierDisputeResolution')}
              onNavigateToSupplierDirectory={() => setActiveTab('Partners')}
            />
          )}
          {activeTab === 'AutoReconciliation' && (
            <AutoReconciliationScreen 
              user={currentUser}
              onNavigateToAlertsDashboard={() => setActiveTab('AutomationHealth')}
              onNavigateToPaymentHistory={() => setActiveTab('SupplierPaymentHistory')}
            />
          )}

          {activeTab === 'TechnicianHomeMyJobs' && (
            <TechnicianHomeMyJobsScreen
              user={currentUser}
              onSelectJob={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('JobDetailSiteInfo');
              }}
              onOpenSos={() => {
                setActiveTab('SOSDesk');
              }}
            />
          )}

          {activeTab === 'JobDetailSiteInfo' && (
            <JobDetailSiteInfoScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('TechnicianHomeMyJobs')}
              onStartSopChecklist={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('InstallationSopChecklist');
              }}
            />
          )}

          {activeTab === 'InstallationSopChecklist' && (
            <InstallationSopChecklistScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('JobDetailSiteInfo')}
              onOpenEvidenceCapture={(jId, stepId) => {
                setSelectedTechJobId(jId);
                setSelectedSopStepId(stepId);
                setActiveTab('PhotoVideoEvidenceCapture');
              }}
              onOpenCheckInScreen={(jId) => {
                setSelectedTechJobId(jId);
                setActiveTab('TechnicianCheckInCheckOut');
              }}
            />
          )}

          {activeTab === 'PhotoVideoEvidenceCapture' && (
            <PhotoVideoEvidenceCaptureScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              initialStepId={selectedSopStepId}
              onBack={() => setActiveTab('InstallationSopChecklist')}
            />
          )}

          {activeTab === 'TechnicianCheckInCheckOut' && (
            <TechnicianCheckInCheckOutScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('JobDetailSiteInfo')}
              onNavigateToSopChecklist={(jId) => {
                setSelectedTechJobId(jId);
                setActiveTab('InstallationSopChecklist');
              }}
            />
          )}

          {activeTab === 'SafetyComplianceChecklist' && (
            <SafetyComplianceChecklistScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('InstallationSopChecklist')}
              onOpenEvidenceCapture={(jId, stepId) => {
                setSelectedTechJobId(jId);
                setSelectedSopStepId(stepId);
                setActiveTab('PhotoVideoEvidenceCapture');
              }}
            />
          )}

          {activeTab === 'IssueBlockerReporting' && (
            <IssueBlockerReportingScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('InstallationSopChecklist')}
            />
          )}

          {activeTab === 'MaterialUsageLogging' && (
            <MaterialUsageLoggingScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('InstallationSopChecklist')}
            />
          )}

          {activeTab === 'QcInspectorAssignment' && (
            <QcInspectorAssignmentScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('InstallationSopChecklist')}
              onNavigateToMechanicalQc={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('QualityChecklistMechanical');
              }}
            />
          )}

          {activeTab === 'QualityChecklistMechanical' && (
            <QualityChecklistMechanicalScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('QcInspectorAssignment')}
              onNavigateToRework={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('DefectSnagList');
              }}
              onNavigateToElectricalQc={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('QualityChecklistElectrical');
              }}
            />
          )}

          {activeTab === 'QualityChecklistElectrical' && (
            <QualityChecklistElectricalScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('QualityChecklistMechanical')}
              onNavigateToComplianceCert={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('ComplianceCertification');
              }}
              onNavigateToSnagList={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('DefectSnagList');
              }}
            />
          )}

          {activeTab === 'ComplianceCertification' && (
            <ComplianceCertificationScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('QualityChecklistElectrical')}
              onNavigateToSnagList={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('DefectSnagList');
              }}
              onNavigateToHandover={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('FinalHandoverChecklist');
              }}
            />
          )}

          {activeTab === 'DefectSnagList' && (
            <DefectSnagListScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('QualityChecklistElectrical')}
              onNavigateToRework={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('ReworkAssignment');
              }}
              onNavigateToElectricalQc={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('QualityChecklistElectrical');
              }}
            />
          )}

          {activeTab === 'ReworkAssignment' && (
            <ReworkAssignmentScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('DefectSnagList')}
              onNavigateToSnagList={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('DefectSnagList');
              }}
              onNavigateToPartsRequest={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('IssueBlockerReporting');
              }}
            />
          )}

          {activeTab === 'FinalHandoverChecklist' && (
            <FinalHandoverChecklistScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('ComplianceCertification')}
              onNavigateToWalkthrough={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('CustomerHandoverWalkthrough');
              }}
              onNavigateToSnagList={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('DefectSnagList');
              }}
              onNavigateToComplianceCert={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('ComplianceCertification');
              }}
            />
          )}

          {activeTab === 'CustomerHandoverWalkthrough' && (
            <CustomerHandoverWalkthroughScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('FinalHandoverChecklist')}
              onNavigateToTimeline={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('InstallationProgressTimeline');
              }}
              onNavigateToWarranty={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('WarrantyAmcRegistration');
              }}
            />
          )}

          {activeTab === 'WarrantyAmcRegistration' && (
            <WarrantyAmcRegistrationScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('CustomerHandoverWalkthrough')}
              onNavigateToCertificate={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('HandoverCompletionCertificate');
              }}
              onNavigateToWalkthrough={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('CustomerHandoverWalkthrough');
              }}
            />
          )}

          {activeTab === 'HandoverCompletionCertificate' && (
            <HandoverCompletionCertificateScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('WarrantyAmcRegistration')}
              onNavigateToTimeline={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('InstallationProgressTimeline');
              }}
            />
          )}

          {activeTab === 'InstallationProgressTimeline' && (
            <InstallationProgressTimelineScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('JobDetailSiteInfo')}
              onNavigateToSop={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('InstallationSopChecklist');
              }}
              onNavigateToQcAssignment={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('QcInspectorAssignment');
              }}
            />
          )}

          {activeTab === 'TechnicianTeamCoordination' && (
            <TechnicianTeamCoordinationScreen
              user={currentUser}
              jobId={selectedTechJobId || 'job_2026_101'}
              onBack={() => setActiveTab('JobDetailSiteInfo')}
              onNavigateToSop={(jobId) => {
                setSelectedTechJobId(jobId);
                setActiveTab('InstallationSopChecklist');
              }}
            />
          )}

          {activeTab === 'RecruitmentLanding' && (
            <RecruitmentLandingScreen
              user={currentUser}
              onNavigateToDataCollection={(appId) => {
                setSelectedApplicantId(appId);
                setActiveTab('ApplicantDataCollection');
              }}
              onNavigateToScreening={() => setActiveTab('ApplicantScreening')}
              onNavigateToInterview={() => setActiveTab('InterviewScheduling')}
              onNavigateToVerification={() => setActiveTab('BackgroundVerification')}
              onNavigateToOffer={() => setActiveTab('OfferOnboardingAgreement')}
              onNavigateToDashboard={() => setActiveTab('NewPartnerAggregationDashboard')}
              onNavigateToTierAssignment={() => setActiveTab('PartnerTierCategoryAssignment')}
              onNavigateToDirectory={() => setActiveTab('PartnerDirectory')}
              onNavigateToExitScreen={(partnerId) => {
                if (partnerId) setSelectedApplicantId(partnerId);
                setActiveTab('PartnerDeactivationExit');
              }}
              onNavigateToTrainingLibrary={() => setActiveTab('TrainingModuleLibrary')}
              onBack={() => setActiveTab('Home')}
            />
          )}

          {activeTab === 'PartnerDirectory' && (
            <PartnerDirectoryScreen
              user={currentUser}
              onNavigateToExitScreen={(partnerId) => {
                setSelectedApplicantId(partnerId);
                setActiveTab('PartnerDeactivationExit');
              }}
              onNavigateToTierAssignment={(partnerId) => {
                setSelectedApplicantId(partnerId);
                setActiveTab('PartnerTierCategoryAssignment');
              }}
              onBack={() => setActiveTab('RecruitmentLanding')}
            />
          )}

          {activeTab === 'PartnerDeactivationExit' && (
            <PartnerDeactivationExitScreen
              user={currentUser}
              partnerId={selectedApplicantId}
              onNavigateToDirectory={() => setActiveTab('PartnerDirectory')}
              onBack={() => setActiveTab('RecruitmentLanding')}
            />
          )}

          {activeTab === 'TrainingModuleLibrary' && (
            <TrainingModuleLibraryScreen
              user={currentUser}
              onOpenLesson={(modId, lesId) => {
                setSelectedTrainingModuleId(modId);
                setSelectedTrainingLessonId(lesId);
                setActiveTab('VideoInteractiveLessonPlayer');
              }}
              onNavigateToSopRepo={() => setActiveTab('SopDocumentRepository')}
              onNavigateToBadges={() => setActiveTab('CertificationBadgeProgress')}
              onNavigateToSkillMatrix={() => setActiveTab('SkillMatrixGapAnalysis')}
              onNavigateToComplianceTracker={() => setActiveTab('TrainingComplianceTracker')}
              onNavigateToSopRollout={() => setActiveTab('NewSopRolloutNotification')}
              onNavigateToFeedback={() => setActiveTab('TrainingFeedback')}
              onBack={() => setActiveTab('RecruitmentLanding')}
            />
          )}

          {activeTab === 'VideoInteractiveLessonPlayer' && (
            <VideoInteractiveLessonPlayerScreen
              user={currentUser}
              trainingModuleId={selectedTrainingModuleId}
              lessonId={selectedTrainingLessonId}
              onNavigateToLibrary={() => setActiveTab('TrainingModuleLibrary')}
              onLessonCompleted={(nextLessonId) => {
                if (nextLessonId) {
                  setSelectedTrainingLessonId(nextLessonId);
                } else {
                  setActiveTab('TrainingModuleLibrary');
                }
              }}
            />
          )}

          {activeTab === 'SopDocumentRepository' && (
            <SopDocumentRepositoryScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              onNavigateToQuiz={(assessId) => {
                setSelectedAssessmentId(assessId);
                setActiveTab('QuizCertificationTest');
              }}
              onNavigateToTrainingLibrary={() => setActiveTab('TrainingModuleLibrary')}
              onBack={() => setActiveTab('TrainingModuleLibrary')}
            />
          )}

          {activeTab === 'QuizCertificationTest' && (
            <QuizCertificationTestScreen
              assessmentId={selectedAssessmentId}
              partnerId={currentUser.id}
              currentLanguage={appLanguage}
              onNavigateToBadges={() => setActiveTab('CertificationBadgeProgress')}
              onBack={() => setActiveTab('TrainingModuleLibrary')}
            />
          )}

          {activeTab === 'CertificationBadgeProgress' && (
            <CertificationBadgeProgressScreen
              partnerId={currentUser.id}
              partnerName={currentUser.name}
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              onNavigateToQuiz={(assessId) => {
                setSelectedAssessmentId(assessId);
                setActiveTab('QuizCertificationTest');
              }}
              onNavigateToSopRepo={() => setActiveTab('SopDocumentRepository')}
              onBack={() => setActiveTab('TrainingModuleLibrary')}
            />
          )}

          {activeTab === 'SkillMatrixGapAnalysis' && (
            <SkillMatrixGapAnalysisScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              onNavigateToTrainingModule={(modId) => {
                setSelectedTrainingModuleId(modId);
                setActiveTab('TrainingModuleLibrary');
              }}
              onNavigateToComplianceTracker={() => setActiveTab('TrainingComplianceTracker')}
              onNavigateToSopRollout={() => setActiveTab('NewSopRolloutNotification')}
              onBack={() => setActiveTab('TrainingModuleLibrary')}
            />
          )}

          {activeTab === 'TrainingComplianceTracker' && (
            <TrainingComplianceTrackerScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              onNavigateToSkillMatrix={() => setActiveTab('SkillMatrixGapAnalysis')}
              onNavigateToSopRollout={() => setActiveTab('NewSopRolloutNotification')}
              onNavigateToModule={(modId) => {
                setSelectedTrainingModuleId(modId);
                setActiveTab('TrainingModuleLibrary');
              }}
              onBack={() => setActiveTab('TrainingModuleLibrary')}
            />
          )}

          {activeTab === 'NewSopRolloutNotification' && (
            <NewSopRolloutNotificationScreen
              userRole={currentUser.role}
              partnerId={currentUser.id}
              currentLanguage={appLanguage}
              onNavigateToSopRepo={() => setActiveTab('SopDocumentRepository')}
              onNavigateToQuiz={(quizId) => {
                setSelectedAssessmentId(quizId);
                setActiveTab('QuizCertificationTest');
              }}
              onBack={() => setActiveTab('TrainingModuleLibrary')}
            />
          )}

          {activeTab === 'TrainingFeedback' && (
            <TrainingFeedbackScreen
              userRole={currentUser.role}
              partnerId={currentUser.id}
              partnerName={currentUser.name}
              currentLanguage={appLanguage}
              onNavigateToLibrary={() => setActiveTab('TrainingModuleLibrary')}
              onBack={() => setActiveTab('TrainingModuleLibrary')}
            />
          )}

          {activeTab === 'CommissionRulesEngine' && (
            <CommissionRulesEngineScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              onNavigateToPayoutTracker={() => setActiveTab('StageWisePayoutTracker')}
              onBack={() => setActiveTab('RecruitmentLanding')}
            />
          )}

          {activeTab === 'StageWisePayoutTracker' && (
            <StageWisePayoutTrackerScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              onNavigateToRulesEngine={() => setActiveTab('CommissionRulesEngine')}
              onBack={() => setActiveTab('CommissionRulesEngine')}
            />
          )}

          {activeTab === 'PayoutApprovalQueue' && (
            <PayoutApprovalQueueScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              onNavigateToDisbursement={() => setActiveTab('AutomatedPayoutDisbursement')}
              onNavigateToRulesEngine={() => setActiveTab('CommissionRulesEngine')}
              onBack={() => setActiveTab('StageWisePayoutTracker')}
            />
          )}

          {activeTab === 'AutomatedPayoutDisbursement' && (
            <AutomatedPayoutDisbursementScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              onNavigateToApprovalQueue={() => setActiveTab('PayoutApprovalQueue')}
              onBack={() => setActiveTab('PayoutApprovalQueue')}
            />
          )}

          {activeTab === 'RewardsLeaderboard' && (
            <RewardsLeaderboardScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onNavigateToPayoutTracker={() => setActiveTab('StageWisePayoutTracker')}
              onBack={() => setActiveTab('StageWisePayoutTracker')}
            />
          )}

          {activeTab === 'BadgesMilestones' && (
            <BadgesMilestonesScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onNavigateToLeaderboard={() => setActiveTab('RewardsLeaderboard')}
              onNavigateToTraining={() => setActiveTab('TrainingModuleCatalog')}
              onBack={() => setActiveTab('StageWisePayoutTracker')}
            />
          )}

          {activeTab === 'ContestConfiguration' && (
            <ContestConfigurationScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              onNavigateToLeaderboard={() => setActiveTab('RewardsLeaderboard')}
              onBack={() => setActiveTab('CommissionRulesEngine')}
            />
          )}

          {activeTab === 'PayoutHistoryStatements' && (
            <PayoutHistoryStatementsScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onNavigateToDisputeModal={(entryId) => {
                setActiveTab('PayoutDisputeQuery');
              }}
              onNavigateToTdsStatement={() => setActiveTab('TaxDeductionStatement')}
              onNavigateToDisputeQuery={() => setActiveTab('PayoutDisputeQuery')}
              onBack={() => setActiveTab('StageWisePayoutTracker')}
            />
          )}

          {activeTab === 'TaxDeductionStatement' && (
            <TaxDeductionStatementScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('PayoutHistoryStatements')}
            />
          )}

          {activeTab === 'PayoutDisputeQuery' && (
            <PayoutDisputeQueryScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('PayoutHistoryStatements')}
              onNavigateToRulesEngine={() => setActiveTab('CommissionRulesEngine')}
            />
          )}

          {(activeTab === 'CustomerHomeDashboard' || activeTab === 'CustomerHome') && (
            <CustomerHomeDashboardScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'ProjectStatusTracker' || activeTab === 'CustomerProjectStatusTracker') && (
            <ProjectStatusTrackerScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('CustomerHomeDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'CustomerDocumentVault' || activeTab === 'SopDocumentRepository') && (
            <CustomerDocumentVaultScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('CustomerHomeDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'CustomerPaymentInstallments' || activeTab === 'PaymentReceiptHistory') && (
            <CustomerPaymentInstallmentsScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('CustomerHomeDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'CustomerSupportTicket' || activeTab === 'CustomerHandoverWalkthrough') && (
            <CustomerSupportTicketScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('CustomerHomeDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'CustomerLiveSupportChat' || activeTab === 'LiveSupportChat') && (
            <CustomerLiveSupportChatScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('CustomerHomeDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'CustomerFeedbackRating' || activeTab === 'CustomerFeedback') && (
            <CustomerFeedbackRatingScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('CustomerHomeDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'CustomerAmcBooking' || activeTab === 'AmcBooking') && (
            <CustomerAmcBookingScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('CustomerHomeDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'CustomerReferralProgram' || activeTab === 'CustomerReferrals' || activeTab === 'ReferralProgram') && (
            <CustomerReferralProgramScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('CustomerHomeDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'CustomerNotificationCenter' || activeTab === 'CustomerNotifications' || activeTab === 'NotificationCenter') && (
            <CustomerNotificationCenterScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('CustomerHomeDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'MasterAutomationRulesDashboard' || activeTab === 'AutomationRulesDashboard' || activeTab === 'MasterAutomationRules') && (
            <MasterAutomationRulesDashboardScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('ExecutiveDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'WorkflowTriggerBuilder' || activeTab === 'TriggerBuilder' || activeTab === 'WorkflowBuilder') && (
            <WorkflowTriggerBuilderScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('MasterAutomationRulesDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'NotificationTemplatesChannels' || activeTab === 'NotificationChannels' || activeTab === 'InternalNotificationTemplates') && (
            <NotificationTemplatesChannelsScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('MasterAutomationRulesDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'EscalationMatrixConfig' || activeTab === 'EscalationMatrix' || activeTab === 'EscalationConfig') && (
            <EscalationMatrixConfigScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('MasterAutomationRulesDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'SlaTimerBreachAlert' || activeTab === 'SlaTimers' || activeTab === 'SlaBreachAlerts') && (
            <SlaTimerBreachAlertScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('MasterAutomationRulesDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'SystemHealthBotMonitoring' || activeTab === 'SystemHealth' || activeTab === 'TechnicalPlumbing') && (
            <SystemHealthBotMonitoringScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('MasterAutomationRulesDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'AuditLogAutomatedActions' || activeTab === 'AutomatedActionAuditLog' || activeTab === 'AutomationAuditLog') && (
            <AuditLogAutomatedActionsScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('MasterAutomationRulesDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'ManualOverrideConsole' || activeTab === 'ManualOverrideTerm' || activeTab === 'ProcessOverrideConsole') && (
            <ManualOverrideConsoleScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('MasterAutomationRulesDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'ApiIntegrationManagement' || activeTab === 'ApiIntegration' || activeTab === 'IntegrationManagement') && (
            <ApiIntegrationManagementScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('MasterAutomationRulesDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'AutomationTestingSandbox' || activeTab === 'AutomationSandbox' || activeTab === 'RuleSandbox') && (
            <AutomationTestingSandboxScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('MasterAutomationRulesDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'CompanyProfileBrandingSettings' || activeTab === 'CompanyProfile' || activeTab === 'BrandingSettings' || activeTab === 'CompanyProfileSettings') && (
            <CompanyProfileBrandingSettingsScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('SettingsMasterDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'UserRolePermissionManagement' || activeTab === 'UserPermissions' || activeTab === 'RolePermissions' || activeTab === 'PermissionsManagement') && (
            <UserRolePermissionManagementScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('SettingsMasterDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'SinglePersonMonitorControlPanel' || activeTab === 'SinglePersonMonitor' || activeTab === 'SoloCompanyMonitor') && (
            <SinglePersonMonitorControlPanelScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('SettingsMasterDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'DataPrivacyConsentManagement' || activeTab === 'DataPrivacy' || activeTab === 'ConsentManagement' || activeTab === 'GdprPrivacy') && (
            <DataPrivacyConsentManagementScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('SettingsMasterDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'SecuritySessionManagement' || activeTab === 'SecuritySessions' || activeTab === 'SessionManagement' || activeTab === 'SecurityThreats') && (
            <SecuritySessionManagementScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('SettingsMasterDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'BackupDataExport' || activeTab === 'DatabaseBackup' || activeTab === 'DataExport' || activeTab === 'DisasterRecovery') && (
            <BackupDataExportScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('SettingsMasterDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'SaaSOpsSubscriptionBilling' || activeTab === 'SaaSBilling' || activeTab === 'SoftwareSubscriptions' || activeTab === 'SaaSExpenses') && (
            <SaaSOpsSubscriptionBillingScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('SettingsMasterDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'LegalContractTemplatesRepository' || activeTab === 'LegalTemplates' || activeTab === 'ContractTemplates' || activeTab === 'StateLiftActs') && (
            <LegalContractTemplatesRepositoryScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('SettingsMasterDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'HelpFaqSupport' || activeTab === 'HelpFAQ' || activeTab === 'KnowledgeBase' || activeTab === 'SupportDesk') && (
            <HelpFaqSupportScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('SettingsMasterDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}

          {(activeTab === 'AppVersionChangelogFeedback' || activeTab === 'AppVersion' || activeTab === 'Changelog' || activeTab === 'AppFeedback') && (
            <AppVersionChangelogFeedbackScreen
              userRole={currentUser.role}
              currentLanguage={appLanguage}
              currentUserId={currentUser.id}
              onBack={() => setActiveTab('SettingsMasterDashboard')}
              onNavigateTab={(tab, params) => setActiveTab(tab)}
            />
          )}







          {activeTab === 'ApplicantDataCollection' && (
            <ApplicantDataCollectionScreen
              user={currentUser}
              applicantId={selectedApplicantId || 'app_2026_01'}
              onBack={() => setActiveTab('RecruitmentLanding')}
              onComplete={(record) => {
                setSelectedApplicantId(record.id);
                setActiveTab('ApplicantScreening');
              }}
            />
          )}

          {activeTab === 'ApplicantScreening' && (
            <ApplicantScreeningScreen
              user={currentUser}
              onNavigateToInterview={(appId) => {
                setSelectedApplicantId(appId);
                setActiveTab('InterviewScheduling');
              }}
              onNavigateToVerification={(appId) => {
                setSelectedApplicantId(appId);
                setActiveTab('BackgroundVerification');
              }}
              onBack={() => setActiveTab('RecruitmentLanding')}
            />
          )}

          {activeTab === 'InterviewScheduling' && (
            <InterviewSchedulingScreen
              user={currentUser}
              applicantId={selectedApplicantId || 'app_2026_01'}
              onNavigateToVerification={(appId) => {
                setSelectedApplicantId(appId);
                setActiveTab('BackgroundVerification');
              }}
              onBack={() => setActiveTab('RecruitmentLanding')}
            />
          )}

          {activeTab === 'BackgroundVerification' && (
            <BackgroundVerificationScreen
              user={currentUser}
              applicantId={selectedApplicantId || 'app_2026_01'}
              onNavigateToOffer={(appId) => {
                setSelectedApplicantId(appId);
                setActiveTab('OfferOnboardingAgreement');
              }}
              onBack={() => setActiveTab('RecruitmentLanding')}
            />
          )}

          {activeTab === 'OfferOnboardingAgreement' && (
            <OfferOnboardingAgreementScreen
              user={currentUser}
              applicantId={selectedApplicantId || 'app_2026_01'}
              onNavigateToDashboard={() => setActiveTab('NewPartnerAggregationDashboard')}
              onNavigateToTierAssignment={(partnerId) => {
                setSelectedApplicantId(partnerId);
                setActiveTab('PartnerTierCategoryAssignment');
              }}
              onBack={() => setActiveTab('RecruitmentLanding')}
            />
          )}

          {activeTab === 'NewPartnerAggregationDashboard' && (
            <NewPartnerAggregationDashboardScreen
              user={currentUser}
              onNavigateToApplicant={(appId) => {
                setSelectedApplicantId(appId);
                setActiveTab('ApplicantDataCollection');
              }}
              onNavigateToOffer={(appId) => {
                setSelectedApplicantId(appId);
                setActiveTab('OfferOnboardingAgreement');
              }}
              onNavigateToTierAssignment={(partnerId) => {
                setSelectedApplicantId(partnerId);
                setActiveTab('PartnerTierCategoryAssignment');
              }}
              onBack={() => setActiveTab('RecruitmentLanding')}
            />
          )}

          {activeTab === 'PartnerTierCategoryAssignment' && (
            <PartnerTierCategoryAssignmentScreen
              user={currentUser}
              partnerId={selectedApplicantId || 'app_2026_01'}
              onNavigateToDashboard={() => setActiveTab('NewPartnerAggregationDashboard')}
              onBack={() => setActiveTab('RecruitmentLanding')}
            />
          )}


          {(currentUser.role === 'surveyor' || currentUser.role === 'technician' || currentUser.role === 'supplier') && activeTab === 'Settings' && (
            <Card className="p-6 max-w-lg mx-auto space-y-4">
              <div className="text-center">
                <Settings className="w-12 h-12 text-antiquegold mx-auto mb-2" />
                <h3 className="font-serif text-xl font-bold text-charcoal">Partner Preferences</h3>
                <p className="text-sm text-warmgray">Set up your localized mobility workbench options.</p>
              </div>
              {renderPreferencesSection()}
              <div className="pt-2">
                <Button variant="secondary" fullWidth onClick={handleLogout}>Log Out / Exit Partner Hub</Button>
              </div>
            </Card>
          )}
    </Suspense>
  );
}
