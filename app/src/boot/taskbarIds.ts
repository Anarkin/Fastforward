export const appId = 'io.github.anarkin.fastforward';

export const taskbarBase = (development: boolean): string =>
  development ? `${appId}.development` : appId;

export interface TaskbarDetails {
  readonly appId: string;
  readonly appIconPath: string;
  readonly appIconIndex: number;
  readonly relaunchCommand: string;
  readonly relaunchDisplayName: string;
}

export function taskbarDetails(
  id: string,
  {
    icon,
    program,
    appPath,
    name,
  }: {
    readonly icon: string;
    readonly program: string;
    readonly appPath: string | undefined;
    readonly name: string;
  },
): TaskbarDetails {
  return {
    appId: id,
    appIconPath: appPath === undefined ? program : icon,
    appIconIndex: 0,
    relaunchCommand: [program, ...(appPath === undefined ? [] : [appPath])]
      .map((part) => `"${part}"`)
      .join(' '),
    relaunchDisplayName: name,
  };
}

export class TaskbarIds {
  private readonly slots = new Map<string, number>();

  constructor(private readonly base: string) {}

  of(window: string, perWindow: boolean): string {
    if (!perWindow) {
      this.slots.delete(window);
      return this.base;
    }
    let slot = this.slots.get(window);
    if (slot === undefined) {
      const taken = new Set(this.slots.values());
      slot = 0;
      while (taken.has(slot)) {
        slot += 1;
      }
      this.slots.set(window, slot);
    }
    return slot === 0 ? this.base : `${this.base}.window.${slot + 1}`;
  }

  forget(window: string): void {
    this.slots.delete(window);
  }
}
