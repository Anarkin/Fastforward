import type { Pty, SpawnPty } from '../tools/terminal/main/sessions';
import type { ShellLaunch } from '../tools/terminal/main/hostProtocol';

export class FakePty implements Pty {
  readonly written: string[] = [];
  readonly sizes: (readonly [number, number])[] = [];
  paused = false;
  killed = false;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<
    (exit: { readonly exitCode: number }) => void
  >();

  constructor(
    readonly launch: ShellLaunch,
    readonly columns: number,
    readonly rows: number,
  ) {}

  onData(listener: (data: string) => void) {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  }

  onExit(listener: (exit: { readonly exitCode: number }) => void) {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  }

  print(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  exit(exitCode: number): void {
    for (const listener of this.exitListeners) {
      listener({ exitCode });
    }
  }

  write(data: string): void {
    this.written.push(data);
  }

  resize(columns: number, rows: number): void {
    this.sizes.push([columns, rows]);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  kill(): void {
    this.killed = true;
  }
}

export function fakePtys(): {
  readonly spawn: SpawnPty;
  readonly spawned: FakePty[];
  last(): FakePty;
} {
  const spawned: FakePty[] = [];
  return {
    spawned,
    spawn: (launch, columns, rows) => {
      const pty = new FakePty(launch, columns, rows);
      spawned.push(pty);
      return pty;
    },
    last: () => {
      const pty = spawned.at(-1);
      if (pty === undefined) {
        throw new Error('No shell was started');
      }
      return pty;
    },
  };
}

export async function until(
  condition: () => boolean,
  tries = 2000,
): Promise<void> {
  for (let tried = 0; tried < tries && !condition(); tried++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  if (!condition()) {
    throw new Error('The condition never held');
  }
}
