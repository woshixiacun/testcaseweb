// 测试设计思维导图：节点类型、数据操作、布局、归档转换。
// 纯函数 + 不可变更新，便于在 React 里直接 setState。

// 节点类型（对齐华为「测试设计」：场景 / 测试点 / 预置条件 / 步骤 / 预期结果）
// submap 是「Feature」：MM 下的分组节点，可嵌套 SC 或更多 Feature
export const NODE_TYPES = {
  root: { label: 'Mind Map', tag: 'MM', color: '#7c6fd6' },
  submap: { label: 'Feature', tag: 'FT', color: '#7c6fd6' },
  scenario: { label: 'Scenario', tag: 'SC', color: '#3a9d6f' },
  point: { label: 'Test Point', tag: 'TP', color: '#3a7bd5' },
  precondition: { label: 'Precondition', tag: 'CO', color: '#d59b3a' },
  step: { label: 'Step', tag: 'ST', color: '#c0556d' },
  expected: { label: 'Expected', tag: 'EX', color: '#8a5ad6' },
};

// 各类型节点允许新增的子节点类型（决定工具栏/右键可加什么）
// 根 MM 与子 MM 都可挂「场景」或再挂一个「子导图」；scenario 排前，
// 使 Ins/Tab 的默认子节点仍是场景，与原行为一致。
export const ALLOWED_CHILDREN = {
  root: ['scenario', 'submap'],
  submap: ['scenario', 'submap'],
  scenario: ['point'],
  point: ['precondition', 'step'],
  step: ['expected'],
  precondition: [],
  expected: [],
};

let _seq = 0;
export const genNodeId = () =>
  `nd_${Date.now()}_${(_seq++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

// 新建一棵空导图
export function emptyDesign(name = 'Mind Map') {
  return {
    id: `dsn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    root: {
      id: genNodeId(),
      type: 'root',
      text: name,
      collapsed: false,
      children: [],
    },
  };
}

// 新建一个指定类型的节点
export function makeNode(type) {
  return {
    id: genNodeId(),
    type,
    text: NODE_TYPES[type]?.label || '',
    collapsed: false,
    children: [],
  };
}

// 递归找节点
export function findNode(node, id) {
  if (node.id === id) return node;
  for (const c of node.children || []) {
    const r = findNode(c, id);
    if (r) return r;
  }
  return null;
}

// 找父节点
export function findParent(node, id, parent = null) {
  if (node.id === id) return parent;
  for (const c of node.children || []) {
    const r = findParent(c, id, node);
    if (r) return r;
  }
  return null;
}

// ---------- 不可变更新 ----------

// 对指定 id 的节点应用 patch（浅合并）
export function patchNode(node, id, patch) {
  if (node.id === id) return { ...node, ...patch };
  if (!node.children) return node;
  return { ...node, children: node.children.map((c) => patchNode(c, id, patch)) };
}

// 在 parentId 下追加一个 child
export function addChild(node, parentId, child) {
  if (node.id === parentId) {
    return { ...node, collapsed: false, children: [...(node.children || []), child] };
  }
  if (!node.children) return node;
  return { ...node, children: node.children.map((c) => addChild(c, parentId, child)) };
}

// 在 siblingId 之后插入一个同级节点（需要父节点上下文，故先定位父）
export function addSiblingAfter(root, siblingId, newNode) {
  const parent = findParent(root, siblingId);
  if (!parent) return root; // 根节点没有同级
  return mapNode(root, parent.id, (p) => {
    const idx = p.children.findIndex((c) => c.id === siblingId);
    const children = [...p.children];
    children.splice(idx + 1, 0, newNode);
    return { ...p, children };
  });
}

// 删除节点（根不可删）
export function removeNode(root, id) {
  if (root.id === id) return root;
  const strip = (node) => ({
    ...node,
    children: (node.children || [])
      .filter((c) => c.id !== id)
      .map(strip),
  });
  return strip(root);
}

// 上移 / 下移：在同级数组里和相邻兄弟交换位置（dir = -1 上移，+1 下移）
export function moveNode(root, id, dir) {
  const parent = findParent(root, id);
  if (!parent) return root;
  return mapNode(root, parent.id, (p) => {
    const idx = p.children.findIndex((c) => c.id === id);
    const j = idx + dir;
    if (j < 0 || j >= p.children.length) return p;
    const children = [...p.children];
    [children[idx], children[j]] = [children[j], children[idx]];
    return { ...p, children };
  });
}

// 全部展开 / 全部收起
export function setAllCollapsed(node, collapsed) {
  return {
    ...node,
    collapsed: node.type === 'root' ? false : collapsed,
    children: (node.children || []).map((c) => setAllCollapsed(c, collapsed)),
  };
}

// 工具：对某个 id 节点整体替换（用回调）
function mapNode(node, id, fn) {
  if (node.id === id) return fn(node);
  if (!node.children) return node;
  return { ...node, children: node.children.map((c) => mapNode(c, id, fn)) };
}

