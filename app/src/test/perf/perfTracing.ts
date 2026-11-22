import type { CDPSession, Page } from 'playwright-core';
import { eventsKept } from './perfTrace';

const leftOut = ['PaintImage'];

const bufferKilobytes = 1024 * 1024;

async function readStream(
  session: CDPSession,
  handle: string,
): Promise<string> {
  const kept = eventsKept(leftOut);
  for (;;) {
    const chunk = await session.send('IO.read', { handle });
    kept.read(
      chunk.base64Encoded === true
        ? Buffer.from(chunk.data, 'base64').toString('utf8')
        : chunk.data,
    );
    if (chunk.eof) {
      await session.send('IO.close', { handle });
      return kept.text();
    }
  }
}

export async function startTracing(
  page: Page,
  included: readonly string[],
): Promise<() => Promise<string>> {
  const session = await page.context().newCDPSession(page);
  await session.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    streamFormat: 'json',
    traceConfig: {
      includedCategories: [...included],
      excludedCategories: ['*'],
      traceBufferSizeInKb: bufferKilobytes,
    },
  });
  return async () => {
    const completed = new Promise<string | undefined>((resolve) => {
      session.once('Tracing.tracingComplete', (event) => resolve(event.stream));
    });
    await session.send('Tracing.end');
    const stream = await completed;
    if (stream === undefined) {
      throw new Error('The trace came back without a stream');
    }
    const text = await readStream(session, stream);
    await session.detach();
    return text;
  };
}
