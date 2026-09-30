import * as vscode from 'vscode';

export interface RecordingLog {
  readonly log: vscode.LogOutputChannel;
  readonly info: unknown[][];
  readonly error: unknown[][];
}

export function recordingLog(channel: vscode.LogOutputChannel): RecordingLog {
  const info: unknown[][] = [];
  const error: unknown[][] = [];
  const recorded: Record<string, unknown[][]> = { info, error };
  const log = new Proxy(channel, {
    get(target, property, receiver) {
      const calls =
        typeof property === 'string' ? recorded[property] : undefined;
      if (calls) {
        return (...args: unknown[]) => calls.push(args);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  return { log, info, error };
}

export async function withMessageStub(
  method: 'showInformationMessage' | 'showErrorMessage',
  run: (messages: string[]) => Promise<void>,
): Promise<void> {
  const original = vscode.window[method];
  const messages: string[] = [];
  Reflect.set(vscode.window, method, (message: string) => {
    messages.push(message);
    return Promise.resolve(undefined);
  });
  try {
    await run(messages);
  } finally {
    Reflect.set(vscode.window, method, original);
  }
}
