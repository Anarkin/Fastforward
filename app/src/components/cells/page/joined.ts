import { spaceCode } from '../../../lib/shared/characterCodes';

const alone = (code: number) =>
  code < spaceCode ||
  (code >= 0x7f && code < 0x300) ||
  (code >= 0x4e00 && code <= 0x9fff) ||
  (code >= 0x3041 && code <= 0x3096) ||
  (code >= 0x30a1 && code <= 0x30fa) ||
  (code >= 0xac00 && code <= 0xd7a3) ||
  (code >= 0xff01 && code <= 0xff5e);

export const joins = (next: number) => next >= 0x300 && !alone(next);

export const standsAlone = (code: number, next: number) =>
  alone(code) && !joins(next);
