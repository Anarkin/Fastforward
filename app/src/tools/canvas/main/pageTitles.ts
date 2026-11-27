import { BlockList, isIP } from 'node:net';
import { decodeHTML } from 'entities';

export type Fetched = Response | { readonly moved: string };

export type PageFetch = (url: string, signal: AbortSignal) => Promise<Fetched>;

export interface Reach {
  readonly fetchPage: PageFetch;
  readonly lookup: (host: string) => Promise<readonly string[]>;
}

const mostBytes = 256 * 1024;

const waitMilliseconds = 10_000;

const longestTitle = 1000;

const longestTag = 1024;

const mostMoves = 5;

const titleOpen = /<title(?=[\s/>])/i;

const titleClose = /<\/title\s*>/i;

const titleEndLength = '</title >'.length;

const metaOpen = /<meta(?=[\s/>])/gi;

const charsetNamed = /charset\s*=\s*["']?([\w.:-]+)/i;

const htmlTypes = /^\s*(?:text\/html|application\/xhtml\+xml)\b/i;

const unreachable = new BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  unreachable.addSubnet(address, prefix, 'ipv4');
}

for (const [address, prefix] of [
  ['::', 127],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  unreachable.addSubnet(address, prefix, 'ipv6');
}

export const isWebLink = (url: string): boolean =>
  URL.parse(url)?.protocol === 'https:';

function onTheWeb(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  const plain = mapped ?? address;
  const family = isIP(plain);
  return (
    family !== 0 && !unreachable.check(plain, family === 4 ? 'ipv4' : 'ipv6')
  );
}

async function reachable(
  url: string,
  lookup: Reach['lookup'],
): Promise<boolean> {
  const host = URL.parse(url)?.hostname.replace(/^\[(.*)\]$/, '$1');
  if (host === undefined || host === '' || !isWebLink(url)) {
    return false;
  }
  const addresses = await lookup(host);
  return addresses.length > 0 && addresses.every(onTheWeb);
}

export function titleIn(html: string): string | undefined {
  const open = titleOpen.exec(html);
  const start = open === null ? -1 : html.indexOf('>', open.index);
  if (start === -1) {
    return undefined;
  }
  const rest = html.slice(start + 1);
  const close = titleClose.exec(rest);
  if (close === null) {
    return undefined;
  }
  const title = decodeHTML(rest.slice(0, close.index))
    .replaceAll(/\s+/g, ' ')
    .trim();
  const cut = title.slice(0, longestTitle);
  return cut === ''
    ? undefined
    : /[\uD800-\uDBFF]$/.test(cut)
      ? cut.slice(0, -1)
      : cut;
}

function metaCharset(head: string): string | undefined {
  for (const { index } of head.matchAll(metaOpen)) {
    const near = head.slice(index, index + longestTag);
    const end = near.indexOf('>');
    const found = charsetNamed.exec(end === -1 ? near : near.slice(0, end));
    if (found?.[1] !== undefined) {
      return found[1];
    }
  }
  return undefined;
}

function charsetOf(type: string, head: Buffer): string {
  return (
    charsetNamed.exec(type)?.[1] ??
    metaCharset(head.toString('latin1')) ??
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
      if (titleClose.test(seen)) {
        break;
      }
      tail = seen.slice(-titleEndLength);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).subarray(0, mostBytes);
}

async function titleOfPage(response: Response): Promise<string | undefined> {
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || response.body === null || !htmlTypes.test(type)) {
    await response.body?.cancel();
    return undefined;
  }
  const head = await headOf(response.body);
  return titleIn(decoded(head, charsetOf(type, head)));
}

export async function readTitle(
  url: string,
  { fetchPage, lookup }: Reach,
): Promise<string | undefined> {
  const signal = AbortSignal.timeout(waitMilliseconds);
  try {
    let at = url;
    for (let moves = 0; moves <= mostMoves; moves++) {
      if (!(await reachable(at, lookup))) {
        return undefined;
      }
      const fetched = await fetchPage(at, signal);
      if (!('moved' in fetched)) {
        return await titleOfPage(fetched);
      }
      at = new URL(fetched.moved, at).href;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
