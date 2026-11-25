// 字段按目标表字段类型渲染（链接列内嵌同款选择器；附件/签名列不在此对话框内设置，建后可在记录详情补）。
// 提交后由宿主创建记录（onSubmit(cells)）并完成链接，成功关闭、失败留框报错。
import React, { useState } from 'react';
import { Button, DatePicker, Input, InputNumber, Modal, Select, Switch, message } from 'antd';
import dayjs from 'dayjs';
import MsIcon from '@/components/MsIcon';
import { LinkRecordPicker, recordColumns } from './LinkPicker';

const SKIP_TYPES = new Set([
  'formula', 'link_formula', 'created_at', 'updated_at', 'created_by', 'updated_by',
  'auto_number', 'button', 'attachment', 'signature',
]);

export default function AddLinkRecordDialog({
  field, linkData, members, prefill, onCancel, onSubmit, addEmptyRecord,
}) {
  const ld = linkData?.[field.id] || {};
  const tFields = (ld.targetFields || []).filter((f) => !SKIP_TYPES.has(f.type));
  const { dispField } = recordColumns(field, linkData);
  const [cells, setCells] = useState(() => {
    const init = {};
    if (prefill && dispField && ['text', 'long_text'].includes(dispField.type)) init[dispField.id] = prefill;
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);
  const set = (fid, v) => setCells((prev) => ({ ...prev, [fid]: v }));

  const submit = async () => {
    const out = {};
    Object.entries(cells).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (Array.isArray(v) && !v.length) return;
      out[k] = v;
    });
    setBusy(true);
    try {
      await onSubmit(out);
    } catch (e) {
      message.error(e?.message || '新建记录失败');
      setBusy(false);
    }
  };

  const editorFor = (f) => {
    const v = cells[f.id];
    switch (f.type) {
      case 'long_text':
        return <Input.TextArea rows={3} value={v || ''} onChange={(e) => set(f.id, e.target.value)} />;
      case 'number':
        return <InputNumber style={{ width: '100%' }} value={v ?? null} onChange={(nv) => set(f.id, nv ?? undefined)} />;
      case 'select':
        return (
          <Select
            style={{ width: '100%' }} allowClear value={v} placeholder="请选择"
            onChange={(nv) => set(f.id, nv)}
            options={(f.config?.options || []).map((o) => ({ value: o.id, label: o.label }))}
          />
        );
      case 'multiselect':
        return (
          <Select
            style={{ width: '100%' }} mode="multiple" allowClear value={v || []} placeholder="请选择"
            onChange={(nv) => set(f.id, nv)}
            options={(f.config?.options || []).map((o) => ({ value: o.id, label: o.label }))}
          />
        );
      case 'date': {
        const isDT = f.config?.precision === 'minute';
        const dv = v ? dayjs(String(v).replace(' ', 'T')) : null;
        return (
          <DatePicker
            style={{ width: '100%' }} value={dv && dv.isValid() ? dv : null}
            format={isDT ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'}
            showTime={isDT ? { format: 'HH:mm' } : false}
            onChange={(d) => set(f.id, d ? (isDT ? d.toISOString() : d.format('YYYY-MM-DD')) : undefined)}
          />
        );
      }
      case 'checkbox':
        return <Switch checked={!!v} onChange={(nv) => set(f.id, nv)} />;
      case 'member':
        return (
          <Select
            style={{ width: '100%' }} allowClear showSearch value={v} placeholder="请选择成员"
            optionFilterProp="label" onChange={(nv) => set(f.id, nv)}
            options={(members || []).map((m) => ({ value: m.uid, label: m.name }))}
          />
        );
      case 'rating': {
        const max = Math.min(f.config?.max || 5, 10);
        return (
          <Select
            style={{ width: '100%' }} allowClear value={v} placeholder="请选择"
            onChange={(nv) => set(f.id, nv)}
            options={Array.from({ length: max }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
          />
        );
      }
      case 'link': {
        const ids = v || [];
        const labels = linkData?.[f.id]?.labels || {};
        const one = !!f.config?.limitOne;
        return (
          <div>
            <div className="zt-dtl-linkcards">
              {ids.map((id) => (
                <span key={id} className="zt-link-card">
                  <span>{labels[id] || '（未命名）'}</span>
                  <span className="zt-link-card-x" title="取消链接" onClick={() => set(f.id, ids.filter((x) => x !== id))}>
                    <MsIcon name="close" size={13} />
                  </span>
                </span>
              ))}
              {addEmptyRecord && (
                <button
                  type="button" className="zt-dtl-linkadd"
                  onClick={async () => {
                    try {
                      const nid = await addEmptyRecord(f);
                      if (nid) set(f.id, one ? [nid] : [...ids, nid]);
                    } catch (e) { /* 宿主已提示 */ }
                  }}
                >
                  <MsIcon name="add" size={15} />添加记录
                </button>
              )}
              {!f.config?.hideLinkBtn && (
                <button type="button" className="zt-dtl-linkadd" onClick={() => setPickerFor(pickerFor === f.id ? null : f.id)}>
                  <MsIcon name="add_link" size={15} />链接已有记录
                </button>
              )}
            </div>
            {pickerFor === f.id && (
              <div className="zt-adddlg-picker">
                <LinkRecordPicker
                  field={f} value={ids} linkData={linkData} members={members}
                  onToggle={(id) => set(f.id, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])}
                  onPickOne={(id) => { set(f.id, [id]); setPickerFor(null); }}
                  onClose={() => setPickerFor(null)}
                />
              </div>
            )}
          </div>
        );
      }
      default:
        return <Input value={v || ''} onChange={(e) => set(f.id, e.target.value)} />;
    }
  };

  return (
    <Modal
      title="增加链接记录" open width={560} zIndex={1400}
      onCancel={onCancel}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button
            type="primary" loading={busy} onClick={submit}
            style={{ background: '#ff8000', borderColor: '#ff8000' }}
          >提交</Button>
        </div>
      )}
    >
      <div className="zt-adddlg-form">
        {tFields.map((f) => (
          <div key={f.id} className="zt-adddlg-row">
            <div className="zt-adddlg-label">{f.name}</div>
            <div className="zt-adddlg-control">{editorFor(f)}</div>
          </div>
        ))}
        {tFields.length === 0 && <div className="zt-dtl-noopt">目标子表没有可填写的列</div>}
      </div>
    </Modal>
  );
}
