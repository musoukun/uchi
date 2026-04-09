import MarkdownIt from 'markdown-it';
import mdContainer from 'markdown-it-container';
import { Prism } from './prism-setup';

// 言語エイリアス (markdown-it の lang 文字列 → Prism の言語キー)
const LANG_ALIAS: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  html: 'markup',
  xml: 'markup',
};

function resolveLang(lang: string): string {
  const k = (lang || '').toLowerCase();
  return LANG_ALIAS[k] || k;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight: (str, lang) => {
    const resolved = resolveLang(lang);
    if (resolved && Prism.languages[resolved]) {
      try {
        const highlighted = Prism.highlight(str, Prism.languages[resolved], resolved);
        return `<pre class="language-${resolved}"><code class="language-${resolved}">${highlighted}</code></pre>`;
      } catch (e) {
        console.warn('[markdown] prism highlight failed', { lang, resolved, error: e });
      }
    } else if (lang) {
      console.warn('[markdown] prism language not loaded:', lang, '(resolved:', resolved + ')');
    }
    return `<pre><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

// :::message ... ::: / :::message alert ... :::
md.use(mdContainer, 'message', {
  validate: (params: string) => /^message\s*(alert)?$/.test(params.trim()),
  render: (tokens: any[], idx: number) => {
    const m = tokens[idx].info.trim().match(/^message\s*(alert)?$/);
    if (tokens[idx].nesting === 1) {
      return `<div class="msg-block ${m[1] || ''}">`;
    }
    return '</div>';
  },
});

// :::details summary ... :::
md.use(mdContainer, 'details', {
  validate: () => true,
  render: (tokens: any[], idx: number) => {
    if (tokens[idx].nesting === 1) {
      const summary = tokens[idx].info.trim().replace(/^details\s*/, '') || '詳細';
      return `<details class="details-block"><summary>${md.utils.escapeHtml(summary)}</summary>`;
    }
    return '</details>';
  },
});

export function renderMd(src: string | null | undefined): string {
  return md.render(src || '');
}
