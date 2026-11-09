export function clickPairs(): (key: string, count: number) => boolean {
  let unpaired: string | undefined;
  return (key, count) => {
    const paired = count >= 2 && unpaired === key;
    unpaired = paired ? undefined : key;
    return paired;
  };
}
