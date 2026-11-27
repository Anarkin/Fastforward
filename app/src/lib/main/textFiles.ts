import { fs } from './files';
import * as path from 'node:path';
import { saveFile } from './fileSaving';

const heldRetries = [10, 20, 40, 80, 160, 320, 640];

export async function writeAtomically(
  file: string,
  text: string,
  retries: readonly number[] = heldRetries,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await saveFile(file, Buffer.from(text), { heldRetries: retries });
}
