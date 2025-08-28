# System Overview (V1)

**Project Name:** 公考督学助手  
**Stack:** HBuilderX + uni-app + uniCloud (WeChat Mini Program)

## Roles
- **Student 学生**: 接收任务、提交作业、查看批改结果。
- **Teacher 教师/管理员**: 创建任务、批改作业、管理学生信息。

## Core Flow (V1)
1. 教师在教研端创建任务（仅支持直播课任务）。
2. 学生端首页展示任务卡片 → 点击进入详情页提交作业（最多 3 次）。
3. 教师在批改任务台查看待批改作业 → 沉浸式界面打分/填写评语。
4. 学生在详情页查看最终分数和评语。

## Docs to read
- [PRD_main.md](product_docs/PRD_main.md)
- [components_guide.md](../ui_design/components_guide.md)
- [api_endpoints.md](api_specs/api_endpoints.md)
- [data_schemas.md](api_specs/data_schemas.md)

> 本文档是新成员/AI 上手入口。
