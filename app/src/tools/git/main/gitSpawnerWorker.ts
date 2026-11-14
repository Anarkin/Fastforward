import { parentPort } from 'node:worker_threads';
import { serveGitSpawns } from './gitSpawner';

if (parentPort !== null) {
  serveGitSpawns(parentPort);
}
