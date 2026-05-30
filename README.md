# 测试用例管理系统

基于 React + FastAPI 的测试用例管理网页应用，支持多级目录、多标签页编辑、版本管理、按版本分 sheet 导出 Excel 等功能。

## 项目结构

```
testcaseweb/
├── frontend/        # 前端 (React + Vite)
│   ├── src/         # React 源码
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── backend/         # 后端 (FastAPI + uvicorn)
│   ├── main.py          # FastAPI 入口
│   ├── routes.py        # APIRouter，可挂载到已有项目
│   ├── storage.py       # 文件型持久化（读写 database/）
│   ├── models.py        # Pydantic 数据模型
│   ├── xlsx_export.py   # 多 sheet xlsx 导出（openpyxl）
│   ├── requirements.txt
│   └── .venv/           # Python 虚拟环境
└── database/        # 数据：前端写入的所有用例 / 树 / 版本都落在这里
    ├── _tree.json
    ├── _versions.json
    └── case_*.json
```

## 启动

### 后端

```bash
cd backend
# 首次需要装依赖（已装过可跳过）
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 启动
uvicorn backend.main:app --reload --port 8000
# 或在 repo 根目录执行：
# ./backend/.venv/bin/uvicorn backend.main:app --reload --port 8000
```

后端默认监听 http://localhost:8000，所有接口都在 `/api/*` 下。
数据目录可通过环境变量 `TESTCASE_DATA_DIR` 覆盖，默认指向 `<repo>/database`。

### 前端

```bash
cd frontend
npm install      # 首次需要
npm run dev      # 启动开发服务器
```

前端开发服务器跑在 http://localhost:5173，内置代理把 `/api/*` 转发到后端 8000。
浏览器打开 http://localhost:5173 即可使用。

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET / PUT | `/api/tree` | 用例树（全量替换写入） |
| GET / PUT | `/api/versions` | 版本数据 |
| GET / PUT / DELETE | `/api/cases/{id}` | 单条用例（PUT 含全局 caseId 唯一性校验，409 冲突；DELETE 幂等） |
| GET | `/api/export` | 全量 JSON 下载 |
| GET | `/api/stats` | 扁平化统计 |
| POST | `/api/export-zip` | 选中用例 → 多 sheet xlsx（按版本分 sheet） |

## 集成到已有 FastAPI 项目

后端的所有路由都封装在一个 `APIRouter` 里，挂载只要一行：

```python
from backend.routes import router as testcase_router

app.include_router(testcase_router)
# 数据目录可通过环境变量 TESTCASE_DATA_DIR 指向你想要的位置
```

## 技术栈

- **前端**：React 18 + Vite 5
- **后端**：FastAPI 0.115 + uvicorn 0.32 + Pydantic 2 + openpyxl

## 数据存储

文件型持久化，每条用例一个 JSON 文件，统一放在 [database/](database/) 下：

- `_tree.json` — 用例树结构
- `_versions.json` — 版本信息
- `case_*.json` — 每条用例一个文件

适合个人 / 小团队场景，方便备份与版本控制。
