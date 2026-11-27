import { decodeHTML } from 'entities';

export type PageFetch = (url: string, init: RequestInit) => Promise<Response>;

const mostBytes = 256 * 1024;

const waitMilliseconds = 10_000;

const longestTitle = 1000;

const titleEnd = /<\/title\s*>/i;

const titleEndLength = '</title >'.length;

const htmlTypes = /^\s*(?:text\/html|application\/xhtml\+xml)\b/i;

export const isWebLink = (url: string): boolean =>
  URL.parse(url)?.protocol === 'https:';

export function titleIn(html: string): string | undefined {
  const found = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
  const title = decodeHTML(found ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim();
  const cut = title.slice(0, longestTitle);
  return cut === ''
    ? undefined
    : /[\uD800-\uDBFF]$/.test(cut)
      ? cut.slice(0, -1)
      : cut;
}

function charsetOf(type: string, head: Buffer): string {
  const named = /charset\s*=\s*["']?([\w.:-]+)/i;
  return (
    named.exec(type)?.[1] ??
    /<meta\b[^>]*?charset\s*=\s*["']?([\w.:-]+)/i.exec(
      head.toString('latin1'),
    )?.[1] ??
    'utf-8'
  );
}

function decoded(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function headOf(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  let tail = '';
  try {
    while (size < mostBytes) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = Buffer.from(value);
      chunks.push(chunk);
      size += chunk.length;
      const seen = tail + chunk.toString('latin1');
      if (titleEnd.test(seen)) {
        break;
      }
      tail = seen.slice(-titleEndLength);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).subarray(0, mostBytes);
}

export async function readTitle(
  url: string,
  fetchPage: PageFetch,
): Promise<string | undefined> {
  if (!isWebLink(url)) {
    return undefined;
  }
  try {
    const response = await fetchPage(url, {
      credentials: 'omit',
      signal: AbortSignal.timeout(waitMilliseconds),
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || response.body === null || !htmlTypes.test(type)) {
      await response.body?.cancel();
      return undefined;
    }
    const head = await headOf(response.body);
    return titleIn(decoded(head, charsetOf(type, head)));
  } catch {
    return undefined;
  }
}
