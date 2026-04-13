-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CommunityTimeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'members_only',
    "visibilityAffiliationIds" TEXT NOT NULL DEFAULT '',
    "visibilityUserIds" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityTimeline_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CommunityTimeline" ("communityId", "createdAt", "id", "name", "visibility", "visibilityAffiliationIds") SELECT "communityId", "createdAt", "id", "name", "visibility", "visibilityAffiliationIds" FROM "CommunityTimeline";
DROP TABLE "CommunityTimeline";
ALTER TABLE "new_CommunityTimeline" RENAME TO "CommunityTimeline";
CREATE INDEX "CommunityTimeline_communityId_idx" ON "CommunityTimeline"("communityId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
