import { strings } from '../shared/strings';

const blank = /^[\p{Zs}\u2800]$/u;

export function blankSignOf(
  cluster: string,
  whitespace: boolean,
): string | undefined {
  if (cluster === '\r') {
    return whitespace ? strings.symbols.carriageReturn : undefined;
  }
  return cluster !== ' ' && blank.test(cluster)
    ? strings.symbols.invisible
    : undefined;
}
