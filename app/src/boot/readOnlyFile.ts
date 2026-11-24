import { fs } from '../lib/main/files';

export function writeReadOnly(file: string, text: string): void {
  if (fs.existsSync(file)) {
    fs.chmodSync(file, 0o644);
  }
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o444);
}
