import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { characterPresetRepository } from '../../db/repositories';
import { AppError } from '../../core/errors';

const app = new Hono();

// Validation schemas
const createPresetSchema = z.object({
  characterId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  preset: z.record(z.any()),
  isGlobal: z.boolean().default(false),
});

const updatePresetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  preset: z.record(z.any()).optional(),
  isGlobal: z.boolean().optional(),
});

/**
 * GET /api/v1/presets
 * List all presets for the current user
 */
app.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const { characterId } = c.req.query();

  let presets;
  if (characterId) {
    // Get presets for specific character + global presets
    const [characterPresets, globalPresets] = await Promise.all([
      characterPresetRepository.findByCharacterId(user.id, characterId),
      characterPresetRepository.findGlobalPresets(user.id),
    ]);
    presets = [...characterPresets, ...globalPresets];
  } else {
    // Get all presets
    presets = await characterPresetRepository.findByUserId(user.id);
  }

  return c.json({
    success: true,
    data: presets,
  });
});

/**
 * GET /api/v1/presets/:id
 * Get a specific preset
 */
app.get('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const preset = await characterPresetRepository.findById(id);
  if (!preset) {
    throw new AppError('Preset not found', 404);
  }

  if (preset.userId !== user.id) {
    throw new AppError('Forbidden', 403);
  }

  return c.json({
    success: true,
    data: preset,
  });
});

/**
 * POST /api/v1/presets
 * Create a new preset
 */
app.post('/', authMiddleware, zValidator('json', createPresetSchema), async (c) => {
  const user = c.get('user');
  const input = c.req.valid('json');

  const preset = await characterPresetRepository.create({
    userId: user.id,
    ...input,
  });

  return c.json(
    {
      success: true,
      data: preset,
    },
    201
  );
});

/**
 * PATCH /api/v1/presets/:id
 * Update a preset
 */
app.patch('/:id', authMiddleware, zValidator('json', updatePresetSchema), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const input = c.req.valid('json');

  const existing = await characterPresetRepository.findById(id);
  if (!existing) {
    throw new AppError('Preset not found', 404);
  }

  if (existing.userId !== user.id) {
    throw new AppError('Forbidden', 403);
  }

  const updated = await characterPresetRepository.update(id, input);

  return c.json({
    success: true,
    data: updated,
  });
});

/**
 * POST /api/v1/presets/:id/apply
 * Apply a preset (increments use count)
 */
app.post('/:id/apply', authMiddleware, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const preset = await characterPresetRepository.findById(id);
  if (!preset) {
    throw new AppError('Preset not found', 404);
  }

  if (preset.userId !== user.id) {
    throw new AppError('Forbidden', 403);
  }

  await characterPresetRepository.incrementUseCount(id);

  return c.json({
    success: true,
    data: preset,
  });
});

/**
 * DELETE /api/v1/presets/:id
 * Delete a preset
 */
app.delete('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const preset = await characterPresetRepository.findById(id);
  if (!preset) {
    throw new AppError('Preset not found', 404);
  }

  if (preset.userId !== user.id) {
    throw new AppError('Forbidden', 403);
  }

  await characterPresetRepository.delete(id);

  return c.json({
    success: true,
    message: 'Preset deleted',
  });
});

export default app;
