import React, { useState } from 'react';
import { STATUS_META } from './StatusSelect';

// 递归统计某节点下（含子孙）的 case 数量
function countCases(node) {
  if (!node) return 0;
  if (node.type === 'case') return 1;
  if (!node.children) return 0;
  let n = 0;
  for (const c of node.children) n += countCases(c);
  return n;
}

export default function TreeView({
  tree,
  selectedId,
  selectedFolderId,
  onSelect,
  onSelectFolder,
  onContextMenu,
  onBlankContextMenu,
  onMove,
}) {
  // 当前正在拖拽的节点 id，以及当前被悬停的放置目标（'root' 或某文件夹 id）
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const handleDropToRoot = (e) => {
    e.preventDefault();
    if (dragId) onMove(dragId, null);
    setDragId(null);
    setDropTarget(null);
  };

  const blankProps = {
    onClick: (e) => {
      // 点击树面板空白处：取消文件夹选中态（后续 + New Case 落到根）
      if (e.target === e.currentTarget && onSelectFolder) {
        onSelectFolder(null);
      }
    },
    onContextMenu: (e) => {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        onBlankContextMenu(e);
      }
    },
    onDragOver: (e) => {
      if (dragId) {
        e.preventDefault();
        if (e.target === e.currentTarget) setDropTarget('root');
      }
    },
    onDrop: (e) => {
      if (e.target === e.currentTarget) handleDropToRoot(e);
    },
  };

  if (!tree || tree.length === 0) {
    return (
      <div
        className={`tree-blank${dropTarget === 'root' ? ' drop-root' : ''}`}
        {...blankProps}
      >
        <div style={{ padding: 20, color: '#999', fontSize: 13 }}>
          Right-click here to add a folder or case
        </div>
      </div>
    );
  }

  return (
    <div
      className={`tree-blank${dropTarget === 'root' ? ' drop-root' : ''}`}
      {...blankProps}
    >
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          level={0}
          selectedId={selectedId}
          selectedFolderId={selectedFolderId}
          onSelect={onSelect}
          onSelectFolder={onSelectFolder}
          onContextMenu={onContextMenu}
          dragId={dragId}
          setDragId={setDragId}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          onMove={onMove}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  level,
  selectedId,
  selectedFolderId,
  onSelect,
  onSelectFolder,
  onContextMenu,
  dragId,
  setDragId,
  dropTarget,
  setDropTarget,
  onMove,
}) {
  const isFolder = node.type === 'folder';
  const isArchiveFolder = isFolder && node.archive === true;
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedId === node.id;
  const isFolderSelected = isFolder && selectedFolderId === node.id;
  const isDropHover = dropTarget === node.id;
  const isDragging = dragId === node.id;

  return (
    <div>
      <div
        className={`tree-node${isSelected ? ' selected' : ''}${
          isFolderSelected ? ' folder-selected' : ''
        }${isDropHover ? ' drop-hover' : ''}${isDragging ? ' dragging' : ''}${
          isArchiveFolder ? ' archive-folder' : ''
        }`}
        style={{ paddingLeft: 6 + level * 14 }}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          setDragId(node.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          setDragId(null);
          setDropTarget(null);
        }}
        onDragOver={(e) => {
          // 只有文件夹能作为放置目标
          if (dragId && dragId !== node.id && isFolder) {
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(node.id);
          }
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          if (dropTarget === node.id) setDropTarget(null);
        }}
        onDrop={(e) => {
          if (dragId && isFolder) {
            e.preventDefault();
            e.stopPropagation();
            onMove(dragId, node.id);
            setExpanded(true);
            setDragId(null);
            setDropTarget(null);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isFolder) {
            // 点击文件夹：标记为当前选中位置（再点一次取消）；同时切换展开
            if (onSelectFolder) onSelectFolder(node.id);
            setExpanded((v) => !v);
          } else {
            onSelect(node);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, node);
        }}
      >
        <span className="caret">
          {isFolder ? (expanded ? '▾' : '▸') : ''}
        </span>
        {isFolder ? (
          <span>📁</span>
        ) : node.type === 'design' ? (
          <span className="tree-design-icon" title="Mind map">🧠</span>
        ) : (
          <span
            className="case-status-dot"
            title={(STATUS_META[node.status] || STATUS_META.pending).label}
            style={{
              background: (STATUS_META[node.status] || STATUS_META.pending)
                .color,
            }}
          />
        )}
        <span>{node.name}</span>
        {/* 文件夹右侧用一个小徽标显示其下（含子孙）case 数量。0 时不显示，避免视觉噪音。 */}
        {isFolder && (() => {
          const n = countCases(node);
          return n > 0 ? (
            <span className="folder-count" title={`${n} case(s) under this folder`}>
              {n}
            </span>
          ) : null;
        })()}
      </div>
      {isFolder && expanded && node.children && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              level={level + 1}
              selectedId={selectedId}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onSelectFolder={onSelectFolder}
              onContextMenu={onContextMenu}
              dragId={dragId}
              setDragId={setDragId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
