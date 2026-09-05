-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChannelContentCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "videoCount" INTEGER NOT NULL,
    "shortCount" INTEGER NOT NULL,
    "liveCount" INTEGER NOT NULL,
    "publicCount" INTEGER NOT NULL DEFAULT 0,
    "unlistedCount" INTEGER NOT NULL DEFAULT 0,
    "privateCount" INTEGER NOT NULL DEFAULT 0,
    "scannedCount" INTEGER NOT NULL,
    "totalOnChannel" INTEGER,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "newestPublishedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelContentCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChannelContentCache" ("capped", "id", "liveCount", "newestPublishedAt", "scannedCount", "shortCount", "totalOnChannel", "updatedAt", "userId", "videoCount") SELECT "capped", "id", "liveCount", "newestPublishedAt", "scannedCount", "shortCount", "totalOnChannel", "updatedAt", "userId", "videoCount" FROM "ChannelContentCache";
DROP TABLE "ChannelContentCache";
ALTER TABLE "new_ChannelContentCache" RENAME TO "ChannelContentCache";
CREATE UNIQUE INDEX "ChannelContentCache_userId_key" ON "ChannelContentCache"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
