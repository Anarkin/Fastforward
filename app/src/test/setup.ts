import { afterAll } from 'vitest';
import { assertNoFoldersLeft } from './support/repositories';

afterAll(() => assertNoFoldersLeft(), 10_000);
