/**
 * P3-3 prompt 拼装布局测试
 *
 * - legacy：与改动前逐字节一致（inline snapshot 在改动前的代码上生成，之后不得 -u）
 * - cache_friendly：各位置的落点与相对顺序（见 chat.service.ts 顶部的位置表）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  retrieveMemories: vi.fn(),
  retrieveStoryPreferences: vi.fn(),
  memoryOrigins: vi.fn(),
  getCurrentEmotion: vi.fn(),
  scan: vi.fn(),
  findPersona: vi.fn(),
  findOverride: vi.fn(),
  loadWorldbooks: vi.fn(),
}));

vi.mock('./story-worldbooks.service', () => ({ loadStoryWorldbookEntries: mocks.loadWorldbooks }));

vi.mock('../../db/repositories/chat.repository', () => ({ chatRepository: {} }));
vi.mock('../../db/repositories/message.repository', () => ({ messageRepository: {} }));
vi.mock('../../db/repositories/user-persona.repository', () => ({
  userPersonaRepository: { findById: mocks.findPersona },
}));
vi.mock('../../db/repositories/chat-override.repository', () => ({
  chatOverrideRepository: { findByChatId: mocks.findOverride },
}));
vi.mock('./chat-variable.service', () => ({
  chatVariableStore: {
    loadAll: vi.fn().mockResolvedValue({ chatVars: {}, globalVars: {} }),
    setChatVar: vi.fn(),
    setGlobalVar: vi.fn(),
  },
}));
vi.mock('./llm.service', () => ({ llmService: {} }));
vi.mock('./memory.service', () => ({ memoryService: { retrieveMemories: mocks.retrieveMemories, retrieveStoryPreferences: mocks.retrieveStoryPreferences } }));
vi.mock('./story-knowledge.service', () => ({ verifiedStoryMemoryOrigins: mocks.memoryOrigins }));
vi.mock('./emotion.service', () => ({ emotionService: { getCurrentEmotion: mocks.getCurrentEmotion } }));
vi.mock('./worldinfo-engine.service', () => ({ worldInfoEngine: { scan: mocks.scan } }));
vi.mock('./websocket.service', () => ({
  websocketService: { emitMemoryRetrieval: vi.fn(), emitPromptBuild: vi.fn() },
}));
vi.mock('./intelligence-debug.service', () => ({
  intelligenceDebugService: {
    recordWorldInfoScan: vi.fn(),
    recordLatency: vi.fn(),
    recordRetrieval: vi.fn(),
  },
}));

import { ChatService } from './chat.service';
import { chatVariableStore } from './chat-variable.service';

const character = {
  id: 'char-1',
  name: 'Aria',
  description: 'A wandering bard.',
  cardData: {
    personality: 'cheerful',
    scenario: 'a tavern at night',
    system_prompt: 'Speak as {{char}} to {{user}}.',
    mes_example: '<START>\n{{user}}: hi\n{{char}}: hello there\n<START>\n{{user}}: bye\n{{char}}: farewell',
    character_author_note: 'Keep it short.',
    post_history_instructions: 'Never break character.',
    extensions: { depth_prompt: { prompt: 'Aria hums softly.', depth: 4, role: 0 } },
  },
};

const memories = [
  { id: 'm1', content: 'likes tea', type: 'preference', score: 0.9 },
  { id: 'm2', content: 'is a developer', type: 'fact', score: 0.8 },
  { id: 'm3', content: 'friend of Bob', type: 'relationship', score: 0.7 },
  { id: 'm4', content: 'moved last year', type: 'event', score: 0.6 },
];

const emotion = { label: 'happy', valence: 0.6, arousal: 0.4 };

/** 引擎旧形态：只有按位置合并后的字符串（不带 stable/volatile），legacy 快照据此生成 */
const legacyWorldInfo = {
  before: 'WI-before',
  EMTop: 'WI-EMTop',
  EMBottom: 'WI-EMBottom',
  ANTop: 'WI-ANTop',
  ANBottom: 'WI-ANBottom',
  after: 'WI-after',
  atDepth: [{ depth: 2, content: 'WI-atDepth', role: 'system' as const }],
  debugInfo: undefined,
};

const baseParams = {
  character: character as never,
  characterId: 'char-1',
  userId: 'user-1',
  userName: 'Sam',
  chatId: 'chat-1',
  userMessage: 'tell me about tea',
  messages: [{ role: 'user', content: 'tell me about tea' }],
};

