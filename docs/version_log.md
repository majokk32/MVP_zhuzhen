# Version Log

## V1.0.1 (2025-01-01)
### 产品重要变更
- **评价体系调整**: 将量化分数改为定性评价档位
  - 首页任务卡片右上角不再显示具体分数（如 `23/40`），改为评价档位（`待复盘`、`优秀`、`极佳`）
  - 沉浸式批改界面的分数拖动条改为三档评价选择器
  - 数据库 schema: `submissions.score` → `submissions.grade` enum
  - API 接口: `gradeSubmission({ score })` → `gradeSubmission({ grade })`
- **文档同步更新**: PRD、API规格、UI组件指南全部对齐新的评价体系

## V1.0.0 (2025-08-27)
### 初始化
- 2025-08-27 · init · Add docs layer
