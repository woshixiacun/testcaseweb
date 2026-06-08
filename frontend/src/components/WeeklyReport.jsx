import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';

// 按 PA1 统计分类（不统计 subtotal 行）
function groupByPA1(rows) {
  const counts = {};
  rows.forEach((r) => {
    if (r.isSubtotal) return; // 跳过 subtotal 行
    const pa1 = (r.pa1 || '').trim();
    if (!pa1) return; // 跳过空的 PA1
    counts[pa1] = (counts[pa1] || 0) + 1;
  });
  return Object.entries(counts).map(([label, count]) => ({ label, count }));
}

// 按 PA2 统计分类（不统计 subtotal 行）
function groupByPA2(rows) {
  const counts = {};
  rows.forEach((r) => {
    if (r.isSubtotal) return; // 跳过 subtotal 行
    const pa2 = (r.pa2 || '').trim();
    if (!pa2) return; // 跳过空的 PA2
    counts[pa2] = (counts[pa2] || 0) + 1;
  });
  return Object.entries(counts).map(([label, count]) => ({ label, count }));
}

// SVG 饼图组件
function PieChart({ data, title }) {
  if (!data || data.length === 0) {
    return <div className="pie-empty">No {title} data available</div>;
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const colors = [
    '#7c6fd6', '#6ea8e6', '#f39c12', '#e74c3c', '#1abc9c',
    '#9b59b6', '#3498db', '#f1c40f', '#e67e22', '#95a5a6',
    '#16a085', '#d35400',
  ];

  let cumulative = 0;
  const slices = data.map((d, i) => {
    const percent = (d.count / total) * 100;
    const startAngle = (cumulative / 100) * 360;
    cumulative += percent;
    const endAngle = (cumulative / 100) * 360;
    return {
      label: d.label,
      count: d.count,
      percent: percent.toFixed(2),
      startAngle,
      endAngle,
      color: colors[i % colors.length],
    };
  });

  const cx = 160;
  const cy = 160;
  const radius = 120;

  // 计算扇形路径
  const getSlicePath = (start, end) => {
    const startRad = ((start - 90) * Math.PI) / 180;
    const endRad = ((end - 90) * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);
    const largeArc = end - start > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  return (
    <div className="pie-chart-wrap">
      <h4 className="pie-title">{title}</h4>
      <div className="pie-container">
        <svg width="320" height="320" className="pie-svg">
          {slices.map((s, i) => {
            const path = getSlicePath(s.startAngle, s.endAngle);
            return (
              <g key={i}>
                <path d={path} fill={s.color} stroke="#fff" strokeWidth="2" />
              </g>
            );
          })}
        </svg>
        <div className="pie-legend">
          {slices.map((s, i) => (
            <div key={i} className="pie-legend-item">
              <span
                className="pie-legend-color"
                style={{ background: s.color }}
              />
              <span className="pie-legend-label">
                {s.label}: {s.count} ({s.percent}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Weekly Report 表格展示组件
export default function WeeklyReport({ onClose, embedded = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getWeeklyReport()
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.error || e.message || 'Failed to load weekly report');
        setLoading(false);
      });
  }, []);

  const pa1Data = useMemo(() => groupByPA1(rows), [rows]);
  const pa2Data = useMemo(() => groupByPA2(rows), [rows]);

  const inner = (
    <>
      <div className="weekly-report-head">
        <h3>Weekly Report</h3>
        {!embedded && (
          <button className="tab-close" onClick={onClose} title="Close">
            ×
          </button>
        )}
      </div>

      {loading ? (
        <div className="weekly-report-loading">Loading...</div>
      ) : error ? (
        <div className="weekly-report-error">{error}</div>
      ) : (
        <>
          <div className="pie-charts-row">
            <PieChart data={pa1Data} title="PA1 Distribution" />
            <PieChart data={pa2Data} title="PA2 Distribution" />
          </div>
          <div className="weekly-report-table-wrap">
            <table className="weekly-report-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Case Owner</th>
                  <th>ART</th>
                  <th>Chipset</th>
                  <th>Account Name</th>
                  <th>Customer Project</th>
                  <th>Customer Project ID</th>
                  <th>Case Number</th>
                  <th>PA1</th>
                  <th>PA2</th>
                  <th>PA3</th>
                  <th>Closed Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="weekly-report-empty">
                      No data available
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => (
                    <tr
                      key={idx}
                      className={r.isSubtotal ? 'subtotal-row' : ''}
                    >
                      <td>{r.col1}</td>
                      <td>{r.caseOwner}</td>
                      <td>{r.art}</td>
                      <td>{r.chipset}</td>
                      <td>{r.accountName}</td>
                      <td>{r.customerProject}</td>
                      <td>{r.customerProjectId}</td>
                      <td>{r.caseNumber}</td>
                      <td>{r.pa1}</td>
                      <td>{r.pa2}</td>
                      <td>{r.pa3}</td>
                      <td>{r.closedDate}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );

  if (embedded) {
    return <div className="weekly-report-embedded">{inner}</div>;
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div
        className="modal weekly-report-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    </div>
  );
}
