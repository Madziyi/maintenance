import Fuse from 'fuse.js';

export interface FuzzySearchOptions {
  threshold?: number; // 0.0 = exact match, 1.0 = match anything (default: 0.4)
  minMatchCharLength?: number; // Minimum character length to match (default: 1)
  ignoreLocation?: boolean; // Ignore location of matches (default: true)
}

/**
 * Fuzzy search function that handles typos and similar words
 * @param items - Array of items to search through
 * @param searchTerm - The search query
 * @param keys - Array of field names to search in
 * @param options - Configuration options for fuzzy matching
 * @returns Filtered array of items that match the search term
 */
export function fuzzySearch<T>(
  items: T[],
  searchTerm: string,
  keys: string[],
  options: FuzzySearchOptions = {}
): T[] {
  if (!searchTerm.trim()) {
    return items;
  }

  const fuse = new Fuse(items, {
    keys,
    threshold: options.threshold ?? 0.4, // 0.4 = allows ~60% similarity (good balance)
    minMatchCharLength: options.minMatchCharLength ?? 1,
    ignoreLocation: options.ignoreLocation ?? true,
    includeScore: false,
    shouldSort: true,
  });

  const results = fuse.search(searchTerm);
  return results.map(result => result.item);
}

/**
 * Check if a single item matches the search term using fuzzy search
 * Useful for filtering within a filter function
 */
export function fuzzyMatch<T>(
  item: T,
  searchTerm: string,
  keys: string[],
  options: FuzzySearchOptions = {}
): boolean {
  if (!searchTerm.trim()) {
    return true;
  }

  return fuzzySearch([item], searchTerm, keys, options).length > 0;
}
