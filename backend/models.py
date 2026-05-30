"""请求/响应数据模型。

只对必填字段做校验；其它字段保持透传，不强行约束前端的数据形状。
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CasePayload(BaseModel):
    """前端 PUT /api/cases/{id} 提交的用例。

    只校验旧后端要求的两个必填字段，其它字段全部透传。
    """

    model_config = ConfigDict(extra="allow")

    caseId: str = Field(..., min_length=1)
    caseName: str = Field(..., min_length=1)


class OkResponse(BaseModel):
    ok: bool = True


class ExportZipRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)


# tree / versions 直接用 list[Any] 透传，不做结构校验，与旧后端保持一致
TreePayload = list[Any]
VersionsPayload = list[Any]
