export const graphemes = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

export const nonAscii = /[^\0-\x7f]/;

const alone = new Map<string, boolean>();

export function standsAlone(character: string): boolean {
  let known = alone.get(character);
  if (known === undefined) {
    known = Array.from(graphemes.segment(`a${character}a`)).length === 3;
    alone.set(character, known);
  }
  return known;
}
