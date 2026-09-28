function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// Every date in the product reads the same, like 2022-12-14 16:12, in local
// time
export function formatDateTime(time: number): string {
  const date = new Date(time);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
