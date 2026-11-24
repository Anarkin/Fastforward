import type { ToHost, ToWebview } from './protocol';
import type { ToolId } from './tools';
import type { CellReport } from './cellGrid';

export interface Bridge {
  readonly platform: string;
  readonly name: string;
  post(message: ToHost): void;
  dropFiles(files: readonly File[], tool: ToolId, message: unknown): void;
  setWindowButtonColor(color: string): void;
  setCellGrid(grid: CellReport | undefined): void;
  showWindow(): void;
  listen(handler: (message: ToWebview) => void): () => void;
  listenMaximized(handler: (maximized: boolean) => void): () => void;
}

export const appNameSwitch = '--fastforward-app-name=';
