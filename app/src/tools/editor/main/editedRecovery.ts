import type { RecoveryCopies } from '../../../lib/main/recoveryCopies';
import { EditedText, recoveredText } from './editedText';

export const recoveryKey = (tab: string) => `editor ${tab}`;

export function recoveredOf(
  recovery: RecoveryCopies | undefined,
  tab: string,
  file: string,
  onDisk: EditedText | undefined,
): EditedText | undefined {
  const copy = recovery?.take(recoveryKey(tab));
  const decoded = onDisk === undefined ? undefined : recoveredText(copy, file);
  if (onDisk === undefined || decoded === undefined) {
    return undefined;
  }
  const recovered = new EditedText(decoded, decoded.ending, onDisk.version);
  recovered.saved(onDisk.checkpoint());
  return recovered.changed() ? recovered : undefined;
}

export function keepCopy(
  recovery: RecoveryCopies | undefined,
  tab: string,
  file: string,
  text: EditedText,
): void {
  recovery?.keep(recoveryKey(tab), () => ({ file, ...text.shown() }));
}
