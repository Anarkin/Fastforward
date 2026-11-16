import { wrapColumns } from './wordWrap';

const lengthOf = (value: string) => parseFloat(value) || 0;

export function boxColumns(box: Element, advance: number): number {
  const style = getComputedStyle(box);
  return wrapColumns(
    box.getBoundingClientRect().width -
      lengthOf(style.paddingLeft) -
      lengthOf(style.paddingRight),
    advance,
  );
}
