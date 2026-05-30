import React, { useEffect, useRef, useState } from 'react';
import { versionColorOf } from '../utils';

// 版本下拉框：触发器与每一行都把版本名显示成带底色的徽章，
// 底色取自该版本在「版本管理」里分配的颜色（与统计表 Version 列一致）。
// 空值显示灰色占位「— Version —」。
export default function VersionSelect({ value, versions, disabled, onChange }) {
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

  const curColor = versionColorOf(versions, value);

  return (
    <div className="status-select version-select" ref={ref}>
      <button
        type="button"
        className="status-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {value ? (
          <span className="version-badge" style={{ background: curColor || 'transparent' }}>
            {value}
          </span>
        ) : (
          <span className="version-placeholder">— Version —</span>
        )}
        {!disabled && <span className="status-select-caret">▾</span>}
      </button>
      {open && !disabled && (
        <div className="status-select-menu">
          <div
            className={`status-select-option${!value ? ' active' : ''}`}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            <span className="version-placeholder">— Version —</span>
          </div>
          {versions.map((v, i) => {
            const color = v.color || versionColorOf(versions, v.edition);
            return (
              <div
                key={v.edition || i}
                className={`status-select-option${v.edition === value ? ' active' : ''}`}
                onClick={() => {
                  onChange(v.edition);
                  setOpen(false);
                }}
              >
                <span className="version-badge" style={{ background: color || 'transparent' }}>
                  {v.edition || '(unnamed)'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
