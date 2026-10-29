/**
 * NSFW 可见性：所有发现入口共用的唯一判断点（backlog P2-6）。
 *
 * 两层控制，缺一不可：
 * - 平台开关 NSFW_ENABLED（运营者）：决定「平台上能不能有 NSFW 内容」。
 * - 用户偏好 users.show_nsfw（用户自己，默认关）：决定「我看不看」。
 *
 * 一张 NSFW 卡对某个观看者可见，当且仅当 两者同时为真。其余情况一律按
 * 「不可见」处理，包括未登录用户（偏好视为关）。
 *
 * 所有拦截点（仓储层的公开列表、搜索、合集、详情、发布）都从这里取判断，
 * 不要在别处直接读 config.nsfwEnabled 或自己拼 is_nsfw 条件。
 * config 在调用时读取（不缓存在模块级常量里），测试里切换开关才会生效。
 */

import { eq, or, type SQL } from 'drizzle-orm';
import { config } from '../../core/config';
import { characters } from '../schema/characters';

/** 平台是否允许 NSFW 内容（运营者开关）。 */
export function isNsfwAllowed(): boolean {
  return config.nsfwEnabled;
}

/**
 * 观看者能否看到 NSFW 内容。
 *
 * @param viewerPrefersNsfw 观看者在服务端读出的偏好；未登录传 false/undefined。
 *   必须来自数据库，不能来自客户端传参。
 */
export function canViewNsfw(viewerPrefersNsfw: boolean | null | undefined): boolean {
  return isNsfwAllowed() && viewerPrefersNsfw === true;
}

/**
 * 列表类查询的 NSFW 条件。
 *
 * 可见时返回 undefined（不加限制，drizzle 的 and() 会忽略它）；
 * 否则返回 `is_nsfw = false`。
 */
export function nsfwVisibilityCondition(viewerPrefersNsfw: boolean | null | undefined): SQL | undefined {
  return canViewNsfw(viewerPrefersNsfw) ? undefined : eq(characters.isNsfw, false);
}

/**
 * 与 nsfwVisibilityCondition 相同，但作者本人始终能看到自己的卡。
 * 用于合集这类「列表里可能混着观看者自己的卡」的入口。
 */
export function nsfwVisibilityConditionForViewer(
  viewerPrefersNsfw: boolean | null | undefined,
  viewerId: string | null | undefined,
): SQL | undefined {
  const base = nsfwVisibilityCondition(viewerPrefersNsfw);
  if (!base || !viewerId) return base;
  return or(base, eq(characters.creatorId, viewerId));
}

/**
 * 单张卡的判断（详情、导出、Fork 等按 id 直取的入口）。
 *
 * 作者本人始终可见自己的卡——作者要能打开自己被标记的卡去编辑。
 * 非 NSFW 的卡不受影响。
 */
export function canViewCharacterNsfw(
  character: { isNsfw?: boolean | null; creatorId?: string | null },
  viewer: { id?: string | null; prefersNsfw?: boolean | null },
): boolean {
  if (!character.isNsfw) return true;
  if (viewer.id && character.creatorId === viewer.id) return true;
  return canViewNsfw(viewer.prefersNsfw);
}
