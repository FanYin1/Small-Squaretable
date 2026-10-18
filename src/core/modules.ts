/**
 * 服务端模块开关运行时单例（P2-1）。
 *
 * 名称、默认值和解析逻辑在 src/types/modules.ts（前端共用）。
 * 这里只负责从 process.env 读一次并缓存。
 */

import {
  resolveModuleFlags,
  type ModuleFlags,
  type ModuleName,
} from '../types/modules';

let cached: ModuleFlags | null = null;

export function getModuleFlags(): ModuleFlags {
  if (!cached) {
    cached = resolveModuleFlags({
      MODULES_ENABLED: process.env.MODULES_ENABLED,
      MODULES_DISABLED: process.env.MODULES_DISABLED,
    });
  }
  return { ...cached };
}

export function isModuleEnabled(name: ModuleName): boolean {
  return getModuleFlags()[name];
}

/** 仅供测试：清掉缓存，让下一次读取重新解析环境变量。 */
export function resetModuleFlagsForTest(): void {
  cached = null;
}
