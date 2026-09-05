-- Credits/quotas are managed by the AI provider, not Vidalyse. Rebuild
-- CreditBalance: keyed by catalog provider id (so Light/Pro track separately),
-- `remaining` nullable (NULL = not tracked, never gated), no synthetic `total`.
-- Old per-category rows were prototype seed data with no meaning here — dropped.
PRAGMA foreign_keys=OFF;

DROP TABLE "CreditBalance";

CREATE TABLE "CreditBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "remaining" INTEGER,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreditBalance_userId_providerId_key" ON "CreditBalance"("userId", "providerId");

PRAGMA foreign_keys=ON;
