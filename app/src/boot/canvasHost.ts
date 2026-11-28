import type { RecoveryCopies } from '../lib/main/recoveryCopies';
import { lookup } from 'node:dns/promises';
import { net } from 'electron';
import { systemCodePage } from '../components/encodings/main/codePages';
import { readingFile } from '../lib/main/fileBlocks';
import { fs } from '../lib/main/files';
import { readTitle, type Fetched } from '../tools/canvas/main/pageTitles';
import { CanvasTool } from '../tools/canvas/main/tool';
import { ReadOnlyFile, saveFile } from '../lib/main/fileSaving';
import { watchFolder } from '../lib/main/watch';

function fetchedOnce(url: string, signal: AbortSignal): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      redirect: 'manual',
      credentials: 'omit',
      useSessionCookies: false,
    });
    const abort = () => {
      request.abort();
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', abort, { once: true });
    let moved: string | undefined;
    request.on('redirect', (_status, _method, location) => {
      moved = location;
    });
    request.on('response', (response) => {
      signal.removeEventListener('abort', abort);
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        for (const each of [value].flat()) {
          headers.append(name, each);
        }
      }
      const ok = response.statusCode >= 200 && response.statusCode < 300;
      if (!ok) {
        request.abort();
        resolve(new Response(null, { status: 502, headers }));
        return;
      }
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          response.on('data', (chunk) => {
            controller.enqueue(new Uint8Array(chunk));
          });
          response.on('end', () => {
            controller.close();
          });
          response.on('error', (error) => {
            controller.error(error);
          });
        },
        cancel: () => {
          request.abort();
        },
      });
      resolve(new Response(body, { status: response.statusCode, headers }));
    });
    request.on('error', (error) => {
      signal.removeEventListener('abort', abort);
      if (moved === undefined) {
        reject(error);
      } else {
        resolve({ moved });
      }
    });
    request.end();
  });
}

export function canvasToolOf(recovery: RecoveryCopies): CanvasTool {
  return new CanvasTool({
    recovery,
    sizeOf: async (file) => (await fs.promises.stat(file)).size,
    readFile: (file) => fs.promises.readFile(file),
    saveFile: async (file, bytes) =>
      saveFile(
        file,
        bytes,
        process.platform === 'win32'
          ? {
              replaceFile: (
                await import('./windowsReplaceFile.js')
              ).windowsReplaceFile(),
            }
          : {},
      ),
    readOnly: (error) => error instanceof ReadOnlyFile,
    watch: (file, onChange) => watchFolder(file, onChange),
    files: {
      realPath: (file) => fs.promises.realpath(file),
      isFolder: async (file) =>
        (await fs.promises.stat(file).catch(() => undefined))?.isDirectory() ??
        false,
      readHead: (file, bytes) => readingFile(file, (read) => read(0, bytes)),
      codePage: () => systemCodePage(process.platform),
    },
    titleOf: (url) =>
      readTitle(url, {
        fetchPage: fetchedOnce,
        lookup: async (host) =>
          (await lookup(host, { all: true })).map(({ address }) => address),
      }),
  });
}
