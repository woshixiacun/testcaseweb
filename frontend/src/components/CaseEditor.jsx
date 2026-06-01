import React from 'react';
import StatusSelect, { TYPE_META } from './StatusSelect';
import VersionSelect from './VersionSelect';
import RequirementMultiSelect from './RequirementMultiSelect';

export default function CaseEditor({
  data,
  isEditing,
  onChange,
  dirty,
  dirPrefix = '',
  versions = [],
}) {
  // data is tab.draft (editing state). All field changes bubble up via onChange(patch).
  const set = (patch) => onChange(patch);

  // The editable name suffix. Fall back: derive from existing caseName for old cases.
  const suffix =
    data.nameSuffix !== undefined
      ? data.nameSuffix
      : data.caseName && dirPrefix && data.caseName.startsWith(dirPrefix)
      ? data.caseName.slice(dirPrefix.length)
      : data.caseName || '';

  const setSuffix = (val) =>
    set({ nameSuffix: val, caseName: dirPrefix + val });

  // requirements available for the currently selected version
  const selectedVersion = versions.find((v) => v.edition === data.version);
  const reqOptions = selectedVersion ? selectedVersion.requirements || [] : [];

  const updateStep = (i, patch) => {
    const steps = data.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    set({ steps });
  };

  const addStep = () => {
    set({
      steps: [
        ...data.steps,
        { operation: '', expected: '', actualResult: 'pending', actualNote: '' },
      ],
    });
  };

  const delStep = (i) => {
    if (data.steps.length <= 1) return;
    set({ steps: data.steps.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="editor">
      {!isEditing && (
        <div className="read-only-hint">
          Read-only mode. Click "Edit" below to make changes.
        </div>
      )}

      <div className="form-row">
        <label className="req">Case Name</label>
        <div className="case-name-split">
          <input
            type="text"
            className="case-name-prefix"
            value={dirPrefix || '(top level) '}
            disabled
            title={
              dirPrefix
                ? `Auto-filled from the function tree: ${dirPrefix}`
                : 'No folder selected — this case will be created at the top level. Click a folder in the tree to change.'
            }
          />
          <input
            type="text"
            className="case-name-suffix"
            value={suffix}
            placeholder="e.g. case001"
            disabled={!isEditing}
            onChange={(e) => setSuffix(e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <label className="req">Case ID</label>
        <input
          type="text"
          value={data.caseId}
          placeholder="Globally unique ID"
          disabled={!isEditing}
          onChange={(e) => set({ caseId: e.target.value })}
        />
      </div>

      <div className="form-row">
        <label>Version &amp; Requirement</label>
        <div className="req-split">
          <VersionSelect
            value={data.version || ''}
            versions={versions}
            disabled={!isEditing}
            onChange={(v) =>
              // changing version resets the requirement selection
              set({ version: v, requirementDir: '' })
            }
          />
          <RequirementMultiSelect
            value={data.requirementDir || ''}
            options={reqOptions}
            disabled={!isEditing || !selectedVersion}
            onChange={(v) => set({ requirementDir: v })}
          />
        </div>
      </div>

      <div className="form-row">
        <label>Status &amp; Type</label>
        <div className="status-type-row">
          <div className="st-group">
            <span className="st-label">Case Status</span>
            <StatusSelect
              value={data.caseStatus}
              options={['draft', 'pending', 'success', 'fail', 'blocked']}
              disabled={!isEditing}
              onChange={(v) => set({ caseStatus: v })}
            />
          </div>
          <div className="st-group st-type">
            <span className="st-label">Case Type</span>
            <StatusSelect
              value={data.caseType || 'uncategorized'}
              options={['uncategorized', 'manual', 'auto']}
              meta={TYPE_META}
              disabled={!isEditing}
              onChange={(v) => set({ caseType: v })}
            />
          </div>
          <div className="st-group st-iter">
            <span className="st-label">Number of Iteration</span>
            <input
              type="number"
              min="0"
              step="1"
              list="iteration-presets"
              className="iter-input"
              value={data.iterations ?? ''}
              placeholder="e.g. 1"
              disabled={!isEditing}
              onChange={(e) => set({ iterations: e.target.value })}
            />
            <datalist id="iteration-presets">
              <option value="1" />
              <option value="5" />
              <option value="10" />
              <option value="50" />
              <option value="100" />
            </datalist>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ marginBottom: 6 }}>
          <strong>Preconditions</strong>
        </div>
        <textarea
          className="precondition"
          value={data.precondition || ''}
          disabled={!isEditing}
          onChange={(e) => set({ precondition: e.target.value })}
          placeholder="Conditions that must be met before running the steps (optional)"
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ marginBottom: 6 }}>
          <strong>Test Steps</strong>
        </div>

        <table className="steps-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th style={{ width: '28%' }}>Action</th>
              <th style={{ width: '28%' }}>Expected Result</th>
              <th>Actual Result</th>
              {isEditing && <th style={{ width: 50 }}></th>}
            </tr>
          </thead>
          <tbody>
            {data.steps.map((s, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                <td>
                  <textarea
                    value={s.operation}
                    disabled={!isEditing}
                    onChange={(e) => updateStep(i, { operation: e.target.value })}
                    placeholder="Action"
                  />
                </td>
                <td>
                  <textarea
                    value={s.expected}
                    disabled={!isEditing}
                    onChange={(e) => updateStep(i, { expected: e.target.value })}
                    placeholder="Expected result"
                  />
                </td>
                <td>
                  <div className="step-actual-cell">
                    <StatusSelect
                      value={s.actualResult || 'pending'}
                      options={['pending', 'success', 'fail', 'blocked']}
                      disabled={!isEditing}
                      onChange={(v) => updateStep(i, { actualResult: v })}
                    />
                    <textarea
                      value={s.actualNote}
                      disabled={!isEditing}
                      onChange={(e) =>
                        updateStep(i, { actualNote: e.target.value })
                      }
                      placeholder="Actual result notes"
                    />
                  </div>
                </td>
                {isEditing && (
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="step-del"
                      disabled={data.steps.length <= 1}
                      onClick={() => delStep(i)}
                      title="Delete this step"
                    >
                      🗑
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {isEditing && (
          <button
            className="btn-primary"
            onClick={addStep}
            style={{
              marginTop: 10,
              padding: '6px 14px',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              color: 'white',
            }}
          >
            + Add Step
          </button>
        )}
      </div>

      {dirty && (
        <div style={{ marginTop: 16 }} className="required-hint">
          Unsaved changes
        </div>
      )}
    </div>
  );
}
