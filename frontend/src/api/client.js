// 简单的 fetch 封装。所有路径走 vite 代理转发到后端
const json = (r) => {
  if (!r.ok) return r.json().then((d) => Promise.reject(d));
  return r.json();
};

export const api = {
  getTree: () => fetch('/api/tree').then(json),
  saveTree: (tree) =>
    fetch('/api/tree', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tree),
    }).then(json),
  getCase: (id) => fetch(`/api/cases/${encodeURIComponent(id)}`).then(json),
  saveCase: (id, data) =>
    fetch(`/api/cases/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(json),
  deleteCase: (id) =>
    fetch(`/api/cases/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(
      json
    ),
  getStats: () => fetch('/api/stats').then(json),
  getVersions: () => fetch('/api/versions').then(json),
  saveVersions: (versions) =>
    fetch('/api/versions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(versions),
    }).then(json),
  // 下载选中的 case 为 Excel 表格（按版本分 sheet）：触发浏览器下载
  downloadZip: async (ids) => {
    const r = await fetch('/api/export-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw d.error ? d : new Error('Download failed');
    }
    const blob = await r.blob();
    const cd = r.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/);
    const filename = m ? m[1] : `testcases_${Date.now()}.xlsx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  exportUrl: () => '/api/export',
};
