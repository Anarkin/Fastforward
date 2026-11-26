export interface GpuOutcomes {
  readonly none: () => void;
  readonly lost: () => void;
}

export function gpuAnswers({
  none,
  lost,
}: GpuOutcomes): (drawing: boolean) => void {
  let drew = false;
  let told = false;
  return (drawing) => {
    if (drawing) {
      drew = true;
      told = false;
      return;
    }
    if (told) {
      return;
    }
    told = true;
    if (drew) {
      lost();
    } else {
      none();
    }
  };
}
