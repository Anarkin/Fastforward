import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { appRoutes } from '../../../boot/appRoutes';
import { viewedFileRoute } from '../../../tools/viewer/shared/files';
import { iconRoute } from '../../../tools/commander/shared/icons';
import { thumbnailRoute } from '../../../tools/commander/shared/thumbnails';
import { gitImageRoute } from '../../../tools/git/shared/images';
import { defaultSettings } from '../../helpers/fixtures';

const drawing = '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>';

const servedDrawing = (range: string | null = null) =>
  Promise.resolve(
    new Response(drawing, {
      status: range === null ? 200 : 206,
      headers: {
        'content-type': 'image/svg+xml',
        ...(range !== null && {
          'content-range': `bytes 0-9/${drawing.length}`,
        }),
      },
    }),
  );

const respond = appRoutes(
  path.resolve('dist'),
  defaultSettings,
  Promise.resolve({
    git: { image: () => servedDrawing() },
    commander: {
      icon: () => servedDrawing(),
      thumbnail: () => servedDrawing(),
    },
    viewer: {
      icon: () => servedDrawing(),
      file: (_url, range) => servedDrawing(range),
    },
    editor: { icon: () => servedDrawing() },
    diff: { image: () => servedDrawing() },
  }),
  () =>
    Promise.resolve(
      new Response('<!doctype html>', {
        headers: { 'content-type': 'text/html' },
      }),
    ),
);

const headersOf = (response: Response) => ({
  policy: response.headers.get('content-security-policy'),
  sniffing: response.headers.get('x-content-type-options'),
});

suite('The routes of the app', () => {
  test('serves the files of the tools by a policy that loads and runs nothing and sniffs no other type, as an SVG of a repository or a folder opened as a page would run its scripts as the app', async () => {
    for (const route of [
      gitImageRoute,
      iconRoute,
      thumbnailRoute,
      viewedFileRoute,
    ]) {
      const response = await respond(
        new Request(`fastforward://app${route}?file=drawing.svg`),
      );

      assert.deepStrictEqual(
        {
          ...headersOf(response),
          status: response.status,
          type: response.headers.get('content-type'),
          body: await response.text(),
        },
        {
          policy:
            "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
          sniffing: 'nosniff',
          status: 200,
          type: 'image/svg+xml',
          body: drawing,
        },
        route,
      );
    }
  });

  test('keeps the part of a file it serves for a range asked for', async () => {
    const response = await respond(
      new Request(`fastforward://app${viewedFileRoute}?file=drawing.svg`, {
        headers: { range: 'bytes=0-9' },
      }),
    );

    assert.deepStrictEqual(
      [
        response.status,
        response.headers.get('content-range'),
        headersOf(response).sniffing,
      ],
      [206, `bytes 0-9/${drawing.length}`, 'nosniff'],
    );
  });

  test('serves its own page and the files of its build without that policy, as the page has a policy of its own and its workers would take that one', async () => {
    for (const file of ['index.html', 'webview.js', 'theme.css']) {
      const response = await respond(new Request(`fastforward://app/${file}`));

      assert.deepStrictEqual(
        headersOf(response),
        { policy: null, sniffing: null },
        file,
      );
    }
  });
});
