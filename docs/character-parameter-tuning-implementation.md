# Character Parameter Tuning - Phase 1 Implementation

## Overview

Implemented a flexible system for dynamically adjusting character card parameters during conversations without modifying the original character cards.

## Completed Features

### 1. Database Schema

**character_presets** table:
- Stores reusable parameter combinations
- Supports character-specific and global presets
- Tracks usage statistics
- Fields: name, description, preset (JSONB), isGlobal, useCount

**chat_overrides** table:
- Stores session-level parameter overrides
- One override per chat
- Can be enabled/disabled without deletion
- Fields: chatId, overrides (JSONB), enabled, note

### 2. Repository Layer

**CharacterPresetRepository** (`src/db/repositories/character-preset.repository.ts`):
- `create()` - Create new preset
- `findById()` - Get preset by ID
- `findByUserId()` - List all user presets
- `findByCharacterId()` - Get presets for specific character
- `findGlobalPresets()` - Get global presets
- `update()` - Update preset
- `incrementUseCount()` - Track usage
- `delete()` - Delete preset

**ChatOverrideRepository** (`src/db/repositories/chat-override.repository.ts`):
- `createOrUpdate()` - Upsert override
- `findByChatId()` - Get override for chat
- `update()` - Update override
- `enable()`/`disable()` - Toggle override
- `delete()` - Remove override

### 3. API Routes

**Character Presets** (`/api/v1/presets`):
- `GET /presets` - List all presets (with optional characterId filter)
- `GET /presets/:id` - Get specific preset
- `POST /presets` - Create new preset
- `PATCH /presets/:id` - Update preset
- `POST /presets/:id/apply` - Apply preset (increments use count)
- `DELETE /presets/:id` - Delete preset

**Chat Overrides** (`/api/v1/chats/:chatId/overrides`):
- `GET /:chatId/overrides` - Get override for chat
- `PUT /:chatId/overrides` - Create or update override
- `PATCH /:chatId/overrides/toggle` - Enable/disable override
- `DELETE /:chatId/overrides` - Delete override

### 4. Service Integration

**ChatService** (`src/server/services/chat.service.ts`):
- Modified `buildEnhancedSystemPrompt()` to fetch and apply chat overrides
- Overrides are merged into cardData before prompt construction
- Supports overriding: personality, scenario, system_prompt, post_history_instructions, description, etc.
- Graceful fallback if override fetch fails

### 5. Testing

**Test Script** (`test-parameter-tuning.sh`):
- Automated test covering full workflow
- Tests preset creation, listing, and management
- Tests override creation, retrieval, toggle, and deletion
- Verifies API responses and data persistence

## How It Works

### Parameter Override Flow

```
1. User creates chat with character
2. User applies parameter override via API
3. Override stored in chat_overrides table
4. When building prompt:
   a. Fetch character card data
   b. Fetch chat override (if exists and enabled)
   c. Merge override into card data
   d. Build prompt with merged parameters
5. AI responds using adjusted parameters
```

### Example Override

```json
{
  "overrides": {
    "personality": "更加友善和耐心",
    "scenario": "在咖啡厅的轻松对话",
    "system_prompt": "你现在处于放松模式，回复更加简短"
  },
  "enabled": true,
  "note": "测试友善模式"
}
```

### Example Preset

```json
{
  "name": "简短回复模式",
  "description": "适合快速对话，回复更简洁",
  "preset": {
    "system_prompt": "请用简短的语言回复，每次回复不超过50字。",
    "post_history_instructions": "保持简洁。"
  },
  "isGlobal": true
}
```

## Files Modified/Created

### Created Files
- `src/db/schema/character-presets.ts` - Preset schema
- `src/db/schema/chat-overrides.ts` - Override schema
- `src/db/repositories/character-preset.repository.ts` - Preset repository
- `src/db/repositories/chat-override.repository.ts` - Override repository
- `src/server/routes/character-presets.ts` - Preset API routes
- `src/server/routes/chat-overrides.ts` - Override API routes
- `test-parameter-tuning.sh` - Test script

### Modified Files
- `src/db/schema/index.ts` - Export new schemas
- `src/db/repositories/index.ts` - Export new repositories
- `src/server/index.ts` - Register new routes
- `src/server/services/chat.service.ts` - Apply overrides in prompt building

## Next Steps (Phase 2)

### Frontend UI Components

1. **CharacterTuner.vue** - Parameter adjustment drawer
   - Quick preset selector
   - Parameter sliders (response length, emotional intensity)
   - Text inputs for personality, scenario, system_prompt
   - Save as preset button
   - Reset to default button

2. **PresetManager.vue** - Preset management page
   - List all presets
   - Create/edit/delete presets
   - Apply preset to current chat
   - Usage statistics

3. **ChatSettings.vue** - Chat-level settings
   - Enable/disable override
   - Quick parameter adjustments
   - Override history/versioning

### API Enhancements

4. **Apply Preset to Chat** - Endpoint to apply preset as override
   ```typescript
   POST /api/v1/chats/:chatId/apply-preset
   { "presetId": "uuid" }
   ```

5. **Get Effective Parameters** - Endpoint to see merged parameters
   ```typescript
   GET /api/v1/chats/:chatId/effective-parameters
   Response: {
     base: { /* original card */ },
     overrides: { /* active overrides */ },
     effective: { /* merged result */ }
   }
   ```

## Testing

Run the test script:
```bash
./test-parameter-tuning.sh
```

Expected output:
- ✅ Login successful
- ✅ Character found
- ✅ Preset created
- ✅ Presets retrieved
- ✅ Chat created
- ✅ Override applied
- ✅ Override verified
- ✅ Override disabled
- ✅ Override re-enabled

## Benefits

1. **Non-destructive** - Original character cards remain unchanged
2. **Flexible** - Any card parameter can be overridden
3. **Reusable** - Presets can be saved and applied to multiple chats
4. **Session-specific** - Each chat can have different parameters
5. **Toggleable** - Overrides can be enabled/disabled without deletion
6. **Trackable** - Usage statistics help identify popular presets

## Architecture Decisions

1. **JSONB Storage** - Flexible schema for any parameter combination
2. **One Override Per Chat** - Simplifies management, uses upsert pattern
3. **Separate Presets Table** - Reusable across chats and characters
4. **Service Layer Integration** - Transparent to WebSocket/API layers
5. **Graceful Fallback** - System continues working if override fetch fails

## Performance Considerations

- Overrides fetched once per prompt build (cached in memory during generation)
- Indexed by chatId for fast lookup
- JSONB allows flexible querying without schema changes
- Preset use count updated asynchronously

## Security

- All endpoints require authentication
- CSRF protection enabled
- User can only access their own presets/overrides
- Chat ownership verified before applying overrides

## Compatibility

- Works with existing character cards (SillyTavern V2 format)
- Compatible with persona system ({{user}} macro)
- Compatible with world book system
- Compatible with memory/emotion systems

## Implementation Date

2026-03-08
