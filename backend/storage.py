"""文件型持久化：直接读写 database/ 下的 JSON。

前端写入的所有用例 / 树 / 版本数据都落到这一个目录里，方便备份与迁移。
默认路径是 <repo>/database，可通过环境变量 TESTCASE_DATA_DIR 覆盖。
如果以后要换数据库，只需替换本模块的实现。
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

# 数据目录：repo 根下的 database/
DATA_DIR = Path(
    os.environ.get(
        "TESTCASE_DATA_DIR",
        Path(__file__).resolve().parent.parent / "database",
    )
).resolve()

TREE_FILE = DATA_DIR / "_tree.json"
VERSIONS_FILE = DATA_DIR / "_versions.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data: Any) -> None:
    # 与旧实现一致：缩进 2 空格
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ----- tree -----
def read_tree() -> list:
    return _read_json(TREE_FILE, [])


def write_tree(tree: list) -> None:
    _write_json(TREE_FILE, tree)


# ----- versions -----
def read_versions() -> list:
    return _read_json(VERSIONS_FILE, [])


def write_versions(versions: list) -> None:
    _write_json(VERSIONS_FILE, versions)


# ----- cases -----
_CASE_ID_SAFE = re.compile(r"[^a-zA-Z0-9_\-]")


def case_file(case_id: str) -> Path:
    """与旧实现一致：把 id 中非字母数字下划线短横替换为下划线，防止路径穿越。"""
    safe = _CASE_ID_SAFE.sub("_", str(case_id))
    return DATA_DIR / f"{safe}.json"


def read_case(case_id: str) -> dict | None:
    path = case_file(case_id)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_case(case_id: str, data: dict) -> None:
    _write_json(case_file(case_id), data)


def delete_case(case_id: str) -> bool:
    path = case_file(case_id)
    if not path.exists():
        return False
    path.unlink()
    return True


def iter_case_files():
    """遍历 case_*.json（排除以 _ 开头的元数据文件）。"""
    for entry in DATA_DIR.iterdir():
        if not entry.is_file():
            continue
        if entry.name.startswith("_"):
            continue
        if entry.suffix != ".json":
            continue
        yield entry


def all_cases() -> dict[str, dict]:
    """读取所有 case，返回 {file_id_without_ext: case_dict}。"""
    out: dict[str, dict] = {}
    for entry in iter_case_files():
        try:
            with entry.open("r", encoding="utf-8") as f:
                out[entry.stem] = json.load(f)
        except Exception:
            # 单个文件解析失败不阻断整体
            continue
    return out


def iter_all_case_files():
    """递归遍历整个 database/ 下的 *.json（含子目录，如 RecoveredCase/）。

    排除以 _ 开头的元数据文件（_tree.json 等）。用于「恢复」功能：
    人工放进来的 case 文件可能在子目录里，且文件名不一定与内部 id 对应。
    """
    for entry in DATA_DIR.rglob("*.json"):
        if not entry.is_file():
            continue
        if entry.name.startswith("_"):
            continue
        yield entry


def _unique_safe_id(desired_id: str, taken: set[str]) -> str:
    """为 case 选一个全局唯一、文件名安全的 id。

    desired_id 经过安全化后若已被占用（taken 收集了已用的 safe id），
    追加 _1 / _2 … 直到不冲突。返回安全化后的 id。
    """
    base = _CASE_ID_SAFE.sub("_", str(desired_id)) or "case"
    candidate = base
    n = 1
    while candidate in taken:
        candidate = f"{base}_{n}"
        n += 1
    taken.add(candidate)
    return candidate


def normalize_case_file(path: Path, data: dict, taken_stems: set[str]) -> tuple[str, str]:
    """把一个 case 文件归一化到顶层标准位置 database/case_<safe_id>.json。

    - 以 case 的内部 id 推导目标文件名；若该 id 已被别的文件占用，分配新 id 并回写到 data。
    - 写入新位置后删除原文件（若原文件就是目标位置则不删）。
    - taken_stems 收集已占用的文件 stem，调用方跨多次复用以避免本批次内部撞名。
    返回 (最终内部 id, 最终文件 stem)。
    """
    desired_id = data.get("id") or path.stem
    base = _CASE_ID_SAFE.sub("_", str(desired_id)) or "case"
    target = DATA_DIR / f"{base}.json"

    # 文件已在顶层标准位置（文件名即 safe id）→ 原地保留，不改名，避免重复点击产生 id 漂移
    if path.resolve() == target.resolve():
        data["id"] = base
        _write_json(target, data)
        taken_stems.add(base)
        return base, base

    safe_stem = _unique_safe_id(desired_id, taken_stems)
    final_id = safe_stem  # 文件名安全化后的 id 同时作为内部 id，保持二者一致
    data["id"] = final_id

    target = DATA_DIR / f"{safe_stem}.json"
    _write_json(target, data)

    # 删除原文件（若不是同一个文件）
    if path.resolve() != target.resolve() and path.exists():
        path.unlink()
    return final_id, safe_stem
