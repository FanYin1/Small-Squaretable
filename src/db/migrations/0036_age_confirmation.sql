-- Migration: 注册时的满 18 岁声明
-- Date: 2026-09-23
-- Description: 补上注册链路完全缺失的年龄门。
--
--   此前 registerSchema 只有 email / password / displayName，注册接口
--   对用户年龄没有任何表达，数据库里也没有任何字段能回答「这个账号
--   声明过自己成年吗」。平台面向角色扮演对话，一旦被问到年龄合规，
--   现状是拿不出任何证据的。
--
--   这里存的是「用户在什么时候声明过自己成年」这个事实，不是出生日期。
--   不收集出生日期就不必承担多一份敏感个人信息的存储与保护义务，而
--   声明本身已经满足「平台要求用户确认年龄」这一条。
--
--   为什么不是一个 boolean：boolean 只能证明字段被写过，证明不了是谁、
--   什么时候、从哪里勾的。时间点 + IP 才是这份声明的证据。IP 与
--   audit_logs.actor_ip 一致做截断 SHA-256（16 位十六进制），因此
--   长度取 varchar(64) 与该表对齐，留出换算法的余量。

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_confirmed_ip VARCHAR(64);

-- 存量用户一律留 NULL，不做回填。
--
-- 回填一个假的声明时间，等于伪造这些用户的同意记录——那比没有记录
-- 更糟：出事时提交的是编造的证据。NULL 如实表达「这批账号注册时
-- 平台没有要求过年龄声明」。
--
-- 因此这两列不能加 NOT NULL：加了就必须给存量行编一个值。
-- 后续若要求存量用户补声明，应做成登录后的一次性弹窗，把 NULL
-- 当作「待补」的信号，而不是在这里替他们勾。

-- 取证查询走这个部分索引：只需要找「声明过的账号」，
-- NULL 的那批不进索引，存量库上体积可忽略。
CREATE INDEX IF NOT EXISTS idx_users_age_confirmed
  ON users (age_confirmed_at)
  WHERE age_confirmed_at IS NOT NULL;
