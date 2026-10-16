# Acceptance Tests

## Data integrity
- [ ] Selecting project A only displays records linked to A.
- [ ] Selecting project B does not retain stale conversation items from A.
- [ ] Items are sorted by real event timestamp; ties have stable deterministic ordering.
- [ ] Empty event sources show a genuine empty state, not fabricated sample history.
- [ ] Refresh/reload reconstructs the view from persisted records.
- [ ] Errors do not silently become empty/success states.

## Workflow actions
- [ ] Every enabled action calls the existing domain/workflow operation.
- [ ] Invalid stage transition is rejected by business logic.
- [ ] Role without permission cannot execute an action, even if calling the service directly.
- [ ] Double click/retry does not create duplicate side effects where idempotency is required.
- [ ] Success refreshes canonical data; failure leaves the persisted truth visible and explains recovery.
- [ ] Existing payment, QC, handover and other hard gates remain intact.

## Role visibility
- [ ] Internal/admin-only event is not exposed to customer.
- [ ] Supplier sees only the supplier-relevant data allowed by existing policy.
- [ ] Technician sees assigned/relevant tasks only where that is the established policy.
- [ ] Unknown visibility is handled conservatively and documented.

## Visual and usability
- [ ] Original reference and target viewport dimensions are recorded.
- [ ] Header, spacing, cards, type, icons, colors and bottom navigation are compared at matching viewport.
- [ ] No horizontal overflow at target mobile viewport.
- [ ] Text wrapping, long names, long addresses and empty values remain usable.
- [ ] Loading/error/empty/disabled states follow existing design.
- [ ] Keyboard focus and semantic labels are present.
- [ ] No fake buttons or misleading live indicators.

## Regression
- [ ] Existing lint/type checks pass.
- [ ] Existing project view/work queue/workflow/authorization checks pass where available.
- [ ] Build passes.
- [ ] No unrelated screens or existing tests were removed/weakened.
- [ ] Any failing check is reported exactly with cause and status.
