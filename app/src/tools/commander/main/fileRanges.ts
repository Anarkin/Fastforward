import * as fs from 'node:fs';

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

const rangePattern = /^bytes=(\d*)-(\d*)$/;

export function byteRange(
  header: string | null,
  size: number,
): ByteRange | 'unsatisfiable' | undefined {
  const match = header === null ? null : rangePattern.exec(header.trim());
  if (match === null) {
    return undefined;
  }
  const [, from = '', to = ''] = match;
  if (from === '' && to === '') {
    return undefined;
  }
  if (from === '') {
    const suffix = Number(to);
    return suffix === 0 || size === 0
      ? 'unsatisfiable'
      : { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  return start >= size || end < start ? 'unsatisfiable' : { start, end };
}

const chunkBytes = 256 * 1024;

function body(
  file: string,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  let handle: fs.promises.FileHandle | undefined;
  let finished = false;
  let position = start;
  const finish = async () => {
    finished = true;
    const open = handle;
    handle = undefined;
    await open?.close();
  };
  return new ReadableStream<Uint8Array>({
    start: async () => {
      const opened = await fs.promises.open(file, 'r');
      if (finished) {
        await opened.close();
      } else {
        handle = opened;
      }
    },
    pull: async (controller) => {
      const length = Math.min(chunkBytes, end + 1 - position);
      const bytes = new Uint8Array(Math.max(0, length));
      let read: number;
      try {
        read =
          handle === undefined || length <= 0
            ? 0
            : (await handle.read(bytes, 0, length, position)).bytesRead;
      } catch (error) {
        await finish();
        controller.error(error);
        return;
      }
      if (read === 0) {
        await finish();
        controller.close();
        return;
      }
      position += read;
      controller.enqueue(bytes.subarray(0, read));
    },
    cancel: finish,
  });
}

export async function fileResponse(
  file: string,
  type: string,
  rangeHeader: string | null,
): Promise<Response> {
  const { size } = await fs.promises.stat(file);
  const range = byteRange(rangeHeader, size);
  const headers = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  };
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'content-range': `bytes */${size}` },
    });
  }
  if (range === undefined) {
    return new Response(size === 0 ? null : body(file, 0, size - 1), {
      headers: { ...headers, 'content-length': String(size) },
    });
  }
  return new Response(body(file, range.start, range.end), {
    status: 206,
    headers: {
      ...headers,
      'content-length': String(range.end - range.start + 1),
      'content-range': `bytes ${range.start}-${range.end}/${size}`,
    },
  });
}
