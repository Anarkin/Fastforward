import { afterEach, beforeEach } from 'vitest';
import { errorsLoggedSince } from './appLogs';
import { assertDisplay } from './display';

assertDisplay();

let started = Date.now();

beforeEach(() => {
  started = Date.now();
});

afterEach(({ task }) => {
  if (task.result?.state !== 'fail') {
    return;
  }
  const errors = errorsLoggedSince(started - 1000);
  if (errors.length > 0) {
    console.error(
      `The app logged these errors while the test ran:\n${errors.join('\n')}`,
    );
  }
});
