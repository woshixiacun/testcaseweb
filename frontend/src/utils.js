// 工具方法

export const genId = () =>
  `case_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// 版本底色调色板（柔和色，按新建顺序分配：第一个浅粉红、第二个浅绿……）
export const VERSION_COLORS = [
  '#fde2e4', // 浅粉红
  '#dcefdd', // 浅绿
  '#dbe7fb', // 浅蓝
  '#fdeecb', // 浅琥珀
  '#e7dbf7', // 浅紫
  '#cfeeea', // 浅青
  '#ffe2cf', // 浅橙
  '#f6d9ee', // 浅品红
];

// 取调色板中下一个待分配的颜色（新建版本时调用）：
// 优先选当前未被占用的颜色，全占满后再按计数循环
export const nextVersionColor = (versions = []) => {
  const used = new Set(
    versions.map((v, i) => (v && v.color) || VERSION_COLORS[i % VERSION_COLORS.length])
  );
  const free = VERSION_COLORS.find((c) => !used.has(c));
  return free || VERSION_COLORS[versions.length % VERSION_COLORS.length];
};

// 解析某个版本的底色：优先用已存的 color，否则按其在列表中的位置推导
export function versionColorAt(versions, idx) {
  if (idx < 0 || idx >= versions.length) return null;
  const v = versions[idx];
  if (v && v.color) return v.color;
  return VERSION_COLORS[idx % VERSION_COLORS.length];
}

// 按 edition 字符串查这个版本的底色（统计表 / 编辑器下拉用）
export function versionColorOf(versions, edition) {
  if (!edition) return null;
  const idx = versions.findIndex((v) => v.edition === edition);
  return versionColorAt(versions, idx);
}

// 默认 case 数据
// caseId 留空，强制人工输入（旧行为是用目录路径预填，但容易跟实际编号混淆）
export const emptyCase = (parentPath = []) => ({
  id: genId(),
  caseName: '',
  caseId: '',
  requirementDir: '',
  caseType: 'uncategorized', // uncategorized | manual | auto
  caseStatus: 'pending', // pending | success | fail | blocked
  precondition: '',
  steps: [
    { operation: '', expected: '', actualResult: 'pending', actualNote: '' },
  ],
});

// 在 tree 中递归查找节点
export function findNode(tree, id) {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children) {
      const r = findNode(node.children, id);
      if (r) return r;
    }
  }
  return null;
}

// 找到父节点（如果在根则返回 null）
export function findParent(tree, id, parent = null) {
  for (const node of tree) {
    if (node.id === id) return parent;
    if (node.children) {
      const r = findParent(node.children, id, node);
      if (r !== undefined && r !== false) {
        // 找到了
        if (r === null && node.children.some((c) => c.id === id)) return node;
        if (r) return r;
      }
    }
  }
  return null;
}

// 找到父节点的 id（节点在根级则返回 null；找不到也返回 null）
// 比 findParent 直接：自己递归一遍，遇到任一直接子节点匹配就返回当前节点 id
export function findParentId(tree, id) {
  function walk(nodes, parentId) {
    for (const n of nodes) {
      if (n.id === id) return parentId;
      if (n.children) {
        const r = walk(n.children, n.id);
        if (r !== undefined) return r;
      }
    }
    return undefined;
  }
  const r = walk(tree, null);
  return r === undefined ? null : r;
}

// 计算节点的目录路径（用于自动填充 caseId 与 caseName 前缀）
export function pathOf(tree, id) {
  const trail = [];
  function walk(nodes, prefix) {
    for (const n of nodes) {
      const here = [...prefix, n.name];
      if (n.id === id) {
        trail.push(...here);
        return true;
      }
      if (n.children && walk(n.children, here)) return true;
    }
    return false;
  }
  walk(tree, []);
  return trail;
}

// 不可变更新：在指定父节点下追加 child（parentId 为 null 表示根）
export function addChild(tree, parentId, child) {
  if (parentId == null) return [...tree, child];
  return tree.map((n) => {
    if (n.id === parentId) {
      return { ...n, children: [...(n.children || []), child] };
    }
    if (n.children) return { ...n, children: addChild(n.children, parentId, child) };
    return n;
  });
}

// 不可变更新：删除节点（连同子树）
export function removeNode(tree, id) {
  return tree
    .filter((n) => n.id !== id)
    .map((n) =>
      n.children ? { ...n, children: removeNode(n.children, id) } : n
    );
}

// 不可变更新：重命名节点
export function renameNode(tree, id, name) {
  return tree.map((n) => {
    if (n.id === id) return { ...n, name };
    if (n.children) return { ...n, children: renameNode(n.children, id, name) };
    return n;
  });
}

// 收集子树下所有 case 节点的 id
export function collectCaseIds(node) {
  const out = [];
  function walk(n) {
    if (n.type === 'case') out.push(n.id);
    if (n.children) n.children.forEach(walk);
  }
  walk(node);
  return out;
}

// 递归按名称排序（同级文件夹与 case 混排，按 name 升序）；
// archive 文件夹（脑图归档生成的）永远置顶，便于一眼分辨。
export function sortTree(tree) {
  const sorted = [...tree].sort((a, b) => {
    const aArc = a.type === 'folder' && a.archive ? 0 : 1;
    const bArc = b.type === 'folder' && b.archive ? 0 : 1;
    if (aArc !== bArc) return aArc - bArc;
    return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN', {
      numeric: true,
      sensitivity: 'base',
    });
  });
  return sorted.map((n) =>
    n.children ? { ...n, children: sortTree(n.children) } : n
  );
}

// 判断 ancestorId 是否为 nodeId 的祖先（或就是它自己）——用于防止拖拽成环
export function isDescendant(tree, ancestorId, nodeId) {
  const ancestor = findNode(tree, ancestorId);
  if (!ancestor) return false;
  if (ancestorId === nodeId) return true;
  const ids = [];
  (function walk(n) {
    ids.push(n.id);
    if (n.children) n.children.forEach(walk);
  })(ancestor);
  return ids.includes(nodeId);
}

// 把 dragId 节点移动到 targetParentId 下（targetParentId 为 null 表示根）
// 返回新的 tree；非法移动（成环 / 目标是 case 节点）时返回 null
export function moveNode(tree, dragId, targetParentId) {
  if (dragId === targetParentId) return null;
  // 目标必须是文件夹或根
  if (targetParentId != null) {
    const target = findNode(tree, targetParentId);
    if (!target || target.type !== 'folder') return null;
    // 不能把节点拖进它自己的子孙
    if (isDescendant(tree, dragId, targetParentId)) return null;
  }
  const moving = findNode(tree, dragId);
  if (!moving) return null;
  // 先摘除，再挂载
  const without = removeNode(tree, dragId);
  return addChild(without, targetParentId, moving);
}

