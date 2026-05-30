import React, { useMemo, useState } from 'react';

// 归档用例弹窗：列出导图里所有「测试点」候选，用户手动勾选要生成哪些。
// props:
//   items: collectArchivable(root) 的结果
//   defaultFolderName: 默认草稿文件夹名（导图名）
//   onCancel()
//   onConfirm({ folderName, selectedItems })
export default function ArchiveDialog({ items, defaultFolderName, onCancel, onConfirm }) {
  // 默认全选
  const [checked, setChecked] = useState(() => new Set(items.map((i) => i.pointId)));
  const [folderName, setFolderName] = useState(defaultFolderName || 'Test Design Draft');

  // 按完整路径分组展示（避免不同 Feature 下的同名 scenario 撞在一起）
  const groups = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      const key = (it.pathSegments || [it.scenarioName]).join(' / ');
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(it);
    }
    return [...m.entries()];
  }, [items]);

  const toggle = (id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleGroup = (groupItems) =>
    setChecked((prev) => {
      const next = new Set(prev);
      const allOn = groupItems.every((i) => next.has(i.pointId));
      groupItems.forEach((i) => (allOn ? next.delete(i.pointId) : next.add(i.pointId)));
      return next;
    });

  const selectedCount = checked.size;

  const confirm = () => {
    if (selectedCount === 0) return;
    const selectedItems = items.filter((i) => checked.has(i.pointId));
    onConfirm({ folderName: folderName.trim() || 'Test Design Draft', selectedItems });
  };

  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal td-archive" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>Archive Cases</h3>

        {items.length === 0 ? (
          <div className="td-archive-empty">
            No test points to archive yet. Add test points under a scenario first, then add steps / expected results.
          </div>
        ) : (
          <>
            <div className="form-row" style={{ marginBottom: 12 }}>
              <label>Target Folder</label>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Generated cases go under this folder, grouped by scenario"
              />
            </div>

            <div className="td-archive-hint">
              Check the test points to generate. Each one becomes a case (with its preconditions and steps / expected results).
            </div>

            <div className="td-archive-list">
              {groups.map(([groupKey, groupItems]) => {
                const allOn = groupItems.every((i) => checked.has(i.pointId));
                const someOn = groupItems.some((i) => checked.has(i.pointId));
                return (
                  <div key={groupKey} className="td-archive-group">
                    <label className="td-archive-group-head">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => {
                          if (el) el.indeterminate = !allOn && someOn;
                        }}
                        onChange={() => toggleGroup(groupItems)}
                      />
                      <span className="td-tag-sc">SC</span>
                      {groupKey}
                      <span className="td-archive-count">{groupItems.length}</span>
                    </label>
                    {groupItems.map((it) => (
                      <label key={it.pointId} className="td-archive-item">
                        <input
                          type="checkbox"
                          checked={checked.has(it.pointId)}
                          onChange={() => toggle(it.pointId)}
                        />
                        <span className="td-tag-tp">TP</span>
                        <span className="td-archive-item-name">{it.pointText}</span>
                        <span className="td-archive-meta">
                          {it.steps.length} step(s)
                          {it.preconditions.length ? ` · ${it.preconditions.length} precond.` : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="modal-buttons" style={{ marginTop: 16 }}>
          <button
            className="btn-secondary"
            onClick={onCancel}
            style={{ padding: '7px 16px', border: 'none', borderRadius: 3, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            className="btn-success"
            onClick={confirm}
            disabled={selectedCount === 0}
            style={{ padding: '7px 16px', border: 'none', borderRadius: 3, cursor: 'pointer' }}
          >
            Generate {selectedCount} case(s)
          </button>
        </div>
      </div>
    </div>
  );
}
