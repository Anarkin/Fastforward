import {
  appIconColors,
  appIconDrawing,
  folderBackOutline,
} from '../../src/shell/page/appIconDrawing.ts';

export function appIconSvg(): string {
  const drawing = appIconDrawing();
  const { size, frontTop } = drawing;
  const half = size / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
    '<defs>',
    '<mask id="disc">',
    `<circle cx="${half}" cy="${half}" r="${half}" fill="#FFFFFF"/>`,
    '</mask>',
    '</defs>',
    '<g mask="url(#disc)">',
    `<rect width="${size}" height="${size}" fill="${appIconColors.sky}"/>`,
    `<path d="${folderBackOutline(drawing)}" fill="${appIconColors.back}"/>`,
    `<rect y="${frontTop}" width="${size}" height="${size - frontTop}" fill="${appIconColors.front}"/>`,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}
