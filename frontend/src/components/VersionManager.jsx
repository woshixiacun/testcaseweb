import React, { useEffect, useState } from 'react';
import { nextVersionColor, versionColorAt } from '../utils';

// Version management.
// 每张卡片有"只读 / 编辑"两态：
//   - 新建：自动进入编辑态
//   - Save：校验 edition 后落库 → 只读
//   - Edit：进入编辑态
//   - Cancel：未保存过的新建 → 整张删除；已存在的 → 撤销改动回到只读
// 父组件传 versions / onChange，本组件内部用 VersionCard 管理每张卡的局部状态。
export default function VersionManager({ versions, onChange }) {
  // 标记最近一次新增的卡片 key，让它初始进入编辑态。
  // 用 newlyAddedKey 而不是 idx，避免数组变化后误标错卡。
  const [newlyAddedKey, setNewlyAddedKey] = useState(null);

  // 给每张卡一个稳定 key：优先用 _key（运行时分配），保证删除/重排时 React state 正确
  // 对持久化数据无影响（写回 onChange 时去掉 _key）。
  const cards = versions.map((v, idx) =>
    v && v._key ? v : { ...v, _key: `v_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}` }
  );

  // 如果检测到 versions 里没有 _key（首次加载），把 _key 写回去
  useEffect(() => {
    if (versions.some((v) => !v._key) && versions.length > 0) {
      onChange(cards);
    }
    // 仅在 versions 引用变化时尝试一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions]);

  const replace = (idx, patch) => {
    const next = cards.map((v, i) => (i === idx ? { ...v, ...patch } : v));
    onChange(next);
  };

  const removeAt = (idx) => onChange(cards.filter((_, i) => i !== idx));

  const addVersion = () => {
    const key = `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setNewlyAddedKey(key);
    onChange([
      ...cards,
      {
        _key: key,
        edition: '',
        releaseDate: '',
        requirements: [],
        color: nextVersionColor(cards),
      },
    ]);
  };

  return (
    <div className="version-manager">
      <div className="vm-head">
        <h3>Version Management</h3>
        <button className="btn-primary vm-add" onClick={addVersion}>
          + Add Version
        </button>
      </div>

      <div className="vm-body">
        {cards.length === 0 ? (
          <div className="vm-empty">No versions yet. Click "Add Version" to create one.</div>
        ) : (
          cards.map((v, idx) => (
            <VersionCard
              key={v._key}
              value={v}
              color={versionColorAt(cards, idx)}
              isNewlyAdded={v._key === newlyAddedKey}
              onSave={(newVal) => {
                replace(idx, newVal);
                if (v._key === newlyAddedKey) setNewlyAddedKey(null);
              }}
              onDelete={() => {
                if (!window.confirm('Delete this version?')) return;
                removeAt(idx);
              }}
              onDiscardNewly={() => {
                // 从未保存过的新建：取消等同于删除该卡
                removeAt(idx);
                setNewlyAddedKey(null);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// 单个版本卡：自管编辑态与 draft。
function VersionCard({ value, color, isNewlyAdded, onSave, onDelete, onDiscardNewly }) {
  const [editing, setEditing] = useState(isNewlyAdded);
  const [draft, setDraft] = useState(value);
  const [reqOpen, setReqOpen] = useState(isNewlyAdded);

  // 外部 value 变了（其他地方改动），且当前不在编辑态时，同步进 draft
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const setDraftField = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // 需求按编号自然排序（"3.1.2" < "3.2.2" < "4.2.1"），与目录树排序口径一致；
  // 空行排到末尾，避免打乱正在编辑的输入。
  const sortReqs = (arr) =>
    [...(arr || [])].sort((a, b) => {
      const sa = String(a).trim();
      const sb = String(b).trim();
      if (!sa && !sb) return 0;
      if (!sa) return 1;
      if (!sb) return -1;
      return sa.localeCompare(sb, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
    });

  const handleSave = () => {
    if (!draft.edition.trim()) {
      alert('Edition is required');
      return;
    }
    // 保存时自动排序需求
    const sorted = { ...draft, requirements: sortReqs(draft.requirements) };
    setDraft(sorted);
    onSave(sorted);
    setEditing(false);
  };

  const handleEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const handleCancel = () => {
    if (isNewlyAdded) {
      // 从未保存过 → 删卡
      onDiscardNewly();
      return;
    }
    setDraft(value);
    setEditing(false);
  };

  const reqs = draft.requirements || [];
  const reqCount = reqs.length;

  const setReqs = (next) => setDraftField({ requirements: next });
  const addReq = () => setReqs([...reqs, '']);
  const updateReq = (ri, v) => setReqs(reqs.map((r, i) => (i === ri ? v : r)));
  const delReq = (ri) => setReqs(reqs.filter((_, i) => i !== ri));

  return (
    <div className="vm-card" style={{ borderLeft: `6px solid ${color}` }}>
      <div className="vm-card-top">
        <span className="vm-color-chip" style={{ background: color }} title="Version color" />
        <div className="vm-field">
          <label>Edition</label>
          <input
            value={draft.edition}
            placeholder="e.g. v1.0.0"
            disabled={!editing}
            onChange={(e) => setDraftField({ edition: e.target.value })}
          />
        </div>
        <div className="vm-field">
          <label>Release Date</label>
          <input
            type="date"
            value={draft.releaseDate || ''}
            disabled={!editing}
            onChange={(e) => setDraftField({ releaseDate: e.target.value })}
          />
        </div>
        <div className="vm-card-actions">
          {editing ? (
            <>
              <button className="btn-success" onClick={handleSave}>
                Save
              </button>
              <button className="btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn-primary" onClick={handleEdit}>
              Edit
            </button>
          )}
          <button className="btn-danger vm-del" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="vm-reqs">
        <div className="vm-reqs-head">
          <button
            type="button"
            className="vm-reqs-toggle"
            onClick={() => setReqOpen((v) => !v)}
            aria-expanded={reqOpen}
          >
            <span className={`vm-caret${reqOpen ? ' open' : ''}`}>▸</span>
            <span>Requirements</span>
            <span className="vm-reqs-count">({reqCount})</span>
          </button>
          {reqOpen && editing && (
            <button className="vm-req-add" onClick={addReq}>
              + Add Requirement
            </button>
          )}
        </div>
        {reqOpen &&
          (reqCount === 0 ? (
            <div className="vm-reqs-empty">
              {editing ? 'No requirements yet. Click "+ Add Requirement" to add one.' : 'No requirements for this version.'}
            </div>
          ) : (
            reqs.map((r, ri) => (
              <div className="vm-req-row" key={ri}>
                <input
                  value={r}
                  placeholder="Requirement description"
                  disabled={!editing}
                  onChange={(e) => updateReq(ri, e.target.value)}
                />
                {editing && (
                  <button
                    className="step-del"
                    title="Delete requirement"
                    onClick={() => delReq(ri)}
                  >
                    🗑
                  </button>
                )}
              </div>
            ))
          ))}
      </div>
    </div>
  );
}
