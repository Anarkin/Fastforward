import { searchFilter, type Filter } from '../../lib/shared/filter';
import { plainSearch } from '../../lib/shared/searchOptions';

export const plainFilter = (query: string): Filter =>
  searchFilter(query, plainSearch);
