/**
 * 主题解析规则（唯一的 TS 端定义）。
 *
 * index.html <head> 里的内联脚本为了在首帧前设好 data-theme，会镜像这条规则；
 * 两边必须一致，由 utils/theme.spec.ts 读取 index.html 并逐组合比对来守住。
 * 改规则时要同时改 index.html 的内联脚本，否则那条测试会失败。
 */

export type Theme = 'light' | 'dark';

/** localStorage 键。index.html 内联脚本里的字面量必须与此相同 */
export const THEME_STORAGE_KEY = 'theme-preference';

/** 用于探测系统是否明确偏好浅色的媒体查询 */
export const PREFERS_LIGHT_QUERY = '(prefers-color-scheme: light)';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/**
 * 解析当前应使用的主题：
 *   1. 用户显式选择过（localStorage 里是合法值）→ 用它，优先级最高
 *   2. 系统明确偏好浅色 → light
 *   3. 其余（偏好深色、无偏好、不支持该查询）→ dark（产品默认的沉浸暗色）
 */
export function resolveTheme(stored: string | null, prefersLight: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersLight ? 'light' : 'dark';
}

/** 读取已保存的显式选择；localStorage 不可用（隐私模式等）时视为没有 */
export function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function systemPrefersLight(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(PREFERS_LIGHT_QUERY).matches;
}
