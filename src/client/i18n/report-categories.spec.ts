import { describe, it, expect } from 'vitest';
import enUS from './locales/en-US.json';
import zhCN from './locales/zh-CN.json';
import { VIOLATION_CATEGORIES } from '@/types/moderation';

/**
 * ReportDialog 用 t(`report.categories.${item}`) 动态取标签，
 * 组件测试挂的是空 messages，所以漏一个键它照样通过。
 * 这里直接对照真实 locale 文件：新增一个违规分类而忘了加翻译，
 * 用户看到的是原始键名 "report.categories.xxx"。
 */
const locales = { 'en-US': enUS, 'zh-CN': zhCN } as Record<string, Record<string, unknown>>;

describe('report category translations', () => {
  for (const [name, messages] of Object.entries(locales)) {
    describe(name, () => {
      const report = messages.report as Record<string, unknown> | undefined;

      it('has a report section', () => {
        expect(report).toBeDefined();
      });

      it('has a non-empty label for every violation category', () => {
        const categories = (report?.categories ?? {}) as Record<string, string>;
        for (const category of VIOLATION_CATEGORIES) {
          expect(categories[category], `missing ${name} report.categories.${category}`)
            .toBeTruthy();
        }
      });

      // 多出来的键说明分类被删了但翻译留着，或者拼错了
      it('has no labels beyond the known categories', () => {
        const categories = (report?.categories ?? {}) as Record<string, string>;
        expect(Object.keys(categories).sort()).toEqual([...VIOLATION_CATEGORIES].sort());
      });

      it('has the dialog strings the component renders', () => {
        for (const key of [
          'title', 'hint', 'category', 'reason', 'reasonPlaceholder',
          'reasonRequired', 'categoryRequired', 'submit', 'submitSuccess',
          'submitFailed', 'reportCharacter', 'reportComment', 'loginRequired',
        ]) {
          expect(report?.[key], `missing ${name} report.${key}`).toBeTruthy();
        }
      });
    });
  }
});
