let scratch: Range | undefined;
let owner: Document | undefined;

export function scratchRange(): Range {
  if (scratch === undefined || owner !== document) {
    scratch = document.createRange();
    owner = document;
  }
  return scratch;
}
