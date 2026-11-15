export function atMostEvery(
  run: () => void,
  delay: number,
): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let again = false;
  const cool = () => {
    timer = setTimeout(() => {
      timer = undefined;
      if (again) {
        again = false;
        run();
        cool();
      }
    }, delay);
  };
  return {
    schedule: () => {
      if (timer === undefined) {
        run();
        cool();
      } else {
        again = true;
      }
    },
    cancel: () => {
      clearTimeout(timer);
      timer = undefined;
      again = false;
    },
  };
}
