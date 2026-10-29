import { utilityProcess } from 'electron';
import type { HostEvent } from './hostProtocol';
import type { ConnectHost } from './tool';
import type { Log } from '../../../shell/main/log';
import { brand, strings } from '../../../shared/strings';

export function hostProcess(modulePath: string, log: Log): ConnectHost {
  return (listener) => {
    const child = utilityProcess.fork(modulePath, [], {
      serviceName: `${brand} Terminal`,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (text: string) => {
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        log.error(strings.log.terminalHost(line));
      }
    });
    child.on('message', (event: HostEvent) => listener.event(event));
    child.once('exit', (code) => listener.stopped(code));
    return {
      send: (command) => {
        child.postMessage(command);
      },
      dispose: () => {
        child.kill();
      },
    };
  };
}
