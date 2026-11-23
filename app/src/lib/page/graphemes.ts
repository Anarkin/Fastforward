export const graphemes = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

export const nonAscii = /[^\0-\x7f]/;
