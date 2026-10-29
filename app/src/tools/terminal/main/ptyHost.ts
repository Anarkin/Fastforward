import * as os from 'node:os';
import { spawn } from 'node-pty';
import { flowLimits } from './flowControl';
import type { HostCommand } from './hostProtocol';
import { PtyHost, realTimer } from './sessions';
import { windowsPtyOf } from './windowsPty';

const parent = process.parentPort;

const host = new PtyHost(
  (launch, columns, rows) =>
    spawn(launch.file, [...launch.args], {
      name: 'xterm-256color',
      cols: columns,
      rows,
      cwd: launch.cwd,
      env: { ...launch.env },
    }),
  (event) => parent.postMessage(event),
  flowLimits,
  realTimer,
  windowsPtyOf(process.platform, os.release()),
);

parent.on('message', ({ data }: { data: HostCommand }) => host.receive(data));
