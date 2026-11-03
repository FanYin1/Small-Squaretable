/** Presentation-only projection. Never writes story state or evaluates card code. */
export interface LedgerSection { title: string; text: string }
export interface LedgerInventory { name: string; quantity: string; price: string }
export interface StoryLedger {
  raw: string; sections: LedgerSection[]; summary: string[]; inventory: LedgerInventory[] | null;
}
export interface StoryLedgerSnapshot { messageId: string; version?: number; opening: boolean; ledger: StoryLedger }
const START = '[商贾宝鉴启]';
const END = '[商贾宝鉴末]';
const titles = ['基础信息', '流动资产', '商品库存', '固定资产', '商铺经营', '市场动态'];
const config = /^config:\s*\n[ \t]*theme: eastern_commerce\s*\n[ \t]*layout: foldable\s*$/;

export function projectStoryLedger(content: string): { content: string; ledger: StoryLedger | null } {
  const unchanged = { content, ledger: null };
  if (content.length > 200000) return unchanged;
  const start = content.indexOf(START), end = content.indexOf(END, start);
  if (start < 0 || end < start || content.indexOf(START, start + START.length) >= 0 || content.indexOf(END, end + END.length) >= 0) return unchanged;
  // Require standalone markers, never reinterpret quoted prose or code examples.
  if (content.slice(0, start).split('\n').at(-1)?.trim() || content.slice(end + END.length).split('\n')[0].trim()) return unchanged;
  if ((content.slice(0, start).match(/^\s*```/gm)?.length ?? 0) % 2) return unchanged;
  const raw = content.slice(start, end + END.length);
  if (raw.length > 20000) return unchanged;
  let rest = raw.slice(START.length, -END.length).replace(/\r\n/g, '\n').trim();
  const first = rest.indexOf('[基础信息]');
  if (first < 0 || !config.test(rest.slice(0, first).trim())) return unchanged;
  rest = rest.slice(first);
  const sections: LedgerSection[] = [];
  for (const title of titles) {
    const open = `[${title}]`, close = `[/${title}]`;
    if (!rest.startsWith(open + '\n')) return unchanged;
    const closing = rest.indexOf('\n' + close);
    if (closing < 0) return unchanged;
    const text = rest.slice(open.length, closing).trim();
    if (!text || /[<>]|\[\/?[^\]\n]+\]/.test(text)) return unchanged;
    sections.push({ title, text });
    rest = rest.slice(closing + 1 + close.length).trim();
  }
  if (rest) return unchanged;
  const field = (section: number, name: string) => {
    const lines = sections[section].text.split('\n');
    const matching = lines.filter(line => new RegExp(`^${name}[：:]`).test(line.trim()));
    if (matching.length !== 1) return null;
    const value = matching[0].trim().slice(name.length + 1).trim();
    return value && value.length <= 60 ? `${name} ${value}` : null;
  };
  const inventoryRows = sections[2].text.replace(/^详情[：:]\s*/, '').split('\n').map(line => line.trim()).filter(Boolean);
  const inventory: LedgerInventory[] = [];
  for (const line of inventoryRows) {
    const match = /^【([^】]+)】\s*[x×]\s*(\d+)\s*[（(]市价[：:]\s*([^）)]+)[）)]$/.exec(line);
    if (!match) break;
    inventory.push({ name: match[1], quantity: match[2], price: match[3] });
  }
  const parsedInventory = inventory.length === inventoryRows.length && inventory.length > 0 ? inventory : null;
  const summary = [field(1, '现金'), field(1, '信誉'), field(0, '地点')].filter((x): x is string => !!x);
  if (parsedInventory) summary.push(`库存 ${parsedInventory.length}类`);
  return { content: (content.slice(0, start).trimEnd() + '\n\n' + content.slice(end + END.length).trimStart()).trim(),
    ledger: { raw, sections, summary, inventory: parsedInventory } };
}

/** During generation, buffer only this known template; DONE restores malformed output. */
export function ledgerStreamingText(content: string): string {
  const projected = projectStoryLedger(content);
  if (projected.ledger) return projected.content;
  const start = content.indexOf(START);
  if (start < 0 || content.includes(END) || content.slice(0, start).split('\n').at(-1)?.trim()) return content;
  if ((content.slice(0, start).match(/^\s*```/gm)?.length ?? 0) % 2) return content;
  const rest = content.slice(start + START.length).replace(/\r\n/g, '\n').trimStart();
  const first = rest.indexOf('[基础信息]');
  return first >= 0 && config.test(rest.slice(0, first).trim()) ? content.slice(0, start).trimEnd() : content;
}
