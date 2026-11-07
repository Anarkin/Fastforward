import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { replaceBuiltin } from '../../../builtins';
import { PdfPlaces } from '../../../../tools/commander/main/pdfPlaces';
import { removeFolder, tempFolder } from '../../../repositories';

const third = { page: 3, zoom: 125, left: 0, top: 500 } as const;
const tenth = { page: 10, zoom: 'page-width', left: -4, top: 80 } as const;

suite('Places in PDFs', () => {
  test('keeps the place in a PDF by its ID across restarts, with its path and when it was read, so it follows the file when moved', async () => {
    const folder = tempFolder('pdf-places');
    try {
      const file = path.join(folder, 'pdf-places.json');
      const places = new PdfPlaces(file, () => 1000);

      await places.save('aa11', third, 'C:/books/one.pdf');
      await places.save('bb22', tenth, 'C:/books/two.pdf');
      await places.save('aa11', tenth, 'D:/moved/one.pdf');

      const again = new PdfPlaces(file, () => 2000);
      assert.deepStrictEqual(await again.of('aa11'), tenth);
      assert.deepStrictEqual(await again.of('bb22'), tenth);
      assert.strictEqual(await again.of('cc33'), undefined);
      const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.deepStrictEqual(saved, {
        aa11: { ...tenth, file: 'D:/moved/one.pdf', read: 1000 },
        bb22: { ...tenth, file: 'C:/books/two.pdf', read: 1000 },
      });
    } finally {
      removeFolder(folder);
    }
  });

  test('forgets the places read longest ago once it keeps as many as it may', async () => {
    const folder = tempFolder('pdf-places');
    try {
      let now = 0;
      const places = new PdfPlaces(
        path.join(folder, 'pdf-places.json'),
        () => now++,
        2,
      );

      await places.save('aa11', third, 'one.pdf');
      await places.save('bb22', third, 'two.pdf');
      await places.save('aa11', tenth, 'one.pdf');
      await places.save('cc33', third, 'three.pdf');

      assert.deepStrictEqual(await places.of('aa11'), tenth);
      assert.strictEqual(await places.of('bb22'), undefined);
      assert.deepStrictEqual(await places.of('cc33'), third);
    } finally {
      removeFolder(folder);
    }
  });

  test('starts with no places from a file that is missing or damaged, or holds places it can not show', async () => {
    const folder = tempFolder('pdf-places');
    try {
      const file = path.join(folder, 'pdf-places.json');
      assert.strictEqual(
        await new PdfPlaces(file, () => 0).of('aa11'),
        undefined,
      );
      fs.writeFileSync(file, '{ not json');
      assert.strictEqual(
        await new PdfPlaces(file, () => 0).of('aa11'),
        undefined,
      );
      fs.writeFileSync(
        file,
        JSON.stringify({
          aa11: { page: -1, zoom: 'auto', left: 0, top: 0, read: 1 },
          bb22: { ...third, file: 'two.pdf', read: 1 },
        }),
      );
      const places = new PdfPlaces(file, () => 0);
      assert.strictEqual(await places.of('aa11'), undefined);
      assert.deepStrictEqual(await places.of('bb22'), third);
    } finally {
      removeFolder(folder);
    }
  });

  test('puts a damaged file aside before saving a place afresh, and leaves one it cannot read as it is, as saving over either lost every place it held', async () => {
    const folder = tempFolder('pdf-places');
    try {
      const file = path.join(folder, 'pdf-places.json');
      fs.writeFileSync(file, '{ "aa11": { not json');
      await new PdfPlaces(file, () => 1).save('bb22', third, 'two.pdf');
      assert.strictEqual(
        fs.readFileSync(`${file}.corrupt`, 'utf8'),
        '{ "aa11": { not json',
      );
      assert.deepStrictEqual(await new PdfPlaces(file).of('bb22'), third);

      const held = JSON.stringify({
        cc33: { ...tenth, file: 'x.pdf', read: 1 },
      });
      fs.writeFileSync(file, held);
      const read = fs.promises.readFile;
      replaceBuiltin(fs.promises, 'readFile', () =>
        Promise.reject(
          Object.assign(new Error('EBUSY: resource busy or locked'), {
            code: 'EBUSY',
          }),
        ),
      );
      try {
        await new PdfPlaces(file, () => 2).save('dd44', third, 'four.pdf');
      } finally {
        replaceBuiltin(fs.promises, 'readFile', read);
      }
      assert.strictEqual(fs.readFileSync(file, 'utf8'), held);
    } finally {
      removeFolder(folder);
    }
  });

  test('keeps saving places after a save failed, as a file held for a moment on Windows made every later save fail until restarted', async () => {
    const folder = tempFolder('pdf-places');
    try {
      const file = path.join(folder, 'pdf-places.json');
      const places = new PdfPlaces(file, () => 1000);
      fs.mkdirSync(path.join(`${file}.tmp`, 'held'), { recursive: true });

      await assert.rejects(places.save('aa11', third, 'C:/books/one.pdf'));
      fs.rmSync(`${file}.tmp`, { recursive: true });
      await places.save('bb22', tenth, 'C:/books/two.pdf');

      assert.deepStrictEqual(await new PdfPlaces(file).of('aa11'), third);
      assert.deepStrictEqual(await new PdfPlaces(file).of('bb22'), tenth);
    } finally {
      removeFolder(folder);
    }
  });
});
