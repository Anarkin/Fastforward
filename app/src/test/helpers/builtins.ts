import { syncBuiltinESMExports } from 'node:module';

export function replaceBuiltin(
  module: object,
  name: string,
  value: unknown,
): void {
  Reflect.set(module, name, value);
  syncBuiltinESMExports();
}
