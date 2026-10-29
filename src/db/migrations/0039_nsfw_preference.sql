-- Migration: 用户「显示 NSFW 内容」偏好
-- Date: 2026-10-18
-- Description: NSFW 改为平台开关 + 用户偏好两层控制（backlog P2-6）。
--   平台开关 NSFW_ENABLED（环境变量）决定「平台上能不能有」；
--   本列是用户偏好，决定「我看不看」。
--
--   默认 FALSE，新用户与存量用户一律如此，不做任何回填：
--   平台允许不等于每个用户都想看，打开必须是用户自己的动作。
--
--   不在数据库层约束「打开偏好必须 age_confirmed_at 非空」：
--   age_confirmed_at 对存量用户是 NULL（见 0036，刻意不回填），而这条
--   规则是业务规则、可能随年龄确认流程演进。校验放在
--   nsfw-preference.service 的写入入口；读取侧（resolveShowNsfw）
--   对「偏好为真但未确认年龄」同样按不可见处理，作为第二道防线。

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS show_nsfw BOOLEAN NOT NULL DEFAULT FALSE;
