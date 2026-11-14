import { afterAll } from 'vitest';
import { assertNoFoldersLeft } from './helpers/repositories';

afterAll(() => assertNoFoldersLeft(), 10_000);
