import React, { useEffect, useRef, useState } from 'react';

// status -> color + label
export const STATUS_META = {
  '': { color: '#bbb', label: '— Select Result —' },
  draft: { color: '#e67e22', label: 'Draft' }, // orange，脑图归档生成的原始草稿
  pending: { color: '#bbb', label: 'Not Run' }, // grey
  success: { color: '#27ae60', label: 'Passed' }, // green
  fail: { color: '#e74c3c', label: 'Failed' }, // red
  blocked: { color: '#f1c40f', label: 'Blocked' }, // yellow
};

// case type -> color + label
export const TYPE_META = {
  uncategorized: { color: '#b3add0', label: 'Uncategorized' },
  manual: { color: '#7c6fd6', label: 'Manual' },
  auto: { color: '#6ea8e6', label: 'Automated' },
};

function Dot({ color }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        flex: '0 0 auto',
      }}
    />
  );
}

// 带彩色圆点的自定义下拉框
// options: 字符串数组，如 ['success','fail','blocked'] 或 ['','success','fail','blocked']
// meta: 取值 -> { color, label } 的映射，默认用执行状态 STATUS_META，
//       传入 TYPE_META 即可复用为「用例类型」下拉。
export default function StatusSelect({ value, options, disabled, onChange, meta = STATUS_META }) {
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

  const fallback = meta[''] || meta[options[0]] || { color: '#bbb', label: '' };
  const cur = meta[value] || fallback;

  return (
    <div className="status-select" ref={ref}>
      <button
        type="button"
        className="status-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <Dot color={cur.color} />
        <span className="status-select-label">{cur.label}</span>
        {!disabled && <span className="status-select-caret">▾</span>}
      </button>
      {open && !disabled && (
        <div className="status-select-menu">
          {options.map((opt) => {
            const m = meta[opt] || fallback;
            return (
              <div
                key={opt}
                className={`status-select-option${opt === value ? ' active' : ''}`}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                <Dot color={m.color} />
                <span>{m.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
