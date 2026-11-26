import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { reportGpu } from '../../../../shell/page/gpuReport';

function fakeGpu() {
  const listeners = new Set<() => void>();
  const gpu = {
    drawing: undefined as boolean | undefined,
    device: () => (gpu.drawing === true ? {} : undefined),
    refused: () => gpu.drawing === false,
    watch: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    answer: (drawing: boolean | undefined) => {
      gpu.drawing = drawing;
      for (const listener of listeners) {
        listener();
      }
    },
  };
  return gpu;
}

suite('GPU told to the main process', () => {
  test('asks for the GPU as the page starts and tells whether it draws once it answers, again only once that changes, so the app can say at its start that it has none', () => {
    const gpu = fakeGpu();
    const told: boolean[] = [];
    let asked = 0;
    const stop = reportGpu(
      { ...gpu, device: () => (asked++, gpu.device()) },
      (drawing) => told.push(drawing),
    );

    const before = [...told];
    gpu.answer(true);
    gpu.answer(true);
    gpu.answer(undefined);
    gpu.answer(false);
    stop();
    gpu.answer(true);

    assert.ok(asked > 0);
    assert.deepStrictEqual([before, told], [[], [true, false]]);
  });

  test('tells at once that a page without WebGPU has none', () => {
    const gpu = fakeGpu();
    gpu.drawing = false;
    const told: boolean[] = [];

    reportGpu(gpu, (drawing) => told.push(drawing));

    assert.deepStrictEqual(told, [false]);
  });
});
