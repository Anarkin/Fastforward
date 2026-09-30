import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as esbuild from 'esbuild';
import electron from 'electron';

const production = process.argv.includes('--production');
const dev = process.argv.includes('--dev');

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: 'info',
};

const copyStatic = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(() => {
      fs.mkdirSync('dist', { recursive: true });
      fs.copyFileSync('src/webview/index.html', 'dist/index.html');
      fs.copyFileSync('build/window-icon.png', 'dist/icon.png');
    });
  },
};

let app;
const restartApp = {
  name: 'restart-app',
  setup(build) {
    build.onEnd((result) => {
      if (!dev || result.errors.length > 0) {
        return;
      }
      if (app) {
        app.removeAllListeners('exit');
        app.kill();
      }
      app = spawn(electron, ['.'], {
        stdio: 'inherit',
        env: { ...process.env, FASTFORWARD_DEV: '1' },
      });
      app.on('exit', (code) => process.exit(code ?? 0));
    });
  },
};

fs.rmSync('dist', { recursive: true, force: true });

const contexts = await Promise.all([
  esbuild.context({
    ...shared,
    entryPoints: {
      main: 'src/main/main.ts',
      preload: 'src/main/preload.ts',
    },
    format: 'cjs',
    platform: 'node',
    outdir: 'dist',
    external: ['electron'],
    plugins: [copyStatic, restartApp],
  }),
  esbuild.context({
    ...shared,
    entryPoints: ['src/webview/main.tsx'],
    format: 'iife',
    platform: 'browser',
    outfile: 'dist/webview.js',
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"',
    },
  }),
]);

if (dev) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
