# Benn

社内に閉じた、Markdown 記事投稿 SNS。
Notion などの社外 SaaS が利用禁止されている環境でも、Markdown で技術記事を書いて共有できる場所を作るための OSS です。

## 想定する利用者

- 社内 Wiki が Markdown 非対応で、コードブロックの色付けすらできない
- Notion / Confluence / GitHub などの社外サービスが遮断されている
- 技術ノウハウを共有する場所として、OneNote や旧式の社内 SNS しか選択肢がない

このような環境で、自分のサーバ 1 台で Zenn のような記事投稿 SNS を立ち上げたい人を想定しています。

## 機能

### 記事
- Markdown による記事の作成 / 編集 / 下書き保存 / 公開
- 記事タイプ (`tech` / `idea`) の選択
- 絵文字アイコン、トピック (タグ) の付与 (最大 5)
- コードブロックのシンタックスハイライト (Prism, 言語自動判定)
- 数式記法 (KaTeX)、注釈ボックス (`:::message`)
- 画像 / GIF のドラッグ&ドロップ・クリップボード貼り付け対応 (最大 50MB)
- いいね、ブックマーク

### 一覧と発見
- 新着、トレンド (期間集計)、フォロー中の 3 つのフィード
- トピックページ、ユーザーページ
- キーワード検索、タイプ (tech/idea) フィルタ
- 自分のブックマーク一覧、自分の下書き一覧

### タグ入力
- Tab / Enter でチップ化
- 既存トピックの候補をオートコンプリートで表示
- ↑ ↓ で候補選択、Backspace で削除

### ユーザー
- メールアドレス + パスワードでアカウント作成 / ログイン
- プロフィール編集 (名前、アバター、自己紹介)
- ユーザー / トピックのフォロー機能

## 技術構成

- フロントエンド: React 18 + React Router 7 + Vite
- バックエンド: Hono (Node アダプタ)
- データベース: SQLite (Prisma ORM)
- Markdown: markdown-it + markdown-it-container
- ハイライト: Prism.js
- 数式: KaTeX
- 認証: メール + パスワード (パスワードハッシュ化、セッション Cookie)

データは SQLite ファイル 1 個に集約されます。バックアップは `.db` ファイルをコピーすれば取れます。

## 起動方法

### Docker で動かす場合 (推奨)

```bash
docker compose up -d
```

ブラウザで `http://localhost:3000` を開きます。
SQLite ファイルは Docker ボリューム `benn-data` に永続化されます。

### ローカル開発

```bash
npm install
npx prisma migrate dev
npm run dev
```

開発サーバが `http://localhost:5173` (Vite) で起動します。
API は同じプロセスの Hono が `/api/*` で応答します。

## 設定

| 環境変数      | デフォルト                  | 説明                                  |
| ------------- | --------------------------- | ------------------------------------- |
| `DATABASE_URL`| `file:/app/data/prod.db`    | SQLite ファイルのパス                 |
| `PORT`        | `3000`                      | リッスンするポート                    |
| `NODE_ENV`    | `production` (Docker 内)    | `production` で静的ファイルを配信     |

## 制限

- 記事本文は最大 49,000 文字
- 画像 / GIF アップロードは 1 ファイルあたり最大 50MB
- アップロードは画像系 MIME (`png` / `jpeg` / `gif` / `webp` / `svg+xml`) に限定
- 同時接続数の上限は SQLite と Node プロセスの性能に依存 (社内人数規模を想定)

## バックアップ

SQLite ファイルとアップロード画像をコピーすれば、そのままバックアップとして使えます。

```bash
docker run --rm -v benn-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/benn-backup.tar.gz -C /data .
```

## ライセンス

[MIT License](./LICENSE) © 2026 musoukun

## このプロジェクトと Zenn の関係

本プロジェクトは Zenn ([https://zenn.dev](https://zenn.dev)) の UI と機能から着想を得た独自実装の OSS です。
Zenn および Zenn のロゴはクラスメソッド株式会社の商標であり、本プロジェクトとは一切関係ありません。
Zenn のソースコード、デザイン素材、利用者の投稿記事は一切含みません。
