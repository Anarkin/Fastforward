const monospaced = /^[\x20-\x7e]*$/;

export function fitsColumn(text: string, columns: number): boolean {
  return text.length <= columns && monospaced.test(text);
}

export function cutClass(text: string, columns: number): string {
  return fitsColumn(text, columns) ? '' : ' cut';
}
