/** Variable-height rows: overscan must never replace the actual viewport. */
export function messageWindow(heights: readonly number[], scrollTop: number, viewportHeight: number, buffer = 5) {
  const offsets = [0];
  for (const height of heights) offsets.push(offsets.at(-1)! + Math.max(1, height));
  const total = offsets.at(-1)!;
  const top = Math.max(0, Math.min(scrollTop, total));
  const bottom = top + Math.max(0, viewportHeight);
  let first = 0;
  while (first < heights.length && offsets[first + 1] <= top) first++;
  if (first === heights.length && first > 0) first--;
  let last = first;
  while (last < heights.length && offsets[last] < bottom) last++;
  const start = Math.max(0, first - buffer);
  const end = Math.min(heights.length, Math.max(last, first + 1) + buffer);
  return { start, end, top: offsets[start], bottom: total - offsets[end], total };
}
