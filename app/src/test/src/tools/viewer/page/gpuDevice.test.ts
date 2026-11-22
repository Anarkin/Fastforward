import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { gpuOf } from '../../../../../tools/viewer/page/gpuDevice';

interface FakeDevice {
  readonly lost: Promise<unknown>;
  readonly lose: () => void;
}

function fakeDevice(): FakeDevice {
  const { promise, resolve } = Promise.withResolvers<unknown>();
  return { lost: promise, lose: () => resolve(undefined) };
}

const settled = () => new Promise((resolve) => setTimeout(resolve));

suite('GPU the cells are drawn with', () => {
  test('asks the page for a device once, however often it is asked for one, hands it out once it came and tells whoever watches, counting on', async () => {
    const device = fakeDevice();
    let asked = 0;
    const gpu = gpuOf<FakeDevice>({
      gpu: {
        requestAdapter: () => {
          asked++;
          return Promise.resolve({
            requestDevice: () => Promise.resolve(device),
          });
        },
      },
    });
    let told = 0;
    const unwatch = gpu.watch(() => told++);

    const before = [gpu.device(), gpu.device(), gpu.generation()];
    await settled();

    assert.deepStrictEqual(before, [undefined, undefined, 0]);
    assert.deepStrictEqual(
      [asked, gpu.device(), gpu.generation(), told, gpu.refused()],
      [1, device, 1, 1, false],
    );
    unwatch();
  });

  test('asks for a new device once the one it had is lost, handing none out between, as nothing else draws the text', async () => {
    const devices = [fakeDevice(), fakeDevice()];
    let asked = 0;
    const gpu = gpuOf<FakeDevice>({
      gpu: {
        requestAdapter: () =>
          Promise.resolve({
            requestDevice: () => Promise.resolve(devices[asked++]),
          }),
      },
    });
    gpu.device();
    await settled();
    const seen: unknown[] = [];
    gpu.watch(() => seen.push(gpu.device()));

    devices[0].lose();
    await settled();

    assert.deepStrictEqual(seen, [undefined, devices[1]]);
    assert.strictEqual(gpu.generation(), 3);
  });

  test('says the GPU is refused in a page without WebGPU, and once the page gives no adapter or fails to give a device, telling whoever watches, so a file viewed says why none of its text is drawn', async () => {
    const without = gpuOf<FakeDevice>({});
    const noAdapter = gpuOf<FakeDevice>({
      gpu: { requestAdapter: () => Promise.resolve(null) },
    });
    const failing = gpuOf<FakeDevice>({
      gpu: {
        requestAdapter: () =>
          Promise.resolve({
            requestDevice: () => Promise.reject(new Error('no device')),
          }),
      },
    });
    let told = 0;
    noAdapter.watch(() => told++);
    failing.watch(() => told++);

    const before = [noAdapter.refused(), failing.refused()];
    const devices = [without.device(), noAdapter.device(), failing.device()];
    await settled();

    assert.deepStrictEqual(before, [false, false]);
    assert.deepStrictEqual(devices, [undefined, undefined, undefined]);
    assert.deepStrictEqual(
      [without.refused(), noAdapter.refused(), failing.refused(), told],
      [true, true, true, 2],
    );
  });
});
