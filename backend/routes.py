"""路由集合：合并业务路由与导出路由到一个 APIRouter，便于挂到已有项目。

所有路径都带 /api 前缀，与旧 Node 后端一一对应。
集成时只需 `from backend.routes import router; app.include_router(router)` 即可。
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Path, Request
from fastapi.responses import JSONResponse, Response

from . import storage
from .models import CasePayload, ExportZipRequest, OkResponse
from .xlsx_export import build_export_xlsx
from .xlsx_import import parse_xlsx
from .weekly_report import get_weekly_report_json

router = APIRouter(prefix="/api")


# ----- tree -----
@router.get("/tree")
def get_tree() -> Any:
    tree = storage.read_tree()
    # 给每个 case 节点附上 caseId(从 case 文件读取),方便前端在树上显示
    def attach_case_id(nodes: list):
        for n in nodes:
            if n.get("type") == "case":
                case_data = storage.read_case(n["id"])
                if case_data and case_data.get("caseId"):
                    n["caseId"] = case_data["caseId"]
            if n.get("children"):
                attach_case_id(n["children"])
    attach_case_id(tree)
    return tree


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


# ----- 恢复孤立用例 -----
def _collect_tree_case_ids(tree: list) -> set[str]:
    """收集树里所有 case 节点的 id。"""
    ids: set[str] = set()

    def walk(node: dict) -> None:
        if node.get("type") == "case" and node.get("id"):
            ids.add(node["id"])
        for child in node.get("children", []) or []:
            walk(child)

    for top in tree:
        walk(top)
    return ids


@router.post("/recover")
def recover_orphan_cases() -> dict:
    """扫描整个 database/，找出不在 _tree.json 里的 case 文件，归一化到顶层并返回。

    - 递归扫描（含 RecoveredCase/ 等子目录），按文件内部 id 比对树里已知的 case id。
    - 孤立文件搬到标准位置 database/case_<safe_id>.json（id 冲突时自动改名）。
    - 清理归一化后变空的子目录。
    返回 {count, recovered: [{id, name, status}]}，供前端挂到 RecoveredCase 文件夹。
    """
    tree = storage.read_tree()
    known_ids = _collect_tree_case_ids(tree)

    # 已占用的顶层文件 stem（避免归一化时撞名）
    taken_stems: set[str] = {
        entry.stem for entry in storage.iter_case_files()
    }

    recovered: list[dict] = []
    for path in list(storage.iter_all_case_files()):
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        cur_id = data.get("id")
        # 已在树里（且文件就在顶层标准位置）则跳过
        if cur_id and cur_id in known_ids and path.parent == storage.DATA_DIR:
            continue
        if cur_id and cur_id in known_ids:
            # id 已知但文件在子目录：仍归一化位置，但不重复加入树
            storage.normalize_case_file(path, data, taken_stems)
            continue

        final_id, _ = storage.normalize_case_file(path, data, taken_stems)
        recovered.append(
            {
                "id": final_id,
                "name": data.get("nameSuffix")
                or data.get("caseName")
                or final_id,
                "status": data.get("caseStatus", "pending"),
            }
        )

    # 只把文件搬出来，保留 RecoveredCase 等子目录本身（作为人工放置 case 的固定入口）
    return {"count": len(recovered), "recovered": recovered}


# ----- 从 Excel 导入 -----
def _find_first_level_folder(tree: list, area: str) -> dict | None:
    """在树的一级目录里按名字大小写不敏感地找文件夹。"""
    target = area.strip().lower()
    if not target:
        return None
    for n in tree:
        if n.get("type") == "folder" and str(n.get("name", "")).strip().lower() == target:
            return n
    return None


@router.post("/import-xlsx")
async def import_xlsx(request: Request) -> dict:
    """接收原始 xlsx 字节（避免引入 python-multipart 依赖），解析后批量入库。

    流程：
    1) 解析 xlsx → 一组 case dict（caseStatus 都为 pending）
    2) 跟现有 case 做 caseId 唯一性校验，重复的进 skipped
    3) 按 Area 匹配/新建一级目录，把 case 节点挂到该目录下；写 case 文件
    4) 持久化 _tree.json，返回 {imported, skipped, errors}
    """
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty body")

    try:
        parsed = parse_xlsx(body)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse xlsx: {e}")

    cases = parsed.get("cases") or []
    errors = list(parsed.get("errors") or [])
    if not cases and not errors:
        return {"imported": 0, "skipped": [], "errors": ["No cases found in sheet"]}

    # 现有 caseId → caseName 映射（用于报告冲突）
    existing: dict[str, str] = {}
    for c in storage.all_cases().values():
        cid = c.get("caseId")
        if cid:
            existing[str(cid)] = c.get("caseName") or ""

    tree = storage.read_tree()
    imported: list[dict] = []
    skipped: list[dict] = []

    # 一次性新生成节点 id 用的小工具
    seq = 0

    def new_dir_id() -> str:
        nonlocal seq
        seq += 1
        return f"dir_{int(time.time() * 1000)}_{seq}_{re.sub(r'[^a-z0-9]', '', str(seq))}"

    def new_case_node_id() -> str:
        nonlocal seq
        seq += 1
        return f"case_{int(time.time() * 1000)}_{seq}"

    # 本批次内部 caseId 也不能重复
    batch_seen: set[str] = set()

    for c in cases:
        case_id = c["caseId"]
        if case_id in existing:
            skipped.append(
                {
                    "caseId": case_id,
                    "caseName": c["caseName"],
                    "reason": f"caseId already exists (used by '{existing[case_id]}')",
                }
            )
            continue
        if case_id in batch_seen:
            skipped.append(
                {
                    "caseId": case_id,
                    "caseName": c["caseName"],
                    "reason": "Duplicate caseId within this Excel",
                }
            )
            continue
        batch_seen.add(case_id)

        # 找/建一级目录
        area = c.pop("area", "")
        parent_id: str | None = None
        if area:
            folder = _find_first_level_folder(tree, area)
            if folder is None:
                folder = {
                    "id": new_dir_id(),
                    "name": area,  # 保留用户大小写
                    "type": "folder",
                    "children": [],
                }
                tree.append(folder)
            parent_id = folder["id"]

        # 树节点 name = caseName 去掉 "Area-" 前缀（保持与编辑器前缀逻辑一致）
        prefix = f"{area}-" if area else ""
        suffix = (
            c["caseName"][len(prefix):]
            if prefix and c["caseName"].startswith(prefix)
            else c["caseName"]
        )

        # 写 case 文件（用新生成的内部 id 作为文件名 / id，不与 caseId 混淆）
        node_id = new_case_node_id()
        case_obj = dict(c)
        case_obj["id"] = node_id
        case_obj["nameSuffix"] = suffix
        storage.write_case(node_id, case_obj)

        # 挂到树
        new_node = {
            "id": node_id,
            "name": suffix,
            "type": "case",
            "status": case_obj["caseStatus"],
        }
        if parent_id is None:
            tree.append(new_node)
        else:
            # 在 tree 里递归找到 parent_id 对应节点，append 子节点
            def attach(nodes: list) -> bool:
                for n in nodes:
                    if n.get("id") == parent_id:
                        n.setdefault("children", []).append(new_node)
                        return True
                    if n.get("children") and attach(n["children"]):
                        return True
                return False

            attach(tree)

        imported.append(
            {"caseId": case_id, "caseName": case_obj["caseName"], "id": node_id}
        )

    storage.write_tree(tree)
    return {
        "imported": len(imported),
        "skipped": skipped,
        "errors": errors,
        "items": imported,
    }


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


# ----- weekly report -----
@router.get("/weeklyreport")
def get_weeklyreport() -> Any:
    """
    返回 weekly report 表格数据(JSON)。
    首次调用时解析 database/weeklyreport/forupload.xlsx 并缓存为 JSON。
    """
    return get_weekly_report_json()
