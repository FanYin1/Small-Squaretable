/** Pure monotonic-clock arithmetic. Samples contain no story, request or user data. */
export interface ReplyTiming {
  attempt: number;
  selection: number;
  startedAt: number;
  firstChunkAt: number | null;
  presentedAt: number | null;
}

export function firstBodyChunk(sample: ReplyTiming, at: number): ReplyTiming {
  return sample.firstChunkAt === null ? { ...sample, firstChunkAt: at } : sample;
}

export function presentationApprox(sample: ReplyTiming, at: number) {
  if (sample.firstChunkAt === null || sample.presentedAt !== null) return null;
  return {
    phase: 'presentation_approx' as const,
    attempt: sample.attempt,
    selection: sample.selection,
    atMs: at,
    sendToFirstBodyChunkMs: sample.firstChunkAt - sample.startedAt,
    firstBodyChunkToPresentationApproxMs: at - sample.firstChunkAt,
    sendToPresentationApproxMs: at - sample.startedAt,
  };
}
