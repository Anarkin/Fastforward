import { afterAll } from 'vitest';
import { assertNoFoldersLeft } from './repositories';

afterAll(() => assertNoFoldersLeft(), 10_000);
