/**
 * P3-3 prompt 布局对比工具：legacy vs cache_friendly
 *
 * 用同一份对话分别按两种布局拼出每一轮发给模型的消息数组，输出：
 *   1. 结构摘要：最后一轮的消息列表，标出相对上一轮哪些消息完全相同 / 部分相同 / 已变化
 *   2. 相邻两轮的最长公共前缀 token 数（用项目自己的估算器），以及按 OpenAI 缓存粒度
 *      （>=1024 token 才开始缓存，之后以 128 为步长）折算的可缓存 token 与输入成本指数
 *   3. 可选 --generate：为人工盲评生成成对的请求体文件
 *
 * 用法（全程离线，不连数据库、不调用 LLM，除了 --from-chat）：
 *   npx tsx scripts/prompt-layout-compare.ts                       # 内置合成 fixture
 *   npx tsx scripts/prompt-layout-compare.ts --turns 40            # 更长的对话
 *   npx tsx scripts/prompt-layout-compare.ts --window 6000         # 模拟上下文窗口已满的滑动截断
 *   npx tsx scripts/prompt-layout-compare.ts --fixture my.json     # 自带 fixture，格式见下
 *   npx tsx scripts/prompt-layout-compare.ts --from-chat <chatId>  # 真实角色卡 + 真实历史（读数据库）
 *   npx tsx scripts/prompt-layout-compare.ts --generate ./blind    # 额外写出盲评文件
 *
 * Fixture JSON：
 *   {
 *     "name": "...", "userName": "...",
 *     "character": { "name": "...", "description": "...", "cardData": { "system_prompt", "mes_example", ... } },
 *     "worldInfo": { "stable": { "before": "...", "ANTop": "..." }, "atDepth": [{ "depth": 2, "content": "...", "role": "system" }] },
 *     "turns": [{ "user": "...", "assistant": "...",
 *                 "memories": [{ "type": "fact", "content": "..." }],
 *                 "emotion": { "label": "happy", "valence": 0.6, "arousal": 0.4 },
 *                 "triggered": { "before": "...", "ANBottom": "..." } }]
 *   }
 *
 * 局限（读数字前请先看）：
 *   - 拼装逻辑与线上共用 src/server/services/prompt-assembly.ts，但宏只做 {{char}} / {{user}} 替换
 *   - 公共前缀是在消息序列上算的，provider 实际按自己的分词器对序列化后的文本缓存，数字是估算
 *   - 内置 fixture 是合成数据，只用来演示机制，不代表任何真实角色的节省比例
 *   - --window 只模拟「丢最老的消息」，不含线上截断时插入的 "[Earlier N messages were omitted...]"，
 *     那条提示的 N 每轮变化，线上截断发生后会比这里的数字更差
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { countTokens } from '../src/server/utils/tokens';
import {
  assemblePrompt,
  buildCardAtDepthEntries,
  buildCardParts,
  buildDefaultPromptParts,
  buildEmotionParts,
  buildMemoryParts,
  buildPromptSections,
  formatExampleMessages,
  injectAtDepth,
  type AtDepthEntry,
} from '../src/server/services/prompt-assembly';
import type { PromptLayout } from '../src/server/services/prompt-layout';
import type { WorldInfoPositionGroups, WorldInfoResult } from '../src/server/services/worldinfo-engine.service';

// ---------------------------------------------------------------- types

type Role = 'system' | 'user' | 'assistant';
interface Msg {
  role: Role;
  content: string;
}

interface FixtureTurn {
  user: string;
  assistant?: string;
  memories?: Array<{ type: string; content: string }>;
  emotion?: { label: string; valence: number; arousal: number } | null;
  triggered?: WorldInfoPositionGroups;
}

interface Fixture {
  name: string;
  userName: string;
  character: { name: string; description: string; cardData: Record<string, unknown> };
  worldInfo?: { stable?: WorldInfoPositionGroups; atDepth?: AtDepthEntry[] };
  turns: FixtureTurn[];
}

interface Options {
  fixturePath?: string;
  chatId?: string;
  turns: number;
  window?: number;
  generateDir?: string;
  samples: number;
  seed: number;
  cachedPriceRatio: number;
}

const LAYOUTS: PromptLayout[] = ['legacy', 'cache_friendly'];
const MESSAGE_OVERHEAD = 4; // 与 src/server/utils/tokens.ts 的 countMessagesTokens 一致

// ---------------------------------------------------------------- args

function parseArgs(argv: string[]): Options {
  const opts: Options = { turns: 24, samples: 6, seed: 42, cachedPriceRatio: 0.5 };
  const num = (name: string, raw: string | undefined): number => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} 需要一个正数，收到 "${raw}"`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--fixture': opts.fixturePath = next; i++; break;
      case '--from-chat': opts.chatId = next; i++; break;
      case '--turns': opts.turns = Math.floor(num(arg, next)); i++; break;
      case '--window': opts.window = Math.floor(num(arg, next)); i++; break;
      case '--generate': opts.generateDir = next; i++; break;
      case '--samples': opts.samples = Math.floor(num(arg, next)); i++; break;
      case '--seed': opts.seed = Math.floor(num(arg, next)); i++; break;
      case '--cached-price-ratio': opts.cachedPriceRatio = num(arg, next); i++; break;
      default:
        throw new Error(`未知参数 ${arg}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------- deterministic RNG + built-in fixture

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const USER_LINES = [
  '今天在集市上看到一只会说话的乌鸦，它好像认识你。',
  '你还记得上次我们在山谷里遇到的那个旅人吗？',
  '我有点累了，想找个地方坐下来喝杯热茶。',
  '那封信上的印章，你有没有在哪里见过？',
  '如果明天下雨，我们还要按原计划出发吗？',
  '我把地图弄丢了，不过我记得大概的方向。',
  '你为什么总是在黄昏的时候看向北边？',
  '帮我想想，这件事要不要告诉村长。',
  '我昨晚做了一个很奇怪的梦，梦里有一座倒着长的塔。',
  '听说东边的港口最近来了一艘没有旗帜的船。',
];

const ASSISTANT_LINES = [
  '她把茶杯推到你面前，指尖在杯沿停了一会儿，才慢慢开口：“这件事要从很久以前说起，不过先让我确认一下，你身后没有人跟着。”',
  '风从半掩的窗缝里钻进来，吹得烛火晃了两下。她没有立刻回答，只是低头整理着袖口，像是在斟酌每一个字该放在哪里。',
  '“你记得倒是清楚。”她轻轻笑了一声，随即又收敛了神色，“那个人后来再没有出现过，我一直觉得不对劲，只是没有证据。”',
  '她站起身走到门边，侧耳听了听外面的动静，确认只有风声之后，才回到桌前压低了声音：“接下来的话，你听完就忘掉。”',
  '“如果真要走，就趁天黑之前。”她把一小袋干粮塞进你手里，语气是少见的认真，“路上不要点火，也不要和陌生人搭话。”',
  '她盯着那封信看了很久，指腹沿着蜡封的边缘慢慢划过，“这个纹样我见过，但不是在这座城里，是在更远的地方。”',
  '“累了就先歇着吧。”她拉过一把椅子，又往炉子里添了一块柴，火光在她脸上映出一层温暖的橘色，“事情不会因为你多睡一会儿就变坏。”',
  '她沉默了片刻，像是在回忆什么，终于叹了口气：“有些答案，知道得太早反而是负担。不过你既然问了，我也不打算再瞒着你。”',
];

const MEMORY_POOL: Array<{ type: string; content: string }> = [
  { type: 'fact', content: '用户的名字叫林远，住在北港附近' },
  { type: 'fact', content: '用户随身带着一枚刻有鸟形纹样的铜扣' },
  { type: 'preference', content: '用户喜欢在黄昏时喝不加糖的红茶' },
  { type: 'preference', content: '用户讨厌被人追问过去的经历' },
  { type: 'relationship', content: '用户和村长之间有旧怨，但表面保持客气' },
  { type: 'relationship', content: '用户曾救过一个名叫阿禾的孩子' },
  { type: 'event', content: '上个月用户在山谷遇到一位不愿透露姓名的旅人' },
  { type: 'event', content: '三天前集市上发生了一起失窃，用户在场' },
  { type: 'fact', content: '用户左手有一道旧伤，阴雨天会隐隐作痛' },
  { type: 'event', content: '用户曾提到想去东边的港口寻找一个人' },
  { type: 'preference', content: '用户更愿意走小路而不是官道' },
  { type: 'fact', content: '用户不识字，信件都需要别人念给他听' },
];

const EMOTION_LABELS = ['calm', 'curious', 'happy', 'sad', 'fearful', 'surprised', 'excited', 'confused'];

const TRIGGERED_ENTRIES: WorldInfoPositionGroups[] = [
  { before: '【北港】东岸最大的港口，夜里实行宵禁，无旗帜的船只会被码头守卫扣押三日。' },
  { ANBottom: '【铜扣纹样】鸟形纹样属于已经覆灭的“夜鸦会”，持有者往往被各方势力暗中留意。' },
  { before: '【村长】表面和善，实际掌握着全村的粮仓钥匙，对外来者格外警惕。' },
];

function buildBuiltinFixture(turnCount: number, seed: number): Fixture {
  const rand = mulberry32(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];

  const turns: FixtureTurn[] = [];
  for (let i = 0; i < turnCount; i++) {
    const memories = [...MEMORY_POOL].sort(() => rand() - 0.5).slice(0, 4);
    const triggered = i % 3 === 1 ? pick(TRIGGERED_ENTRIES) : undefined;
    turns.push({
      user: pick(USER_LINES),
      assistant: pick(ASSISTANT_LINES),
      memories,
      emotion: {
        label: pick(EMOTION_LABELS),
        valence: Math.round((rand() * 2 - 1) * 100) / 100,
        arousal: Math.round(rand() * 100) / 100,
      },
      ...(triggered ? { triggered } : {}),
    });
  }

  return {
    name: `builtin-synthetic (turns=${turnCount}, seed=${seed})`,
    userName: '林远',
    character: {
      name: '沈砚',
      description:
        '沈砚是北港旧街上一家茶铺的主人，三十出头，说话慢，习惯在黄昏时看向北边。她表面只是个普通的茶铺老板，实际上掌握着不少关于港口与山谷的消息，却很少主动提起。',
      cardData: {
        personality: '沉稳、谨慎、嘴硬心软，不轻易相信陌生人，但对认定的人格外护短',
        scenario: '北港旧街的茶铺里，黄昏，炉火正旺，窗外有风',
        system_prompt:
          '你是 {{char}}，请始终以第一人称与 {{user}} 对话。保持叙事的画面感，用动作和神态描写补充情绪，不要替 {{user}} 做决定或说话。回复长度控制在两到四段，避免重复上一轮用过的句式。涉及港口、山谷和夜鸦会的情报要循序渐进地透露，不要一次说完。',
        mes_example:
          '<START>\n{{user}}: 你这里有什么茶？\n{{char}}: 她抬眼看了看你，把一只粗陶杯推过来：“只有一种，喝不喝随你。”\n<START>\n{{user}}: 能和我说说北港吗？\n{{char}}: “想听就坐下，站着的客人我不讲故事。”',
        character_author_note: '保持克制的叙事语气，少用感叹号。',
        post_history_instructions: '不要跳出角色，也不要总结剧情。',
        extensions: { depth_prompt: { prompt: '{{char}} 的右手习惯性地摩挲着茶杯边缘。', depth: 4, role: 0 } },
      },
    },
    worldInfo: {
      stable: {
        before:
          '【世界观】北港位于大陆东岸，背靠青灰色的山脉。港口、山谷与旧街三地的势力彼此牵制，消息比货物更值钱。旧街的茶铺是各方耳目汇集的地方，规矩是不问来历、不谈价码。',
        ANTop:
          '【叙事约束】夜鸦会已于十年前覆灭，但其残余仍在暗处活动。涉及夜鸦会的线索只能通过暗示给出，不能由角色直接点破。',
      },
    },
    turns,
  };
}

// ---------------------------------------------------------------- fixture from file / chat

function loadFixtureFile(path: string): Fixture {
  const raw: unknown = JSON.parse(readFileSync(resolve(path), 'utf-8'));
  const fixture = raw as Partial<Fixture>;
  if (!fixture || !fixture.character || !Array.isArray(fixture.turns) || fixture.turns.length === 0) {
    throw new Error(`${path} 不是合法的 fixture：需要 character 与非空的 turns`);
  }
  return {
    name: fixture.name ?? path,
    userName: fixture.userName ?? 'User',
    character: fixture.character,
    worldInfo: fixture.worldInfo,
    turns: fixture.turns,
  };
}

/**
 * 真实角色卡 + 真实历史。每轮的记忆 / 情绪 / 触发的世界书线上是实时检索的，这里没法复现，
 * 从内置合成数据里按轮次借用，所以只有「历史 + 角色卡」是真的。
 */
