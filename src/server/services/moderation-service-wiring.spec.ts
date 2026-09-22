/**
 * moderationService 的真实装配
 *
 * 这个文件补的是一个把整条审核链在生产环境彻底打死、却被全部现有测试漏掉的
 * 缺口。moderation.service.spec.ts 一类的测试都是 `new ModerationService(mocks)`，
 * 从不经过 getModerationService()——而路由层用的只有后者。
 *
 * 工厂函数里用的是 require()，项目是 ESM（package.json type: module），运行时
 * 必抛 `require is not defined`。也就是说举报提交、处置动作、举报队列、待审队列
 * 四个入口全部 500，而单元测试 100% 绿。
 *
 * 所以这里刻意不 mock 任何东西：要验证的正是真实依赖能被装起来。
 * 仓库模块只在导入时建连接池、不发查询，所以无需数据库即可运行。
 */

import { describe, it, expect } from 'vitest';
import { getModerationService, moderationService } from './moderation.service';
import { ModerationService } from './moderation.service';

describe('getModerationService 真实装配', () => {
  it('能在 ESM 下构造出实例——require() 会在这里炸', () => {
    expect(() => getModerationService()).not.toThrow();
    expect(getModerationService()).toBeInstanceOf(ModerationService);
  });

  it('是单例：路由每次调用不该重建仓库', () => {
    expect(getModerationService()).toBe(getModerationService());
  });

  // 装配成功但某个仓库是 undefined，会在第一次真实调用时才炸，
  // 症状和这次一样难查，所以这里逐个盯住
  it('四个仓库都真的接上了', () => {
    const svc = getModerationService() as unknown as Record<string, unknown>;
    for (const dep of ['reportRepo', 'moderationRepo', 'characterRepo', 'userRepo']) {
      expect(svc[dep], `${dep} 未注入`).toBeDefined();
    }
  });

  // 路由层实际引用的是这个转发对象，它的每个方法都会触发工厂
  it('导出的转发对象能取到实例', () => {
    expect(() => moderationService.instance).not.toThrow();
    expect(typeof moderationService.getCharactersByStatus).toBe('function');
  });
});
