-- Post にタイトル列を追加 (エディタ経由の本格投稿用、NULL 許容)
ALTER TABLE "Post" ADD COLUMN "title" TEXT;