async function loadFixtureFromChat(chatId: string): Promise<Fixture> {
  const { db } = await import('../src/db/index');
  const { chats, messages } = await import('../src/db/schema/chats');
  const { characters } = await import('../src/db/schema/characters');
  const { eq, asc } = await import('drizzle-orm');

  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  if (!chat) throw new Error(`找不到 chat ${chatId}`);
  if (!chat.characterId) throw new Error(`chat ${chatId} 没有关联单个角色（群聊暂不支持）`);

  const [character] = await db.select().from(characters).where(eq(characters.id, chat.characterId)).limit(1);
  if (!character) throw new Error(`找不到角色 ${chat.characterId}`);

  const rows = await db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.sentAt));
  const turns: FixtureTurn[] = [];
  for (const row of rows) {
    if (row.role === 'user') {
      turns.push({ user: row.content });
    } else if (row.role === 'assistant' && turns.length > 0 && turns[turns.length - 1].assistant === undefined) {
      turns[turns.length - 1].assistant = row.content;
    }
  }
  if (turns.length < 2) throw new Error(`chat ${chatId} 的用户消息不足 2 条，无法比较相邻两轮`);

  const borrowed = buildBuiltinFixture(turns.length, 7).turns;
  console.error('[警告] --from-chat：记忆 / 情绪 / 触发的世界书从合成数据借用，只有角色卡与历史来自真实对话');
  return {
    name: `chat ${chatId} (${turns.length} turns)`,
    userName: 'User',
    character: {
      name: character.name,
      description: character.description ?? '',
      cardData: (character.cardData as Record<string, unknown>) ?? {},
    },
    turns: turns.map((turn, i) => ({
      ...turn,
      memories: borrowed[i].memories,
      emotion: borrowed[i].emotion,
      triggered: borrowed[i].triggered,
    })),
  };
}

