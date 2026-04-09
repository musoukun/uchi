import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { csrf } from 'hono/csrf';
import { api } from './routes';
import { authRoutes } from './auth-routes';
import { loadUser } from './auth';

const app = new Hono();

app.use('*', logger());

// CSRF: state 変更系で Origin ヘッダを検証 (SameSite=Lax と二重防御)
// dev は同一オリジンしかないので default 設定で OK
app.use('*', csrf());

// favicon.ico の自動 404 を抑制
app.get('/favicon.ico', (c) => c.body(null, 204));

// グローバルエラーハンドラ
app.onError((err, c) => {
  console.error(err);
  // バリデーションエラーは 400 で返す (Error.message をそのまま見せる)
  const status =
    err.message === 'not found' ? 404 :
    err.message === 'forbidden' ? 403 :
    err.message === 'not logged in' ? 401 : 400;
  return c.json({ error: err.message }, status);
});

// 認証関連 (loadUser 不要)
app.route('/api/auth', authRoutes);

// API: loadUser でセッションから user を取得して c.var.user に注入
app.use('/api/*', loadUser);
app.route('/api', api);

const isProd = process.env.NODE_ENV === 'production' || !!(import.meta as any).env?.PROD;

if (isProd) {
  const { serveStatic } = await import('@hono/node-server/serve-static');
  const { readFile } = await import('node:fs/promises');

  app.use('/assets/*', serveStatic({ root: './dist/client' }));

  let cachedHtml: string | null = null;
  app.get('*', async (c) => {
    if (!cachedHtml) cachedHtml = await readFile('./dist/client/index.html', 'utf8');
    return c.html(cachedHtml);
  });

  const { serve } = await import('@hono/node-server');
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port });
  console.log(`Benn listening on http://localhost:${port}`);
} else {
  app.get('*', (c) =>
    c.html(
      `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Benn (dev)</title>
    <script type="module">
      import RefreshRuntime from "/@react-refresh"
      RefreshRuntime.injectIntoGlobalHook(window)
      window.$RefreshReg$ = () => {}
      window.$RefreshSig$ = () => (type) => type
      window.__vite_plugin_react_preamble_installed__ = true
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/@vite/client"></script>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>`
    )
  );
}

export default app;
