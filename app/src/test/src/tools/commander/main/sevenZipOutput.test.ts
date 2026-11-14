import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  progressOf,
  reasonOf,
} from '../../../../../tools/commander/main/sevenZipOutput';

suite('reasonOf', () => {
  test('joins the errors 7-Zip names, without the file they are about, taking the line after an error naming only the file, or says how 7-Zip ended when it names none', () => {
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output: '',
          errors:
            'ERROR: a.tar.gz : a.tar.gz\nOpen ERROR: Cannot open the file as [tar] archive\n\nERRORS:\nIs not archive\n',
        },
        'a.tar.gz',
      ),
      'Cannot open the file as [tar] archive',
    );
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output: '',
          errors:
            '\nERRORS:\nUnexpected end of archive\nThere are data after the end of archive\n\nErrors: 1\n',
        },
        'cut-short.zip',
      ),
      'Unexpected end of archive There are data after the end of archive',
    );
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output:
            '--\nPath = cut-short.zip\nType = zip\nERRORS:\nUnexpected end of archive\nPhysical Size = 490\nCharacteristics = Local\n\n----------\n',
          errors: '\nERRORS:\nUnexpected end of archive\n\nErrors: 1\n',
        },
        'cut-short.zip',
      ),
      'Unexpected end of archive',
    );
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output: '',
          errors:
            'ERROR: C:\\archives\\a.7z\r\nCannot open encrypted archive. Wrong password?\r\n\r\nERRORS:\r\nHeaders Error\r\n',
        },
        'C:\\archives\\a.7z',
      ),
      'Cannot open encrypted archive. Wrong password?',
    );
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output: '',
          errors: '\r\n\r\nSystem ERROR:\r\nThe parameter is incorrect.\r\n',
        },
        'a.zip',
      ),
      'The parameter is incorrect.',
    );
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output: '',
          errors: '\r\nError:\r\nThe file is read-only\r\n\r\nErrors: 1\r\n',
        },
        'ro.zip',
      ),
      'The file is read-only',
    );
    assert.strictEqual(
      reasonOf({ code: 255, output: '', errors: '' }, 'a.zip'),
      '7-Zip ended with code 255.',
    );
    assert.strictEqual(
      reasonOf({ code: null, output: '', errors: '' }, 'a.zip'),
      '7-Zip was stopped.',
    );
  });
});

suite('the progress of an extraction', () => {
  test('reads how far 7-Zip got, how many files it took out and the one it is taking, adding or copying as it packs too, leaving out how far it got opening and scanning', () => {
    assert.deepStrictEqual(progressOf(' 18% 1029 - folder-0010/file.txt'), {
      percent: 18,
      files: 1029,
      current: 'folder-0010/file.txt',
    });
    assert.deepStrictEqual(progressOf('  6% 4 + s3.txt'), {
      percent: 6,
      files: 4,
      current: 's3.txt',
    });
    assert.deepStrictEqual(progressOf(' 76% = big.bin'), {
      percent: 76,
      files: 0,
      current: 'big.bin',
    });
    assert.deepStrictEqual(progressOf('  8% 496'), { percent: 8, files: 496 });
    assert.deepStrictEqual(progressOf('  0%'), { percent: 0, files: 0 });
    assert.strictEqual(progressOf(' 81% 4096 Open'), undefined);
    assert.strictEqual(progressOf('  0M Scan C:/archives/'), undefined);
  });
});
