# 远端默认入口切换

日期：2026-10-29（香港时间）。用户授权接手远端部署，并明确要求覆盖原服务、隐藏原页面、默认进入小小方桌。

## 结果

- 公网入口：`http://47.116.114.103/`。前端现有路由将 `/` 导航至 `/market`，无需填写3081端口。
- Nginx默认站点由intake切换为small-squaretable，代理到`127.0.0.1:3081`；支持WebSocket Upgrade和长响应，关闭代理缓冲，上传限制50MiB。
- 远端`APP_URL`与由其派生的CORS/OAuth基础地址更新为`http://47.116.114.103`；应用端口改为仅监听回环地址。数据库与Redis未发布宿主机端口。
- 旧`intake.service`停止、禁用开机启动；根用户crontab中的intake监控任务也已注释。该任务此前每15分钟检查并重启旧服务，单独停止systemd服务不足以停用。
- 旧服务文件、数据库和上传文件均未删除。临时放行的3081防火墙规则已撤销。
- 沿用上一会话构建的镜像`small-squaretable:remote-20261029`，ID为`sha256:d47a103656de7d873b6390d736a98ac8ef2841b48252269fac319e536c0f973b`；检查其客户端产物含资料抽屉遮罩实现。此项不等同于登录后的抽屉交互验收。

## 验证与边界

- 公网无代理HTTP：根页面200、`/health/ready` 200；首页引用的9个JS/CSS资源全部200且类型正确。
- 公网`/ws`完成101升级；未携带登录令牌，因此仅证明代理支持WebSocket，不证明登录认证或真实生成成功。
- Chromium直接连接公网IP超时，不能记为公网浏览器通过。改用SSH本地18081转发至远端Nginx80，真实远端API、无业务替身；1440与390宽度的首页自动导航、登录页、无横向溢出、无页面异常和HTTP错误检查通过。
- 首次浏览器断言预期中文品牌而失败：产品无语言偏好时默认英语，浏览器locale不会自动覆盖。保存初次结果后，显式设置现有`locale=zh-CN`偏好重跑通过；没有修改生产默认语言。
- 远端仍为新数据库（接手时users为0）。本地凡音账户、卡片、故事、状态记忆与上传文件未迁移；发现页空态符合当前数据。没有调用模型，也没有改变工程测试预算。
- HTTP入口已可用，未配置域名或HTTPS；登录业务、账户数据迁移、真实生成与用户真机体验未在此次入口切换中验收。

本地证据：`backups/exploration/remote-entry-20261029/`，包含公网资源报告、两次浏览器报告和四张中文页面截图。它们不含真实用户故事。

## 配置、备份与回滚

远端应用目录为`/srv/small-squaretable`，Nginx站点为`/etc/nginx/sites-available/small-squaretable`。备份目录为`/srv/backup/squaretable-entry-20261029T132813Z`，仅服务器管理员可读，包含原环境配置、Compose文件、旧Nginx配置、systemd单元说明及原根用户crontab；不要提交这些私有备份。

恢复旧默认页面时，将sites-enabled中的small-squaretable链接替换回intake，先`nginx -t`再reload，然后`systemctl enable --now intake`。需要恢复旧监控时，仅恢复原crontab中intake监控那一行，避免覆盖之后新增的其他任务。


## 数据库迁移补充

2026-10-29按用户要求迁移本机`squaretable-exploration-postgres-1 / squaretable_beta`到远端。源库有2个用户、20个故事、22张角色卡、167条消息、19份剧情状态、78条状态事件、12本世界书和1348条世界书条目；凡音账户名下有5个故事、9张自有角色卡。“蔚蓝星域”名称匹配到3张卡。其他本地beta/旧开发数据库不含凡音账户；此前提及的聊天UUID不在当前源库，也不在本次声称迁移范围内。源和远端初始schema的列结构一致，pg_dump schema diff只有3个PostgreSQL对等CHECK表达式的格式差异。JWT、refresh JWT、TOTP加密密钥指纹一致。

源数据通过SSH传输，在远端新建`squaretable_migrated`，先导入源schema，再恢复完整data-only归档；恢复期间使用pg_restore的disable-triggers选项处理循环外键。尝试清空原目标schema时，数据库的不可删故事删除凭据保护触发器拒绝了TRUNCATE，该事务回滚；因此采用独立新库切换，原`squaretable_beta`及其数据未被更改。Compose中的`DATABASE_URL`现指向新库。

恢复后逐表比对76张业务表的行数，全部与源库相同；关键表复核为users 2、chats 20、characters 22、messages 167、story_states 19、story_events 78、story_deletions 12。远端凡音账户存在且关联5个故事、9张角色卡。两侧上传卷都没有文件，无需复制上传内容。远端健康检查和首页HTTP均200；1440/390浏览器下首页自动导航和登录表单正常、无资源失败及JS错误。真实密码登录、登录后私有角色库与故事逐条打开尚待用户实际确认；Redis内存会话未迁移，迁移后需重新登录。

敏感源/远端数据库归档保存在本机忽略目录`backups/exploration/db-migration-20261029/`，权限0600；同一份源归档在远端`/srv/backup/squaretable-entry-20261029T132813Z/data-migration/`，权限0600。该目录不得发布或提交。远端数据库迁移前完整备份为本机`remote-before.dump`，原空库`squaretable_beta`仍在。需回滚应用时，将Compose数据库名改回`squaretable_beta`并重建app容器；本机`dumps.sha256`记录源归档及远端迁移前备份校验和。

迁移是一次快照，不会持续同步本机后续新写入。自迁移时间起应使用远端地址继续游玩；本机旧实例仍在运行，后续在本机新增的记录不会自动出现在远端。

## 2026-10-30 后续实际公网复核

上述入口切换和迁移记录保留为历史。后续已完成公网真实浏览器密码登录、迁移后私人库、蔚蓝星域开局/推荐/抽屉、认证 WebSocket、权限和工程故事删除检查，并修复 HTTP CSP 白屏、JSON 未压缩超时及 HTTP UUID API 不可用。最新镜像为 `small-squaretable:remote-20261030-http-ready`（`3a7c3b10c364`）；本轮没有真实模型调用，生成验收仍开放。详见[实际访问与功能验证](remote-verification-20261030.md)。