// ---------------------------------------------------------------- prompt building (shares prompt-assembly with chat.service)

function mergeGroups(stable: WorldInfoPositionGroups | undefined, volatile: WorldInfoPositionGroups | undefined) {
  const positions = ['before', 'EMTop', 'EMBottom', 'ANTop', 'ANBottom', 'after'] as const;
  const merged: WorldInfoPositionGroups = {};
  for (const position of positions) {
    const text = [stable?.[position], volatile?.[position]].filter(Boolean).join('\n');
    if (text) merged[position] = text;
  }
  return merged;
}

function msgTokens(message: Msg): number {
  return countTokens(message.content) + MESSAGE_OVERHEAD;
}

function sumTokens(messages: Msg[]): number {
  return messages.reduce((total, message) => total + msgTokens(message), 0);
}

function buildMessages(fixture: Fixture, turnIndex: number, layout: PromptLayout, windowTokens?: number): Msg[] {
  const turn = fixture.turns[turnIndex];
  const { character, userName } = fixture;
  const cardData = character.cardData as Record<string, string> & {
    extensions?: { depth_prompt?: { prompt?: string; depth?: number; role?: number } };
  };
  const expand = (text: string): string =>
    text.replace(/\{\{char\}\}/gi, character.name).replace(/\{\{user\}\}/gi, userName);

  const defaultParts = buildDefaultPromptParts(character.name, character.description, cardData);
  const cardParts = buildCardParts(defaultParts, cardData.system_prompt, expand);
  const exampleBlock = cardData.mes_example ? formatExampleMessages(cardData.mes_example, expand) : '';

  const worldInfo: WorldInfoResult = {
    ...mergeGroups(fixture.worldInfo?.stable, turn.triggered),
    atDepth: fixture.worldInfo?.atDepth ?? [],
    stable: fixture.worldInfo?.stable ?? {},
    volatile: turn.triggered ?? {},
  };

  const sections = buildPromptSections({
    layout,
    worldInfo,
    personaStableBlock: '',
    cardParts,
    exampleParts: exampleBlock ? [exampleBlock] : [],
    memoryParts: buildMemoryParts(turn.memories ?? []),
    emotionParts: buildEmotionParts(turn.emotion),
  });
  const { systemPrompt, atDepthEntries, dynamicBlock } = assemblePrompt({
    layout,
    sections,
    atDepthLeading: [...(worldInfo.atDepth ?? [])],
    atDepthTrailing: buildCardAtDepthEntries(cardData, expand),
  });

  let history: Msg[] = [];
  for (let i = 0; i < turnIndex; i++) {
    history.push({ role: 'user', content: fixture.turns[i].user });
    if (fixture.turns[i].assistant) history.push({ role: 'assistant', content: fixture.turns[i].assistant as string });
  }
  history.push({ role: 'user', content: turn.user });

  if (windowTokens) {
    // 与线上一致：注入内容在截断之后才插入，所以先把它们的 token 从预算里扣掉，再丢最老的历史
    const injected = atDepthEntries.map((entry) => msgTokens({ role: entry.role, content: entry.content }));
    const fixed = msgTokens({ role: 'system', content: systemPrompt }) + injected.reduce((a, b) => a + b, 0);
    while (history.length > 1 && fixed + sumTokens(history) > windowTokens) {
      history = history.slice(1);
    }
  }

  void dynamicBlock;
  return injectAtDepth([{ role: 'system', content: systemPrompt } as Msg, ...history], atDepthEntries);
}

