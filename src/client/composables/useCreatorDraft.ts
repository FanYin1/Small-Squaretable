import { ref } from 'vue';
import { z } from 'zod';

export const creatorFormSchema = z.object({
  name: z.string(), description: z.string(), category: z.string(), tags: z.array(z.string()),
  isNsfw: z.boolean(), personality: z.string(), scenario: z.string(), systemPrompt: z.string(),
  firstMessage: z.string(), exampleMessages: z.string(), creatorNotes: z.string(),
  avatarUrl: z.string(), alternateGreetings: z.array(z.string()),
}).strict();
export type CreatorForm = z.infer<typeof creatorFormSchema>;
const snapshotSchema = z.tuple([creatorFormSchema, z.record(z.unknown()), z.string(), z.record(z.unknown()), z.record(z.string())]);
const envelopeSchema = z.object({ version: z.literal(1), base: z.string(), draft: z.string(), uncertain: z.boolean() }).strict();
type Envelope = z.infer<typeof envelopeSchema>;
const limit = 10 * 1024 * 1024;

export function parseCreatorSnapshot(value: string) {
  return snapshotSchema.parse(JSON.parse(value));
}

export function useCreatorDraft() {
  const pending = ref<Envelope | null>(null);
  const stored = ref(false);
  const failed = ref(false);
  let key: string | null = null;

  function open(nextKey: string | null) {
    key = nextKey;
    pending.value = null;
    stored.value = false;
    failed.value = false;
    if (!key) return;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      if (raw.length > limit) throw new Error('Draft exceeds local limit');
      const value = envelopeSchema.parse(JSON.parse(raw));
      parseCreatorSnapshot(value.draft);
      pending.value = value;
      stored.value = true;
    } catch { failed.value = true; }
  }

  function persist(base: string, draft: string, uncertain: boolean) {
    if (!key || pending.value) return;
    if (base === draft && !uncertain) { clear(); return; }
    try {
      const raw = JSON.stringify({ version: 1, base, draft, uncertain });
      if (raw.length > limit) throw new Error('Draft exceeds local limit');
      sessionStorage.setItem(key, raw);
      stored.value = true;
      failed.value = false;
    } catch { stored.value = false; failed.value = true; }
  }

  function clear() {
    pending.value = null;
    stored.value = false;
    try { if (key) sessionStorage.removeItem(key); failed.value = false; }
    catch { failed.value = true; }
  }

  function take() {
    const value = pending.value;
    pending.value = null;
    return value;
  }

  return { pending, stored, failed, open, persist, clear, take };
}
