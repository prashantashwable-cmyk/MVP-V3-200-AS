# REUSE MAP: existing code to use before writing new code

> Built from a read-only scan of commit `fc505b8` on 2026-09-24. Step 01 must **verify every row** and correct it in the audit.
> **Rule for every step:** check this map before creating any file. A new screen or service needs a one-line reason in the PR saying why reuse didn't fit.

## Legend: which store the code uses today
| Mark | Meaning | Typical effort |
|---|---|---|
| ◆ | **Canonical.** Already reads and writes the shared Firestore repository. | Use as-is or extend. Cheapest. |
| ★ | **Dual-write bridged.** Writes already reach canonical Firestore, but reads still come from the legacy localStorage store. | **Switch its reads to canonical.** Very cheap. Built by the old pack, phases 15–18. |
| ○ | **Legacy only.** Reads and writes browser localStorage through `DbManager`. | Rewire it, or build a thin new screen (see the rule below). |
| □ | **UI only.** No persistence found; probably local state or mock data. | Wire the UI to canonical entities. |

## The size rule (this is what saves the most work)
Reuse **services and components** before whole screens. A legacy-only (○) screen may be over about 600 lines and do far more than the MVP needs. Examples: `LeadInbox` has 1,646 lines, `LeadFollowUpScheduler` 1,653, `PaymentStageScheduleSetup` 1,303 and `EmergencyEscalationAlert` 1,135.

In that case:
1. Build a **thin MVP screen** of about 250 lines or less.
2. Reuse the old screen's sub-components, its styles and the canonical services.
3. Hide the old screen behind `MVP_MODE`.

Rewiring 1,600 lines of localStorage logic costs more than it saves.

## Backbone (Step 03)
| Need | Reuse | Mark | Mode |
|---|---|---|---|
| Entities and IDs | `src/domain/entities.ts`, `src/domain/ids.ts` | ◆ | Extend additively: Task, Blocker, and new fields and stages |
| Repositories | `src/repository/*` (Firestore, plus the demo repository for tests) | ◆ | Add `tasks` and `blockers` the same way the existing ones are built |
| Audit | `src/lib/audit.ts` | ◆ | As-is |
| Idempotency and concurrency | `src/lib/idempotency.ts`, the repository `version` field | ◆ | As-is |
| Authorization | `src/lib/authz.ts`, `src/domain/permissions.ts` | ◆ | Extend with owner, sales and qc |
| Payment gate pattern | `src/services/commercialWorkflow.ts` (payment-before-procurement hard gate) | ◆ | Copy the pattern for the D-14 soft gates with override |
| Workflow references | `src/workflows/definitions/*`, `src/services/operationsWorkflow.ts` | ◆ | Read for transition rules; reuse functions where they fit D-08 |

## Step 04: Order View, dashboard, navigation
| Need | Reuse | Mark | Lines | Mode |
|---|---|---|---|---|
| Universal Order View | `ProjectOperatingView.tsx` + `services/projectOperatingView.ts` | ◆ | 195 | **Extend.** It already has stage, next action, owner, blockers and money. |
| Next action and owner | `WorkQueueScreen.tsx` + `services/workQueue.ts` | ◆ | 102 | Extend to read persisted tasks |
| Needs Attention | `services/controlTower.ts` | ◆ | — | Reuse the categories |
| Landing and navigation | `OperatingSurfacesHome.tsx`, `navigation/surfaces.ts`, `routers/*` | ◆ | 97 | Add the `MVP_MODE` filter |