describe('buildEnhancedSystemPrompt layout', () => {
  const service = new ChatService({} as never, {} as never);
  const originalLayout = process.env.PROMPT_LAYOUT;

  it.each([null, 1])('keeps macro persistence within legacy stories (version %s)', async contentSnapshotVersion => {
    const withVariables = { ...character, cardData: { ...character.cardData, system_prompt: '{{setvar::coins::10}}{{setglobalvar::visit::1}}Stay here.' } };
    await service.buildEnhancedSystemPrompt({ ...baseParams, character: withVariables as never, contentSnapshotVersion });
    expect(chatVariableStore.setChatVar).toHaveBeenCalledTimes(contentSnapshotVersion == null ? 1 : 0);
    expect(chatVariableStore.setGlobalVar).toHaveBeenCalledTimes(contentSnapshotVersion == null ? 1 : 0);
  });

  const identitySnapshot = {
    protocol: 1 as const, source: 'persona' as const,
    userId: '550e8400-e29b-41d4-a716-446655440001', tenantId: '550e8400-e29b-41d4-a716-446655440002',
    sourceId: '550e8400-e29b-41d4-a716-446655440003', name: 'Original traveler', description: 'Keeps promises',
    revision: 'a'.repeat(64), capturedAt: '2026-10-23T00:00:00.000Z',
  };

  it.each(['legacy', 'cache_friendly'])('uses the persisted identity without reading an edited persona (%s)', async (layout) => {
    process.env.PROMPT_LAYOUT = layout;
    mocks.findPersona.mockResolvedValue({ name: 'Changed identity', description: 'Changed biography', userId: identitySnapshot.userId });
    const result = await service.buildEnhancedSystemPrompt({ ...baseParams, userId: identitySnapshot.userId, personaId: 'edited', identitySnapshot });
    expect(result.systemPrompt).toContain('[User Persona: Original traveler]');
    expect(result.systemPrompt).toContain('Keeps promises');
    expect(result.systemPrompt).not.toContain('Changed biography');
    expect(mocks.findPersona).not.toHaveBeenCalled();
  });

  it('rejects a snapshot belonging to a different user', async () => {
    await expect(service.buildEnhancedSystemPrompt({ ...baseParams, identitySnapshot })).rejects.toThrow('Story identity owner mismatch');
  });

  it.each(['legacy', 'cache_friendly'])('keeps a saved name when the identity has no biography (%s)', async layout => {
    process.env.PROMPT_LAYOUT = layout;
    const result = await service.buildEnhancedSystemPrompt({ ...baseParams, userId: identitySnapshot.userId,
      identitySnapshot: { ...identitySnapshot, name: '顾舟', description: null } });
    expect(result.systemPrompt).toContain('[User Persona: 顾舟]');
    expect(result.systemPrompt).not.toContain('[User Persona: 顾舟]\nnull');
    expect(mocks.findPersona).not.toHaveBeenCalled();
  });

  it.each(['legacy', 'cache_friendly'])('loads saved worldbook entries for generation (%s)', async layout => {
    process.env.PROMPT_LAYOUT = layout;
    mocks.loadWorldbooks.mockResolvedValue([]);
    await service.buildEnhancedSystemPrompt({ ...baseParams, worldbookSnapshotVersion: 1 });
    expect(mocks.loadWorldbooks).toHaveBeenCalledWith('chat-1', 'user-1', 'char-1');
    expect(mocks.scan).toHaveBeenCalledWith(expect.objectContaining({ entries: [], chat: baseParams.messages }));
  });

  it('scans the current action even when there is no prior history', async () => {
    mocks.loadWorldbooks.mockResolvedValue([]);
    await service.buildEnhancedSystemPrompt({ ...baseParams, messages: undefined, worldbookSnapshotVersion: 1 });
    expect(mocks.scan).toHaveBeenCalledWith(expect.objectContaining({ chat: [{ role: 'user', content: baseParams.userMessage }] }));
  });

  it('fails instead of generating without a missing saved binding', async () => {
    mocks.loadWorldbooks.mockRejectedValue(new Error('Saved binding unavailable'));
    await expect(service.buildEnhancedSystemPrompt({ ...baseParams, worldbookSnapshotVersion: 1 }))
      .rejects.toThrow('Saved binding unavailable');
    expect(mocks.scan).not.toHaveBeenCalled();
  });

  it('rejects unsupported binding protocols before fetching live books', async () => {
    await expect(service.buildEnhancedSystemPrompt({ ...baseParams, worldbookSnapshotVersion: 2 }))
      .rejects.toThrow('Unsupported story worldbook snapshot version');
    expect(mocks.scan).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PROMPT_LAYOUT;
    mocks.findOverride.mockResolvedValue(undefined);
    mocks.findPersona.mockResolvedValue(undefined);
    mocks.retrieveMemories.mockResolvedValue(memories);
    mocks.retrieveStoryPreferences.mockResolvedValue([]);
    mocks.memoryOrigins.mockResolvedValue(new Map());
    mocks.getCurrentEmotion.mockResolvedValue(emotion);
    mocks.scan.mockResolvedValue(structuredClone(legacyWorldInfo));
  });

  afterEach(() => {
    if (originalLayout === undefined) delete process.env.PROMPT_LAYOUT;
    else process.env.PROMPT_LAYOUT = originalLayout;
  });

  it('injects a sourced story style preference when vector retrieval has no topic match', async () => {
    mocks.retrieveMemories.mockResolvedValue([]);
    mocks.retrieveStoryPreferences.mockResolvedValue([{ id: 'style', content: 'outdated candidate', type: 'preference', score: 0 }]);
    mocks.memoryOrigins.mockResolvedValue(new Map([['style', { type: 'preference', content: '请用短句，少用比喻。',
      firstVersion: 2, lastVersion: 12, sourceMessageIds: [3, 23] }]]));
    const result = await service.buildEnhancedSystemPrompt({ ...baseParams, contentSnapshotVersion: 1 });
    expect(result.systemPrompt).toContain('请用短句，少用比喻。');
    expect(result.systemPrompt).toContain('来源事件版本 2–12');
    expect(result.systemPrompt).not.toContain('outdated candidate');
    expect(mocks.retrieveStoryPreferences).toHaveBeenCalledWith('char-1', 'user-1', 'chat-1');
    expect(mocks.getCurrentEmotion).not.toHaveBeenCalled();
  });

  it('omits an unauthorized or invalid story preference rather than reviving its candidate text', async () => {
    mocks.retrieveMemories.mockResolvedValue([]);
    mocks.retrieveStoryPreferences.mockResolvedValue([{ id: 'private-style', content: 'HIDDEN_STYLE', type: 'preference', score: 0 }]);
    const result = await service.buildEnhancedSystemPrompt({ ...baseParams, contentSnapshotVersion: 1, isolateKnowledge: false });
    expect(result.systemPrompt).not.toContain('HIDDEN_STYLE');
    expect(result.systemPrompt).not.toContain('本次故事的历史派生记忆');
  });

  describe('legacy (default) output is byte-identical to pre-P3-3 behaviour', () => {
    it('full prompt: card + examples + all world info positions + persona + memory + emotion', async () => {
      mocks.findPersona.mockResolvedValue({ userId: 'user-1', name: 'Sam', description: 'a curious traveller' });
      const result = await service.buildEnhancedSystemPrompt({ ...baseParams, personaId: 'p1' });
      expect(result).toMatchInlineSnapshot(`
        {
          "atDepthEntries": [
            {
              "content": "WI-atDepth",
              "depth": 2,
              "role": "system",
            },
            {
              "content": "Keep it short.",
              "depth": 0,
              "role": "system",
            },
            {
              "content": "Never break character.",
              "depth": 4,
              "role": "system",
            },
            {
              "content": "Aria hums softly.",
              "depth": 4,
              "role": "system",
            },
          ],
          "systemPrompt": "WI-before
        You are Aria.
        A wandering bard.
        Personality: cheerful
        Scenario: a tavern at night
        Speak as Aria to Sam.

        ## Example Dialogue

        [Example conversation 1]
        Sam: hi
        Aria: hello there

        [Example conversation 2]
        Sam: bye
        Aria: farewell
        WI-EMTop
        WI-EMBottom
        [User Persona: Sam]
        a curious traveller

        WI-ANTop

        ## 行为指引
        - 根据记忆中的信息个性化回复
        - 保持情感状态的一致性，情感变化应自然过渡
        - 可以主动提及相关记忆，但不要生硬
        Stay in character at all times.

        ## 关于用户的记忆
        【事实】is a developer
        【偏好】likes tea
        【关系】friend of Bob
        【事件】moved last year

        ## 当前情感状态
        当前情感: happy, Valence: 0.60, Arousal: 0.40
        情感表现指引: 语气轻快积极，乐于分享和交流，可能开玩笑
        WI-ANBottom
        WI-after",
        }
      `);
    });

    it('system_prompt containing {{original}}', async () => {
      const withOriginal = {
        ...character,
        cardData: { ...character.cardData, system_prompt: 'Context: {{original}}\nBe nice.' },
      };
      const result = await service.buildEnhancedSystemPrompt({ ...baseParams, character: withOriginal as never });
      expect(result).toMatchInlineSnapshot(`
        {
          "atDepthEntries": [
            {
              "content": "WI-atDepth",
              "depth": 2,
              "role": "system",
            },
            {
              "content": "Keep it short.",
              "depth": 0,
              "role": "system",
            },
            {
              "content": "Never break character.",
              "depth": 4,
              "role": "system",
            },
            {
              "content": "Aria hums softly.",
              "depth": 4,
              "role": "system",
            },
          ],
          "systemPrompt": "WI-before
        Context: You are Aria.
        A wandering bard.
        Personality: cheerful
        Scenario: a tavern at night
        Be nice.

        ## Example Dialogue

        [Example conversation 1]
        Sam: hi
        Aria: hello there

        [Example conversation 2]
        Sam: bye
        Aria: farewell
        WI-EMTop
        WI-EMBottom
        WI-ANTop

        ## 行为指引
        - 根据记忆中的信息个性化回复
        - 保持情感状态的一致性，情感变化应自然过渡
        - 可以主动提及相关记忆，但不要生硬
        Stay in character at all times.

        ## 关于用户的记忆
        【事实】is a developer
        【偏好】likes tea
        【关系】friend of Bob
        【事件】moved last year

        ## 当前情感状态
        当前情感: happy, Valence: 0.60, Arousal: 0.40
        情感表现指引: 语气轻快积极，乐于分享和交流，可能开玩笑
        WI-ANBottom
        WI-after",
        }
      `);
    });

    it('minimal: no world info scan, no memory, no emotion', async () => {
      mocks.retrieveMemories.mockResolvedValue([]);
      mocks.getCurrentEmotion.mockResolvedValue(null);
      const bare = { id: 'char-2', name: 'Bot', description: '', cardData: {} };
      const result = await service.buildEnhancedSystemPrompt({
        ...baseParams,
        character: bare as never,
        messages: undefined,
      });
      expect(result).toMatchInlineSnapshot(`
        {
          "atDepthEntries": [],
          "systemPrompt": "You are Bot.

        ## 行为指引
        - 根据记忆中的信息个性化回复
        - 保持情感状态的一致性，情感变化应自然过渡
        - 可以主动提及相关记忆，但不要生硬
        Stay in character at all times.",
        }
      `);
    });

    it('PROMPT_LAYOUT=legacy and unknown values behave as default', async () => {
      const reference = await service.buildEnhancedSystemPrompt(baseParams);
      process.env.PROMPT_LAYOUT = 'legacy';
      expect(await service.buildEnhancedSystemPrompt(baseParams)).toEqual(reference);
      process.env.PROMPT_LAYOUT = 'banana';
      expect(await service.buildEnhancedSystemPrompt(baseParams)).toEqual(reference);
    });

    it('ignores stable/volatile split fields on the world info result', async () => {
      const reference = await service.buildEnhancedSystemPrompt(baseParams);
      mocks.scan.mockResolvedValue({
        ...structuredClone(legacyWorldInfo),
        stable: { before: 'WI-before' },
        volatile: { EMTop: 'WI-EMTop', EMBottom: 'WI-EMBottom', ANTop: 'WI-ANTop', ANBottom: 'WI-ANBottom', after: 'WI-after' },
      });
      expect(await service.buildEnhancedSystemPrompt(baseParams)).toEqual(reference);
    });
  });

  describe('cache_friendly layout', () => {
    /** 引擎新形态：合并字段不变，另带 stable（常驻）与 volatile（触发）拆分 */
    const splitWorldInfo = {
      before: 'S-before\nV-before',
      EMTop: 'S-EMTop\nV-EMTop',
      EMBottom: 'S-EMBottom\nV-EMBottom',
      ANTop: 'S-ANTop\nV-ANTop',
      ANBottom: 'S-ANBottom\nV-ANBottom',
      after: 'S-after\nV-after',
      atDepth: [{ depth: 2, content: 'WI-atDepth', role: 'system' as const }],
      stable: {
        before: 'S-before',
        EMTop: 'S-EMTop',
        EMBottom: 'S-EMBottom',
        ANTop: 'S-ANTop',
        ANBottom: 'S-ANBottom',
        after: 'S-after',
      },
      volatile: {
        before: 'V-before',
        EMTop: 'V-EMTop',
        EMBottom: 'V-EMBottom',
        ANTop: 'V-ANTop',
        ANBottom: 'V-ANBottom',
        after: 'V-after',
      },
    };

    /** 依次断言 needles 在 haystack 中按此顺序出现 */
    function expectInOrder(haystack: string, needles: string[]): void {
      let from = 0;
      for (const needle of needles) {
        const at = haystack.indexOf(needle, from);
        expect(at, `"${needle}" should appear after position ${from}`).toBeGreaterThanOrEqual(0);
        from = at + needle.length;
      }
    }

    beforeEach(() => {
      process.env.PROMPT_LAYOUT = 'cache_friendly';
      mocks.scan.mockResolvedValue(structuredClone(splitWorldInfo));
    });

    it('stable prefix keeps constant world info, card, examples, persona and guidelines in legacy order', async () => {
      mocks.findPersona.mockResolvedValue({ userId: 'user-1', name: 'Sam', description: 'a curious traveller' });
      const { systemPrompt } = await service.buildEnhancedSystemPrompt({ ...baseParams, personaId: 'p1' });

      expectInOrder(systemPrompt, [
        'S-before',
        'You are Aria.',
        '## Example Dialogue',
        'S-EMTop',
        'S-EMBottom',
        '[User Persona: Sam]\na curious traveller\n\nS-ANTop',
        '## 行为指引',
        'S-ANBottom',
        'S-after',
      ]);
    });

    it('nothing that changes per turn is left in the stable prefix', async () => {
      const { systemPrompt } = await service.buildEnhancedSystemPrompt(baseParams);
      for (const volatile of ['V-before', 'V-EMTop', 'V-EMBottom', 'V-ANTop', 'V-ANBottom', 'V-after']) {
        expect(systemPrompt).not.toContain(volatile);
      }
      expect(systemPrompt).not.toContain('## 关于用户的记忆');
      expect(systemPrompt).not.toContain('## 当前情感状态');
    });

    it('dynamic block: triggered world info, memory and emotion in legacy relative order', async () => {
      const { atDepthEntries } = await service.buildEnhancedSystemPrompt(baseParams);
      const dynamic = atDepthEntries.find((e) => e.content.includes('## 关于用户的记忆'));

      expect(dynamic).toBeDefined();
      expect(dynamic).toMatchObject({ depth: 1, role: 'system' });
      expect(dynamic!.content.startsWith('\n')).toBe(false);
      expectInOrder(dynamic!.content, [
        'V-before',
        'V-EMTop',
        'V-EMBottom',
        'V-ANTop',
        '## 关于用户的记忆',
        '【事实】is a developer',
        '## 当前情感状态',
        '情感表现指引',
        'V-ANBottom',
        'V-after',
      ]);
    });

    it('relative order of ANTop / memory / emotion / ANBottom matches legacy', async () => {
      mocks.scan.mockResolvedValue(structuredClone(legacyWorldInfo));
      process.env.PROMPT_LAYOUT = 'legacy';
      const legacy = await service.buildEnhancedSystemPrompt(baseParams);
      const markers = ['WI-ANTop', '## 关于用户的记忆', '## 当前情感状态', 'WI-ANBottom'];
      const legacyOrder = markers.filter((m) => legacy.systemPrompt.includes(m)).sort(
        (a, b) => legacy.systemPrompt.indexOf(a) - legacy.systemPrompt.indexOf(b)
      );
      expect(legacyOrder).toEqual(markers);

      // 旧形态（无 stable/volatile）在 cache_friendly 下整体进变动块，顺序仍与 legacy 一致
      process.env.PROMPT_LAYOUT = 'cache_friendly';
      const friendly = await service.buildEnhancedSystemPrompt(baseParams);
      const block = friendly.atDepthEntries.find((e) => e.content.includes('## 关于用户的记忆'))!.content;
      expectInOrder(block, markers);
    });

    it('atDepth entries: world-info atDepth, then dynamic block (depth 1), Author Note (0), PHI and depth_prompt unchanged', async () => {
      const { atDepthEntries } = await service.buildEnhancedSystemPrompt(baseParams);
      expect(atDepthEntries.map((e) => [e.depth, e.content.split('\n')[0]])).toEqual([
        [2, 'WI-atDepth'],
        [1, 'V-before'],
        [0, 'Keep it short.'],
        [4, 'Never break character.'],
        [4, 'Aria hums softly.'],
      ]);
    });

    it('injected into a conversation: dynamic block sits right before the last user message, Author Note after it', async () => {
      const { atDepthEntries } = await service.buildEnhancedSystemPrompt(baseParams);
      const history = [
        { role: 'system' as const, content: 'SYS' },
        { role: 'user' as const, content: 'u1' },
        { role: 'assistant' as const, content: 'a1' },
        { role: 'user' as const, content: 'u2' },
      ];
      const { injectAtDepth } = await import('./prompt-assembly');
      const out = injectAtDepth(history, atDepthEntries).map((m) => m.content.split('\n')[0]);
      expect(out.slice(-3)).toEqual(['V-before', 'u2', 'Keep it short.']);
    });

    it('reports reservedTokens for the dynamic block; legacy does not', async () => {
      const friendly = await service.buildEnhancedSystemPrompt(baseParams);
      expect(friendly.reservedTokens).toBeGreaterThan(0);

      process.env.PROMPT_LAYOUT = 'legacy';
      const legacy = await service.buildEnhancedSystemPrompt(baseParams);
      expect('reservedTokens' in legacy).toBe(false);
    });

    it('no dynamic content: no block, no reservedTokens, and prompt equals the stable part only', async () => {
      mocks.retrieveMemories.mockResolvedValue([]);
      mocks.getCurrentEmotion.mockResolvedValue(null);
      const bare = { id: 'char-2', name: 'Bot', description: '', cardData: {} };
      const result = await service.buildEnhancedSystemPrompt({
        ...baseParams,
        character: bare as never,
        messages: undefined,
      });
      expect(result.reservedTokens).toBeUndefined();
      expect(result.atDepthEntries).toEqual([]);
      // 与 legacy 的「minimal」快照相同：没有变动内容时两种布局产出一致
      expect(result.systemPrompt).toContain('You are Bot.');
      expect(result.systemPrompt).toContain('Stay in character at all times.');
    });

    it('persona stays in the stable prefix even when the world info scan returned nothing', async () => {
      mocks.scan.mockResolvedValue(null);
      mocks.findPersona.mockResolvedValue({ userId: 'user-1', name: 'Sam', description: 'a curious traveller' });
      const { systemPrompt } = await service.buildEnhancedSystemPrompt({ ...baseParams, personaId: 'p1' });
      expectInOrder(systemPrompt, ['[User Persona: Sam]\na curious traveller', '## 行为指引']);
    });

    it('stable prefix is byte-identical across turns when only memory / emotion / triggered entries change', async () => {
      const turn1 = await service.buildEnhancedSystemPrompt(baseParams);

      mocks.retrieveMemories.mockResolvedValue([{ id: 'm9', content: 'hates rain', type: 'preference', score: 0.5 }]);
      mocks.getCurrentEmotion.mockResolvedValue({ label: 'sad', valence: -0.4, arousal: 0.2 });
      mocks.scan.mockResolvedValue({
        ...structuredClone(splitWorldInfo),
        volatile: { ...splitWorldInfo.volatile, EMTop: 'V-EMTop-other', after: '' },
        EMTop: 'S-EMTop\nV-EMTop-other',
        after: 'S-after',
      });
      const turn2 = await service.buildEnhancedSystemPrompt({ ...baseParams, userMessage: 'something else' });

      expect(turn2.systemPrompt).toBe(turn1.systemPrompt);
      expect(turn2.atDepthEntries[1].content).not.toBe(turn1.atDepthEntries[1].content);
    });
  });
});
