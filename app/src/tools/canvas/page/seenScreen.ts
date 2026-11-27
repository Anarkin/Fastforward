import { doubleShift, lightBits, type Screen, type Way } from './screen';

const light = ' ╵╶└╷│┌├╴┘─┴┐┤┬┼';

const heavy = ' ║═╚║║╔╠═╝═╩╗╣╦╬';

const arrows: Readonly<Record<Way, string>> = {
  up: '▲',
  right: '▶',
  down: '▼',
  left: '◀',
};

export function screenRows(screen: Screen): string[] {
  const { see } = screen;
  screen.see = undefined;
  see?.();
  return Array.from({ length: screen.rows }, (_, row) => {
    let line = '';
    for (let column = 0; column < screen.columns; column++) {
      const at = row * screen.columns + column;
      const glyph = screen.seen[at] ?? screen.glyphs[at];
      const arrow = screen.arrows[at];
      const bits = screen.lines[at] ?? 0;
      const double = (bits >> doubleShift) & lightBits;
      if (glyph !== undefined) {
        line += glyph;
      } else if (arrow !== undefined) {
        line += arrows[arrow];
      } else if (double === 0) {
        line += light.charAt(bits & lightBits);
      } else {
        line += heavy.charAt(double | (bits & lightBits));
      }
    }
    return line.trimEnd();
  });
}
