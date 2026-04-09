// prismjs の言語コンポーネントは内部でグローバル `Prism` を参照する書き方をしている。
// ESM bundler 経由だとそのままだと言語が登録されず Prism.languages.xxx が undefined になる。
// 対策: このファイルで Prism を import → globalThis.Prism にセット → 言語コンポーネントを import。
// markdown.ts はこのファイルから Prism を import することで、評価順序を保証する。
import Prism from 'prismjs';

// @ts-expect-error - 言語ファイルがグローバル Prism を参照する
globalThis.Prism = Prism;

// 主要言語を事前ロード (autoloader 不要)
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';

export { Prism };
