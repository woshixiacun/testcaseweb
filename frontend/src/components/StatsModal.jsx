import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { STATUS_META, TYPE_META } from './StatusSelect';
import { versionColorOf } from '../utils';
import PieChart from './PieChart';

// Case statistics: two pie charts + a per-column filterable table.
// embedded=true renders inline (no mask / no close button), used as the default page.
// onOpenCase(caseNodeId) opens that case in a tab.
export default function StatsModal({ onClose, embedded = false, onOpenCase, onDeleteCases, versions = [] }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // per-column filter conditions
  const [f, setF] = useState({
    requirementDir: '',
    caseId: '',
    caseName: '',
    topDir: '',
    version: '',
    caseStatus: '', // '' = all
    caseType: '', // '' = all
  });

  // selected case ids (for zip download)
  const [selected, setSelected] = useState(() => new Set());
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .getStats()
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.error || e.message || 'Failed to load');
        setLoading(false);
      });
  }, []);

  const setFilter = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  // apply filters
  const filtered = useMemo(() => {
    const t = (s) => String(s || '').toLowerCase();
    return rows.filter(
      (r) =>
        t(r.requirementDir).includes(t(f.requirementDir)) &&
        t(r.caseId).includes(t(f.caseId)) &&
        t(r.caseName).includes(t(f.caseName)) &&
        t(r.topDir).includes(t(f.topDir)) &&
        t(r.version).includes(t(f.version)) &&
        (f.caseStatus === '' || r.caseStatus === f.caseStatus) &&
        (f.caseType === '' || r.caseType === f.caseType)
    );
  }, [rows, f]);

  // pie data: computed over the filtered rows (more intuitive)
  const typePie = useMemo(() => {
    const order = ['uncategorized', 'manual', 'auto'];
    return order.map((k) => ({
      label: TYPE_META[k].label,
      color: TYPE_META[k].color,
      value: filtered.filter((r) => r.caseType === k).length,
    }));
  }, [filtered]);

  const statusPie = useMemo(() => {
    const order = ['draft', 'pending', 'success', 'fail', 'blocked'];
    return order.map((k) => ({
      label: STATUS_META[k].label,
      color: STATUS_META[k].color,
      value: filtered.filter((r) => r.caseStatus === k).length,
    }));
  }, [filtered]);

  const Dot = ({ color }) => (
    <span className="case-status-dot" style={{ background: color, marginRight: 6 }} />
  );

  // selection helpers
  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // "select all" reflects current filtered rows
  const filteredIds = filtered.map((r) => r.id);
  const allSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected = filteredIds.some((id) => selected.has(id));

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });

  const selectedCount = selected.size;

  const handleDownload = async () => {
    if (selectedCount === 0 || downloading) return;
    setDownloading(true);
    try {
      await api.downloadZip([...selected]);
    } catch (e) {
      alert('Download failed: ' + (e.error || e.message || ''));
    } finally {
      setDownloading(false);
    }
  };

  // 删除选中用例：交给父组件同步删后端 JSON + 树 + 关闭 tab，
  // 成功后本组件再把对应行从表格与选中集合中移除。
  const handleDelete = async () => {
    if (selectedCount === 0 || deleting || !onDeleteCases) return;
    const ids = [...selected];
    if (
      !window.confirm(
        `Delete ${ids.length} selected case(s)? This removes them from the ` +
          `backend, the function tree, and any open tabs. This cannot be undone.`
      )
    )
      return;
    setDeleting(true);
    try {
      await onDeleteCases(ids);
      const removed = new Set(ids);
      setRows((prev) => prev.filter((r) => !removed.has(r.id)));
      setSelected(new Set());
    } catch (e) {
      alert('Delete failed: ' + (e.error || e.message || ''));
    } finally {
      setDeleting(false);
    }
  };

  const inner = (
    <>
        <div className="stats-head">
          <h3>Case Statistics</h3>
          <div className="stats-head-actions">
            {onDeleteCases && (
              <button
                className="btn-danger stats-download-btn"
                onClick={handleDelete}
                disabled={selectedCount === 0 || deleting}
                title={
                  selectedCount === 0
                    ? 'Select cases to enable delete'
                    : `Delete ${selectedCount} selected case(s)`
                }
              >
                {deleting
                  ? 'Deleting…'
                  : `Delete Selected${selectedCount ? ` (${selectedCount})` : ''}`}
              </button>
            )}
            <button
              className="btn-primary stats-download-btn"
              onClick={handleDownload}
              disabled={selectedCount === 0 || downloading}
              title={
                selectedCount === 0
                  ? 'Select cases to enable download'
                  : `Download ${selectedCount} case(s) as zip`
              }
            >
              {downloading
                ? 'Downloading…'
                : `Download Selected${selectedCount ? ` (${selectedCount})` : ''}`}
            </button>
            {!embedded && (
              <button className="tab-close" onClick={onClose} title="Close">×</button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="stats-loading">Loading…</div>
        ) : err ? (
          <div className="stats-loading" style={{ color: '#c0392b' }}>{err}</div>
        ) : (
          <>
            <div className="pie-row">
              <PieChart title="Case Type Distribution" data={typePie} />
              <PieChart title="Execution Status Distribution" data={statusPie} />
              <div className="stats-summary">
                <div className="stats-total">{filtered.length}</div>
                <div className="stats-total-label">
                  Cases shown{filtered.length !== rows.length ? ` (of ${rows.length})` : ''}
                </div>
              </div>
            </div>

            <div className="stats-table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th className="col-check">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = !allSelected && someSelected;
                        }}
                        onChange={toggleAll}
                        title="Select all (filtered)"
                      />
                    </th>
                    <th>Version</th>
                    <th>Case ID</th>
                    <th>Case Name</th>
                    <th>Function</th>
                    <th>Requirement</th>
                    <th>Status</th>
                    <th>Type</th>
                  </tr>
                  <tr className="filter-row">
                    <th className="col-check"></th>
                    <th>
                      {/* 可输入 + 可下拉：默认空 input + datalist；版本少可下拉，版本多可手输关键词。
                          目前 filter 用的是 includes 子串匹配，所以选择整版本号也能精确命中。 */}
                      <input
                        list="stats-version-options"
                        value={f.version}
                        onChange={(e) => setFilter('version', e.target.value)}
                        placeholder="Filter / pick"
                      />
                      <datalist id="stats-version-options">
                        {versions.map((v) => (
                          <option key={v.edition} value={v.edition} />
                        ))}
                      </datalist>
                    </th>
                    <th>
                      <input
                        value={f.caseId}
                        onChange={(e) => setFilter('caseId', e.target.value)}
                        placeholder="Filter"
                      />
                    </th>
                    <th>
                      <input
                        value={f.caseName}
                        onChange={(e) => setFilter('caseName', e.target.value)}
                        placeholder="Filter"
                      />
                    </th>
                    <th>
                      <input
                        value={f.topDir}
                        onChange={(e) => setFilter('topDir', e.target.value)}
                        placeholder="Filter"
                      />
                    </th>
                    <th>
                      <input
                        value={f.requirementDir}
                        onChange={(e) => setFilter('requirementDir', e.target.value)}
                        placeholder="Filter"
                      />
                    </th>
                    <th>
                      <select
                        value={f.caseStatus}
                        onChange={(e) => setFilter('caseStatus', e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="draft">Draft</option>
                        <option value="pending">Not Run</option>
                        <option value="success">Passed</option>
                        <option value="fail">Failed</option>
                        <option value="blocked">Blocked</option>
                      </select>
                    </th>
                    <th>
                      <select
                        value={f.caseType}
                        onChange={(e) => setFilter('caseType', e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="uncategorized">Uncategorized</option>
                        <option value="manual">Manual</option>
                        <option value="auto">Automated</option>
                      </select>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="stats-empty">No matching cases</td>
                    </tr>
                  ) : (
                    filtered.map((r) => {
                      const sm = STATUS_META[r.caseStatus] || STATUS_META.pending;
                      const tm = TYPE_META[r.caseType] || TYPE_META.uncategorized;
                      return (
                        <tr key={r.id} className={selected.has(r.id) ? 'row-selected' : ''}>
                          <td className="col-check">
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleOne(r.id)}
                            />
                          </td>
                          <td className="version-cell">
                            {r.version ? (
                              <span
                                className="version-badge"
                                style={{ background: versionColorOf(versions, r.version) || 'transparent' }}
                              >
                                {r.version}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <button
                              className="case-link"
                              title="Open this case"
                              onClick={() => onOpenCase && onOpenCase(r.id)}
                            >
                              {r.caseId}
                            </button>
                          </td>
                          <td>
                            <button
                              className="case-link"
                              title="Open this case"
                              onClick={() => onOpenCase && onOpenCase(r.id)}
                            >
                              {r.caseName}
                            </button>
                          </td>
                          <td>{r.topDir || '—'}</td>
                          <td>{r.requirementDir || '—'}</td>
                          <td><Dot color={sm.color} />{sm.label}</td>
                          <td><Dot color={tm.color} />{tm.label}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
    </>
  );

  if (embedded) {
    return <div className="stats-embedded">{inner}</div>;
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
        {inner}
      </div>
    </div>
  );
}
