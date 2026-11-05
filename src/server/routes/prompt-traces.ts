import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { chatRepository } from '../../db/repositories/chat.repository';
import { NotFoundError } from '../../core/errors';
import { readGenerationTraces } from '../services/generation-trace-store';
import { readPromptTraces } from '../services/prompt-trace-store';

export const promptTraceRoutes = new Hono();
promptTraceRoutes.get('/:id/prompt-traces', authMiddleware(), zValidator('param', z.object({ id: z.string().uuid() })), async c => {
  c.header('Cache-Control', 'no-store');
  const user = c.get('user');
  const id = c.req.valid('param').id;
  const chat = await chatRepository.findById(id);
  if (!chat || chat.userId !== user.id || chat.tenantId !== user.tenantId) throw new NotFoundError('Chat');
  return c.json({ success: true, data: await readPromptTraces(user.tenantId, user.id, id) });
});

promptTraceRoutes.get('/:id/generation-traces', authMiddleware(), zValidator('param', z.object({ id: z.string().uuid() })), async c => {
  c.header('Cache-Control', 'no-store');
  const user = c.get('user');
  const id = c.req.valid('param').id;
  const chat = await chatRepository.findById(id);
  if (!chat || chat.userId !== user.id || chat.tenantId !== user.tenantId) throw new NotFoundError('Chat');
  return c.json({ success: true, data: await readGenerationTraces(user.tenantId, user.id, id) });
});
