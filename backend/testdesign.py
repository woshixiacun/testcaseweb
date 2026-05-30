"""测试设计（思维导图）独立路由。

独立模块，不改动现有 routes.py。数据全量存到 database/_designs.json，
复用 storage.DATA_DIR，与 tree / versions 的"整体替换"读写模式一致。

数据形状：
  - 旧：扁平数组 [ {id,name,root}, ... ]（仍兼容读取）
  - 新：{ "tree": [...带文件夹的目录树...], "maps": { id: {id,name,root} } }
后端不校验结构，整体透传，由前端负责形状与迁移。

挂载方式（在 main.py 里加一行）：
    from .testdesign import router as testdesign_router
    app.include_router(testdesign_router)
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body

from . import storage
from .models import OkResponse

router = APIRouter(prefix="/api")

# 与 _tree.json / _versions.json 并列的元数据文件
DESIGNS_FILE: Path = storage.DATA_DIR / "_designs.json"


def _read_designs() -> Any:
    if not DESIGNS_FILE.exists():
        return []
    with DESIGNS_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_designs(designs: Any) -> None:
    # 缩进 2 空格，与 storage._write_json 风格一致
    with DESIGNS_FILE.open("w", encoding="utf-8") as f:
        json.dump(designs, f, ensure_ascii=False, indent=2)


@router.get("/testdesigns")
def get_testdesigns() -> Any:
    """返回测试设计数据（新结构对象或旧扁平数组，原样透传）。"""
    return _read_designs()


@router.put("/testdesigns", response_model=OkResponse)
def put_testdesigns(designs: Any = Body(default=None)) -> OkResponse:
    """全量替换写入。接受对象（新结构）或数组（旧结构），整体透传。"""
    _write_designs(designs if designs is not None else [])
    return OkResponse()
