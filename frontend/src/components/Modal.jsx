import React, { useEffect, useState } from 'react';

// 简单的输入弹窗 / 确认弹窗
export default function Modal({
  title,
  message,
  defaultValue,
  placeholder,
  needInput,
  confirmText = 'OK',
  cancelText = 'Cancel',
  extraButtons = [],
  onClose,
  onConfirm,
}) {
  const [value, setValue] = useState(defaultValue || '');
  const [error, setError] = useState('');

  useEffect(() => {
    setValue(defaultValue || '');
  }, [defaultValue]);

  const handleConfirm = () => {
    if (needInput && !value.trim()) {
      setError('Please enter a name');
      return;
    }
    onConfirm(needInput ? value.trim() : true);
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        {needInput && (
          <>
            <input
              autoFocus
              value={value}
              placeholder={placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
            />
            {error && (
              <div className="required-hint" style={{ marginTop: -10, marginBottom: 10 }}>
                {error}
              </div>
            )}
          </>
        )}
        <div className="modal-buttons">
          {extraButtons.map((b, i) => (
            <button
              key={i}
              className={b.className || 'btn-secondary'}
              onClick={b.onClick}
              style={{ padding: '7px 16px', border: 'none', borderRadius: 3, cursor: 'pointer' }}
            >
              {b.label}
            </button>
          ))}
          <button
            className="btn-secondary"
            onClick={onClose}
            style={{ padding: '7px 16px', border: 'none', borderRadius: 3, cursor: 'pointer' }}
          >
            {cancelText}
          </button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            style={{ padding: '7px 16px', border: 'none', borderRadius: 3, cursor: 'pointer' }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