// ---------------------------------------------------------------- prefix metrics

function commonCharPrefix(a: string, b: string): string {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/** 两个消息序列的最长公共前缀 token 数；消息内部在第一处差异前截断（落在词中间时回退到词边界） */
function commonPrefixTokens(a: Msg[], b: Msg[]): number {
  let tokens = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i].role !== b[i].role) break;
    if (a[i].content === b[i].content) {
      tokens += msgTokens(a[i]);
      continue;
    }
    const prefix = commonCharPrefix(a[i].content, b[i].content);
    const atBoundary = prefix.replace(/\S*$/, '');
    if (atBoundary.length > 0) tokens += countTokens(atBoundary) + MESSAGE_OVERHEAD;
    break;
  }
  return tokens;
}

/** OpenAI 风格：prompt >= 1024 才缓存，之后以 128 token 为粒度 */
function cacheableTokens(sharedPrefix: number): number {
  if (sharedPrefix < 1024) return 0;
  return 1024 + Math.floor((sharedPrefix - 1024) / 128) * 128;
}

type Sharing = '=' | '~' | 'x';

function sharingAgainstPrevious(previous: Msg[], current: Msg[]): Sharing[] {
  const marks: Sharing[] = [];
  let broken = false;
  for (let i = 0; i < current.length; i++) {
    const before = previous[i];
    if (broken || !before || before.role !== current[i].role) {
      marks.push('x');
      broken = true;
    } else if (before.content === current[i].content) {
      marks.push('=');
    } else {
      marks.push(commonCharPrefix(before.content, current[i].content).length > 0 ? '~' : 'x');
      broken = true;
    }
  }
  return marks;
}

