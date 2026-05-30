import React from 'react';

// 饼图：data = [{ label, value, color }]
// 纯 SVG 实现，无第三方依赖
export default function PieChart({ title, data, size = 160 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2;
  const cx = r;
  const cy = r;

  // 生成每个扇区的 path
  let acc = 0;
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const start = (acc / total) * Math.PI * 2;
      acc += d.value;
      const end = (acc / total) * Math.PI * 2;
      const large = end - start > Math.PI ? 1 : 0;
      // 从 12 点方向起，顺时针
      const x1 = cx + r * Math.sin(start);
      const y1 = cy - r * Math.cos(start);
      const x2 = cx + r * Math.sin(end);
      const y2 = cy - r * Math.cos(end);
      const pct = ((d.value / total) * 100).toFixed(0);
      return { ...d, pct, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z` };
    });

  return (
    <div className="pie-card">
      <div className="pie-title">{title}</div>
      {total === 0 ? (
        <div className="pie-empty">No data</div>
      ) : (
        <div className="pie-body">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {slices.length === 1 ? (
              <circle cx={cx} cy={cy} r={r} fill={slices[0].color} />
            ) : (
              slices.map((s, i) => (
                <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="1" />
              ))
            )}
          </svg>
          <div className="pie-legend">
            {data.map((d, i) => (
              <div className="pie-legend-item" key={i}>
                <span className="pie-dot" style={{ background: d.color }} />
                <span className="pie-legend-label">{d.label}</span>
                <span className="pie-legend-val">
                  {d.value}
                  {total > 0 ? ` (${((d.value / total) * 100).toFixed(0)}%)` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
