/*
  Warnings:

  - You are about to drop the column `liveCount` on the `ChannelContentCache` table. All the data in the column will be lost.
  - You are about to drop the column `privateCount` on the `ChannelContentCache` table. All the data in the column will be lost.
  - You are about to drop the column `publicCount` on the `ChannelContentCache` table. All the data in the column will be lost.
  - You are about to drop the column `shortCount` on the `ChannelContentCache` table. All the data in the column will be lost.
  - You are about to drop the column `unlistedCount` on the `ChannelContentCache` table. All the data in the column will be lost.
  - You are about to drop the column `videoCount` on the `ChannelContentCache` table. All the data in the column will be lost.
  - Added the required column `matrix` to the `ChannelContentCache` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChannelContentCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "matrix" JSONB NOT NULL,
    "scannedCount" INTEGER NOT NULL,
    "totalOnChannel" INTEGER,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "newestPublishedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelContentCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChannelContentCache" ("capped", "id", "newestPublishedAt", "scannedCount", "totalOnChannel", "updatedAt", "userId") SELECT "capped", "id", "newestPublishedAt", "scannedCount", "totalOnChannel", "updatedAt", "userId" FROM "ChannelContentCache";
DROP TABLE "ChannelContentCache";
ALTER TABLE "new_ChannelContentCache" RENAME TO "ChannelContentCache";
CREATE UNIQUE INDEX "ChannelContentCache_userId_key" ON "ChannelContentCache"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
