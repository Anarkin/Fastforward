export interface ShellLaunch {
  readonly file: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

export type HostCommand =
  | {
      readonly type: 'spawn';
      readonly id: string;
      readonly launch: ShellLaunch;
      readonly columns: number;
      readonly rows: number;
      readonly scrollback: number;
    }
  | {
      readonly type: 'attach';
      readonly id: string;
      readonly columns: number;
      readonly rows: number;
      readonly scrollback: number;
    }
  | { readonly type: 'detach'; readonly id: string }
  | { readonly type: 'input'; readonly id: string; readonly data: string }
  | {
      readonly type: 'resize';
      readonly id: string;
      readonly columns: number;
      readonly rows: number;
    }
  | { readonly type: 'ack'; readonly id: string; readonly chars: number }
  | { readonly type: 'kill'; readonly id: string };

export type HostEvent =
  | {
      readonly type: 'screen';
      readonly id: string;
      readonly data: string;
      readonly exited: boolean;
    }
  | { readonly type: 'output'; readonly id: string; readonly data: string }
  | { readonly type: 'folder'; readonly id: string; readonly folder: string }
  | { readonly type: 'exited'; readonly id: string };
