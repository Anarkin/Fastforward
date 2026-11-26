interface AskedGpu {
  readonly device: () => unknown;
  readonly refused: () => boolean;
  readonly watch: (listener: () => void) => () => void;
}

export function reportGpu(
  gpu: AskedGpu,
  tell: (drawing: boolean) => void,
): () => void {
  let told: boolean | undefined;
  const answered = () => {
    const drawing =
      gpu.device() !== undefined ? true : gpu.refused() ? false : undefined;
    if (drawing !== undefined && drawing !== told) {
      told = drawing;
      tell(drawing);
    }
  };
  const unwatch = gpu.watch(answered);
  answered();
  return unwatch;
}