// ---------------------------------------------------------------- reporting

interface LayoutRun {
  layout: PromptLayout;
  prompts: Msg[][];
  promptTokens: number[];
  shared: number[];
  cacheable: number[];
}

function runLayout(fixture: Fixture, layout: PromptLayout, windowTokens?: number): LayoutRun {
  const prompts = fixture.turns.map((_, i) => buildMessages(fixture, i, layout, windowTokens));
  const promptTokens = prompts.map(sumTokens);
  const shared = prompts.map((prompt, i) => (i === 0 ? 0 : commonPrefixTokens(prompts[i - 1], prompt)));
  return { layout, prompts, promptTokens, shared, cacheable: shared.map(cacheableTokens) };
}

const pct = (value: number, total: number): string => (total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '-');
const pad = (value: string | number, width: number): string => String(value).padStart(width);

function snippet(text: string, max = 56): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

function printStructure(runs: LayoutRun[]): void {
  for (const run of runs) {
    const last = run.prompts.length - 1;
    const marks = sharingAgainstPrevious(run.prompts[last - 1], run.prompts[last]);
    console.log(`\n[${run.layout}] 最后一轮（第 ${last + 1} 轮）的消息结构，${run.prompts[last].length} 条，${run.promptTokens[last]} tokens`);
    console.log('  标记：= 与上一轮完全相同   ~ 开头相同后面变化   x 已变化 / 新增（其后全部无法命中前缀）');
    const prompt = run.prompts[last];
    let i = 0;
    while (i < prompt.length) {
      // 连续的、标记相同的 user/assistant 历史消息折叠成一行，避免长对话刷屏
      let end = i + 1;
      const isHistory = (k: number): boolean => prompt[k].role !== 'system';
      while (isHistory(i) && end < prompt.length && isHistory(end) && marks[end] === marks[i]) end++;
      if (end - i > 2) {
        const tokens = sumTokens(prompt.slice(i, end));
        console.log(`  ${pad(`${i}-${end - 1}`, 5)} ${marks[i]} ${'history'.padEnd(9)} ${pad(tokens, 5)}t  ${end - i} 条 user/assistant 消息`);
      } else {
        for (let k = i; k < end; k++) {
          console.log(`  ${pad(k, 5)} ${marks[k]} ${prompt[k].role.padEnd(9)} ${pad(msgTokens(prompt[k]), 5)}t  ${snippet(prompt[k].content)}`);
        }
      }
      i = end;
    }
  }
}

