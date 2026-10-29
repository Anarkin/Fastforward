import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { Terminal } from '@xterm/headless';
import type { WindowsPty } from '../shared/protocol';

export interface Mirror {
  readonly terminal: Terminal;
  serialize(): string;
  scrollback(lines: number): void;
  dispose(): void;
}

export function createMirror({
  columns,
  rows,
  scrollback,
  windowsPty,
}: {
  readonly columns: number;
  readonly rows: number;
  readonly scrollback: number;
  readonly windowsPty?: WindowsPty;
}): Mirror {
  const terminal = new Terminal({
    cols: columns,
    rows,
    scrollback,
    allowProposedApi: true,
    ...(windowsPty && { windowsPty }),
  });
  const serializer = new SerializeAddon();
  terminal.loadAddon(serializer);
  terminal.loadAddon(new Unicode11Addon());
  terminal.unicode.activeVersion = '11';
  return {
    terminal,
    serialize: () => serializer.serialize(),
    scrollback: (lines) => {
      terminal.options.scrollback = lines;
    },
    dispose: () => terminal.dispose(),
  };
}
