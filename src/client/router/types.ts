import 'vue-router';
import type { ModuleName } from '@/types/modules';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    guestOnly?: boolean;
    requiresRole?: 'user' | 'moderator' | 'admin';
    /** 所属功能模块（P2-1）；模块关闭时该路由按 404 处理 */
    module?: ModuleName;
  }
}
