import { defineStore } from 'pinia';
import { ref } from 'vue';
import { createLogger } from '@client/utils/logger';
import {
  DEFAULT_MODULE_FLAGS,
  MODULE_NAMES,
  type ModuleFlags,
  type ModuleName,
} from '@/types/modules';

const logger = createLogger('ModulesStore');

/**
 * 功能模块开关（P2-1）。
 *
 * 数据来自后端公开接口 GET /api/v1/config/modules，和后端挂载路由用的是同一份配置。
 * 加载前以及加载失败时一律视为关闭（宁可少显示入口，也不要闪现已下线的入口）；
 * 路由守卫会在首次导航前等待 ensureLoaded()，所以页面渲染时开关已就绪。
 */
export const useModulesStore = defineStore('modules', () => {
  const flags = ref<ModuleFlags>({ ...DEFAULT_MODULE_FLAGS });
  const loaded = ref(false);
  let inflight: Promise<void> | null = null;

  function isEnabled(name: ModuleName | undefined): boolean {
    // 路由没有声明 module 的视为不受开关控制
    if (!name) return true;
    return flags.value[name] === true;
  }

  async function load(): Promise<void> {
    try {
      const response = await fetch('/api/v1/config/modules', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = (await response.json()) as { data?: Partial<ModuleFlags> };
      const next: ModuleFlags = { ...DEFAULT_MODULE_FLAGS };
      for (const name of MODULE_NAMES) {
        next[name] = body.data?.[name] === true;
      }
      flags.value = next;
    } catch (e: unknown) {
      logger.error('Failed to load module flags, keeping all optional modules closed', e);
      flags.value = { ...DEFAULT_MODULE_FLAGS };
    } finally {
      loaded.value = true;
    }
  }

  /** 只请求一次；并发调用共享同一个请求 */
  function ensureLoaded(): Promise<void> {
    if (loaded.value) return Promise.resolve();
    if (!inflight) {
      inflight = load().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  return { flags, loaded, isEnabled, ensureLoaded };
});
