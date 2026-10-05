import type { ToHost, ToWebview } from './protocol';

export interface Bridge {
  readonly platform: string;
  readonly name: string;
  post(message: ToHost): void;
  setWindowButtonColor(color: string): void;
  listen(handler: (message: ToWebview) => void): () => void;
}
