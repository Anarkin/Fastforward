import type { SpawnOptions } from 'node:child_process';
import { replaceBuiltin } from '../../../../../helpers/builtins';

export function holdingGit(held: (args: readonly string[]) => boolean): {
  started: (command: string) => boolean;
  release: () => void;
} {
  const childProcess = process.getBuiltinModule('node:child_process');
  const { spawn } = childProcess;
  const spawned: (readonly string[])[] = [];
  const { promise: released, resolve } = Promise.withResolvers<void>();
  const holding = (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => {
    const child = spawn(command, args, options);
    spawned.push(args);
    if (held(args)) {
      const emit = child.emit.bind(child);
      child.emit = (event: string | symbol, ...rest: unknown[]) => {
        if (event !== 'close') {
          return emit(event, ...rest);
        }
        void released.then(() => emit(event, ...rest));
        return true;
      };
    }
    return child;
  };
  replaceBuiltin(childProcess, 'spawn', holding);
  return {
    started: (command) => spawned.some((args) => args.includes(command)),
    release: () => {
      replaceBuiltin(childProcess, 'spawn', spawn);
      resolve();
    },
  };
}
