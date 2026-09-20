/**
 * Macro Replacement Service
 *
 * SillyTavern 兼容的宏替换引擎
 * 支持 {{char}}, {{user}}, {{time}}, {{date}}, {{random::a,b,c}},
 * {{roll::XdY}}, {{input}}, {{original}}, {{idle_duration}} 等宏
 */

import { chatVariableStore } from './chat-variable.service';

export interface MacroContext {
  charName: string;
  userName: string;
  input?: string;
  /** Used for {{original}} replacement in system_prompt */
  original?: string;
  /** Character card fields for {{personality}}, {{scenario}}, {{description}}, {{mesExamples}} */
  personality?: string;
  scenario?: string;
  description?: string;
  mesExamples?: string;
  /** Chat message history for {{lastMessage}}, {{lastCharMessage}}, {{lastUserMessage}} */
  messages?: Array<{ role: string; content: string }>;
  /** Pre-loaded chat-scoped variables (from chatVariableStore) */
  chatVars?: Record<string, string>;
  /** Pre-loaded global variables (from chatVariableStore) */
  globalVars?: Record<string, string>;
  /** Collects variable mutations during macro expansion (caller persists them) */
  varWrites?: Array<{ scope: 'chat' | 'global'; name: string; value: string }>;
}

const MACRO_PATTERN = /\{\{([^}]+)\}\}/gi;

/**
 * Apply all macro replacements to a text string.
 */
