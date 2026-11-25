const escape = String.fromCharCode(0x1b);
const csi = String.fromCharCode(0x9b);

const pasteMark = new RegExp(`(?:${escape}\\[|${csi})20[01]~`, 'g');

export function withoutPasteMarks(text: string): string {
  let kept = text;
  for (;;) {
    const next = kept.replace(pasteMark, '');
    if (next === kept) {
      return kept;
    }
    kept = next;
  }
}
