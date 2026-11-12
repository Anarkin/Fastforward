export function fileIdOf(stats: {
  readonly dev: bigint;
  readonly ino: bigint;
}): string | undefined {
  return stats.ino === 0n ? undefined : `${stats.dev}:${stats.ino}`;
}