function printTurnTable(runs: LayoutRun[]): void {
  console.log('\n相邻两轮的公共前缀（token，估算器同项目 countTokens；可缓存 = 按 1024 起 / 128 步长折算）');
  console.log(
    `  ${pad('turn', 4)} | ${pad('prompt L', 8)} ${pad('shared L', 8)} ${pad('cache L', 8)} | ` +
      `${pad('prompt C', 8)} ${pad('shared C', 8)} ${pad('cache C', 8)} | L=legacy C=cache_friendly`
  );
  const [legacy, friendly] = runs;
  for (let i = 1; i < legacy.prompts.length; i++) {
    console.log(
      `  ${pad(i + 1, 4)} | ${pad(legacy.promptTokens[i], 8)} ${pad(legacy.shared[i], 8)} ${pad(legacy.cacheable[i], 8)} | ` +
        `${pad(friendly.promptTokens[i], 8)} ${pad(friendly.shared[i], 8)} ${pad(friendly.cacheable[i], 8)}`
    );
  }
}

function printSummary(runs: LayoutRun[], cachedPriceRatio: number): void {
  console.log(`\n汇总（第 2 轮起；缓存价格按未缓存的 ${cachedPriceRatio} 倍估算，--cached-price-ratio 可调）`);
  console.log(
    `  ${'layout'.padEnd(15)} ${pad('Σprompt', 9)} ${pad('Σshared', 9)} ${pad('shared%', 8)} ${pad('Σcacheable', 11)} ${pad('cacheable%', 11)} ${pad('cost index', 11)}`
  );
  for (const run of runs) {
    const prompt = run.promptTokens.slice(1).reduce((a, b) => a + b, 0);
    const shared = run.shared.slice(1).reduce((a, b) => a + b, 0);
    const cacheable = run.cacheable.slice(1).reduce((a, b) => a + b, 0);
    const costIndex = (prompt - cacheable * (1 - cachedPriceRatio)) / prompt;
    console.log(
      `  ${run.layout.padEnd(15)} ${pad(prompt, 9)} ${pad(shared, 9)} ${pad(pct(shared, prompt), 8)} ${pad(cacheable, 11)} ${pad(pct(cacheable, prompt), 11)} ${pad(costIndex.toFixed(3), 11)}`
    );
  }
  console.log('  cost index = 输入成本 / 完全不缓存时的输入成本（越低越省），只算输入侧，不含输出。');
}

