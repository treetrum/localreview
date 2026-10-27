/** Case-insensitive; every whitespace-separated term must appear in the path. */
export function matchesQuery(path: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = path.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
