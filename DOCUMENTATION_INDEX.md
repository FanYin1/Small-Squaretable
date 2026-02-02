# Small Squaretable - 文档索引

> 完整的项目文档导航
>
> **更新日期**: 2026-02-01

---

## 📋 文档分类

### 🚀 快速开始

| 文档 | 描述 | 适用对象 |
|------|------|----------|
| [README.md](README.md) | 项目概览和快速开始 | 所有人 |
| [USER_GUIDE.md](USER_GUIDE.md) | 用户使用指南 | 最终用户 |
| [OPERATIONS_MANUAL.md](OPERATIONS_MANUAL.md) | 运维操作手册 | 开发者、运维 |

### 📊 项目总结

| 文档 | 描述 | 内容 |
|------|------|------|
| [PROJECT_COMPLETION_SUMMARY.md](PROJECT_COMPLETION_SUMMARY.md) | 项目完成总结 | 交付物、统计、成果 |
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | 功能权限实现总结 | Feature Gate 系统 |

### 🧪 测试文档

| 文档 | 描述 | 测试类型 |
|------|------|----------|
| [TEST_COVERAGE_REPORT.md](TEST_COVERAGE_REPORT.md) | 测试覆盖率详细报告 | 单元测试、集成测试 |
| [TEST_SUITE_SUMMARY.md](TEST_SUITE_SUMMARY.md) | 测试套件总结 | 统计、建议 |
| [E2E_TEST_SUMMARY.md](E2E_TEST_SUMMARY.md) | E2E 测试实现总结 | 端到端测试 |
| [e2e/README.md](e2e/README.md) | E2E 测试完整文档 | Playwright 指南 |
| [e2e/QUICKSTART.md](e2e/QUICKSTART.md) | E2E 快速开始 | 快速上手 |

### 🚢 部署文档

| 文档 | 描述 | 部署方式 |
|------|------|----------|
| [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md) | 部署配置总结 | Docker + K8s |
| [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) | 部署检查清单 | 生产部署 |
| [docs/deployment/deployment-guide.md](docs/deployment/deployment-guide.md) | 完整部署指南 | 详细步骤 |
| [docs/deployment/stripe-setup.md](docs/deployment/stripe-setup.md) | Stripe 配置指南 | 支付集成 |
| [k8s/README.md](k8s/README.md) | Kubernetes 配置说明 | K8s 清单 |

### 🏗️ 架构文档

| 文档 | 描述 | 内容 |
|------|------|------|
| [docs/architecture/infrastructure.md](docs/architecture/infrastrmd) | 基础设施架构 | 完整技术架构 |
| [docs/frontend-backend-integration.md](docs/frontend-backend-integration.md) | 前后端集成 | API 集成文档 |

### 🎯 功能文档

| 文档 | 描述 | 功能模块 |
|------|------|----------|
| [FEATURE_GATE_EXAMPLES.md](FEATURE_GATE_EXAMPLES.md) | 功能权限示例 | Feature Gate |
| [docs/subscription-guide.md](docs/subscription-guide.md) | 订阅系统指南 | 订阅计费 |

---

## 📖 按角色查找文档

### 👤 最终用户

**必读**:
1. [USER_GUIDE.md](USER_GUIDE.md) - 完整使用指南

**参考**:
- 功能介绍
- 订阅计划对比
- 常见问题解答

### 👨‍💻 开发者

**必读**:
1. [README.md](README.md) - 项目概览
2. [OPERATIONS_MANUAL.md](OPERATIONS_MANUAL.md) - 开发指南

**参考**:
- [TEST_COVERAGE_REPORT.md](TEST_COVERAGE_REPORT.md) - 测试覆盖率
- [docs/architecture/infrastructure.md](docs/architecture/infrastructure.md) - 架构设计
- [FEATURE_GATE_EXAMPLES.md](FEATURE_GATE_EXAMPLES.md) - 功能实现

### 🔧 运维人员

**必读**:
1. [OPERATIONS_MANUAL.md](OPERATIONS_MANUAL.md) - 运维手册
2. [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md) - 部署配置

**参考**:
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - 部署检查
- [docs/deployment/deployment-guide.md](docs/deployment/deployment-guide.md) - 详细步骤
- [k8s/README.md](k8s/README.md) - K8s 配置

### 🧪 测试工程师

**必读**:
1. [TEST_SUITE_SUMMARY.md](TEST_SUITE_SUMMARY.md) - 测试总结
2. [e2e/README.md](e2e/README.md) - E2E 测试

**参考**:
- [TEST_COVERAGE_REPORT.md](TEST_COVERAGE_REPORT.md) - 覆盖率报告
- [E2E_TEST_SUMMARY.md](E2E_TEST_SUMMARY.md) - E2E 实现
- [e2e/QUICKSTART.md](e2e/QUICKSTART.md) - 快速开始

### 📊 项目经理

**必读**:
1. [PROJECT_COMPLETION_SUMMARY.md](PROJECT_COMPLETION_SUMMARY.md) - 项目总结
2. [README.md](README.md) - 项目概览

**参考**:
- [TEST_SUITE_SUMMARY.md](TEST_SUITE_SUMMARY.md) - 质量报告
- [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md) - 部署状态

---

## 🔍 按主题查找文档

### 认证与授权
- [OPERATIONS_MANUAL.md](OPERATIONS_MANUAL.md) - 账户管理
- [FEATURE_GATE_EXAMPLES.md](FEATURE_GATE_EXAMPLES.md) - 权限控制

### 订阅与计费
- [USER_GUIDE.md](USER_GUIDE.md) - 订阅计划
- [docs/subscription-guide.md](docs/subscription-guide.md) - 订阅系统
- [docs/deployment/stripe-setup.md](docs/deployment/stripe-setup.md) - Stripe 配置

### 聊天功能
- [USER_GUIDE.md](USER_GUIDE.md) - 聊天使用
- [docs/frontend-backend-integration.md](docs/frontend-backend-integration.md) - WebSocket 集成

### 角色管理
- [USER_GUIDE.md](USER_GUIDE.md) - 角色创建和市场
- [FEATURE_GATE_EXAMPLES.md](FEATURE_GATE_EXAMPLES.md) - 角色分享权限

### 测试
- [TEST_COVERAGE_REPORT.md](TEST_COVERAGE_REPORT.md) - 单元测试
- [E2E_TEST_SUMMARY.md](E2E_TEST_SUMMARY.md) - E2E 测试
- [e2e/README.md](e2e/README.md) - Playwright 指南

### 部署
- [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md) - 部署概览
- [docs/deployment/deployment-guide.md](docs/deployment/deployment-guide.md) - 详细步骤
- [k8s/README.md](k8s/README.md) - Kubernetes

### 架构
- [docs/architecture/infrastructure.md](docs/architecture/infrastructure.md) - 技术架构
- [PROJECT_COMPLETION_SUMMARY.md](PROJECT_COMPLETION_SUMMARY.md) - 架构决策

---

## 📈 文档统计

- **总文档数**: 15+ 个
- **总字数**: 50,000+ 字
- **覆盖范围**: 用户、开发、测试、部署、架构
- **维护状态**: ✅ 最新（2026-02-01）

---

## 🔄 文档更新

### 最近更新
- 2026-02-01: 创建完整文档体系
- 2026-02-01: 添加用户指南和操作手册
- 2026-02-01: 完成测试和部署文档

### 维护计划
- 每次功能更新后更新相关文档
- 每月审查文档准确性
- 根据用户反馈改进文档

---

**维护者**: Small Squaretable Team
**最后更新**: 2026-02-01
