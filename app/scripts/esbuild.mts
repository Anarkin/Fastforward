import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { quitApp } from './devApp.mts';
import { ensureSevenZip } from './sevenZip.mts';
import { mainOptions, webviewOptions } from '../esbuild.config.mts';

const production = process.argv.includes('--production');
const dev = process.argv.includes('--dev');
const outdir =
  process.argv
    .find((arg) => arg.startsWith('--outdir='))
    ?.slice('--outdir='.length) ?? 'dist';
const electron: string = createRequire(import.meta.url)('electron');

let webviewBuild = Promise.withResolvers<void>();
const trackWebview: esbuild.Plugin = {
  name: 'track-webview',
  setup(build) {
    let built = false;
    build.onStart(() => {
      if (built) {
        webviewBuild = Promise.withResolvers<void>();
      }
    });
    build.onEnd(() => {
      built = true;
      webviewBuild.resolve();
    });
  },
};

let app: ChildProcess | undefined;
const restartApp: esbuild.Plugin = {
  name: 'restart-app',
  setup(build) {
    build.onEnd(async (result) => {
      if (!dev || result.errors.length > 0) {
        return;
      }
      if (app) {
        app.removeAllListeners('exit');
        await quitApp(app);
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

const target = `${process.platform}-${process.arch}`;
const sevenZip = await ensureSevenZip({
  folder: `build/7zip/${target}`,
  target,
});
if (sevenZip === 'fetched') {
  console.log(`Fetched 7-Zip for ${target}.`);
} else if (sevenZip === 'unsupported') {
  console.log(
    `No 7-Zip is pinned for ${target}, so the commander opens no archives.`,
  );
}

fs.mkdirSync(outdir, { recursive: true });
for (const entry of fs.readdirSync(outdir)) {
  fs.rmSync(`${outdir}/${entry}`, { recursive: true, force: true });
}
fs.copyFileSync('src/shell/page/index.html', `${outdir}/index.html`);
fs.copyFileSync('build/window-icon.png', `${outdir}/icon.png`);
fs.copyFileSync('src/shell/main/settings.json', `${outdir}/settings.json`);
for (const folder of ['cmaps', 'standard_fonts', 'iccs', 'wasm']) {
  fs.cpSync(`node_modules/pdfjs-dist/${folder}`, `${outdir}/pdfjs/${folder}`, {
    recursive: true,
    filter: (source) => !source.includes('quickjs'),
  });
}

const contexts = await Promise.all([
  esbuild.context({
    ...mainOptions(production),
    outdir,
    logLevel: 'info',
    plugins: [restartApp],
  }),
  esbuild.context({
    ...webviewOptions(production),
    outdir,
    logLevel: 'info',
    plugins: [trackWebview],
  }),
]);

if (dev) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  const copied = new Map<string, NodeJS.Timeout>();
  const copyOnChange = (folder: string, name: string) =>
    fs.watch(folder, (_event, file) => {
      if (file === name) {
        clearTimeout(copied.get(name));
        copied.set(
          name,
          setTimeout(
            () => fs.copyFileSync(`${folder}/${name}`, `${outdir}/${name}`),
            100,
          ),
        );
      }
    });
  copyOnChange('src/shell/main', 'settings.json');
  copyOnChange('src/shell/page', 'index.html');
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
