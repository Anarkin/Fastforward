import type { TextRequest } from '../shared/protocol';

export function uniqueTexts(requests: readonly TextRequest[]): TextRequest[] {
  return [
    ...new Map(
      requests.map((request) => [`${request.side}\0${request.path}`, request]),
    ).values(),
  ];
}

const maxTextsAsked = 10_000;

export function isPathAsked(value: unknown): value is string {
  return (
    typeof value === 'string' && !value.includes('\0') && !value.includes('\n')
  );
}

function isTextRequest(value: unknown): value is TextRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    isPathAsked(value.path) &&
    'blob' in value &&
    typeof value.blob === 'string' &&
    'side' in value &&
    (value.side === 'old' || value.side === 'new')
  );
}

export function areTextRequests(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= maxTextsAsked &&
    value.every(isTextRequest)
  );
}
