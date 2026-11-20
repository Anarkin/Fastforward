export function onceQuiet(
  run: () => void,
  quiet: number,
): { schedule: () => void; hurry: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  return {
    schedule: () => {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        run();
      }, quiet);
    },
    hurry: () => {
      if (timer !== undefined) {
        cancel();
        run();
      }
    },
    cancel,
  };
}
