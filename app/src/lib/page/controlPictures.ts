const deleteCode = 0x7f;
const firstPicture = 0x2400;
const deletePicture = 0x2421;

const drawnByTheViews = new Set([9, 10, 13]);

const codes = [
  ...Array.from({ length: 0x20 }, (_, code) => code).filter(
    (code) => !drawnByTheViews.has(code),
  ),
  deleteCode,
];

const pictureCode = (code: number) =>
  code === deleteCode ? deletePicture : firstPicture + code;

const escaped = (code: number) => `\\u${code.toString(16).padStart(4, '0')}`;

const controlClass = `[${codes.map(escaped).join('')}]`;

const pictureClass = `[${codes.map((code) => escaped(pictureCode(code))).join('')}]`;

const control = new RegExp(controlClass);
const controls = new RegExp(controlClass, 'g');
const picture = new RegExp(pictureClass);
const pictures = new RegExp(pictureClass, 'g');

export const controlCharacters = (): RegExp => new RegExp(controlClass, 'g');

export const pictureRuns = new RegExp(`(${pictureClass}+)`);

export const pictureOf = (code: number): string =>
  String.fromCharCode(pictureCode(code));

export const hasControls = (text: string): boolean => control.test(text);

export const hasPictures = (text: string): boolean => picture.test(text);

export function pictured(text: string): string {
  return control.test(text)
    ? text.replace(controls, (character) => pictureOf(character.charCodeAt(0)))
    : text;
}

export function unpictured(text: string): string {
  return picture.test(text)
    ? text.replace(pictures, (shown) => {
        const code = shown.charCodeAt(0);
        return String.fromCharCode(
          code === deletePicture ? deleteCode : code - firstPicture,
        );
      })
    : text;
}