export function applyMacros(text: string, ctx: MacroContext): string {
  if (!text) return text;

  return text.replace(MACRO_PATTERN, (match, inner: string) => {
    const key = inner.trim();
    const keyLower = key.toLowerCase();

    // {{char}}
    if (keyLower === 'char') return ctx.charName;

    // {{user}}
    if (keyLower === 'user') return ctx.userName;

    // {{original}}
    if (keyLower === 'original') return ctx.original ?? match;

    // {{input}} — the user's current message
    if (keyLower === 'input') return ctx.input ?? '';

    // --- Character card field macros ---
    if (keyLower === 'personality') return ctx.personality ?? '';
    if (keyLower === 'scenario') return ctx.scenario ?? '';
    if (keyLower === 'description') return ctx.description ?? '';
    if (keyLower === 'mesexamples' || keyLower === 'mes_examples') return ctx.mesExamples ?? '';

    // --- Message history macros ---
    if (keyLower === 'lastmessage') {
      if (ctx.messages && ctx.messages.length > 0) {
        return ctx.messages[ctx.messages.length - 1].content;
      }
      return '';
    }
    if (keyLower === 'lastcharmessage') {
      if (ctx.messages) {
        for (let i = ctx.messages.length - 1; i >= 0; i--) {
          if (ctx.messages[i].role === 'assistant') return ctx.messages[i].content;
        }
      }
      return '';
    }
    if (keyLower === 'lastusermessage') {
      if (ctx.messages) {
        for (let i = ctx.messages.length - 1; i >= 0; i--) {
          if (ctx.messages[i].role === 'user') return ctx.messages[i].content;
        }
      }
      return '';
    }

    // --- Hidden instruction macros (return empty) ---
    if (keyLower === 'comment' || keyLower === 'hidden') return '';

    // {{time}} — current time HH:MM
    if (keyLower === 'time') {
      const now = new Date();
      return now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    // {{date}} — current date YYYY-MM-DD
    if (keyLower === 'date') {
      return new Date().toISOString().slice(0, 10);
    }
    // {{datetime}} — full date+time
    if (keyLower === 'datetime') {
      return new Date().toLocaleString('zh-CN', { hour12: false });
    }

    // {{weekday}} — day of week
    if (keyLower === 'weekday') {
      return new Date().toLocaleDateString('zh-CN', { weekday: 'long' });
    }

    // {{isotime}} / {{isodate}}
    if (keyLower === 'isotime') return new Date().toISOString();
    if (keyLower === 'isodate') return new Date().toISOString().slice(0, 10);

    // {{random::a,b,c}} — pick one at random
    if (keyLower.startsWith('random::') || key.startsWith('random::')) {
      const options = key.slice('random::'.length).split(',').map(s => s.trim()).filter(Boolean);
      if (options.length > 0) {
        return options[Math.floor(Math.random() * options.length)];
      }
      return '';
    }

    // {{roll::XdY}} — dice roll
    if (keyLower.startsWith('roll::') || key.startsWith('roll::')) {
      const diceExpr = key.slice('roll::'.length).trim();
      return rollDice(diceExpr);
    }

    // {{idle_duration}} — placeholder, returns empty
    if (keyLower === 'idle_duration') return '';

    // {{newline}} / {{nl}}
    if (keyLower === 'newline' || keyLower === 'nl') return '\n';

    // {{trim}}
    if (keyLower === 'trim') return '';

    // --- Variable macros (tavern_helper compatible) ---

    // {{getvar::name}} — get chat-scoped variable
    if (keyLower.startsWith('getvar::') || key.startsWith('getvar::')) {
      const varName = key.slice('getvar::'.length).trim();
      return ctx.chatVars?.[varName] ?? '';
    }

    // {{setvar::name::value}} — set chat-scoped variable, returns empty
    if (keyLower.startsWith('setvar::') || key.startsWith('setvar::')) {
      const rest = key.slice('setvar::'.length);
      const sepIdx = rest.indexOf('::');
      if (sepIdx >= 0) {
        const varName = rest.slice(0, sepIdx).trim();
        const varValue = rest.slice(sepIdx + 2);
        if (ctx.chatVars) ctx.chatVars[varName] = varValue;
        if (ctx.varWrites) ctx.varWrites.push({ scope: 'chat', name: varName, value: varValue });
      }
      return '';
    }

    // {{addvar::name::value}} — numeric add to chat-scoped variable, returns new value
    if (keyLower.startsWith('addvar::') || key.startsWith('addvar::')) {
      const rest = key.slice('addvar::'.length);
      const sepIdx = rest.indexOf('::');
      if (sepIdx >= 0) {
        const varName = rest.slice(0, sepIdx).trim();
        const addVal = parseFloat(rest.slice(sepIdx + 2)) || 0;
        const current = parseFloat(ctx.chatVars?.[varName] || '0');
        const result = String(current + addVal);
        if (ctx.chatVars) ctx.chatVars[varName] = result;
        if (ctx.varWrites) ctx.varWrites.push({ scope: 'chat', name: varName, value: result });
        return result;
      }
      return '';
    }

    // {{getglobalvar::name}} — get global variable
    if (keyLower.startsWith('getglobalvar::') || key.startsWith('getglobalvar::')) {
      const varName = key.slice('getglobalvar::'.length).trim();
      return ctx.globalVars?.[varName] ?? '';
    }

    // {{setglobalvar::name::value}} — set global variable, returns empty
    if (keyLower.startsWith('setglobalvar::') || key.startsWith('setglobalvar::')) {
      const rest = key.slice('setglobalvar::'.length);
      const sepIdx = rest.indexOf('::');
      if (sepIdx >= 0) {
        const varName = rest.slice(0, sepIdx).trim();
        const varValue = rest.slice(sepIdx + 2);
        if (ctx.globalVars) ctx.globalVars[varName] = varValue;
        if (ctx.varWrites) ctx.varWrites.push({ scope: 'global', name: varName, value: varValue });
      }
      return '';
    }

    // {{addglobalvar::name::value}} — numeric add to global variable, returns new value
    if (keyLower.startsWith('addglobalvar::') || key.startsWith('addglobalvar::')) {
      const rest = key.slice('addglobalvar::'.length);
      const sepIdx = rest.indexOf('::');
      if (sepIdx >= 0) {
        const varName = rest.slice(0, sepIdx).trim();
        const addVal = parseFloat(rest.slice(sepIdx + 2)) || 0;
        const current = parseFloat(ctx.globalVars?.[varName] || '0');
        const result = String(current + addVal);
        if (ctx.globalVars) ctx.globalVars[varName] = result;
        if (ctx.varWrites) ctx.varWrites.push({ scope: 'global', name: varName, value: result });
        return result;
      }
      return '';
    }

    // Unknown macro — leave as-is
    return match;
  });
}

/**
 * Apply macros to all strings in an array.
 */
export function applyMacrosToAll(texts: string[], ctx: MacroContext): string[] {
  return texts.map(t => applyMacros(t, ctx));
}

/**
 * Roll dice in XdY format (e.g., "2d6" → sum of 2 six-sided dice).
 */
function rollDice(expr: string): string {
  const match = expr.match(/^(\d+)d(\d+)$/i);
  if (!match) return '0';
  const count = Math.min(parseInt(match[1], 10), 100);
  const sides = parseInt(match[2], 10);
  if (count <= 0 || sides <= 0) return '0';
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return String(total);
}

/**
 * Persist variable mutations collected during macro expansion.
 * Call this after applyMacros() if ctx.varWrites has entries.
 */
export async function persistVarWrites(
  ctx: MacroContext,
  chatId: string,
  userId: string,
): Promise<void> {
  if (!ctx.varWrites || ctx.varWrites.length === 0) return;

  for (const write of ctx.varWrites) {
    if (write.scope === 'chat') {
      await chatVariableStore.setChatVar(chatId, write.name, write.value);
    } else {
      await chatVariableStore.setGlobalVar(userId, write.name, write.value);
    }
  }
}

/**
 * Create a MacroContext with pre-loaded variables from Redis.
 */
export async function createMacroContextWithVars(
  base: Omit<MacroContext, 'chatVars' | 'globalVars' | 'varWrites'>,
  chatId: string,
  userId: string,
): Promise<MacroContext> {
  const { chatVars, globalVars } = await chatVariableStore.loadAll(chatId, userId);
  return {
    ...base,
    chatVars,
    globalVars,
    varWrites: [],
  };
}
