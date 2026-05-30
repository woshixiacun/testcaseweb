import React, { useEffect } from 'react';

// 类似 vscode 的右键菜单
export default function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    document.addEventListener('click', close);
    document.addEventListener('contextmenu', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
    };
  }, [onClose]);

  // 防止右键菜单超出窗口（简单处理）
  const style = { left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - items.length * 32 - 8) };

  return (
    <div
      className="context-menu"
      style={style}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.sep ? (
          <div className="context-menu-sep" key={`sep-${i}`} />
        ) : (
          <div
            key={it.label}
            className="context-menu-item"
            style={it.danger ? { color: '#c0392b' } : undefined}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            {it.label}
          </div>
        )
      )}
    </div>
  );
}
