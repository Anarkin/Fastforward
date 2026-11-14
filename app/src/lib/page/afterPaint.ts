export function afterPaint(run: () => void): {
  readonly ask: () => void;
  readonly cancel: () => void;
} {
  let frame: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    ask: () => {
      if (frame !== undefined || timer !== undefined) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = undefined;
        timer = setTimeout(() => {
          timer = undefined;
          run();
        });
      });
    },
    cancel: () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      clearTimeout(timer);
      frame = undefined;
      timer = undefined;
    },
  };
}

export function inNextFrame(run: () => void): { readonly ask: () => void } {
  let frame: number | undefined;
  return {
    ask: () => {
      frame ??= requestAnimationFrame(() => {
        frame = undefined;
        run();
      });
    },
  };
}
