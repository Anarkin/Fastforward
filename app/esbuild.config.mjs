export function webviewOptions(production) {
  return {
    entryPoints: { webview: 'src/webview/main.tsx' },
    format: 'esm',
    splitting: true,
    platform: 'browser',
    outdir: 'dist',
    chunkNames: 'chunks/[name]-[hash]',
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"',
    },
  };
}
