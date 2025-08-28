# Routing & Roles (V1)

- 登录后根据 user.role 跳转：
  - teacher → `/pages/teacher/dashboard`
  - student → `/pages/student/tasks`
- 所有新页面必须在 `pages.json` 注册。
- 云函数调用统一使用 `uniCloud.callFunction`。
- 新增接口时更新 `docs/api_specs/api_endpoints.md`。
