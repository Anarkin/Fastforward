export interface Pool<Kept> {
  readonly taken: () => Kept;
  readonly givenBack: (kept: Kept) => void;
}

export function poolOf<Kept>(
  make: () => Kept,
  rested: (kept: Kept) => void,
  dropped: (kept: Kept) => void,
): Pool<Kept> {
  let spare: Kept | undefined;
  return {
    taken: () => {
      const kept = spare ?? make();
      spare = undefined;
      return kept;
    },
    givenBack: (kept) => {
      if (spare === undefined) {
        rested(kept);
        spare = kept;
      } else {
        dropped(kept);
      }
    },
  };
}
