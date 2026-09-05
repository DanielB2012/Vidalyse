-- Tiny key/value store for user-entered settings that aren't tied to a YouTube
-- account. First use: the user's own Gemini API key for the online models.
-- Vidalyse ships without a key of its own.
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
