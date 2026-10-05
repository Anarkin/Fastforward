import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as esbuild from 'esbuild';
import electron from 'electron';

const production = process.argv.includes('--production');
const dev = process.argv.includes('--dev');

const shared = {
  bundle: true,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: 'info',
};

let webviewBuild = Promise.withResolvers();
const trackWebview = {
  name: 'track-webview',
  setup(build) {
    let built = false;
    build.onStart(() => {
      if (built) {
        webviewBuild = Promise.withResolvers();
      }
    });
    build.onEnd(() => {
      built = true;
      webviewBuild.resolve();
    });
  },
};

let app;
const restartApp = {
  name: 'restart-app',
  setup(build) {
    build.onEnd(async (result) => {
      if (!dev || result.errors.length > 0) {
        return;
      }
      if (app) {
        const old = app;
        old.removeAllListeners('exit');
        if (old.exitCode === null && old.signalCode === null) {
          const exited = new Promise((resolve) => old.once('exit', resolve));
          // Killing skips the app's close and will-quit handlers on Windows,
          // so it is asked to quit first
          if (old.connected) {
            old.disconnect();
          }
          const killing = setTimeout(() => old.kill(), 5000);
          await exited;
          clearTimeout(killing);
        }
      }
      await webviewBuild.promise;
      app = spawn(electron, ['.'], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: { ...process.env, FASTFORWARD_DEV: '1' },
      });
      app.on('exit', (code) => process.exit(code ?? 0));
    });
  },
};

fs.mkdirSync('dist', { recursive: true });
for (const entry of fs.readdirSync('dist')) {
  fs.rmSync(`dist/${entry}`, { recursive: true, force: true });
}
fs.copyFileSync('src/webview/index.html', 'dist/index.html');
fs.copyFileSync('build/window-icon.png', 'dist/icon.png');
fs.copyFileSync('src/settings.json', 'dist/settings.json');

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
    external: ['electron', 'electron-updater'],
    plugins: [restartApp],
  }),
  esbuild.context({
    ...shared,
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
    plugins: [trackWebview],
  }),
]);

if (dev) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  const copied = new Map();
  const copyOnChange = (folder, name) =>
    fs.watch(folder, (_event, file) => {
      if (file === name) {
        clearTimeout(copied.get(name));
        copied.set(
          name,
          setTimeout(
            () => fs.copyFileSync(`${folder}/${name}`, `dist/${name}`),
            100,
          ),
        );
      }
    });
  copyOnChange('src', 'settings.json');
  copyOnChange('src/webview', 'index.html');
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
