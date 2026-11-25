# EraEarn Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Identity & PII Isolation**: `users/{userId}` documents contain investor email and financial balances and may only be read by the document owner (`request.auth.uid == userId`) or an authorized platform administrator. Blanket collection listing by regular users is forbidden.
2. **No Self-Assigned Privileges**: Users cannot create or update `role` to `'admin'`, cannot elevate `kycStatus`, and cannot forge `admins/{uid}` entries.
3. **Plan Integrity**: Investment positions must reference an existing active `plans/{planId}` document, with `principal >= plan.minAmount` and `monthlyRoi` bounded within `[plan.minMonthlyRoi, plan.maxMonthlyRoi]`.
4. **Conservation of Funds**: Investors cannot inflate `availableBalance` out of thin air. Investing transfers funds from `availableBalance` to `totalInvested` in equal magnitude (`availableBalance + totalInvested` remains invariant). Withdrawals strictly reduce `availableBalance`. Deposits require admin verification (`status: 'pending'` on creation).
5. **Terminal State Locking**: Once a transaction is `'completed'` or `'rejected'`, non-admin users cannot mutate its status or amount.
6. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must match `request.time`.

## 2. The Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unverified Email Write**: Authenticated user with `email_verified == false` attempts `users/{uid}` create.
2. **Self-Admin Escalation**: Investor creates `users/{uid}` with `role: "admin"` or `availableBalance: 999999`.
3. **Cross-User PII Read**: Investor A calls `get()` or `list()` on `users` belonging to Investor B.
4. **Shadow Ghost Field**: Investor creates `investments/{id}` with extra field `isApprovedOverride: true`.
5. **ID Poisoning**: Investor creates `transactions/{1500_char_string}` exceeding 128-char ID limit.
6. **Forged ROI Rate**: Investor creates `investments/{id}` with `principal: 100` and `monthlyRoi: 99.0` against Tier 1 (`5%-7%`).
7. **Orphan Plan Reference**: Investor creates `investments/{id}` referencing non-existent `planId: "fake_plan"`.
8. **Direct Balance Minting**: Investor updates `users/{uid}` setting `availableBalance: 50000` without matching `totalInvested` decrease or valid yield claim.
9. **Fake Completed Deposit**: Investor creates `transactions/{id}` with `type: "deposit"` and `status: "completed"`.
10. **Transaction Tampering**: Investor updates a `'pending'` withdrawal transaction to `status: "completed"` or increases `amount`.
11. **Plan Tampering**: Non-admin investor updates `plans/tier_core` to set `maxMonthlyRoi: 50`.
12. **Admin Registry Spoof**: Non-admin investor writes to `admins/{uid}` to grant themselves admin privileges.
