-- タイムライン visibility を 2段シンプルモデルに変換
-- members_only / public → open
-- selected_users → private
-- affiliation_in → open (所属ベースは廃止)
UPDATE "CommunityTimeline" SET "visibility" = 'open' WHERE "visibility" IN ('members_only', 'public', 'affiliation_in');
UPDATE "CommunityTimeline" SET "visibility" = 'private' WHERE "visibility" = 'selected_users';
