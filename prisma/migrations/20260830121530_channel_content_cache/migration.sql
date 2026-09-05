-- CreateTable
CREATE TABLE "ChannelContentCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "videoCount" INTEGER NOT NULL,
    "shortCount" INTEGER NOT NULL,
    "liveCount" INTEGER NOT NULL,
    "scannedCount" INTEGER NOT NULL,
    "totalOnChannel" INTEGER,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "newestPublishedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelContentCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelContentCache_userId_key" ON "ChannelContentCache"("userId");
