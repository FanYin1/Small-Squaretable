/**
 * Web Vitals ingestion endpoint
 *
 * Receives Core Web Vitals metrics from the frontend via sendBeacon.
 * This endpoint is intentionally unauthenticated (sendBeacon cannot send
 * auth headers) and exempt from CSRF protection.
 */

import { Hono } from 'hono';
import { logger } from '../services/logger.service';

const vitalsLogger = logger.child({ service: 'web-vitals' });

export const vitalsRoutes = new Hono();

vitalsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { name, value, rating, timestamp, url } = body;

    if (!name || value === undefined) {
      return c.json({ success: false, error: 'Missing name or value' }, 400);
    }

    vitalsLogger.info('Web vital recorded', {
      vital: { name, value, rating, url },
      clientTimestamp: timestamp,
    });

    return c.json({ success: true }, 202);
  } catch {
    // Never fail client-side beacon — malformed payloads are silently accepted
    return c.json({ success: true }, 202);
  }
});
