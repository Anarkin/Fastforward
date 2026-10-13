function sharedOptions(production) {
  return {
    bundle: true,
    sourcemap: !production,
    sourcesContent: false,
  };
}

export function mainOptions(production) {
  return {
    ...sharedOptions(production),
    entryPoints: {
      main: 'src/main/main.ts',
      preload: 'src/main/preload.ts',
    },
    format: 'cjs',
    platform: 'node',
    outdir: 'dist',
    external: ['electron', 'electron-updater'],
  };
}

export function webviewOptions(production) {
  return {
    ...sharedOptions(production),
    entryPoints: {
      webview: 'src/webview/main.tsx',
      syntaxWorker: 'src/webview/syntaxWorker.ts',
    },
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
