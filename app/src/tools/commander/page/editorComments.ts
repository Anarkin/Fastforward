import { EditorState, type Extension } from '@codemirror/state';

interface CommentTokens {
  readonly line?: string;
  readonly block?: { readonly open: string; readonly close: string };
}

const slashes: CommentTokens = {
  line: '//',
  block: { open: '/*', close: '*/' },
};
const hashes: CommentTokens = { line: '#' };
const markup: CommentTokens = { block: { open: '<!--', close: '-->' } };
const dashes: CommentTokens = { line: '--' };
const semicolons: CommentTokens = { line: ';' };
const percents: CommentTokens = { line: '%' };
const parentheses = { open: '(*', close: '*)' };

const commentTokens: Readonly<Record<string, CommentTokens>> = {
  javascript: slashes,
  typescript: slashes,
  tsx: slashes,
  jsx: slashes,
  jsonc: slashes,
  json5: slashes,
  c: slashes,
  cpp: slashes,
  csharp: slashes,
  java: slashes,
  go: slashes,
  rust: slashes,
  swift: slashes,
  kotlin: slashes,
  scala: slashes,
  php: slashes,
  dart: slashes,
  groovy: slashes,
  'objective-c': slashes,
  scss: slashes,
  less: slashes,
  zig: slashes,
  css: { block: { open: '/*', close: '*/' } },
  html: markup,
  xml: markup,
  markdown: markup,
  vue: markup,
  svelte: markup,
  python: hashes,
  ruby: hashes,
  shellscript: hashes,
  yaml: hashes,
  toml: hashes,
  perl: hashes,
  r: hashes,
  make: hashes,
  docker: hashes,
  cmake: hashes,
  elixir: hashes,
  julia: hashes,
  nix: hashes,
  powershell: { line: '#', block: { open: '<#', close: '#>' } },
  ini: semicolons,
  clojure: semicolons,
  lisp: semicolons,
  sql: { line: '--', block: { open: '/*', close: '*/' } },
  lua: { line: '--', block: { open: '--[[', close: ']]' } },
  haskell: { line: '--', block: { open: '{-', close: '-}' } },
  ada: dashes,
  bat: { line: 'REM' },
  fsharp: { line: '//', block: parentheses },
  ocaml: { block: parentheses },
  vb: { line: "'" },
  erlang: percents,
  latex: percents,
  matlab: percents,
};

export function commentsOf(language: string | undefined): Extension {
  const tokens = language === undefined ? undefined : commentTokens[language];
  return tokens === undefined
    ? []
    : EditorState.languageData.of(() => [{ commentTokens: tokens }]);
}
