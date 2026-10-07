import * as assert from 'node:assert';
import {
  adjacentColumn,
  columnMove,
  columnOf,
  columnStep,
  forwardedColumn,
  shownColumns,
} from '../webview/activeColumn';
import { element } from './fixtures';

const press = {
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
};

suite('Active column', () => {
  const key = {
    key: 'ArrowRight',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: element('DIV'),
  };

  test('shows the files and the diff only with a commit selected, and the commits unless hidden', () => {
    assert.deepStrictEqual(shownColumns(true, 'a'), [
      'commits',
      'files',
      'diff',
    ]);
    assert.deepStrictEqual(shownColumns(true, undefined), ['commits']);
    assert.deepStrictEqual(shownColumns(false, 'a'), ['files', 'diff']);
  });

  test('moves to the next column on Right or Tab, and back on Left or Shift+Tab, telling Tab apart', () => {
    assert.deepStrictEqual(columnMove(key), { step: 1, tab: false });
    assert.deepStrictEqual(columnMove({ ...key, key: 'ArrowLeft' }), {
      step: -1,
      tab: false,
    });
    assert.deepStrictEqual(columnMove({ ...key, key: 'Tab' }), {
      step: 1,
      tab: true,
    });
    assert.deepStrictEqual(columnMove({ ...key, key: 'Tab', shiftKey: true }), {
      step: -1,
      tab: true,
    });
  });

  test('leaves the arrows to fields and to keys a column used itself, and keys with modifiers alone', () => {
    assert.strictEqual(
      columnMove({ ...key, target: element('INPUT') })?.step,
      undefined,
    );
    assert.strictEqual(
      columnMove({ ...key, target: element('DIV', true) })?.step,
      undefined,
    );
    assert.strictEqual(
      columnMove({ ...key, key: 'Tab', target: element('INPUT') })?.step,
      1,
    );
    assert.strictEqual(
      columnMove({ ...key, defaultPrevented: true })?.step,
      undefined,
    );
    assert.strictEqual(columnMove({ ...key, ctrlKey: true })?.step, undefined);
    assert.strictEqual(columnMove({ ...key, shiftKey: true })?.step, undefined);
    assert.strictEqual(
      columnMove({ ...key, key: 'ArrowDown' })?.step,
      undefined,
    );
  });

  test('stops at the first and last shown column, starting from the first', () => {
    const all = shownColumns(true, 'a');
    assert.strictEqual(adjacentColumn(all, 'commits', 1), 'files');
    assert.strictEqual(adjacentColumn(all, 'diff', -1), 'files');
    assert.strictEqual(adjacentColumn(all, 'diff', 1), undefined);
    assert.strictEqual(adjacentColumn(all, 'commits', -1), undefined);
    assert.strictEqual(
      adjacentColumn(shownColumns(false, 'a'), 'commits', 1),
      'files',
    );
  });

  test('keeps Tab from leaving the columns past either end, letting the arrows go there', () => {
    const all = shownColumns(true, 'a');
    assert.deepStrictEqual(columnStep(key, all, 'commits'), {
      next: 'files',
      preventDefault: true,
    });
    assert.deepStrictEqual(columnStep(key, all, 'diff'), {
      next: undefined,
      preventDefault: false,
    });
    assert.deepStrictEqual(columnStep({ ...key, key: 'Tab' }, all, 'diff'), {
      next: undefined,
      preventDefault: true,
    });
    assert.deepStrictEqual(
      columnStep({ ...key, key: 'Tab', shiftKey: true }, all, 'commits'),
      { next: undefined, preventDefault: true },
    );
    assert.strictEqual(
      columnStep({ ...key, key: 'ArrowDown' }, all, 'commits'),
      undefined,
    );
  });

  test('tells which column an element is in by its place among the columns', () => {
    const container: { children: unknown[] } = { children: [] };
    const columns = [0, 1, 2].map(() => ({ parentElement: container }));
    container.children = columns;
    const inColumn = (index: number) => ({ closest: () => columns[index] });
    assert.strictEqual(columnOf(inColumn(0)), 'commits');
    assert.strictEqual(columnOf(inColumn(1)), 'files');
    assert.strictEqual(columnOf(inColumn(2)), 'diff');
    assert.strictEqual(columnOf({ closest: () => null }), undefined);
    assert.strictEqual(columnOf(null), undefined);
  });
});

suite('Changes from the Files column', () => {
  const key = { ...press, key: 'j', code: 'KeyJ' };

  test('hands j and k in the Files column to the diff, to jump there', () => {
    assert.strictEqual(forwardedColumn('files', key), 'diff');
    assert.strictEqual(
      forwardedColumn('files', { ...key, key: 'k', code: 'KeyK' }),
      'diff',
    );
  });

  test('keeps them where they are elsewhere, and other keys or ones with modifiers in the Files column', () => {
    assert.strictEqual(forwardedColumn('commits', key), undefined);
    assert.strictEqual(forwardedColumn('diff', key), undefined);
    assert.strictEqual(forwardedColumn(undefined, key), undefined);
    assert.strictEqual(
      forwardedColumn('files', { ...key, key: 'x', code: 'KeyX' }),
      undefined,
    );
    assert.strictEqual(
      forwardedColumn('files', { ...key, ctrlKey: true }),
      undefined,
    );
    assert.strictEqual(
      forwardedColumn('files', { ...key, defaultPrevented: true }),
      undefined,
    );
  });
});
