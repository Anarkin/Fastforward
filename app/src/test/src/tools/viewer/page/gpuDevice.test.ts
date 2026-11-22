import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { gpuSupported } from '../../../../../tools/viewer/page/gpuDevice';

suite('GPU the cells are drawn with', () => {
  test('says no cells can be drawn in a page without WebGPU, and that they can in one that has it', () => {
    assert.strictEqual(gpuSupported({}), false);
    assert.strictEqual(gpuSupported({ gpu: undefined }), false);
    assert.strictEqual(gpuSupported({ gpu: {} }), true);
  });
});
