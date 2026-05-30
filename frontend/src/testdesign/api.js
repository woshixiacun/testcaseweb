// 测试设计模块独立的 fetch 封装（不动现有 src/api/client.js）。
// 走 vite 代理转发到后端 /api/testdesigns。
const json = (r) => {
  if (!r.ok) return r.json().then((d) => Promise.reject(d));
  return r.json();
};

export const designApi = {
  getDesigns: () => fetch('/api/testdesigns').then(json),
  saveDesigns: (designs) =>
    fetch('/api/testdesigns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(designs),
    }).then(json),
};
