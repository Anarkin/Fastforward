import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { wheelTurn } from '../../../../lib/page/wheelTurns';

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
});
