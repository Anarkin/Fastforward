import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { protoOnce, structOnce } from '../../../../lib/main/koffiTypes';

suite('Native types', () => {
  test('defines a named native type once however often the module that defines it loads, reusing the one defined, as a module loaded again by each test file threw a duplicate type name', () => {
    const definition = 'uint32_t __stdcall KoffiTypesTestRelease(void *self)';
    const fields = { x: 'int32_t', y: 'int32_t' } as const;
    assert.strictEqual(protoOnce(definition), protoOnce(definition));
    assert.strictEqual(
      structOnce('KoffiTypesTestPoint', fields),
      structOnce('KoffiTypesTestPoint', fields),
    );
  });
});
