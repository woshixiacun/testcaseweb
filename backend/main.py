"""FastAPI 入口。

集成到已有项目时，可直接：
    from backend.routes import router as testcase_router
    app.include_router(testcase_router)

独立运行：
    uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routes import router
from .storage import DATA_DIR
from .testdesign import router as testdesign_router


def create_app() -> FastAPI:
    app = FastAPI(title="testcase-manager")
    # 与旧 Node 后端的 cors() 行为对齐：开放所有来源
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 错误响应字段对齐旧 Node 后端：用 {"error": "..."} 而非 FastAPI 默认的 {"detail": "..."}
    # 前端 src/api/client.js 与各页面读取的是 e.error，保持兼容
    @app.exception_handler(HTTPException)
    async def _http_error(_req: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"error": str(exc.detail)}
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(
        _req: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # 把校验错误压成单条字符串，沿用旧后端 400 风格
        first = exc.errors()[0] if exc.errors() else {"msg": "Invalid request"}
        loc = ".".join(str(x) for x in first.get("loc", []) if x != "body")
        msg = first.get("msg", "Invalid request")
        text = f"{loc}: {msg}" if loc else msg
        # 必填字段缺失时给出更直观提示，匹配旧后端的 "Case Name and Case ID are required"
        if any(
            e.get("type") in ("missing", "value_error") and "caseId" in str(e.get("loc"))
            or e.get("type") in ("missing", "value_error") and "caseName" in str(e.get("loc"))
            for e in exc.errors()
        ):
            text = "Case Name and Case ID are required"
        return JSONResponse(status_code=400, content={"error": text})

    @app.exception_handler(Exception)
    async def _unhandled(_req: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    app.include_router(router)
    app.include_router(testdesign_router)

    @app.on_event("startup")
    async def _on_startup() -> None:
        print(f"[server] testcase api ready (data dir: {DATA_DIR})")

    return app


app = create_app()


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