// ---------------------------------------------------------------- blind-rating files

function shuffle<T>(items: T[], rand: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const BLIND_INSTRUCTIONS = `盲评步骤（prompt-layout-compare.ts --generate 生成）

1. case-XX-A.json / case-XX-B.json 是同一轮对话在两种 prompt 布局下的请求体，哪个是哪种布局记录在
   key.json 里。评分结束之前不要打开 key.json。
2. 把 model 字段填成要验证的模型，逐个文件发给 chat/completions，例如：
     curl -s "$BASE_URL/chat/completions" -H "Authorization: Bearer $API_KEY" \\
       -H "Content-Type: application/json" -d @case-01-A.json
   同一个 case 的 A 和 B 用相同的 temperature；provider 支持 seed 时也填同一个 seed。
3. 只看回复文本，在 rating-sheet.csv 里给 A、B 各打 1-5 分（角色一致性 / 设定遵守 / 记忆与情绪被自然用到），
   并在 preferred 列填 A、B 或 tie。
4. 全部打完后再打开 key.json 对照。若 cache_friendly 的平均分不低于 legacy，且「偏好」没有系统性偏向 legacy，
   才考虑把默认值改成 cache_friendly。
5. 样本量 6 个只够发现明显的退化。要有说服力，请用 --from-chat 取真实对话，并扩大 --samples。
`;

function writeBlindFiles(dir: string, fixture: Fixture, opts: Options): void {
  const rand = mulberry32(opts.seed + 1000);
  const total = fixture.turns.length;
  const first = Math.min(3, total - 1);
  const candidates = Array.from({ length: total - first }, (_, i) => first + i);
  const count = Math.min(opts.samples, candidates.length);
  const step = candidates.length / count;
  const chosen = Array.from({ length: count }, (_, i) => candidates[Math.floor(i * step)]);

  const outDir = resolve(dir);
  mkdirSync(outDir, { recursive: true });

  const key: Array<{ case: string; turn: number; A: PromptLayout; B: PromptLayout }> = [];
  const rows = ['case,turn,A_score_1to5,B_score_1to5,preferred_A_B_tie,note'];

  chosen.forEach((turnIndex, n) => {
    const id = String(n + 1).padStart(2, '0');
    const [a, b] = shuffle(LAYOUTS, rand);
    for (const [label, layout] of [['A', a], ['B', b]] as const) {
      const messages = buildMessages(fixture, turnIndex, layout, opts.window);
      const body = { model: 'FILL_IN_MODEL', temperature: 0.7, messages };
      writeFileSync(join(outDir, `case-${id}-${label}.json`), JSON.stringify(body, null, 2), 'utf-8');
    }
    key.push({ case: id, turn: turnIndex + 1, A: a, B: b });
    rows.push(`${id},${turnIndex + 1},,,,`);
  });

  writeFileSync(join(outDir, 'key.json'), JSON.stringify(key, null, 2), 'utf-8');
  writeFileSync(join(outDir, 'rating-sheet.csv'), `${rows.join('\n')}\n`, 'utf-8');
  writeFileSync(join(outDir, 'INSTRUCTIONS.txt'), BLIND_INSTRUCTIONS, 'utf-8');
  console.log(`\n盲评文件已写入 ${outDir}（${count} 个 case，A/B 随机分配，对照表在 key.json）`);
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const fixture = opts.chatId
    ? await loadFixtureFromChat(opts.chatId)
    : opts.fixturePath
      ? loadFixtureFile(opts.fixturePath)
      : buildBuiltinFixture(opts.turns, opts.seed);

  if (fixture.turns.length < 2) throw new Error('至少需要 2 轮才能比较相邻两轮');

  console.log(`fixture: ${fixture.name}`);
  console.log(`轮数: ${fixture.turns.length}${opts.window ? `，上下文窗口模拟: ${opts.window} tokens（滑动截断）` : '，无截断'}`);

  const runs = LAYOUTS.map((layout) => runLayout(fixture, layout, opts.window));
  printStructure(runs);
  printTurnTable(runs);
  printSummary(runs, opts.cachedPriceRatio);

  if (opts.generateDir) writeBlindFiles(opts.generateDir, fixture, opts);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
