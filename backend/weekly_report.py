"""
Weekly Report Excel parser.

解析 database/weeklyreport/forupload.xlsx，提取表格数据并转为 JSON。

列识别方式: 按表头名(大小写/空格不敏感)匹配，而不是按固定位置。
这样真实表格里新增 PA3 等列、或列顺序变化时都能正确读到。

表头别名 → 驼峰键名映射见 _HEADER_ALIASES。
特殊行:
- subtotal 行: 任意单元格值为 "subtotal"（大小写不敏感）
- 完全空行: 所有列为空，过滤掉
"""
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl


XLSX_PATH = Path("database/weeklyreport/forupload.xlsx")
JSON_PATH = Path("database/weeklyreport/forupload.json")

# 输出字段顺序(前端表格按此顺序渲染)
FIELDS = [
    "col1",
    "caseOwner",
    "art",
    "chipset",
    "accountName",
    "customerProject",
    "customerProjectId",
    "caseNumber",
    "pa1",
    "pa2",
    "pa3",
    "closedDate",
]

# 表头别名(归一化后) → 字段名。归一化: 小写 + 去除非字母数字。
_HEADER_ALIASES = {
    "col1": "col1",
    "no": "col1",
    "caseowner": "caseOwner",
    "owner": "caseOwner",
    "art": "art",
    "chipset": "chipset",
    "accountname": "accountName",
    "account": "accountName",
    "customerproject": "customerProject",
    "customerprojectid": "customerProjectId",
    "casenumber": "caseNumber",
    "pa1": "pa1",
    "pa2": "pa2",
    "pa3": "pa3",
    "closeddate": "closedDate",
    "closed": "closedDate",
}


def _norm(h: Any) -> str:
    """表头归一化: 小写 + 去除非字母数字。"""
    return re.sub(r"[^a-z0-9]", "", str(h or "").lower())


def _cell_to_str(v: Any) -> str:
    """单元格值转字符串。NaN/None/空 → ""; 日期 → 'YYYY/M/D'。"""
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return f"{v.year}/{v.month}/{v.day}"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    s = str(v).strip()
    if s.lower() in ("nan", "none"):
        return ""
    return s


def parse_weekly_report() -> list[dict[str, Any]]:
    """解析 forupload.xlsx，返回行列表(按表头名识别列)。"""
    if not XLSX_PATH.exists():
        return []

    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        return []

    # 表头行 → {列索引: 字段名}
    header = rows[0]
    col_map: dict[int, str] = {}
    for idx, h in enumerate(header):
        field = _HEADER_ALIASES.get(_norm(h))
        if field and idx not in col_map.values():
            col_map[idx] = field

    result: list[dict[str, Any]] = []
    for r in rows[1:]:
        # 初始化所有字段为空
        row_dict: dict[str, Any] = {f: "" for f in FIELDS}
        for idx, field in col_map.items():
            if idx < len(r):
                row_dict[field] = _cell_to_str(r[idx])

        # 全空行: 跳过
        if all(row_dict[f] == "" for f in FIELDS):
            continue

        # subtotal 检测: 任意单元格(原始行)等于 "subtotal"
        is_subtotal = any(
            _cell_to_str(c).strip().lower() == "subtotal" for c in r
        )
        row_dict["isSubtotal"] = is_subtotal
        result.append(row_dict)

    return result


def get_weekly_report_json(force_refresh: bool = False) -> list[dict[str, Any]]:
    """
    返回 weekly report JSON 数据。
    - force_refresh=True: 强制重新解析 Excel。
    - 否则: JSON 存在就用 JSON; 不存在则解析 Excel 并写入 JSON。
    """
    if not force_refresh and JSON_PATH.exists():
        try:
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    data = parse_weekly_report()
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return data
