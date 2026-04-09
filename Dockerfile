# syntax=docker/dockerfile:1.7

# ---- 1. deps: 依存だけ入れたレイヤー (キャッシュ用) ----
FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ---- 2. build: ソース足してビルド ----
FROM deps AS build
WORKDIR /app
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- 3. runtime: 実行に必要なものだけ ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Prisma クライアント (生成済み) と schema、ビルド成果物
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist

# SQLite 永続化用ディレクトリ
RUN mkdir -p /app/data
ENV DATABASE_URL="file:/app/data/prod.db"
ENV PORT=3000
EXPOSE 3000

# 起動時に最新マイグレーションを適用してから起動
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server/index.js"]