// ---------- 布局：水平向右展开的树 ----------
// 返回 { nodes: [{node, x, y, w, h}], edges: [{x1,y1,x2,y2}], width, height }
// 叶子节点按纵向堆叠，父节点垂直居中于其可见子节点。
const NODE_W = 180;
const NODE_H = 44;
const GAP_X = 56; // 层级水平间距
const GAP_Y = 16; // 同级垂直间距
const PAD = 40; // 画布留白

export function layout(root) {
  const placed = [];
  const edges = [];
  let cursorY = PAD;

  // 后序遍历：先排子节点，父节点取子节点 y 的中点
  function walk(node, depth) {
    const x = PAD + depth * (NODE_W + GAP_X);
    const visibleChildren =
      node.collapsed || !node.children ? [] : node.children;

    if (visibleChildren.length === 0) {
      const y = cursorY;
      cursorY += NODE_H + GAP_Y;
      const box = { node, x, y, w: NODE_W, h: NODE_H, depth };
      placed.push(box);
      return box;
    }

    const childBoxes = visibleChildren.map((c) => walk(c, depth + 1));
    const first = childBoxes[0];
    const last = childBoxes[childBoxes.length - 1];
    const y = (first.y + last.y) / 2;
    const box = { node, x, y, w: NODE_W, h: NODE_H, depth };
    placed.push(box);

    // 连线：父右中 → 子左中
    for (const cb of childBoxes) {
      edges.push({
        x1: x + NODE_W,
        y1: y + NODE_H / 2,
        x2: cb.x,
        y2: cb.y + NODE_H / 2,
      });
    }
    return box;
  }

  walk(root, 0);

  const width =
    Math.max(...placed.map((b) => b.x + b.w), PAD) + PAD;
  const height = Math.max(cursorY, PAD) + PAD;
  return { nodes: placed, edges, width, height, NODE_W, NODE_H };
}

// ---------- 归档：思维导图 → 测试用例 ----------

// 枚举导图里所有「测试点」作为可归档的用例候选。
// 场景可能嵌在多层「Feature」(submap) 下，递归时收集祖先 Feature 名构成 pathSegments，
// 归档时按这条路径在树里逐级建文件夹（mindmap → feature1 → feature2 → ... → scenario → cases）。
//
// 返回 [{ pointId, scenarioName, pathSegments, pointText, preconditions, steps }]
//   pathSegments：[feature1, feature2, ..., scenarioName]，不含 mindmap 名（由 dialog
//                 的 folderName 作为根文件夹注入），也不含 test point 自己（它会变成 case）。
export function collectArchivable(root) {
  const out = [];

  const collectScenario = (scenario, ancestorPath) => {
    const scenarioName = (scenario.text || '').trim() || 'Untitled Scenario';
    const pathSegments = [...ancestorPath, scenarioName];
    for (const point of scenario.children || []) {
      if (point.type !== 'point') continue;
      const preconditions = [];
      const steps = [];
      for (const child of point.children || []) {
        if (child.type === 'precondition') {
          const t = (child.text || '').trim();
          if (t) preconditions.push(t);
        } else if (child.type === 'step') {
          // 步骤的预期结果取其第一个 expected 子节点（可空）
          const exp = (child.children || []).find((c) => c.type === 'expected');
          steps.push({
            operation: (child.text || '').trim(),
            expected: exp ? (exp.text || '').trim() : '',
          });
        }
      }
      out.push({
        pointId: point.id,
        scenarioName,
        pathSegments,
        pointText: (point.text || '').trim() || 'Untitled Test Point',
        preconditions,
        steps,
      });
    }
  };

  // 下钻：root 透传，submap 把自己的名字压入路径，scenario 收集
  const walk = (node, ancestorPath) => {
    for (const child of node.children || []) {
      if (child.type === 'scenario') {
        collectScenario(child, ancestorPath);
      } else if (child.type === 'submap') {
        const featureName = (child.text || '').trim() || 'Untitled Feature';
        walk(child, [...ancestorPath, featureName]);
      } else if (child.type === 'root') {
        walk(child, ancestorPath);
      }
    }
  };
  walk(root, []);
  return out;
}

// 把一个归档候选转成符合现有 case 结构的对象（steps 至少一行，对齐 emptyCase）。
// caseName / caseId 由调用方（App）按目录前缀与唯一性拼装，这里只产出业务字段。
export function archivableToCaseFields(item) {
  const steps =
    item.steps.length > 0
      ? item.steps.map((s) => ({
          operation: s.operation,
          expected: s.expected,
          actualResult: 'pending',
          actualNote: '',
        }))
      : [{ operation: '', expected: '', actualResult: 'pending', actualNote: '' }];
  return {
    caseType: 'uncategorized',
    caseStatus: 'pending',
    precondition: item.preconditions.join('\n'),
    steps,
  };
}



