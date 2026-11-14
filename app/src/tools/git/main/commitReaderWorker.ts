import { parentPort } from 'node:worker_threads';
import { serveCommitReads } from './commitReader';

if (parentPort !== null) {
  serveCommitReads(parentPort);
}
