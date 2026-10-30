function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

const fields: Readonly<Record<string, (date: Date) => string>> = {
  YYYY: (date) => pad(date.getFullYear(), 4),
  MM: (date) => pad(date.getMonth() + 1),
  DD: (date) => pad(date.getDate()),
  HH: (date) => pad(date.getHours()),
  mm: (date) => pad(date.getMinutes()),
  ss: (date) => pad(date.getSeconds()),
};

const fieldPattern = /YYYY|MM|DD|HH|mm|ss/g;

export function formatDate(time: number, pattern: string): string {
  const date = new Date(time);
  return pattern.replace(fieldPattern, (field) => fields[field](date));
}

export function formatDateTime(time: number): string {
  return formatDate(time, 'YYYY-MM-DD HH:mm');
}
