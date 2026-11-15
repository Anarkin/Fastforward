export interface RunArgs {
  readonly runs: number;
  readonly against: string | undefined;
  readonly vitest: readonly string[];
}

const defaultRuns = 5;

export function parseRunArgs(args: readonly string[]): RunArgs {
  let runs = defaultRuns;
  let against: string | undefined;
  const vitest: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('--runs=')) {
      runs = Number(arg.slice('--runs='.length));
      if (!Number.isInteger(runs) || runs < 1) {
        throw new Error(`--runs takes a whole number from 1, not ${arg}`);
      }
    } else if (arg.startsWith('--against=')) {
      against = arg.slice('--against='.length);
    } else {
      vitest.push(arg);
    }
  }
  return { runs, against, vitest };
}

export function variantName(ref: string): string {
  return ref.replace(/[^A-Za-z0-9._-]+/g, '-');
}

export function runOrder(
  variants: readonly string[],
  rounds: number,
): { readonly variant: string; readonly round: number }[] {
  return Array.from({ length: rounds }, (_, index) => {
    const round = index + 1;
    const order = round % 2 === 1 ? variants : variants.toReversed();
    return order.map((variant) => ({ variant, round }));
  }).flat();
}
