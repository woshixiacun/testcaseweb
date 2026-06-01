import React, { useEffect, useMemo, useRef, useState } from 'react';

// 把逗号分隔的字符串解析成去空、去重后的数组（仅本组件内部用）
const parseReqs = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s, i, arr) => s && arr.indexOf(s) === i);

// Requirement 多选下拉：点一项就加到触发器里的 chips 列表，chip 上的 × 可移除。
// 已选项不出现在下拉里；下拉里只显示「还能加的」选项。
// 值以 ", " 拼接的字符串存到 data.requirementDir，与统计表筛选 / xlsx 导出兼容。
export default function RequirementMultiSelect({
  value,
  options = [],
  disabled,
  placeholder = '— Requirement —',
  emptyHint = 'Select a version first',
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = useMemo(() => parseReqs(value), [value]);
  const hasOptions = options.length > 0;
  const remaining = useMemo(
    () => options.filter((r) => !selected.includes(r)),
    [options, selected]
  );

  const add = (req) => {
    if (selected.includes(req)) return;
    onChange([...selected, req].join(', '));
  };

  const remove = (req) => {
    onChange(selected.filter((r) => r !== req).join(', '));
  };

  const triggerDisabled = disabled || !hasOptions;

  return (
    <div className="status-select req-multiselect" ref={ref}>
      <button
        type="button"
        className="status-select-trigger req-multi-trigger"
        disabled={triggerDisabled}
        onClick={() => setOpen((v) => !v)}
      >
        {selected.length === 0 ? (
          <span className="version-placeholder">
            {hasOptions ? placeholder : emptyHint}
          </span>
        ) : (
          <span className="req-chips">
            {selected.map((r) => (
              <span key={r} className="req-chip">
                <span className="req-chip-text">{r}</span>
                {!disabled && (
                  <span
                    className="req-chip-x"
                    role="button"
                    title={`Remove ${r}`}
                    onClick={(e) => {
                      // 点 × 不冒泡到触发器，避免误触发开关菜单
                      e.stopPropagation();
                      remove(r);
                    }}
                  >
                    ×
                  </span>
                )}
              </span>
            ))}
          </span>
        )}
        {!triggerDisabled && <span className="status-select-caret">▾</span>}
      </button>

      {open && !triggerDisabled && (
        <div className="status-select-menu req-multi-menu">
          {remaining.length === 0 ? (
            <div className="req-multi-empty">All requirements added</div>
          ) : (
            remaining.map((r) => (
              <div
                key={r}
                className="status-select-option"
                onClick={() => {
                  add(r);
                  // 选完不关菜单：方便连续多选；想关上点外面或再点触发器
                }}
              >
                {r}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
