import {
  controlCodes,
  controlOfPicture,
  formFeed,
  pictureOfControl,
} from '../shared/controlFont';

const swappedCodes = [formFeed];

const escaped = (code: number) => `\\u${code.toString(16).padStart(4, '0')}`;

const classOf = (codes: readonly number[]) =>
  `[${codes.map(escaped).join('')}]`;

const control = new RegExp(classOf(controlCodes));

const swappedClass = classOf(swappedCodes);

const pictureClass = classOf(swappedCodes.map(pictureOfControl));

const swapped = new RegExp(swappedClass);
const everySwapped = new RegExp(swappedClass, 'g');
const picture = new RegExp(pictureClass);
const everyPicture = new RegExp(pictureClass, 'g');

export const swappedCharacters = (): RegExp => new RegExp(swappedClass, 'g');

export const pictureRuns = new RegExp(`(${pictureClass}+)`);

export const pictureOf = (code: number): string =>
  String.fromCharCode(pictureOfControl(code));

export const hasControls = (text: string): boolean => control.test(text);

export const hasSwapped = (text: string): boolean => swapped.test(text);

export const hasPictures = (text: string): boolean => picture.test(text);

export function pictured(text: string): string {
  return swapped.test(text)
    ? text.replace(everySwapped, (character) =>
        pictureOf(character.charCodeAt(0)),
      )
    : text;
}

export function unpictured(text: string): string {
  return picture.test(text)
    ? text.replace(everyPicture, (shown) =>
        String.fromCharCode(controlOfPicture(shown.charCodeAt(0))),
      )
    : text;
}