## Step 05: Leads, sales and survey
| Need | Reuse | Mark | Lines | Mode |
|---|---|---|---|---|
| Lead detail | `LeadDetail.tsx` | ★ | 1,211 | Switch reads; trim fields to spec §13 |
| My Leads / pipeline | `LeadKanban.tsx` | ★ | 1,113 | Switch reads; hide scoring and AI parts |
| New Lead form | `LeadInbox.tsx` | ○ | 1,646 | **Thin new form.** Reuse its inputs and styles. |
| Follow-ups | `LeadFollowUpScheduler.tsx` | ○ | 1,653 | **Thin new list** (a query on `next_followup`) |
| Survey form | `SiteVisitVerification.tsx` | ○ | 790 | Rewire, or thin new form with the §15 fields |
| Camera | `CameraCapture.tsx` | □ | 322 | As-is |
| Lead store helper | `src/lib/firestoreLeads.ts` | ? | — | Verify whether it is canonical. Reuse it if so. |

## Step 06: Quote, booking and payments
| Need | Reuse | Mark | Lines | Mode |
|---|---|---|---|---|
| Quote builder | `QuotePricing.tsx` | □ | 549 | Wire the UI to canonical `Quote`/`QuoteVersion` |
| Customer quote view | `QuotationPreview.tsx` | □ | 622 | Wire it; strip cost fields |
| Margin settings | `PricingRulesMarginConfig.tsx` | □ | 534 | Only if it maps cheaply onto `src/mvp/config.ts`; otherwise hide it |
| Margin approval | `DiscountApprovalWorkflow.tsx` | □ | 761 | Reuse the UI with `ApprovalRequest` and APPROVE_MARGIN |
| Payment milestones | `PaymentStageScheduleSetup.tsx` | ○ | 1,303 | **Thin new milestone panel** on the Order View |
| Payment verification | `PaymentCollectionDashboard.tsx` | ★ | 1,103 | Switch reads; add verify/reject |
| Online payment | `OnlinePaymentCheckout.tsx` | ★ | 662 | Keep only if the audit shows the gateway is real; otherwise hide |

## Step 07: Site-ready, supplier and delivery
| Need | Reuse | Mark | Lines | Mode |
|---|---|---|---|---|
| PO | `PurchaseOrderGenerator.tsx` | ★ | 734 | Switch reads; simplify |
| PO status and delay | `SupplierOrderStatusTracking.tsx` | ★ | 524 | Switch reads |
| Readiness and delivery checklist | `SiteDeliveryChecklistScreen.tsx` | ★ | 623 | Switch reads; reuse it for the customer readiness checklist |
| Delivery date | `DeliverySchedulingScreen.tsx` | ★ | 934 | Switch reads, or fold into the PO expected date |
| Shipment tracking | `LiveShipmentTrackingScreen.tsx` | ★ | 430 | The MVP needs status only. Hide the GPS parts. |
| Supplier list | `SupplierDirectory.tsx` | ○ | 774 | Rewire (simple) |
| Material received | `MaterialReceivedConfirmationScreen.tsx` | ○ | 613 | Rewire, or use the delivery checklist |

## Step 08: Technician, installation and blockers
| Need | Reuse | Mark | Lines | Mode |
|---|---|---|---|---|
| Start and check-in | `TechnicianCheckInCheckOutScreen.tsx` | ★ | 311 | Switch reads; add the START gate |
| Photo evidence | `PhotoVideoEvidenceCaptureScreen.tsx` | ★ | 391 | Switch reads; images only |
| TODAY home | `TechnicianHomeMyJobsScreen.tsx` | ○ | 408 | Rewire to tasks |
| 11-item checklist | `InstallationSopChecklistScreen.tsx` | ○ | 406 | Rewire; set the items to spec §18 |
| Blockers | `IssueBlockerReportingScreen.tsx` | ○ | 441 | Rewire to the `Blocker` entity with 8 reasons |
| Offline and uploads | `src/offline/outbox.ts`, `mediaUpload.ts` | ◆ | — | Reuse if they work with canonical writes |

