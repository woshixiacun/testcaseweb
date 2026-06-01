import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api/client';
import {
  emptyCase,
  addChild,
  removeNode,
  findNode,
  findParentId,
  collectCaseIds,
  pathOf,
  sortTree,
  moveNode,
  isDescendant,
  genId,
} from './utils';
import TreeView from './components/TreeView';
import ContextMenu from './components/ContextMenu';
import CaseEditor from './components/CaseEditor';
import Modal from './components/Modal';
import Toast from './components/Toast';
import StatsModal from './components/StatsModal';
import VersionManager from './components/VersionManager';
import TestDesignView from './testdesign/TestDesignView';
import { designApi } from './testdesign/api';
import { normalizeDesigns, makeDesign, makeFolder } from './testdesign/designstore';

const MAX_TABS = 20;
const STATS_TAB_ID = '__stats__';
const VERSION_TAB_ID = '__versions__';
const TESTDESIGN_TAB_ID = '__testdesign__';

export default function App() {
  // 目录树（结构 + case 节点的元数据 name）
  const [tree, setTree] = useState([]);
  // 已打开的 tab：{ id, draft, saved, dirty, isEditing, isNew, parentId }
  // - draft：当前编辑器中的内容（含暂存）
  // - saved：上次保存（或加载）的版本
  // - isNew：尚未保存到后端的新 case
  // - isEditing：true 时表单可编辑，false 时只读
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  // 当前在树里"高亮"的文件夹 id：决定工具栏 + New Case 落在哪
  // null 表示未选中任何文件夹（落到根）
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  // 右键菜单
  const [ctxMenu, setCtxMenu] = useState(null);
  // 弹窗
  const [modal, setModal] = useState(null);
  // toast
  const [toast, setToast] = useState(null);
  // 版本数据（版本管理 + Requirement 下拉来源）
  const [versions, setVersions] = useState([]);
  // 侧栏宽度（可拖拽分隔条改变）
  const [sidebarWidth, setSidebarWidth] = useState(280);
  // 左侧栏页签：'cases'（用例 Function Tree）| 'designs'（测试设计目录）
  const [sidebarTab, setSidebarTab] = useState('cases');
  // 测试设计数据：{ tree: [...目录树...], maps: { id: {id,name,root} } }
  const [designData, setDesignData] = useState({ tree: [], maps: {} });
  // 当前在 Test Design 标签里打开的脑图 id（null = 未选）
  const [activeDesignId, setActiveDesignId] = useState(null);
  // Designs 树里高亮的文件夹（决定「新建脑图」落点）
  const [selectedDesignFolderId, setSelectedDesignFolderId] = useState(null);
  // 上传 Excel 的隐藏 file input + 导入中状态
  const fileInputRef = React.useRef(null);
  const [importing, setImporting] = useState(false);

  // 拖拽侧栏右边缘改变宽度
  const startResizeSidebar = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev) => {
      const w = startW + (ev.clientX - startX);
      // 限制范围，避免拖没了或拖太宽
      setSidebarWidth(Math.max(180, Math.min(600, w)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // ---------- 初始化：加载目录 + 版本 ----------
  useEffect(() => {
    api
      .getTree()
      .then((t) => setTree(sortTree(t)))
      .catch((e) => {
        showToast('Failed to load function tree: ' + (e.error || e.message), 'error');
      });
    api
      .getVersions()
      .then((v) => setVersions(Array.isArray(v) ? v : []))
      .catch(() => {});
    // 测试设计数据（兼容旧的扁平数组）
    designApi
      .getDesigns()
      .then((raw) => setDesignData(normalizeDesigns(raw)))
      .catch(() => setDesignData({ tree: [], maps: {} }));
  }, []);

  // ---------- 工具：toast ----------
  const showToast = useCallback((msg, type = '') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  }, []);

  // 版本数据持久化（每次变化同步到后端）
  // VersionManager 给每张卡注入了一个内部 _key 字段做 React key；持久化时剥离掉，不污染存储。
  const persistVersions = (next) => {
    setVersions(next);
    const cleaned = next.map(({ _key, ...rest }) => rest);
    api.saveVersions(cleaned).catch((e) => {
      showToast('Failed to save versions: ' + (e.error || e.message), 'error');
    });
  };

  // ---------- 树持久化（每次树变化都按字母排序后同步到后端） ----------
  const persistTree = (newTree) => {
    const sorted = sortTree(newTree);
    setTree(sorted);
    api.saveTree(sorted).catch((e) => {
      showToast('Failed to save function tree: ' + (e.error || e.message), 'error');
    });
  };

  // ---------- 测试设计数据持久化（tree 排序后整体写回） ----------
  const persistDesigns = (next) => {
    const sorted = { tree: sortTree(next.tree), maps: next.maps };
    setDesignData(sorted);
    designApi.saveDesigns(sorted).catch((e) => {
      showToast('Failed to save test designs: ' + (e.error || e.message), 'error');
    });
  };

  // 拖拽移动节点：改变层级（归属到目标文件夹，或拖到空白处归到根级）
  const handleMove = (dragId, targetParentId) => {
    const moved = moveNode(tree, dragId, targetParentId);
    if (!moved) {
      showToast('Cannot move to that location', 'error');
      return;
    }
    persistTree(moved);
  };

  // ---------- 恢复孤立用例 ----------
  // 扫描整个 database/，把不在 _tree.json 里的 case 文件归一化后，
  // 挂到根级的浅绿色 RecoveredCase 文件夹下（已存在则复用并追加）。
  const handleRecover = async () => {
    try {
      const { count, recovered } = await api.recover();
      if (!count) {
        showToast('No orphan cases found', 'success');
        return;
      }
      // 找到已有的 RecoveredCase 文件夹，没有就新建一个（带 recovered 标记 → 浅绿）
      let next = tree;
      let folder = next.find(
        (n) => n.type === 'folder' && n.recovered === true
      );
      let folderId;
      if (folder) {
        folderId = folder.id;
      } else {
        folderId = `dir_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        next = addChild(next, null, {
          id: folderId,
          name: 'RecoveredCase',
          type: 'folder',
          recovered: true,
          children: [],
        });
      }
      // 只追加树里还没有的节点（后端已保证 recovered 都是孤立 id，这里再防一层重复）
      for (const c of recovered) {
        if (findNode(next, c.id)) continue;
        next = addChild(next, folderId, {
          id: c.id,
          name: c.name,
          type: 'case',
          status: c.status,
        });
      }
      persistTree(next);
      showToast(`Recovered ${count} case(s)`, 'success');
    } catch (e) {
      showToast('Recover failed: ' + (e.error || e.message || ''), 'error');
    }
  };

  // ---------- 从 Excel 导入用例 ----------
  const onClickUpload = () => {
    if (importing) return;
    fileInputRef.current && fileInputRef.current.click();
  };

  const onFilePicked = async (e) => {
    const file = e.target.files && e.target.files[0];
    // 清空 input，保证选同一个文件也能再次触发 change
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const res = await api.importXlsx(buf);
      // 重新拉取后端树（后端已写入 case 文件 + 更新 _tree.json）
      const t = await api.getTree();
      setTree(sortTree(t));
      setSidebarTab('cases');

      const { imported = 0, skipped = [], errors = [] } = res;
      // 用 Modal 汇报结果（导入数 / 跳过 / 错误）
      const lines = [];
      lines.push(`Imported: ${imported} case(s)`);
      if (skipped.length) {
        lines.push(`Skipped: ${skipped.length}`);
        skipped.slice(0, 10).forEach((s) =>
          lines.push(`  • ${s.caseId || '(no id)'} — ${s.reason}`)
        );
        if (skipped.length > 10) lines.push(`  …and ${skipped.length - 10} more`);
      }
      if (errors.length) {
        lines.push(`Notes: ${errors.length}`);
        errors.slice(0, 10).forEach((er) => lines.push(`  • ${er}`));
        if (errors.length > 10) lines.push(`  …and ${errors.length - 10} more`);
      }
      setModal({
        title: 'Import Result',
        message: lines.join('\n'),
        confirmText: 'OK',
        onClose: () => setModal(null),
        onConfirm: () => setModal(null),
      });
      if (imported > 0) {
        showToast(`Imported ${imported} case(s)`, 'success');
      }
    } catch (err) {
      showToast('Import failed: ' + (err.detail || err.error || err.message || ''), 'error');
    } finally {
      setImporting(false);
    }
  };

  // ---------- tab 操作 ----------

  const updateTab = (id, patch) =>
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // 在编辑器中修改内容 → 写到 draft，标 dirty
  const handleEditorChange = (id, patch) => {
    setTabs((ts) =>
      ts.map((t) => {
        if (t.id !== id) return t;
        const draft = { ...t.draft, ...patch };
        // 与 saved 比较判断 dirty（暂时简单按 patch 出现就 dirty）
        return { ...t, draft, dirty: true };
      })
    );
  };

  // 新建 case：在工具栏点"新建 case"或目录右键"新建 case"
  const newCaseTab = (parentId = null) => {
    if (tabs.length >= MAX_TABS) {
      showToast(`At most ${MAX_TABS} tabs can be open at once`, 'error');
      return;
    }
    const parentPath = parentId ? pathOf(tree, parentId) : [];
    const c = emptyCase(parentPath);
    const tab = {
      id: c.id,
      draft: c,
      saved: null,
      dirty: true,
      isEditing: true,
      isNew: true,
      parentId,
    };
    setTabs((ts) => [...ts, tab]);
    setActiveId(c.id);
  };

  // 打开特殊 tab（统计 / 版本管理，全局唯一）
  const openSpecialTab = (id, type) => {
    const existed = tabs.find((t) => t.id === id);
    if (existed) {
      setActiveId(id);
      return;
    }
    if (tabs.length >= MAX_TABS) {
      showToast(`At most ${MAX_TABS} tabs can be open at once`, 'error');
      return;
    }
    setTabs((ts) => [...ts, { id, type }]);
    setActiveId(id);
  };
  const openStatsTab = () => openSpecialTab(STATS_TAB_ID, 'stats');
  const openVersionTab = () => openSpecialTab(VERSION_TAB_ID, 'versions');
  const openTestDesignTab = () => {
    setSidebarTab('designs');
    openSpecialTab(TESTDESIGN_TAB_ID, 'testdesign');
  };

  // ---------- 测试设计目录树操作 ----------
  // 打开某张脑图：定位到 Test Design 标签并切到该图
  const openDesign = (node) => {
    if (!node || node.type !== 'design') return;
    setActiveDesignId(node.id);
    openSpecialTab(TESTDESIGN_TAB_ID, 'testdesign');
  };

  // 新建脑图（落到指定文件夹，缺省落根）
  const createDesign = (parentId = null) => {
    const { node, map } = makeDesign('Mind Map');
    const nextTree = addChild(designData.tree, parentId, node);
    persistDesigns({ tree: nextTree, maps: { ...designData.maps, [map.id]: map } });
    setActiveDesignId(map.id);
    setSidebarTab('designs');
    openSpecialTab(TESTDESIGN_TAB_ID, 'testdesign');
  };

  // 新建脑图文件夹
  const createDesignFolder = (parentId = null) => {
    setModal({
      title: 'New Design Folder',
      placeholder: 'Folder name',
      needInput: true,
      onClose: () => setModal(null),
      onConfirm: (name) => {
        setModal(null);
        persistDesigns({
          tree: addChild(designData.tree, parentId, makeFolder(name)),
          maps: designData.maps,
        });
      },
    });
  };

  // 重命名脑图 / 文件夹（脑图节点同时同步 maps 里的 name）
  const renameDesignNode = (node) => {
    setModal({
      title: 'Rename',
      placeholder: 'New name',
      defaultValue: node.name,
      needInput: true,
      onClose: () => setModal(null),
      onConfirm: (name) => {
        setModal(null);
        const tree = renameInTree(designData.tree, node.id, name);
        const maps = { ...designData.maps };
        if (node.type === 'design' && maps[node.id]) {
          maps[node.id] = { ...maps[node.id], name };
        }
        persistDesigns({ tree, maps });
      },
    });
  };

  // 删除脑图 / 文件夹（连同其下所有脑图的 maps 一并清除）
  const deleteDesignNode = (node) => {
    const isFolder = node.type === 'folder';
    const subtree = findNode(designData.tree, node.id);
    const designIds = [];
    (function walk(n) {
      if (!n) return;
      if (n.type === 'design') designIds.push(n.id);
      (n.children || []).forEach(walk);
    })(subtree);
    const hint = isFolder
      ? `Delete folder "${node.name}" and the ${designIds.length} mind map(s) under it? This cannot be undone.`
      : `Delete mind map "${node.name}"? This cannot be undone.`;
    setModal({
      title: 'Confirm Delete',
      message: hint,
      confirmText: 'Delete',
      onClose: () => setModal(null),
      onConfirm: () => {
        setModal(null);
        const tree = removeNode(designData.tree, node.id);
        const maps = { ...designData.maps };
        for (const id of designIds) delete maps[id];
        persistDesigns({ tree, maps });
        if (designIds.includes(activeDesignId)) setActiveDesignId(null);
        if (
          isFolder &&
          selectedDesignFolderId &&
          (selectedDesignFolderId === node.id ||
            isDescendant(designData.tree, node.id, selectedDesignFolderId))
        ) {
          setSelectedDesignFolderId(null);
        }
      },
    });
  };

  // 拖拽移动脑图节点
  const handleDesignMove = (dragId, targetParentId) => {
    const moved = moveNode(designData.tree, dragId, targetParentId);
    if (!moved) {
      showToast('Cannot move to that location', 'error');
      return;
    }
    persistDesigns({ tree: moved, maps: designData.maps });
  };

  // 更新某张脑图的 root（TestDesignView 编辑回调）
  const updateDesignRoot = (designId, newRoot) => {
    const cur = designData.maps[designId];
    if (!cur) return;
    persistDesigns({
      tree: designData.tree,
      maps: { ...designData.maps, [designId]: { ...cur, root: newRoot } },
    });
  };

  // Designs 树右键菜单
  const onDesignNodeContext = (e, node) => {
    const items = [];
    if (node.type === 'folder') {
      items.push({ label: 'New Subfolder', onClick: () => createDesignFolder(node.id) });
      items.push({ label: 'New Mind Map', onClick: () => createDesign(node.id) });
      items.push({ label: 'Rename', onClick: () => renameDesignNode(node) });
      items.push({ sep: true });
    } else {
      items.push({ label: 'Rename', onClick: () => renameDesignNode(node) });
    }
    items.push({ label: 'Delete', danger: true, onClick: () => deleteDesignNode(node) });
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onDesignBlankContext = (e) => {
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'New Top-level Folder', onClick: () => createDesignFolder(null) },
        { label: 'New Mind Map', onClick: () => createDesign(null) },
      ],
    });
  };

  // 打开已有 case
  const openCase = async (node) => {
    if (node.type !== 'case') return;
    setSidebarTab('cases');
    // 已经打开则直接激活
    const existed = tabs.find((t) => t.id === node.id);
    if (existed) {
      setActiveId(node.id);
      return;
    }
    if (tabs.length >= MAX_TABS) {
      showToast(`At most ${MAX_TABS} tabs can be open at once`, 'error');
      return;
    }
    try {
      const data = await api.getCase(node.id);
      const tab = {
        id: node.id,
        draft: data,
        saved: data,
        dirty: false,
        isEditing: false,
        isNew: false,
        parentId: null,
      };
      setTabs((ts) => [...ts, tab]);
      setActiveId(node.id);
    } catch (e) {
      showToast('Failed to open: ' + (e.error || e.message), 'error');
    }
  };

  // 从统计页点击用例名称：按节点 id 找到 case 并打开
  const openCaseById = (caseNodeId) => {
    const node = findNode(tree, caseNodeId);
    if (!node) {
      showToast('This case no longer exists', 'error');
      return;
    }
    openCase(node);
  };

  // 批量删除用例（来自统计页"Delete Selected"）：
  // 同步删后端 JSON 文件 + 从树移除对应 case 节点 + 关掉相关 tab。
  // 统计页本身的行删除由 StatsModal 在本回调成功后自行处理。
  const handleDeleteCases = async (ids) => {
    if (!ids || ids.length === 0) return;
    // 关掉相关 tab（直接丢弃，不再询问）
    setTabs((ts) => ts.filter((t) => !ids.includes(t.id)));
    if (ids.includes(activeId)) setActiveId(null);
    // 后端逐个删除（DELETE 幂等，文件不存在也返回 ok）
    for (const id of ids) {
      try {
        await api.deleteCase(id);
      } catch {}
    }
    // 从树移除每个 case 节点并持久化
    let next = tree;
    for (const id of ids) next = removeNode(next, id);
    persistTree(next);
    showToast(`Deleted ${ids.length} case(s)`, 'success');
  };

  // 测试设计「归档用例」：把选中的测试点生成为正式 case，落到目录树。
  // - 在根级新建一个草稿文件夹（folderName）
  // - 每个场景在其下建同名子文件夹
  // - 每个测试点 → 一条 case，写后端 + 进树
  // 返回生成的用例条数（供 TestDesignView 提示）。
  const handleArchiveDesign = async ({ folderName, items }) => {
    if (!items || items.length === 0) return 0;

    // 已用过的 caseId 集合（全局），避免与现有用例及本批次内部冲突
    const usedCaseIds = new Set();
    const stats = await api.getStats().catch(() => []);
    for (const r of stats) if (r.caseId) usedCaseIds.add(String(r.caseId));
    const uniqueCaseId = (base) => {
      let id = base;
      let n = 1;
      while (usedCaseIds.has(id)) id = `${base}_${n++}`;
      usedCaseIds.add(id);
      return id;
    };

    let seq = 0;
    const newDirId = () =>
      `dir_${Date.now()}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

    // 1) 根级 archive 文件夹（粉红 + 永远置顶）
    const rootFolder = {
      id: newDirId(),
      name: folderName,
      type: 'folder',
      archive: true,
      children: [],
    };
    let nextTree = addChild(tree, null, rootFolder);

    // 2) 在 nextTree 里按 [folderName, ...pathSegments] 逐级 ensure 子文件夹，
    //    同名同层 reuse，命中即返回该文件夹 id。新建的中间层也带 archive 标记。
    const ensurePath = (segments) => {
      let parentId = rootFolder.id;
      for (const seg of segments) {
        const parent = findNode(nextTree, parentId);
        const found = (parent.children || []).find(
          (c) => c.type === 'folder' && c.name === seg
        );
        if (found) {
          parentId = found.id;
        } else {
          const id = newDirId();
          nextTree = addChild(nextTree, parentId, {
            id,
            name: seg,
            type: 'folder',
            archive: true,
            children: [],
          });
          parentId = id;
        }
      }
      return parentId;
    };

    // 3) 每个测试点 → case，落到 root → pathSegments 末端目录
    let count = 0;
    for (const it of items) {
      const parentId = ensurePath(it.pathSegments || [it.scenarioName]);
      const dirTrail = pathOf(nextTree, parentId); // [folderName, ...pathSegments]
      const prefix = dirTrail.length ? dirTrail.join('-') + '-' : '';
      const shortName = it.pointText;
      const caseId = uniqueCaseId(shortName);

      const steps =
        it.steps.length > 0
          ? it.steps.map((s) => ({
              operation: s.operation,
              expected: s.expected,
              actualResult: 'pending',
              actualNote: '',
            }))
          : [{ operation: '', expected: '', actualResult: 'pending', actualNote: '' }];

      const caseObj = {
        id: genId(),
        caseName: prefix + shortName,
        nameSuffix: shortName,
        caseId,
        requirementDir: '',
        version: '',
        caseType: 'uncategorized',
        caseStatus: 'draft',
        precondition: it.preconditions.join('\n'),
        steps,
      };

      try {
        await api.saveCase(caseObj.id, caseObj);
        nextTree = addChild(nextTree, parentId, {
          id: caseObj.id,
          name: shortName,
          type: 'case',
          status: 'draft',
        });
        count++;
      } catch (e) {
        showToast(`Archive "${shortName}" failed: ` + (e.error || e.message || ''), 'error');
      }
    }

    persistTree(nextTree);
    return count;
  };

  // 关闭 tab：dirty 时弹窗提醒保存
  const closeTab = (id) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.dirty) {
      setModal({
        title: 'Close tab',
        message: 'This tab has unsaved changes. Save before closing?',
        confirmText: 'Save',
        cancelText: 'Cancel',
        extraButtons: [
          {
            label: "Don't Save",
            className: 'btn-danger',
            onClick: () => {
              setModal(null);
              doCloseTab(id);
            },
          },
        ],
        onClose: () => setModal(null),
        onConfirm: async () => {
          setModal(null);
          const ok = await saveTab(id);
          if (ok) doCloseTab(id);
        },
      });
      return;
    }
    doCloseTab(id);
  };

  const doCloseTab = (id) => {
    setTabs((ts) => {
      const next = ts.filter((t) => t.id !== id);
      if (activeId === id) {
        setActiveId(next.length ? next[next.length - 1].id : null);
      }
      return next;
    });
  };

  // 暂存：仅写入内存（不调后端），切 tab 时状态保留
  const stashTab = (id) => {
    // 实际我们的 draft 一直跟随输入，已经"暂存"在内存中。
    // 这里只是给用户一个明确反馈。
    showToast('Stashed (switching tabs keeps your edits)', 'success');
  };

  // 保存：调后端 PUT /api/cases/:id；如果是新 case，再追加到树
  const saveTab = async (id) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return false;
    const draft = tab.draft;

    // 目录前缀 + 用户填写的短名 → 完整 caseName；树节点只显示短名
    const prefix = dirPrefixForTab(tab);
    const suffix =
      draft.nameSuffix !== undefined
        ? draft.nameSuffix
        : draft.caseName && prefix && draft.caseName.startsWith(prefix)
        ? draft.caseName.slice(prefix.length)
        : draft.caseName || '';

    if (!suffix.trim() || !draft.caseId.trim()) {
      showToast('Case Name and Case ID are required', 'error');
      return false;
    }

    const fullName = prefix + suffix;
    const shortName = suffix;
    const d = { ...draft, caseName: fullName, nameSuffix: suffix };

    try {
      await api.saveCase(d.id, d);
      // 如果是新 case，把节点加进树（节点 name 用短名，带状态显示圆点）
      if (tab.isNew) {
        const newNode = {
          id: d.id,
          name: shortName,
          type: 'case',
          status: d.caseStatus,
        };
        const nextTree = addChild(tree, tab.parentId, newNode);
        persistTree(nextTree);
      } else {
        // 已存在：同步树里的 name（短名）与 status
        const cur = findNode(tree, d.id);
        if (cur && (cur.name !== shortName || cur.status !== d.caseStatus)) {
          const updated = patchCaseNode(tree, d.id, {
            name: shortName,
            status: d.caseStatus,
          });
          persistTree(updated);
        }
      }
      updateTab(id, {
        draft: d,
        saved: d,
        dirty: false,
        isEditing: false,
        isNew: false,
      });
      showToast('Saved', 'success');
      return true;
    } catch (e) {
      showToast('Failed to save: ' + (e.error || e.message), 'error');
      return false;
    }
  };

  // 局部辅助：树重命名（不引用 utils 是因为命名冲突）
  const renameInTree = (nodes, id, name) =>
    nodes.map((n) => {
      if (n.id === id) return { ...n, name };
      if (n.children) return { ...n, children: renameInTree(n.children, id, name) };
      return n;
    });

  // 局部辅助：给指定节点合并字段（如 name / status）
  const patchCaseNode = (nodes, id, patch) =>
    nodes.map((n) => {
      if (n.id === id) return { ...n, ...patch };
      if (n.children) return { ...n, children: patchCaseNode(n.children, id, patch) };
      return n;
    });

  // ---------- 顶部按钮 ----------
  // 工具栏 + New Case：决定新 case 落在哪
  //   1) 树里若选中了文件夹（folder-selected）→ 落在该文件夹
  //   2) 否则若当前 active tab 是已有 case → 落在该 case 的父文件夹（即"我跟它做邻居"）
  //   3) 都没有 → 落在根
  // 用户只需看 CaseName 的前缀就能确认位置。
  const resolveNewCaseParentId = () => {
    if (selectedFolderId) return selectedFolderId;
    const tab = tabs.find((t) => t.id === activeId);
    if (tab && !tab.type && !tab.isNew) {
      // 已保存的 case：找其在树中的父文件夹
      return findParentId(tree, tab.id);
    }
    return null;
  };
  const onToolbarNewCase = () => newCaseTab(resolveNewCaseParentId());

  // ---------- 目录右键菜单 ----------

  const onTreeNodeContext = (e, node) => {
    const items = [];
    if (node.type === 'folder') {
      items.push({
        label: 'New Subfolder',
        onClick: () => askCreateFolder(node.id),
      });
      items.push({
        label: 'New Case',
        onClick: () => newCaseTab(node.id),
      });
      items.push({
        label: 'Rename',
        onClick: () => askRename(node),
      });
      items.push({ sep: true });
    }
    items.push({
      label: 'Delete',
      danger: true,
      onClick: () => askDelete(node),
    });
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onBlankContext = (e) => {
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'New Top-level Folder',
          onClick: () => askCreateFolder(null),
        },
        {
          label: 'New Case',
          onClick: () => newCaseTab(null),
        },
      ],
    });
  };

  const askCreateFolder = (parentId) => {
    setModal({
      title: 'New Folder',
      placeholder: 'Folder name',
      needInput: true,
      onClose: () => setModal(null),
      onConfirm: (name) => {
        setModal(null);
        const node = {
          id: `dir_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name,
          type: 'folder',
          children: [],
        };
        persistTree(addChild(tree, parentId, node));
      },
    });
  };

  const askRename = (node) => {
    setModal({
      title: 'Rename',
      placeholder: 'New name',
      defaultValue: node.name,
      needInput: true,
      onClose: () => setModal(null),
      onConfirm: (name) => {
        setModal(null);
        persistTree(renameInTree(tree, node.id, name));
      },
    });
  };

  const askDelete = (node) => {
    const isFolder = node.type === 'folder';
    const caseIds = collectCaseIds(node).filter((id) => id !== node.id || node.type === 'case');
    const hint = isFolder
      ? `This will delete folder "${node.name}" and the ${caseIds.length} case(s) under it. This cannot be undone.`
      : `This will delete case "${node.name}". This cannot be undone.`;
    setModal({
      title: 'Confirm Delete',
      message: hint,
      confirmText: 'Delete',
      onClose: () => setModal(null),
      onConfirm: async () => {
        setModal(null);
        // 先关掉相关 tab（直接丢弃，不再询问）
        const idsToDelete = node.type === 'case' ? [node.id] : caseIds;
        setTabs((ts) => ts.filter((t) => !idsToDelete.includes(t.id)));
        if (idsToDelete.includes(activeId)) setActiveId(null);
        // 如果删的是当前选中的文件夹（或其祖先），清空选中态
        if (
          node.type === 'folder' &&
          selectedFolderId &&
          (selectedFolderId === node.id ||
            isDescendant(tree, node.id, selectedFolderId))
        ) {
          setSelectedFolderId(null);
        }
        // 后端删除每个 case 文件
        for (const id of idsToDelete) {
          try {
            await api.deleteCase(id);
          } catch {}
        }
        persistTree(removeNode(tree, node.id));
        showToast('Deleted', 'success');
      },
    });
  };

  // ---------- 渲染 ----------

  const activeTab = tabs.find((t) => t.id === activeId);

  // 计算目录前缀："目录1-目录2-…-"（末尾带连字符）。
  // 已保存的 case：其节点在树中，取 pathOf 去掉最后一段（自身）。
  // 新建未保存的 case：用 tab.parentId（所在文件夹）算前缀。
  const dirPrefixForTab = (tab) => {
    if (!tab) return '';
    if (tab.isNew) {
      if (tab.parentId == null) return '';
      const trail = pathOf(tree, tab.parentId); // 文件夹完整路径
      return trail.length ? trail.join('-') + '-' : '';
    }
    const trail = pathOf(tree, tab.id); // [dir1, ..., caseNodeName]
    const dirs = trail.slice(0, -1);
    return dirs.length ? dirs.join('-') + '-' : '';
  };

  return (
    <div className="app">
      <div className="toolbar">
        <h1>Test Case Manager</h1>
        <button onClick={openStatsTab}>Case Statistics</button>
        <button onClick={openVersionTab}>Version Management</button>
        <button onClick={openTestDesignTab} title="Design test points on a mind map, then archive them into cases">
          Test Design
        </button>
        <button
          onClick={onToolbarNewCase}
          title="Create new case in the current folder. The CaseName prefix will show its location."
        >
          + New Case
        </button>
        <div className="toolbar-spacer" />
        <button
          onClick={onClickUpload}
          disabled={importing}
          title="Import cases from an Excel file (.xlsx). Area matches a top-level folder; cases are added under it."
        >
          {importing ? 'Importing…' : '⬆ Upload Excel'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={onFilePicked}
        />
      </div>

      <div className="main">
        <div className="sidebar" style={{ width: sidebarWidth }}>
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab${sidebarTab === 'designs' ? ' active' : ''}`}
              onClick={() => setSidebarTab('designs')}
            >
              Designs
            </button>
            <button
              className={`sidebar-tab${sidebarTab === 'cases' ? ' active' : ''}`}
              onClick={() => setSidebarTab('cases')}
            >
              Cases
            </button>
          </div>

          {sidebarTab === 'cases' ? (
            <>
              <div className="sidebar-header">
                <span>Function Tree</span>
                <div className="sidebar-header-actions">
                  <button
                    className="icon-btn"
                    title="Scan database for cases not in the tree and recover them into RecoveredCase"
                    onClick={handleRecover}
                  >
                    ⟳ Refresh
                  </button>
                  <button title="New top-level folder" onClick={() => askCreateFolder(null)}>
                    + Folder
                  </button>
                </div>
              </div>
              <div className="tree">
                <TreeView
                  tree={tree}
                  selectedId={activeId}
                  selectedFolderId={selectedFolderId}
                  onSelect={openCase}
                  onSelectFolder={(folderId) =>
                    setSelectedFolderId((cur) => (cur === folderId ? null : folderId))
                  }
                  onContextMenu={onTreeNodeContext}
                  onBlankContextMenu={onBlankContext}
                  onMove={handleMove}
                />
              </div>
            </>
          ) : (
            <>
              <div className="sidebar-header">
                <span>Design Tree</span>
                <button title="New top-level folder" onClick={() => createDesignFolder(null)}>
                  + Folder
                </button>
              </div>
              <div className="tree">
                <TreeView
                  tree={designData.tree}
                  selectedId={activeDesignId}
                  selectedFolderId={selectedDesignFolderId}
                  onSelect={openDesign}
                  onSelectFolder={(folderId) =>
                    setSelectedDesignFolderId((cur) => (cur === folderId ? null : folderId))
                  }
                  onContextMenu={onDesignNodeContext}
                  onBlankContextMenu={onDesignBlankContext}
                  onMove={handleDesignMove}
                />
              </div>
            </>
          )}
        </div>

        <div
          className="sidebar-resizer"
          onMouseDown={startResizeSidebar}
          title="Drag to resize the function tree"
        />

        <div className="content">
          {tabs.length > 0 ? (
            <>
              <div className="tabs">
                {tabs.map((t) => {
                  const isStats = t.type === 'stats';
                  const isVersions = t.type === 'versions';
                  const isTestDesign = t.type === 'testdesign';
                  const isSpecial = isStats || isVersions || isTestDesign;
                  const title = isStats
                    ? 'Case Statistics'
                    : isVersions
                    ? 'Version Management'
                    : isTestDesign
                    ? 'Test Design'
                    : t.draft.caseName || 'New Case';
                  return (
                    <div
                      key={t.id}
                      className={`tab${activeId === t.id ? ' active' : ''}${
                        isSpecial ? ' tab-stats' : ''
                      }`}
                      onClick={() => setActiveId(t.id)}
                      title={title}
                    >
                      <span className="tab-title">
                        {isStats && '📊 '}
                        {isVersions && '🏷 '}
                        {isTestDesign && '🧩 '}
                        {title}
                      </span>
                      {!isSpecial && t.dirty && <span className="dirty-dot">●</span>}
                      <span
                        className="tab-close"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(t.id);
                        }}
                      >
                        ×
                      </span>
                    </div>
                  );
                })}
              </div>

              {activeTab && activeTab.type === 'stats' && (
                <StatsModal embedded onOpenCase={openCaseById} onDeleteCases={handleDeleteCases} versions={versions} />
              )}

              {activeTab && activeTab.type === 'versions' && (
                <VersionManager versions={versions} onChange={persistVersions} />
              )}

              {activeTab && activeTab.type === 'testdesign' && (
                <TestDesignView
                  map={activeDesignId ? designData.maps[activeDesignId] : null}
                  onChangeRoot={updateDesignRoot}
                  onArchive={handleArchiveDesign}
                  onNewMap={() => createDesign(selectedDesignFolderId)}
                  showToast={showToast}
                />
              )}

              {activeTab && !activeTab.type && (
                <>
                  <CaseEditor
                    data={activeTab.draft}
                    isEditing={activeTab.isEditing}
                    dirty={activeTab.dirty}
                    dirPrefix={dirPrefixForTab(activeTab)}
                    versions={versions}
                    onChange={(patch) =>
                      handleEditorChange(activeTab.id, patch)
                    }
                  />
                  <div className="editor-bottom-bar">
                    <div style={{ color: '#888', fontSize: 12 }}>
                      {activeTab.isNew
                        ? 'Unsaved new case'
                        : activeTab.isEditing
                        ? 'Editing'
                        : 'Read-only'}
                    </div>
                    <div className="btns">
                      {activeTab.isEditing ? (
                        <>
                          <button
                            className="btn-secondary"
                            onClick={() => stashTab(activeTab.id)}
                          >
                            Stash
                          </button>
                          <button
                            className="btn-success"
                            onClick={() => saveTab(activeTab.id)}
                            disabled={
                              !activeTab.draft.caseName.trim() ||
                              !activeTab.draft.caseId.trim()
                            }
                          >
                            Save
                          </button>
                          {!activeTab.isNew && (
                            <button
                              className="btn-secondary"
                              onClick={() => {
                                // cancel editing: revert to saved
                                if (activeTab.dirty) {
                                  if (
                                    !window.confirm(
                                      'Discard current changes?'
                                    )
                                  )
                                    return;
                                }
                                updateTab(activeTab.id, {
                                  draft: activeTab.saved,
                                  dirty: false,
                                  isEditing: false,
                                });
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          className="btn-primary"
                          onClick={() =>
                            updateTab(activeTab.id, { isEditing: true })
                          }
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <StatsModal embedded onOpenCase={openCaseById} onDeleteCases={handleDeleteCases} versions={versions} />
          )}
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {modal && <Modal {...modal} />}

      <Toast toast={toast} />
    </div>
  );
}
