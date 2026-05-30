import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import MindMap from './MindMap';
import ArchiveDialog from './ArchiveDialog';
import {
  makeNode,
  findNode,
  findParent,
  patchNode,
  addChild,
  addSiblingAfter,
  removeNode,
  moveNode,
  setAllCollapsed,
  collectArchivable,
  layout,
  ALLOWED_CHILDREN,
  NODE_TYPES,
} from './mindmap-utils';
import './testdesign.css';

// 测试设计主视图（受控）。脑图的目录树与持久化由 App 管理：
//   map         当前打开的脑图 { id, name, root }（无则显示空态）
//   onChangeRoot(designId, newRoot)  编辑脑图回调
//   onArchive(payload)               归档成 case
//   onNewMap()                       新建脑图（落到 Designs 树）
//   showToast(msg, type)
export default function TestDesignView({ map, onChangeRoot, onArchive, onNewMap, showToast }) {
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  // 画布平移偏移（无边画布：拖动背景即平移）
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const activeDesign = map || null;

  // 缩放：限制在 30%~200%，步进 10%
  const ZOOM_MIN = 0.3;
  const ZOOM_MAX = 2;
  const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  const bump = (delta) => setZoom((z) => clampZoom(Math.round((z + delta) * 100) / 100));
  const zoomIn = () => bump(0.1);
  const zoomOut = () => bump(-0.1);
  const zoomReset = () => setZoom(1);
  // Fit：根据可视区与内容尺寸算出合适缩放，并把平移复位，使整张图从左上可见
  const fitToView = () => {
    const el = canvasRef.current;
    if (!el || !activeDesign) return;
    const { width, height } = layout(activeDesign.root);
    if (!width || !height) return;
    const avail = el.clientWidth - 24;
    const availH = el.clientHeight - 24;
    const z = clampZoom(Math.min(avail / width, availH / height));
    setZoom(Math.round(z * 100) / 100);
    setPan({ x: 0, y: 0 });
  };

  // 鼠标滚轮：普通滚轮平移画布，Ctrl/⌘ + 滚轮缩放。
  // React 的 onWheel 是 passive，preventDefault 无效，故用原生非 passive 监听。
  const canvasRef = useRef(null);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        bump(-Math.sign(e.deltaY) * 0.1);
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [activeDesign?.id]);

  // 拖动背景平移画布（无边画布）。在节点上小幅点击仍是选中/编辑，
  // 一旦移动超过阈值即视为平移，并抑制随后的 click，避免误选节点。
  const onCanvasMouseDown = (e) => {
    if (e.button !== 0) return;
    // 编辑文字 / 悬浮缩放按钮上不触发平移
    if (e.target.closest('.mm-edit') || e.target.closest('.td-zoom-float')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = pan;
    let moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) setIsPanning(true);
      moved = true;
      setPan({ x: startPan.x + dx, y: startPan.y + dy });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setIsPanning(false);
      if (moved) {
        // 抑制拖动结束后浏览器补发的那次 click，避免选中/取消选中节点
        const suppress = (ce) => ce.stopPropagation();
        window.addEventListener('click', suppress, { capture: true, once: true });
        setTimeout(
          () => window.removeEventListener('click', suppress, { capture: true }),
          0
        );
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const toast = useCallback(
    (msg, type) => (showToast ? showToast(msg, type) : null),
    [showToast]
  );

  // 切换脑图时清掉选中/编辑/平移，避免串台
  useEffect(() => {
    setSelectedId(null);
    setEditingId(null);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [activeDesign?.id]);

  // 更新当前导图的 root（交给 App 持久化）
  const updateRoot = (newRoot) => {
    if (!activeDesign || !onChangeRoot) return;
    onChangeRoot(activeDesign.id, newRoot);
  };

  // 当前选中节点
  const selectedNode = activeDesign ? findNode(activeDesign.root, selectedId) : null;

  // ---------- 节点操作 ----------
  // 给选中节点加一个指定类型的子节点
  const addChildNode = (type) => {
    if (!activeDesign || !selectedNode) return;
    const allowed = ALLOWED_CHILDREN[selectedNode.type] || [];
    if (!allowed.includes(type)) {
      toast(`Cannot add ${NODE_TYPES[type].label} directly under ${NODE_TYPES[selectedNode.type].label}`, 'error');
      return;
    }
    const child = makeNode(type);
    updateRoot(addChild(activeDesign.root, selectedNode.id, child));
    setSelectedId(child.id);
    setEditingId(child.id);
  };

  // 在选中节点后加一个同类型的同级节点
  const addSibling = () => {
    if (!activeDesign || !selectedNode || selectedNode.type === 'root') return;
    const node = makeNode(selectedNode.type);
    updateRoot(addSiblingAfter(activeDesign.root, selectedNode.id, node));
    setSelectedId(node.id);
    setEditingId(node.id);
  };

  // 给选中节点加它「下一层级」的第一种允许子类型（Ins 键 / 工具栏「新增子节点」）
  const addDefaultChild = () => {
    if (!selectedNode) return;
    const allowed = ALLOWED_CHILDREN[selectedNode.type] || [];
    if (allowed.length === 0) {
      toast(`${NODE_TYPES[selectedNode.type].label} cannot have child nodes`, 'error');
      return;
    }
    addChildNode(allowed[0]);
  };

  const deleteSelected = () => {
    if (!activeDesign || !selectedNode || selectedNode.type === 'root') return;
    const parent = findParent(activeDesign.root, selectedNode.id);
    updateRoot(removeNode(activeDesign.root, selectedNode.id));
    setSelectedId(parent ? parent.id : activeDesign.root.id);
  };

  const move = (dir) => {
    if (!activeDesign || !selectedNode) return;
    updateRoot(moveNode(activeDesign.root, selectedNode.id, dir));
  };

  const setText = (id, text) => {
    if (!activeDesign) return;
    updateRoot(patchNode(activeDesign.root, id, { text }));
    setEditingId(null);
  };

  const toggleCollapse = (id) => {
    if (!activeDesign) return;
    const node = findNode(activeDesign.root, id);
    updateRoot(patchNode(activeDesign.root, id, { collapsed: !node.collapsed }));
  };

  const expandAll = () => activeDesign && updateRoot(setAllCollapsed(activeDesign.root, false));
  const collapseAll = () => activeDesign && updateRoot(setAllCollapsed(activeDesign.root, true));

  // ---------- 键盘快捷键 ----------
  const containerRef = useRef(null);
  const onKeyDown = (e) => {
    // 编辑文字时不拦截
    if (editingId) return;
    // 缩放快捷键（Ctrl/⌘ + +/-/0），不依赖选中节点
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        zoomReset();
        return;
      }
    }
    if (!selectedNode) return;
    if (e.key === 'Insert' || e.key === 'Tab') {
      e.preventDefault();
      addDefaultChild();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      addSibling();
    } else if (e.key === 'Delete') {
      e.preventDefault();
      deleteSelected();
    } else if (e.key === 'F2') {
      e.preventDefault();
      setEditingId(selectedNode.id);
    }
  };

  // ---------- 归档 ----------
  const archivable = useMemo(
    () => (activeDesign ? collectArchivable(activeDesign.root) : []),
    [activeDesign]
  );

  const handleArchiveConfirm = async ({ folderName, selectedItems }) => {
    setArchiveOpen(false);
    if (!onArchive) return;
    try {
      const n = await onArchive({ folderName, items: selectedItems });
      toast(`Archived ${n} case(s) to "${folderName}"`, 'success');
    } catch (e) {
      toast('Archive failed: ' + (e.error || e.message || ''), 'error');
    }
  };

  const allowedChildTypes = selectedNode
    ? ALLOWED_CHILDREN[selectedNode.type] || []
    : [];

  return (
    <div
      className="td-root"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={() => setSelectedId(activeDesign ? activeDesign.root.id : null)}
    >
      {/* 顶部工具栏 */}
      <div className="td-toolbar" onClick={(e) => e.stopPropagation()}>
        <div className="td-tool-group">
          <button onClick={() => onNewMap && onNewMap()} title="Create a new mind map">
            ＋ New Map
          </button>
          {activeDesign && (
            <span className="td-current-map" title="Current mind map (manage maps in the left Designs tree)">
              {activeDesign.name}
            </span>
          )}
        </div>

        {activeDesign && (
          <>
            <div className="td-tool-sep" />
            <div className="td-tool-group">
              {/* 按节点类型加子节点：根据当前选中节点动态启用 */}
              {['submap', 'scenario', 'point', 'precondition', 'step', 'expected'].map((type) => {
                const meta = NODE_TYPES[type];
                const enabled = allowedChildTypes.includes(type);
                return (
                  <button
                    key={type}
                    className="td-add-btn"
                    style={enabled ? { borderColor: meta.color, color: meta.color } : undefined}
                    disabled={!enabled}
                    onClick={() => addChildNode(type)}
                    title={`Add ${meta.label} under the selected node`}
                  >
                    +{meta.label}
                  </button>
                );
              })}
            </div>

            <div className="td-tool-sep" />
            <div className="td-tool-group">
              <button onClick={() => move(-1)} disabled={!selectedNode} title="Move up (same level)">↑ Up</button>
              <button onClick={() => move(1)} disabled={!selectedNode} title="Move down (same level)">↓ Down</button>
              <button onClick={expandAll} title="Expand all">Expand</button>
              <button onClick={collapseAll} title="Collapse all">Collapse</button>
              <button
                className="td-danger"
                onClick={deleteSelected}
                disabled={!selectedNode || selectedNode?.type === 'root'}
                title="Delete selected node (Del)"
              >
                Delete Node
              </button>
            </div>

            <div className="td-tool-spacer" />
            <button
              className="btn-success td-archive-btn"
              onClick={() => setArchiveOpen(true)}
              title="Archive test points into test cases"
            >
              Archive Cases
            </button>
          </>
        )}
      </div>

      {/* 画布 */}
      {!activeDesign ? (
        <div className="td-empty">
          <p>No mind map yet. Click "＋ New Map" in the top-left to start designing tests.</p>
          <p className="td-empty-hint">
            Hierarchy: Scenario(SC) → Test Point(TP) → Precondition(CO) / Step(ST) → Expected(EX).
            <br />
            Shortcuts: Ins/Tab add child, Enter add sibling, F2 rename, Del delete. Ctrl + scroll to zoom.
          </p>
        </div>
      ) : (
        <div
          className={`td-canvas-wrap${isPanning ? ' td-panning' : ''}`}
          ref={canvasRef}
          onMouseDown={onCanvasMouseDown}
          onClick={(e) => e.stopPropagation()}
          style={{ backgroundPosition: `${pan.x}px ${pan.y}px` }}
        >
          <div
            className="td-canvas-pan"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: '0 0' }}
          >
            <div className="td-canvas-scale" style={{ zoom }}>
              <MindMap
                root={activeDesign.root}
                selectedId={selectedId}
                editingId={editingId}
                onSelect={setSelectedId}
                onStartEdit={setEditingId}
                onText={setText}
                onToggle={toggleCollapse}
              />
            </div>
          </div>
        </div>
      )}

      {/* 悬浮缩放控件：固定在视图左下角，竖排 放大/缩小/Fit */}
      {activeDesign && (
        <div className="td-zoom-float" onClick={(e) => e.stopPropagation()}>
          <button onClick={zoomIn} title="Zoom in (Ctrl + +)">＋</button>
          <button onClick={zoomOut} title="Zoom out (Ctrl + -)">−</button>
          <button className="td-zoom-fit" onClick={fitToView} title="Fit to view">Fit</button>
        </div>
      )}

      {archiveOpen && (
        <ArchiveDialog
          items={archivable}
          defaultFolderName={activeDesign?.name}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={handleArchiveConfirm}
        />
      )}
    </div>
  );
}


