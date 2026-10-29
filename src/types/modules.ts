/**
 * 功能模块开关（P2-1）：前后端共用的唯一来源。
 *
 * 只放名称、默认值和纯函数解析器，不读 process.env，这样前端也能引用。
 * 服务端运行时单例见 src/core/modules.ts。
 *
 * 开关只负责「关入口」：关闭的模块不挂路由、不启动后台任务、
 * 前端不显示入口。代码本身保留在仓库里。
 */

export const MODULE_NAMES = [
  'analytics',
  'social_follow',
  'plugins',
  'webhooks_developer',
  'recommendations',
  'gdpr_consent_ui',
  'admin_advanced',
] as const;

export type ModuleName = (typeof MODULE_NAMES)[number];

export type ModuleFlags = Record<ModuleName, boolean>;

/**
 * 默认值：封存 / 下线的模块一律关闭。
 * 打开某个模块要显式设置 MODULES_ENABLED。
 */
export const DEFAULT_MODULE_FLAGS: Readonly<ModuleFlags> = Object.freeze({
  analytics: false,
  social_follow: false,
  plugins: false,
  webhooks_developer: false,
  recommendations: false,
  gdpr_consent_ui: false,
  admin_advanced: false,
});

export interface ModuleEnv {
  MODULES_ENABLED?: string;
  MODULES_DISABLED?: string;
}

function parseList(raw: string | undefined): ModuleName[] {
  if (!raw) return [];
  const names = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const known = new Set<string>(MODULE_NAMES);
  const unknown = names.filter((n) => !known.has(n));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown module name(s): ${unknown.join(', ')}. Valid names: ${MODULE_NAMES.join(', ')}`
    );
  }
  return names as ModuleName[];
}

/**
 * 从环境变量解析开关。
 * MODULES_ENABLED 先生效，MODULES_DISABLED 后生效（同名时关闭优先）。
 * 名称拼错直接抛错，避免静默地没有打开想要的模块。
 */
export function resolveModuleFlags(env: ModuleEnv = {}): ModuleFlags {
  const flags: ModuleFlags = { ...DEFAULT_MODULE_FLAGS };
  for (const name of parseList(env.MODULES_ENABLED)) flags[name] = true;
  for (const name of parseList(env.MODULES_DISABLED)) flags[name] = false;
  return flags;
}
