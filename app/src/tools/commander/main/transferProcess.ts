import { utilityProcess } from 'electron';
import type { Log } from '../../../shell/main/log';
import { brand, strings } from '../../../lib/shared/strings';
import type { TransferEvent } from './transferProtocol';
import type { ConnectTransfer } from './transfers';

export function transferProcess(modulePath: string, log: Log): ConnectTransfer {
  return (listener) => {
    const child = utilityProcess.fork(modulePath, [], {
      serviceName: `${brand} Copying`,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let disposed = false;
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (text: string) => {
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        log.error(strings.log.transferHost(line));
      }
    });
    child.on('message', (event: TransferEvent) => listener.event(event));
    child.once('exit', (code) => {
      if (!disposed) {
        listener.stopped(code);
      }
    });
    return {
      send: (command) => {
        child.postMessage(command);
      },
      dispose: () => {
        disposed = true;
        child.kill();
      },
    };
  };
}
