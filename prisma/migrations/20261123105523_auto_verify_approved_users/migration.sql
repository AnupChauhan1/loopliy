-- Auto-verify every approved/active account so email verification never blocks login
UPDATE "User"
SET "emailVerified" = COALESCE("emailVerified", "approvedAt", "adminApprovedAt", "hrApprovedAt", NOW())
WHERE "approvedAt" IS NOT NULL OR "adminApprovedAt" IS NOT NULL OR "hrApprovedAt" IS NOT NULL;
