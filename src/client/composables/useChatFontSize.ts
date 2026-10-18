import { ref, watch } from 'vue';

/**
 * 聊天正文字号偏好（P1-2）。
 *
 * 只管聊天气泡里的叙事文本，不影响全站 --font-size-body。
 * 档位对应的像素值定义在 variables.css 的
 * `[data-chat-font-size="..."]` 规则里（单一来源），这里只负责：
 *   1. 保存/恢复偏好（localStorage，沿用 useTheme / useLocale 的做法）
 *   2. 把当前档位写到 <html data-chat-font-size>，由 CSS 换算成 --chat-font-size
 */

export const CHAT_FONT_SIZES = ['small', 'medium', 'large'] as const;
export type ChatFontSize = (typeof CHAT_FONT_SIZES)[number];

const STORAGE_KEY = 'chat-font-size';
const ATTRIBUTE = 'data-chat-font-size';
const DEFAULT_SIZE: ChatFontSize = 'medium';

function isChatFontSize(value: unknown): value is ChatFontSize {
  return typeof value === 'string' && (CHAT_FONT_SIZES as readonly string[]).includes(value);
}

function readStoredSize(): ChatFontSize {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isChatFontSize(saved) ? saved : DEFAULT_SIZE;
  } catch {
    // 隐私模式等场景下 localStorage 可能抛错，退回默认档位即可
    return DEFAULT_SIZE;
  }
}

const size = ref<ChatFontSize>(readStoredSize());

// 模块级 watch：导入即生效（immediate），不依赖任何组件挂载，
// 这样聊天页刷新后偏好立刻应用，也不会随组件卸载而失效。
watch(
  size,
  (value) => {
    document.documentElement.setAttribute(ATTRIBUTE, value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // 持久化失败不影响本次会话内的显示
    }
  },
  { immediate: true },
);

export function useChatFontSize() {
  function setSize(next: ChatFontSize) {
    if (!isChatFontSize(next)) return;
    size.value = next;
  }

  return {
    size,
    setSize,
    sizes: CHAT_FONT_SIZES,
  };
}
