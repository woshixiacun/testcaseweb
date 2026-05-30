// 测试设计「目录树 + 多张脑图」的数据层。
// 复用 utils.js 里通用的不可变树 helper（addChild/removeNode/moveNode/sortTree…），
// 这里只补脑图特有的：结构定义、旧数据迁移、节点工厂、按文件夹收集。
//
// 持久化形状（_designs.json）：
//   { tree: [ 文件夹/脑图节点 ... ], maps: { [designId]: { id, name, root } } }
// - tree：左侧 Designs 目录树。文件夹 { id, name, type:'folder', children:[] }；
//         脑图节点 { id, name, type:'design' }（id 同时是 maps 的 key）
// - maps：每张脑图的完整内容（root 是脑图画布的根节点）

import { emptyDesign } from './mindmap-utils';

// 新建一个脑图：返回 { node, map }
// node 进 tree（只存元信息），map 进 maps（存 root 内容）
export function makeDesign(name = 'Mind Map') {
  const d = emptyDesign(name); // { id, name, root }
  return {
    node: { id: d.id, name: d.name, type: 'design' },
    map: d,
  };
}

// 新建文件夹节点
export function makeFolder(name) {
  return {
    id: `ddir_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    type: 'folder',
    children: [],
  };
}

// 把后端读到的原始数据规整成 { tree, maps }。
// 兼容三种历史形状：
//   1) 新结构对象 { tree, maps } —— 原样返回（补默认）
//   2) 旧扁平数组 [ {id,name,root}, ... ] —— 全部挂到根级
//   3) null/空 —— 返回空结构
export function normalizeDesigns(raw) {
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    return {
      tree: Array.isArray(raw.tree) ? raw.tree : [],
      maps: raw.maps && typeof raw.maps === 'object' ? raw.maps : {},
    };
  }
  if (Array.isArray(raw)) {
    const tree = [];
    const maps = {};
    for (const d of raw) {
      if (!d || !d.id) continue;
      maps[d.id] = { id: d.id, name: d.name, root: d.root };
      tree.push({ id: d.id, name: d.name, type: 'design' });
    }
    return { tree, maps };
  }
  return { tree: [], maps: {} };
}
