import { z } from 'zod';

export const analyticsEventSchema = z.object({
  eventType: z.string().min(1).max(100),
  properties: z.record(z.unknown()).default({}),
  timestamp: z.number().optional(),
});

export const batchEventsSchema = z.object({
  events: z.array(analyticsEventSchema).min(1).max(100),
  context: z.object({
    sessionId: z.string(),
    platform: z.string().default('web'),
    deviceType: z.string().default('desktop'),
    browser: z.string().optional(),
    os: z.string().optional(),
    appVersion: z.string().optional(),
    referrer: z.string().optional(),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
  }),
});

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type BatchEventsInput = z.infer<typeof batchEventsSchema>;
