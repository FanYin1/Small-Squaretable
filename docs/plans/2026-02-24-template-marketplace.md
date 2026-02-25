# Iteration 40: Character Template Marketplace Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add template rating system, "My Templates" management, "Save as Template" from existing characters, backend route tests, and trending sort.

**Architecture:** 5 tasks. T1 adds template rating (schema + endpoints). T2 adds "My Templates" management page. T3 adds "Save as Template" from character. T4 adds backend route tests. T5 runs final verification. T1-T4 are independent.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Add template rating system

**Files:**
- Create: `src/db/schema/template-ratings.ts`
- Modify: `src/server/routes/character-templates.ts`
- Modify: `src/client/services/character-template.api.ts`
- Modify: `src/client/pages/CharacterTemplates.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Create `template-ratings.ts` schema (simpler than character ratings — just a 1-5 star rating):
```ts
export const templateRatings = pgTable('template_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => characterTemplates.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(), // 1-5
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueTemplateUser: unique().on(table.templateId, table.userId),
}));
```

2. Add rating endpoints to `character-templates.ts`:
- `POST /:id/rate` — rate a template (1-5), upsert
- `GET /:id/rating` — get user's rating + average rating

3. Add `averageRating` to the template list response. Use a SQL subquery or join to compute average.

4. Update `CharacterTemplates.vue` to show star ratings on each card and allow rating via click.

5. Add i18n keys for rating UI.

**Tests:** ~3 tests in `src/server/routes/character-template-ratings.spec.ts`
- Rate template returns success
- Get rating returns average and user rating
- Duplicate rating updates existing

**Commit:** `feat(templates): add template rating system`

---

### Task 2: Add "My Templates" management section

**Files:**
- Modify: `src/server/routes/character-templates.ts`
- Modify: `src/client/pages/CharacterTemplates.vue`
- Modify: `src/client/services/character-template.api.ts`

**What to do:**

1. Add `GET /mine` endpoint to `character-templates.ts` (auth required):
```ts
characterTemplateRoutes.get('/mine', authMiddleware(), async (c) => {
  const user = c.get('user');
  const templates = await db.select().from(characterTemplates)
    .where(eq(characterTemplates.creatorId, user.id))
    .orderBy(desc(characterTemplates.updatedAt));
  return c.json<ApiResponse>({
    success: true,
    data: templates,
    meta: { timestamp: new Date().toISOString() },
  });
});
```

Place this BEFORE the `/:id` route to avoid conflicts.

2. Add `getMyTemplates` to the API service.

3. Add a "My Templates" tab to `CharacterTemplates.vue` with edit/delete buttons. Use `el-tabs` to switch between "Browse" and "My Templates".

4. Add edit dialog (reuse the create template schema) and delete with confirmation.

**Tests:** ~2 tests in `src/client/pages/CharacterTemplates.spec.ts`
- My Templates tab shows user's templates
- Delete template removes from list

**Commit:** `feat(templates): add My Templates management section`

---

### Task 3: Add "Save as Template" from existing character

**Files:**
- Modify: `src/client/pages/CharacterEditor.vue`
- Modify: `src/client/services/character-template.api.ts`

**What to do:**

1. Add a "Save as Template" button to CharacterEditor (only in edit mode, for character owners).

2. When clicked, open a dialog pre-filled with the character's data (name, description, cardData, category, tags, avatarUrl).

3. On confirm, call `characterTemplateApi.createTemplate(data)` to create the template.

4. Add i18n keys: `"saveAsTemplate": "Save as Template"` / `"保存为模板"`, `"templateSaved": "Template saved successfully"` / `"模板保存成功"`.

**Tests:** ~1 test in `src/client/pages/CharacterEditor.spec.ts`
- Save as Template button visible in edit mode

**Commit:** `feat(editor): add Save as Template action`

---

### Task 4: Add backend route tests for character templates

**Files:**
- Create: `src/server/routes/character-templates.spec.ts`

**What to do:**

The character template routes have no tests. Add comprehensive tests:

~8 tests:
- `GET /` — list public templates with pagination
- `GET /` — filter by category
- `GET /:id` — get template by ID
- `GET /:id` — returns 404 for non-existent
- `POST /` — create template (auth required)
- `PATCH /:id` — update template (creator only)
- `PATCH /:id` — returns 403 for non-creator
- `DELETE /:id` — delete template (creator only)

Mock: `db` (select, insert, update, delete), auth middleware.

Follow the mocking pattern from existing route tests.

**Commit:** `test(templates): add character template route tests`

---

### Task 5: Final verification

**What to do:**

1. Run `npx vitest run` — expect 1900+ tests passing
2. Run `npx tsc --noEmit` — expect 0 errors
3. Verify all features work together

**Commit:** None (verification only).

---

## Verification

After all tasks:
- `npx vitest run` — 1900+ tests passing
- `npx tsc --noEmit` — 0 errors
- Template rating system works
- My Templates management works
- Save as Template from CharacterEditor works
- Character template routes fully tested
