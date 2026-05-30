"""路由集合：合并业务路由与导出路由到一个 APIRouter，便于挂到已有项目。

所有路径都带 /api 前缀，与旧 Node 后端一一对应。
集成时只需 `from backend.routes import router; app.include_router(router)` 即可。
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Path
from fastapi.responses import JSONResponse, Response

from . import storage
from .models import CasePayload, ExportZipRequest, OkResponse
from .xlsx_export import build_export_xlsx

router = APIRouter(prefix="/api")


# ----- tree -----
@router.get("/tree")
def get_tree() -> Any:
    return storage.read_tree()


@router.put("/tree", response_model=OkResponse)
def put_tree(tree: list = Body(default_factory=list)) -> OkResponse:
    storage.write_tree(tree)
    return OkResponse()


# ----- versions -----
@router.get("/versions")
def get_versions() -> Any:
    return storage.read_versions()


@router.put("/versions", response_model=OkResponse)
def put_versions(versions: list = Body(default_factory=list)) -> OkResponse:
    storage.write_versions(versions)
    return OkResponse()


# ----- cases -----
@router.get("/cases/{case_id}")
def get_case(case_id: str = Path(...)) -> Any:
    data = storage.read_case(case_id)
    if data is None:
        raise HTTPException(status_code=404, detail="not found")
    return data


@router.put("/cases/{case_id}", response_model=OkResponse)
def put_case(case_id: str, payload: CasePayload) -> OkResponse:
    # 全局 caseId 唯一性校验：扫描其它 case 文件
    data = payload.model_dump()
    target_safe_id = re.sub(r"[^a-zA-Z0-9_\-]", "_", case_id)
    for stem, other in storage.all_cases().items():
        if stem == target_safe_id:
            continue
        if other.get("caseId") == data["caseId"]:
            raise HTTPException(
                status_code=409,
                detail=(
                    f'Case ID "{data["caseId"]}" already exists '
                    f'(used by "{other.get("caseName") or stem}")'
                ),
            )
    storage.write_case(case_id, data)
    return OkResponse()


@router.delete("/cases/{case_id}", response_model=OkResponse)
def delete_case(case_id: str) -> OkResponse:
    # 与旧后端一致：文件不存在也返回 ok
    storage.delete_case(case_id)
    return OkResponse()


# ----- export 全量 JSON -----
@router.get("/export")
def export_all() -> Response:
    payload = {"tree": storage.read_tree(), "cases": storage.all_cases()}
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    filename = f"testcases_{int(time.time() * 1000)}.json"
    return Response(
        content=body,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ----- 统计 -----
@router.get("/stats")
def stats() -> list[dict]:
    tree = storage.read_tree()

    # 建立 caseId -> 一级目录名 的映射（顶层文件夹名；若直接在根则空字符串）
    top_dir_of: dict[str, str] = {}

    def walk(node: dict, top_name: str) -> None:
        if node.get("type") == "case":
            top_dir_of[node["id"]] = top_name
        for child in node.get("children", []) or []:
            walk(child, top_name)

    for top in tree:
        top_name = top.get("name", "") if top.get("type") == "folder" else ""
        walk(top, top_name)

    rows: list[dict] = []
    for c in storage.all_cases().values():
        rows.append(
            {
                "id": c.get("id"),
                "requirementDir": c.get("requirementDir", ""),
                "caseId": c.get("caseId", ""),
                "caseName": c.get("caseName", ""),
                "topDir": top_dir_of.get(c.get("id"), ""),
                "version": c.get("version", ""),
                "caseStatus": c.get("caseStatus", "pending"),
                "caseType": c.get("caseType", "uncategorized"),
            }
        )
    return rows


# ----- 选中用例导出 xlsx -----
@router.post("/export-zip")
def export_zip(req: ExportZipRequest) -> Response:
    if not req.ids:
        raise HTTPException(status_code=400, detail="No cases selected")

    cases: list[dict] = []
    for cid in req.ids:
        data = storage.read_case(cid)
        if data is not None:
            cases.append(data)

    if not cases:
        raise HTTPException(status_code=404, detail="Selected cases not found")

    versions = storage.read_versions()
    xlsx_bytes, filename = build_export_xlsx(cases, versions)
    return Response(
        content=xlsx_bytes,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
