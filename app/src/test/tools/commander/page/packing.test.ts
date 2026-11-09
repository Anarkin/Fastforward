import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  archiveFor,
  namedPart,
  volumeBytesOf,
  volumeSizes,
  withFormat,
} from '../../../../tools/commander/page/packing';

const selected = (archive: string) => {
  const { start, end } = namedPart(archive);
  return archive.slice(start, end);
};

suite('Packing on the page', () => {
  test('names the archive after the one item packed, without its extension, or after the folder of the items, in the folder it goes to', () => {
    assert.strictEqual(
      archiveFor(['report.final.pdf'], '/code/docs', '/backup', 'zip'),
      '/backup/report.final.zip',
    );
    assert.strictEqual(
      archiveFor(['photos'], 'C:\\Users\\me', 'D:\\', '7z'),
      'D:\\photos.7z',
    );
    assert.strictEqual(
      archiveFor(['a.txt', 'b.txt'], '/code/docs', '/backup/', 'tar.gz'),
      '/backup/docs.tar.gz',
    );
    assert.strictEqual(
      archiveFor(['a.txt', 'b.txt'], 'C:\\', 'D:\\out', 'zip'),
      'D:\\out\\archive.zip',
    );
    assert.strictEqual(
      archiveFor(['sub/a.txt'], '/code', '/backup', 'zip'),
      '/backup/a.zip',
    );
    assert.strictEqual(
      archiveFor(['my.photos'], '/code', '/backup', 'zip', true),
      '/backup/my.photos.zip',
    );
    assert.strictEqual(
      archiveFor(['a.txt', 'b.txt'], '/', '/backup', 'zip'),
      '/backup/archive.zip',
    );
  });

  test('selects the name of the archive to type over, after its folder and before the extension of its format', () => {
    assert.strictEqual(selected('/backup/photos.tar.gz'), 'photos');
    assert.strictEqual(selected('D:\\out\\report.final.zip'), 'report.final');
    assert.strictEqual(selected('D:\\out\\notes'), 'notes');
  });

  test('changes the extension of the archive for another format, adding it to a name without one it knows', () => {
    assert.strictEqual(withFormat('/b/photos.zip', '7z'), '/b/photos.7z');
    assert.strictEqual(
      withFormat('/b/photos.tar.gz', 'tar.xz'),
      '/b/photos.tar.xz',
    );
    assert.strictEqual(
      withFormat('/b/photos.tar', 'tar.gz'),
      '/b/photos.tar.gz',
    );
    assert.strictEqual(withFormat('/b/photos.ZIP', 'tar'), '/b/photos.tar');
    assert.strictEqual(withFormat('/b/photos.v2', 'zip'), '/b/photos.v2.zip');
  });

  test('reads the size of a volume in bytes, kilobytes, megabytes or gigabytes as 7-Zip counts them, megabytes when no unit is given', () => {
    assert.strictEqual(volumeBytesOf('100 MB'), 100 * 1024 * 1024);
    assert.strictEqual(volumeBytesOf('100'), 100 * 1024 * 1024);
    assert.strictEqual(
      volumeBytesOf('4.5g'),
      Math.round(4.5 * 1024 * 1024 * 1024),
    );
    assert.strictEqual(volumeBytesOf(' 640 KB '), 640 * 1024);
    assert.strictEqual(volumeBytesOf('65536 B'), 65_536);
    for (const wrong of ['', 'MB', '-5 MB', 'ten MB', '5 TB', '1.5.2 MB']) {
      assert.strictEqual(volumeBytesOf(wrong), undefined, wrong);
    }
  });

  test('offers the sizes of volumes most asked for, a CD, the largest file of FAT32 and a DVD among them', () => {
    assert.deepStrictEqual(
      volumeSizes.map((size) => [size.size, volumeBytesOf(size.size)]),
      [
        ['100 MB', 104_857_600],
        ['700 MB', 734_003_200],
        ['4092 MB', 4_290_772_992],
        ['4480 MB', 4_697_620_480],
      ],
    );
  });
});
