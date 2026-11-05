import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { glideAt } from '../../ui/glide';
import {
  glideRows,
  revealGlides,
  rowGlide,
  rowPadding,
  snappedTop,
  wheelTurn,
} from '../../ui/rowScroll';

const touchpad = (deltaY: number, deltaMode = 0) => ({
  deltaY,
  deltaMode,
  wheelDeltaY: deltaMode === 0 ? -deltaY : 0,
});

const notches = (count: number, deltaMode = 0) => ({
  deltaY: (deltaMode === 0 ? 100 : 3) * count,
  deltaMode,
  wheelDeltaY: -120 * count,
});

const textRows = { row: 20, step: 20, page: 400, perNotch: 3 };

suite('Scrolling by whole rows', () => {
  test('snaps a place between rows to the start of the next row, never past the end', () => {
    assert.strictEqual(snappedTop(0, 16.8, 1000), 0);
    assert.strictEqual(snappedTop(33.6, 16.8, 1000), 33.6);
    assert.strictEqual(snappedTop(20, 16.8, 1000), 33.6);
    assert.ok(Math.abs(snappedTop(33.59, 16.8, 1000) - 33.6) < 1e-9);
    assert.strictEqual(snappedTop(995, 16.8, 1000), 1000);
  });

  test('turns a touchpad into whole rows by how far it moved, keeping what is left for the next turn, lines and pages too, whatever rows a notch of the wheel moves', () => {
    assert.deepStrictEqual(wheelTurn(0, touchpad(100), textRows), {
      rows: 5,
      pending: 0,
    });
    assert.deepStrictEqual(wheelTurn(0, touchpad(30), textRows), {
      rows: 1,
      pending: 10,
    });
    assert.deepStrictEqual(wheelTurn(10, touchpad(10), textRows), {
      rows: 1,
      pending: 0,
    });
    assert.deepStrictEqual(wheelTurn(0, touchpad(-45), textRows), {
      rows: -2,
      pending: -5,
    });
    assert.deepStrictEqual(wheelTurn(0, touchpad(3, 1), textRows), {
      rows: 3,
      pending: 0,
    });
    assert.deepStrictEqual(wheelTurn(0, touchpad(1, 2), textRows), {
      rows: 20,
      pending: 0,
    });
  });

  test('moves each notch of a mouse wheel by the rows of the setting, rather than by the lines or the page the system scrolls, dropping what a touchpad left', () => {
    const oneRow = { ...textRows, perNotch: 1 };
    assert.deepStrictEqual(wheelTurn(7, notches(1), oneRow), {
      rows: 1,
      pending: 0,
    });
    assert.deepStrictEqual(wheelTurn(0, notches(-1), oneRow), {
      rows: -1,
      pending: 0,
    });
    assert.deepStrictEqual(wheelTurn(0, notches(2), oneRow), {
      rows: 2,
      pending: 0,
    });
    assert.deepStrictEqual(wheelTurn(0, notches(1), textRows), {
      rows: 3,
      pending: 0,
    });
    assert.deepStrictEqual(wheelTurn(0, notches(1, 1), oneRow), {
      rows: 1,
      pending: 0,
    });
    assert.deepStrictEqual(wheelTurn(0, notches(1, 2), oneRow), {
      rows: 1,
      pending: 0,
    });
  });

  test('moves rows taller than text, as of thumbnails, by as little touchpad as a row of text, and by the rows of a notch', () => {
    const tiles = { row: 170, step: 20, page: 340, perNotch: 1 };
    assert.deepStrictEqual(wheelTurn(0, touchpad(30), tiles), {
      rows: 1,
      pending: 10,
    });
    assert.deepStrictEqual(wheelTurn(0, touchpad(-45), tiles), {
      rows: -2,
      pending: -5,
    });
    assert.deepStrictEqual(wheelTurn(0, touchpad(3, 1), tiles), {
      rows: 3,
      pending: 0,
    });
    assert.deepStrictEqual(wheelTurn(0, touchpad(1, 2), tiles), {
      rows: 2,
      pending: 0,
    });
    assert.deepStrictEqual(wheelTurn(0, notches(1), tiles), {
      rows: 1,
      pending: 0,
    });
  });

  test('pads the end of a list by what is left of a row at the bottom of the view, so its last place starts on a row', () => {
    assert.strictEqual(rowPadding(100, 20), 0);
    assert.strictEqual(rowPadding(110, 20), 10);
    assert.ok(Math.abs(rowPadding(500, 16.8) - 12.8) < 1e-9);
  });

  test('glides to the row it aims at in a moment, easing out, and from where it is on to a new aim, ending on the row', () => {
    const glide = glideRows(undefined, 0, 1000, 200);
    assert.strictEqual(glideAt(glide, 1000), 0);
    const halfway = glideAt(glide, 1000 + rowGlide / 2);
    assert.ok(halfway > 100 && halfway < 200, String(halfway));
    assert.strictEqual(glideAt(glide, 1000 + rowGlide), 200);
    const further = glideRows(glide, 50, 1000 + rowGlide / 2, 400);
    assert.strictEqual(glideAt(further, 1000 + rowGlide / 2), halfway);
    assert.strictEqual(glideAt(further, 1000 + rowGlide * 1.5), 400);
  });

  test('glides to a row revealed more than a row and at most a view away, as a page key moves, and jumps a row or far, as the arrows, Home, End and finding do', () => {
    assert.strictEqual(revealGlides(0, 380, 20, 400), true);
    assert.strictEqual(revealGlides(380, 0, 20, 400), true);
    assert.strictEqual(revealGlides(0, 400, 20, 400), true);
    assert.strictEqual(revealGlides(0, 20, 20, 400), false);
    assert.strictEqual(revealGlides(0, 8, 20, 400), false);
    assert.strictEqual(revealGlides(0, 4000, 20, 400), false);
  });
});
