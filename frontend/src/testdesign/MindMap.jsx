import React, { useMemo, useRef, useEffect } from 'react';
import { layout, NODE_TYPES } from './mindmap-utils';

// 思维导图渲染：SVG 画连接线，HTML 盒子画节点。零第三方依赖。
// props:
//   root         当前导图根节点
//   selectedId   选中节点 id
//   editingId    正在内联编辑文字的节点 id
//   onSelect(id) 点击节点
//   onStartEdit(id) 双击进入编辑
//   onText(id, text) 编辑提交
//   onToggle(id) 折叠/展开
export default function MindMap({
  root,
  selectedId,
  editingId,
  onSelect,
  onStartEdit,
  onText,
  onToggle,
}) {
  const { nodes, edges, width, height } = useMemo(() => layout(root), [root]);
  const editRef = useRef(null);

  // 进入编辑态时自动聚焦并全选
  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const curve = (e) => {
    const mx = (e.x1 + e.x2) / 2;
    return `M ${e.x1} ${e.y1} C ${mx} ${e.y1}, ${mx} ${e.y2}, ${e.x2} ${e.y2}`;
  };

  return (
    <div className="mm-canvas" style={{ width, height }}>
      <svg className="mm-edges" width={width} height={height}>
        {edges.map((e, i) => (
          <path key={i} d={curve(e)} className="mm-edge" />
        ))}
      </svg>
      {nodes.map(({ node, x, y, w, h }) => {
        const meta = NODE_TYPES[node.type] || NODE_TYPES.root;
        const hasChildren = (node.children || []).length > 0;
        const isEditing = editingId === node.id;
        return (
          <div
            key={node.id}
            className={`mm-node${selectedId === node.id ? ' selected' : ''} mm-type-${node.type}`}
            style={{ left: x, top: y, width: w, minHeight: h, borderColor: meta.color }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(node.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartEdit(node.id);
            }}
            title={meta.label}
          >
            <span className="mm-tag" style={{ background: meta.color }}>
              {meta.tag}
            </span>
            {isEditing ? (
              <textarea
                ref={editRef}
                className="mm-edit"
                defaultValue={node.text}
                rows={1}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => onText(node.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.target.blur();
                  } else if (e.key === 'Escape') {
                    e.target.value = node.text;
                    e.target.blur();
                  }
                }}
              />
            ) : (
              <span className="mm-text">{node.text || <em>(empty)</em>}</span>
            )}
            {hasChildren && (
              <button
                className="mm-toggle"
                title={node.collapsed ? 'Expand' : 'Collapse'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.id);
                }}
              >
                {node.collapsed ? '+' : '−'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
