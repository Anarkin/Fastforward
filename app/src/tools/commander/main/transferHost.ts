import type { TransferCommand } from './transferProtocol';
import { transferServer } from './transferServer';

process.noAsar = true;

const parent = process.parentPort;

const receive = transferServer((event) => parent.postMessage(event));

parent.on('message', ({ data }: { data: TransferCommand }) => receive(data));
