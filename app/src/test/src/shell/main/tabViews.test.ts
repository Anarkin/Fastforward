import * as assert from 'node:assert';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import type { ToWebview } from '../../../../shell/shared/protocol';
import { releaseWait, TabViews } from '../../../../shell/main/tabViews';
import type { Page } from '../../../../shell/main/toolContract';

interface PostedPage extends Page {
  readonly posted: ToWebview[];
  disposed: boolean;
}

const pageOf = (): PostedPage => {
  const posted: ToWebview[] = [];
  return { posted, post: (message) => posted.push(message), disposed: false };
};

function viewsWith(max?: number) {
  const holding = new Map<Page, Set<string>>();
  const pages: PostedPage[] = [];
  const views = new TabViews(
    (page, tab) => holding.get(page)?.has(tab) === true,
    () => pages,
    max,
  );
  const page = (...tabs: string[]): PostedPage => {
    const made = pageOf();
    holding.set(made, new Set(tabs));
    pages.push(made);
    views.ready(made);
    return made;
  };
  const hold = (held: Page, ...tabs: string[]) =>
    holding.set(held, new Set(tabs));
  return { views, page, hold };
}

const handed = (page: PostedPage) =>
  page.posted.flatMap((message) =>
    message.type === 'view' ? [`${message.tab} ${message.view}`] : [],
  );

const released = (page: PostedPage) =>
  page.posted.flatMap((message) =>
    message.type === 'release' ? [message.tab] : [],
  );

suite('Tab views', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('hands the view a page kept of a tab to every other page that shows it, the last kept winning, and none to the page that kept it last, which holds it already', () => {
    const { views, page } = viewsWith();
    const one = page('1');
    const other = page('1');

    assert.strictEqual(views.keep(one, '1', 'a'), true);
    assert.strictEqual(views.keep(other, '1', 'b'), true);
    views.handTo(one, '1');
    views.handTo(other, '1');
    views.handTo(one, '2');

    assert.deepStrictEqual(handed(one), ['1 b']);
    assert.deepStrictEqual(handed(other), []);
  });

  test('takes what a page sends before it is ready as kept by no page, so a window reloaded gets back what its old page sent as it went away through the connection of the new', () => {
    const { views, hold } = viewsWith();
    const reloaded = pageOf();
    hold(reloaded, '1');

    views.keep(reloaded, '1', 'a');
    views.ready(reloaded);
    views.handTo(reloaded, '1');

    assert.deepStrictEqual(handed(reloaded), ['1 a']);
  });

  test("refuses what is not a string or is longer than its bound before making anything of it, forgetting what it kept of the tab, and what a page sends of another window's tab or of a tab closed", () => {
    const { views, page } = viewsWith(20);
    const one = page('1');
    const other = page('2');
    views.keep(one, '1', '{"small":1}');
    views.keep(one, '2', '{"small":1}');
    const sparse: unknown[] = [];
    sparse.length = 2 ** 28;
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      for (const refused of [
        'x'.repeat(21),
        undefined,
        { small: 1 },
        new Map([['a', 'x'.repeat(100)]]),
        sparse,
      ]) {
        assert.strictEqual(views.keep(one, '1', refused), false);
      }
      assert.strictEqual(stringify.mock.calls.length, 0);
    } finally {
      stringify.mockRestore();
    }
    assert.strictEqual(views.keep(one, 3, 'a'), false);
    assert.strictEqual(views.keep(one, '9', 'a'), false);

    views.handTo(other, '1');
    views.handTo(other, '2');
    views.handTo(other, '9');
    assert.deepStrictEqual(handed(other), []);
  });

  test('releases a tab by asking the page it leaves for its view, waiting until the page sends it, and hands that view to every page, the one that released it too, as it lets go of the tab', async () => {
    const { views, page, hold } = viewsWith();
    const left = page('1');
    const there = page();
    views.keep(left, '1', 'a');
    hold(left);
    hold(there, '1');
    let done = false;

    const releasing = views.release(left, '1').then(() => {
      done = true;
    });
    assert.deepStrictEqual(released(left), ['1']);
    assert.strictEqual(views.keep(left, '1', 'b'), true);
    await vi.advanceTimersByTimeAsync(releaseWait / 2);
    assert.strictEqual(done, false);
    views.released(left, '1', 'c');
    await releasing;
    assert.strictEqual(views.keep(left, '1', 'd'), false);

    views.handTo(there, '1');
    views.handTo(left, '1');
    assert.deepStrictEqual(handed(there), ['1 c']);
    assert.deepStrictEqual(handed(left), ['1 c']);
  });

  test('stops waiting for a page to release a tab once the wait is over, or at once when the page is gone, keeping what it had', async () => {
    const { views, page } = viewsWith();
    const slow = page('1');
    const gone = page('2');
    views.keep(slow, '1', 'a');
    gone.disposed = true;
    let done = false;

    const releasing = views.release(slow, '1').then(() => {
      done = true;
    });
    await views.release(gone, '2');
    assert.deepStrictEqual(released(gone), []);
    await vi.advanceTimersByTimeAsync(releaseWait - 1);
    assert.strictEqual(done, false);
    await vi.advanceTimersByTimeAsync(1);
    await releasing;
    views.released(slow, '1', 'late');

    views.handTo(slow, '1');
    assert.deepStrictEqual(handed(slow), ['1 a']);
  });

  test('releases a tab moving on again only once the page it left first sent its view, so the view handed on holds what that page last did', async () => {
    const { views, page, hold } = viewsWith();
    const first = page('1');
    const second = page();
    views.keep(first, '1', 'a');
    hold(first);
    hold(second, '1');

    const left = views.release(first, '1');
    hold(second);
    hold(first, '1');
    const back = views.release(second, '1');
    await Promise.resolve();
    assert.deepStrictEqual(released(second), []);
    views.released(first, '1', 'b');
    await left;
    await vi.advanceTimersByTimeAsync(0);
    assert.deepStrictEqual(released(second), ['1']);
    views.released(second, '1', '');
    await back;

    views.handTo(first, '1');
    assert.deepStrictEqual(handed(first), ['1 b']);
  });

  test('stops waiting for a page to release its tabs once the page goes away, as a window closed while its tab moves never answers', async () => {
    const { views, page } = viewsWith();
    const closing = page('1');
    let done = false;

    const releasing = views.release(closing, '1').then(() => {
      done = true;
    });
    views.gone(closing);
    await releasing;

    assert.strictEqual(done, true);
  });

  test('keeps what it had of a tab released by a page that has nothing of it, and takes a release only from the page asked', async () => {
    const { views, page } = viewsWith();
    const one = page('1');
    const other = page('1');
    views.keep(one, '1', 'a');

    const releasing = views.release(one, '1');
    views.released(other, '1', 'other');
    views.released(one, '1', '');
    await releasing;

    views.handTo(one, '1');
    assert.deepStrictEqual(handed(one), ['1 a']);
  });

  test('forgets the view of a tab dropped as it closes, telling every page to let go of it', () => {
    const { views, page } = viewsWith();
    const one = page('1');
    const other = page();
    views.keep(one, '1', 'a');

    views.drop('1');
    views.released(one, '1', 'b');
    views.handTo(other, '1');

    assert.deepStrictEqual([released(one), released(other)], [['1'], ['1']]);
    assert.deepStrictEqual(handed(other), []);
  });
});