## Step 09: QC, handover, AMC and emergency
| Need | Reuse | Mark | Lines | Mode |
|---|---|---|---|---|
| QC assignment and decision | `QcInspectorAssignmentScreen.tsx` | ★ | 610 | Switch reads; add PASS/REWORK/FAIL |
| QC checklist | `QualityChecklistMechanicalScreen.tsx` (+ Electrical) | ○ | 609 | Merge into one QC form |
| Rework | `ReworkAssignmentScreen.tsx` + canonical `Snag` | ○ | 646 | Rewire to Snag + REWORK task |
| Handover | `FinalHandoverChecklistScreen.tsx` | ★ | 578 | Switch reads |
| Handover certificate | `HandoverCompletionCertificateScreen.tsx` | ★ | 542 | Switch reads |
| Customer handover confirmation | `CustomerHandoverWalkthroughScreen.tsx` | ★ | 666 | Switch reads |
| Warranty and AMC | `WarrantyAmcRegistrationScreen.tsx` | ○ | 676 | Rewire to `Warranty`/`AMC` |
| Emergency (D-28) | `EmergencyEscalationAlert.tsx` | ○ | 1,135 | **Thin new** emergency button and flow; reuse its UI parts |

## Step 10: Customer, owner, notifications, reports, languages
| Need | Reuse | Mark | Lines | Mode |
|---|---|---|---|---|
| Customer home | `CustomerHomeDashboardScreen.tsx` + `services/portalWorkSummary.ts` | ◆/○ mixed | 375 | Finish moving it to canonical; the service is canonical |
| Documents | `CustomerDocumentVaultScreen.tsx` | ◆/○ mixed | 268 | Finish moving it to canonical |
| Support and complaints | `CustomerSupportTicketScreen.tsx` → canonical `ServiceCase` | ○ | 495 | Rewire |
| Notification centre | `CustomerNotificationCenterScreen.tsx` + `services/notificationService.ts` | ○ + ◆ | 389 | Rewire the UI to `NotificationRecord` |
| Reports | `RevenueProfitAnalytics.tsx`, `SalesFunnelAnalytics.tsx` | ○ | 1,398 / 1,031 | **Thin new report tables.** Reuse only their chart components. |
| Languages | `src/lib/language.ts` (en/mr/hi exist) | ○ | — | Decouple from `DbManager`; add the MVP keys |

## Step 11: Security and compliance
| Need | Reuse | Mark | Mode |
|---|---|---|---|
| Compliance documents | `ComplianceCertificationScreen.tsx` (★, 515 lines) + `DocumentRecord` | ★ | Switch reads; add the D-27 list |
| Demo bypass guard | `src/lib/demoCredentials.ts` + `scripts/production-bundle-bypass-check.ts` | ◆ | Keep; must pass |
| Rules and hardening | `firestore.rules`, `scripts/security-hardening-check.ts`, `destructive-action-safety-check.ts`, `hard-gate-attack-test.ts` | ◆ | Extend for the new collections |
| Bundle size | `scripts/code-splitting-check.ts` | ◆ | Keep hidden screens out of the MVP bundles |

## Step 12: Tests (don't write from scratch)
| Existing | What it already proves | Reuse for |
|---|---|---|
| `scripts/full-company-simulation.ts` | One project through the full lifecycle via the real screen bridges, **including QC fail → snag → rework → reinspection → pass** (48 assertions) | Adapt it for S1 and S4 |
| `scripts/final-e2e-acceptance.ts` | One project through the canonical service layer | Base for the S1 service-level check |
| `project-operating-view-check.ts`, `work-queue-check.ts` | Order View and next-action logic | Extend for progress, health and tasks |
| `transactional-idempotency-concurrency-test.ts` | Concurrent writes and idempotency | Double-accept and duplicate-task checks |
| `installation-qc-handover-bridge-check.ts` | Installation → QC → handover writes | S1 steps 13–16 |
| `docs/production/QC-FAILURE-LOOP-UAT.md`, `FULL-LIVE-PROJECT-LIFECYCLE-UAT.md` | Earlier manual UAT scripts | Source for `OWNER_UAT_SCRIPT.md` |
| The earlier Playwright scratch approach (`.uat-scratch/` in `.gitignore`) | Real-browser UAT without adding a dependency | E2E option for Step 12 |
