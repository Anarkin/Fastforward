export type Timer = (run: () => void, ms: number) => () => void;

export const realTimer: Timer = (run, ms) => {
  const timeout = setTimeout(run, ms);
  return () => clearTimeout(timeout);
};
