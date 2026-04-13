-- プライベートコミュニティ機能廃止
-- 既存の private コミュニティを public に変換
UPDATE "Community" SET "visibility" = 'public' WHERE "visibility" = 'private';

-- CommunityLeftLog テーブル削除 (private 脱退履歴)
DROP TABLE IF EXISTS "CommunityLeftLog";

-- User にアバターラベル (頭文字カスタム) 追加
ALTER TABLE "User" ADD COLUMN "avatarLabel" TEXT;
