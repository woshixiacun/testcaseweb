# 换电脑后的启动指南（Setup Guide）

本文档说明在一台**全新电脑**上，如何从源码把「测试用例管理系统」的前端和后端跑起来。

---

## 一、需要先装的环境

在新电脑上先装好这两样（只需装一次）：

| 工具 | 版本要求 | 用途 | 下载 |
|---|---|---|---|
| **Python** | 3.10 或以上（本项目用 3.11） | 跑后端 | https://www.python.org/downloads/ |
| **Node.js** | 18 或以上（本项目用 20） | 跑前端 | https://nodejs.org/ （装 LTS 版） |

装完后打开终端验证（能打印出版本号就 OK）：

```bash
python3 --version    # 期望 Python 3.10+（Windows 上可能是 python --version）
node -v              # 期望 v18+
npm -v
```

> 提示：你原来电脑上虽然用的是 conda 的 Python，但本项目**不依赖 conda**。新电脑装官方 Python 即可，conda 装的 Python 也行，只要版本 ≥ 3.10。

---

## 二、拿到代码

两种方式任选其一：

**方式 A：从 GitHub 克隆**
```bash
git clone https://github.com/woshixiacun/testcaseweb.git
cd testcaseweb
```

**方式 B：解压压缩包**
```bash
tar -xzf testcaseweb.tar.gz
cd testcaseweb
```

> 注意：代码包里**不含**依赖目录（`node_modules`、`.venv`），这是正常的——下面会重新安装。

---

## 三、启动后端（FastAPI，端口 8000）

进入项目根目录后：

### macOS / Linux

```bash
cd backend
python3 -m venv .venv              # 创建虚拟环境（只需一次）
source .venv/bin/activate          # 激活虚拟环境
pip install -r requirements.txt    # 安装依赖（只需一次）
cd ..
uvicorn backend.main:app --reload --port 8000
```

### Windows（PowerShell）

```powershell
cd backend
python -m venv .venv               # 创建虚拟环境（只需一次）
.\.venv\Scripts\Activate.ps1       # 激活虚拟环境
pip install -r requirements.txt    # 安装依赖（只需一次）
cd ..
uvicorn backend.main:app --reload --port 8000
```

启动成功后会看到：

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

后端就绪，所有接口在 `http://localhost:8000/api/*` 下。**这个终端窗口保持开着别关。**

---

## 四、启动前端（React + Vite，端口 5173）

**另开一个新终端窗口**，回到项目根目录：

```bash
cd frontend
npm install        # 安装依赖（只需一次，国内已配 npmmirror 镜像，速度较快）
npm run dev        # 启动开发服务器
```

启动成功后会看到：

```
  ➜  Local:   http://localhost:5173/
```

浏览器打开 **http://localhost:5173** 即可使用。

> 前端已内置代理：页面里所有 `/api/*` 请求会自动转发到后端的 8000 端口，所以**必须先把后端跑起来**，否则页面加载不出数据。

---

## 五、日常启动（依赖装过之后）

第一次装完依赖后，以后每次开机使用只需两步，各开一个终端：

**终端 1 — 后端：**
```bash
cd testcaseweb
# macOS/Linux:
source backend/.venv/bin/activate
# Windows: .\backend\.venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --port 8000
```

**终端 2 — 前端：**
```bash
cd testcaseweb/frontend
npm run dev
```

然后浏览器开 http://localhost:5173 。

---

## 六、数据在哪

所有用例 / 目录树 / 版本数据都以 JSON 文件存在项目的 `database/` 目录下：

- `_tree.json` — 用例目录树
- `_versions.json` — 版本信息
- `_designs.json` — 测试设计（思维导图）
- `case_*.json` — 每条用例一个文件

**换电脑要保留旧数据**：把旧电脑 `database/` 目录里的这些文件，拷到新电脑同一目录覆盖即可。
（注意：从 GitHub 克隆下来的 `database/` 是空的，因为数据没上传到 GitHub；从 tar.gz 解压的则包含数据。）

数据目录也可通过环境变量 `TESTCASE_DATA_DIR` 指向别处。

---

## 七、常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 页面打开但数据加载失败、报接口错误 | 后端没启动，或不是 8000 端口。先确认后端终端在运行。 |
| `uvicorn: command not found` | 虚拟环境没激活，或没装依赖。重新 `source .venv/bin/activate` 再 `pip install -r requirements.txt`。 |
| Windows 激活脚本报“无法加载，禁止运行脚本” | PowerShell 执行策略限制。以管理员开 PowerShell 跑 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`，再激活。 |
| `npm install` 很慢或卡住 | 项目已配国内镜像（`frontend/.npmrc`）。若仍慢，检查网络或临时去掉 `.npmrc` 里的镜像配置。 |
| 端口被占用（8000 / 5173） | 关掉占用端口的程序，或改用其它端口：后端 `--port 8001`，前端 `npm run dev -- --port 5174`（注意两者改了要保持代理一致）。 |
| 浏览器在另一台机器（如 WSL 场景） | 前端已绑定 `0.0.0.0`，用启动日志里的 Network 地址访问即可。 |

---

## 八、技术栈速记

- **前端**：React 18 + Vite 5，端口 5173
- **后端**：FastAPI + uvicorn + Pydantic + openpyxl，端口 8000
- **数据**：文件型持久化，存在 `database/` 下
