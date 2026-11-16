/** Above this many cells the DP table is too slow to build on every render. */
const MAX_CELLS = 1_000_000;

/**
 * Index pairs `[i, j]` of a longest common subsequence of `a` and `b`, in order. Returns null if
 * the inputs are too large once the common prefix and suffix are trimmed.
 */
export function lcs<T>(a: readonly T[], b: readonly T[]): [number, number][] | null {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const n = endA - start;
  const m = endB - start;
  if (n * m > MAX_CELLS) return null;

  // table[i][j] = LCS length of a[start + i..endA) and b[start + j..endB).
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[start + i] === b[start + j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }

  const pairs: [number, number][] = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      pairs.push([start + i, start + j]);
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) i++;
    else j++;
  }
  for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}
