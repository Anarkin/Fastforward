import type { BuildOptions } from 'esbuild';

function sharedOptions(production: boolean): BuildOptions {
  return {
    bundle: true,
    sourcemap: !production,
    sourcesContent: false,
  };
}

export function mainOptions(production: boolean): BuildOptions {
  return {
    ...sharedOptions(production),
    entryPoints: {
      main: 'src/main/main.ts',
      preload: 'src/main/preload.ts',
      ptyHost: 'src/tools/terminal/main/ptyHost.ts',
      gitSpawner: 'src/tools/git/main/cli/gitSpawnerWorker.ts',
      commitReader: 'src/tools/git/main/history/commitReaderWorker.ts',
    },
    format: 'cjs',
    platform: 'node',
    outdir: 'dist',
    external: ['electron', 'electron-updater', 'node-pty', 'koffi'],
  };
}

export function webviewOptions(production: boolean): BuildOptions {
  return {
    ...sharedOptions(production),
    entryPoints: {
      webview: 'src/shell/page/main.tsx',
      syntaxWorker: 'src/ui/syntaxWorker.ts',
      thumbnailWorker: 'src/ui/thumbnailWorker.ts',
      pdfWorker: 'node_modules/pdfjs-dist/build/pdf.worker.mjs',
    },
    format: 'esm',
    splitting: true,
    platform: 'browser',
    outdir: 'dist',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    loader: { '.svg': 'file', '.gif': 'file' },
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"',
    },
  };
}
