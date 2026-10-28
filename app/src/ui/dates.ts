function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateTime(time: number): string {
  const date = new Date(time);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
