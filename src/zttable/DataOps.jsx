// 宿主经 api 注入后端：list/create/update/remove/run(op,rowIds)/listTables/listViews/getFields/resolveViewRowIds。
// 操作：计算总和/求差值/计算百分比/计算排名/提取用户名/比较和复制/自动添加链接。
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Modal, Select, message } from 'antd';
import MsIcon from '@/components/MsIcon';
import { isReadonlyType } from './fields';

export const DATA_OP_KINDS = [
  { key: 'add_link', label: '自动添加链接', desc: '根据匹配规则自动在两个子表之间添加链接' },
  { key: 'cumulative_sum', label: '计算总和', desc: '将第一行到当前行的所有值相加' },
  { key: 'diff', label: '求差值', desc: '计算每一行与前一行的差值' },
  { key: 'percent', label: '计算百分比', desc: '计算每行占列总数的百分比' },
  { key: 'rank', label: '计算排名', desc: '根据一列计算排名，并将结果写入另一列' },
  { key: 'extract_username', label: '提取用户名', desc: '从列类型为协作人列、创建人列和最后修改人列中提取用户名' },
  { key: 'compare_copy', label: '比较和复制', desc: '比较两个子表中的行，并在匹配时将一个或多个列值从源子表的行复制到结果子表的行' },
];
const kindLabel = (k) => (DATA_OP_KINDS.find((x) => x.key === k) || {}).label || k;

const NUM_SRC = ['number', 'duration', 'rating'];
const writable = (f) => !isReadonlyType(f.type) && f.type !== 'attachment';

function OpEditor({ api, fields, op, onClose, onSaved }) {
  const [name, setName] = useState(op?.name || '未命名');
  const [kind, setKind] = useState(op?.kind || null);
  const [cfg, setCfg] = useState(op?.config || {});
  const [tables, setTables] = useState([]);
  const [views, setViews] = useState([]);
  const [srcFields, setSrcFields] = useState([]);
  const [otherFields, setOtherFields] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  useEffect(() => { api.listTables().then(setTables).catch(() => {}); api.listViews().then(setViews).catch(() => {}); }, []); // eslint-disable-line
  useEffect(() => {
    if (kind === 'compare_copy' && cfg.sourceTableId) {
      api.getFields(cfg.sourceTableId).then(setSrcFields).catch(() => setSrcFields([]));
    }
  }, [kind, cfg.sourceTableId]); // eslint-disable-line
  useEffect(() => {
    if (kind === 'add_link' && cfg.otherTableId) {
      api.getFields(cfg.otherTableId).then(setOtherFields).catch(() => setOtherFields([]));
    }
  }, [kind, cfg.otherTableId]); // eslint-disable-line

  const numSrcFields = fields.filter((f) => NUM_SRC.includes(f.type));
  const rankSrcFields = fields.filter((f) => NUM_SRC.includes(f.type) || f.type === 'date');
  const numTgtFields = fields.filter((f) => f.type === 'number' && writable(f));
  const txtTgtFields = fields.filter((f) => (f.type === 'text' || f.type === 'longtext') && writable(f));
  const extractSrcFields = [
    ...fields.filter((f) => f.type === 'member'),
    { id: 'created_by', name: '创建人' },
    { id: 'updated_by', name: '最后修改人' },
  ];
  const sel = (list) => list.map((f) => ({ value: f.id, label: f.name }));

  const save = async (runAfter) => {
    if (!kind) { message.warning('请选择一个操作'); return; }
    setBusy(true);
    try {
      let saved = op;
      const body = { name: name || '未命名', kind, config: cfg };
      if (op?.id) { await api.update(op.id, body); saved = { ...op, ...body }; }
      else { const r = await api.create(body); saved = { ...body, id: r.id }; }
      if (runAfter) {
        const rowIds = cfg.viewId && api.resolveViewRowIds ? await api.resolveViewRowIds(cfg.viewId) : null;
        const res = await api.run(saved, rowIds);
        message.success(`运行完成，更新了 ${res?.updated ?? 0} 行`);
      } else {
        message.success('已保存');
      }
      onSaved();
      onClose();
    } catch (e) {
      message.error(e.message || '保存失败');
    } finally { setBusy(false); }
  };

  const matchPairs = cfg.matchPairs || [];
  const copyPairs = cfg.copyPairs || [];
  const linkConds = cfg.linkConds || [];
  const linkFieldOpts = [
    ...fields.filter((f) => f.type === 'link' && f.config?.targetTableId === cfg.otherTableId)
      .map((f) => ({ value: f.id, label: f.name })),
    ...otherFields.filter((f) => f.type === 'link')
      .map((f) => ({ value: f.id, label: `${f.name}（在另一个子表）` })),
  ];
  return (
    <Modal open title={op ? '编辑数据处理操作' : '增加数据处理操作'} onCancel={onClose} width={560}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="run" type="primary" loading={busy} onClick={() => save(true)}>运行</Button>,
        <Button key="save" type="primary" loading={busy} onClick={() => save(false)}>保存</Button>,
      ]}>
      <div className="zt-op-form">
        <div className="zt-op-row"><span className="zt-op-label">名称</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} /></div>
        <div className="zt-op-row"><span className="zt-op-label">操作</span>
          <Select style={{ width: '100%' }} placeholder="请选择一个操作" value={kind} onChange={setKind}
            options={DATA_OP_KINDS.map((k) => ({
              value: k.key, disabled: k.disabled,
              label: k.disabled ? `${k.label}（即将上线，敬请期待）` : k.label,
            }))} /></div>
        {kind && <div className="zt-op-note">{(DATA_OP_KINDS.find((k) => k.key === kind) || {}).desc}</div>}

        {(kind === 'cumulative_sum' || kind === 'diff' || kind === 'percent' || kind === 'rank') && (
          <>
            <div className="zt-op-row"><span className="zt-op-label">视图</span>
              <Select style={{ width: '100%' }} placeholder="选择视图（决定处理行与行序）" value={cfg.viewId} allowClear
                onChange={(v) => set({ viewId: v })} options={views.map((v) => ({ value: v.id, label: v.name }))} /></div>
            <div className="zt-op-row"><span className="zt-op-label">源列</span>
              <Select style={{ width: '100%' }} placeholder="选择一个列" value={cfg.sourceFieldId}
                onChange={(v) => set({ sourceFieldId: v })}
                options={sel(kind === 'rank' ? rankSrcFields : numSrcFields)} /></div>
            <div className="zt-op-row"><span className="zt-op-label">结果列</span>
              <Select style={{ width: '100%' }} placeholder="选择一个列" value={cfg.targetFieldId}
                onChange={(v) => set({ targetFieldId: v })} options={sel(numTgtFields)} /></div>
            {kind === 'rank' && (
              <div className="zt-op-row"><span className="zt-op-label">排序方式</span>
                <Select style={{ width: '100%' }} value={cfg.order || 'desc'} onChange={(v) => set({ order: v })}
                  options={[{ value: 'desc', label: '数值大的排在前面' }, { value: 'asc', label: '数值小的排在前面' }]} /></div>
            )}
          </>
        )}

        {kind === 'extract_username' && (
          <>
            <div className="zt-op-row"><span className="zt-op-label">视图</span>
              <Select style={{ width: '100%' }} placeholder="选择视图（决定处理行）" value={cfg.viewId} allowClear
                onChange={(v) => set({ viewId: v })} options={views.map((v) => ({ value: v.id, label: v.name }))} /></div>
            <div className="zt-op-row"><span className="zt-op-label">选择要提取的列</span>
              <Select style={{ width: '100%' }} placeholder="选择一个列" value={cfg.sourceFieldId}
                onChange={(v) => set({ sourceFieldId: v })} options={sel(extractSrcFields)} /></div>
            <div className="zt-op-row"><span className="zt-op-label">结果列</span>
              <Select style={{ width: '100%' }} placeholder="选择一个列" value={cfg.targetFieldId}
                onChange={(v) => set({ targetFieldId: v })} options={sel(txtTgtFields)} /></div>
          </>
        )}

        {kind === 'add_link' && (
          <>
            <div className="zt-op-row"><span className="zt-op-label">另一个子表</span>
              <Select style={{ width: '100%' }} placeholder="选择子表" value={cfg.otherTableId}
                onChange={(v) => set({ otherTableId: v, linkFieldId: undefined, linkConds: [] })}
                options={tables.map((t) => ({ value: t.id, label: t.name }))} /></div>
            <div className="zt-op-row"><span className="zt-op-label">链接列</span>
              <Select style={{ width: '100%' }} placeholder={cfg.otherTableId ? '选择链接列' : '先选择另一个子表'} value={cfg.linkFieldId}
                onChange={(v) => set({ linkFieldId: v })} options={linkFieldOpts} /></div>
            {cfg.otherTableId && linkFieldOpts.length === 0 && (
              <div className="zt-op-note">两个子表之间还没有链接列，请先在任一子表创建「链接其他记录」列。</div>
            )}
            {linkConds.map((p, i) => (
              <div className="zt-op-row zt-op-pair" key={`l${i}`}><span className="zt-op-label">{i === 0 ? '如果列' : ''}</span>
                <Select style={{ width: 130 }} placeholder="本表列" value={p.thisFieldId}
                  onChange={(v) => { const n = [...linkConds]; n[i] = { ...p, thisFieldId: v }; set({ linkConds: n }); }}
                  options={sel(fields)} />
                <span>等于</span>
                <Select style={{ width: 130 }} placeholder="对方列" value={p.otherFieldId}
                  onChange={(v) => { const n = [...linkConds]; n[i] = { ...p, otherFieldId: v }; set({ linkConds: n }); }}
                  options={sel(otherFields)} />
                <button className="zt-icon-btn" onClick={() => set({ linkConds: linkConds.filter((_, j) => j !== i) })}><MsIcon name="close" size={15} /></button>
              </div>
            ))}
            <div className="zt-op-row zt-op-pair"><span className="zt-op-label" />
              <Button size="small" type="link" disabled={!cfg.otherTableId}
                onClick={() => set({ linkConds: [...linkConds, {}] })}>+ 增加匹配条件</Button></div>
          </>
        )}

        {kind === 'compare_copy' && (
          <>
            <div className="zt-op-row"><span className="zt-op-label">从子表</span>
              <Select style={{ width: '100%' }} placeholder="选择子表" value={cfg.sourceTableId}
                onChange={(v) => set({ sourceTableId: v, matchPairs: [], copyPairs: [] })}
                options={tables.map((t) => ({ value: t.id, label: t.name }))} /></div>
            {matchPairs.map((p, i) => (
              <div className="zt-op-row zt-op-pair" key={`m${i}`}><span className="zt-op-label">{i === 0 ? '如果列' : ''}</span>
                <Select style={{ width: 130 }} placeholder="选择列" value={p.sourceFieldId}
                  onChange={(v) => { const n = [...matchPairs]; n[i] = { ...p, sourceFieldId: v }; set({ matchPairs: n }); }}
                  options={sel(srcFields)} />
                <span>等于</span>
                <Select style={{ width: 130 }} placeholder="选择列" value={p.targetFieldId}
                  onChange={(v) => { const n = [...matchPairs]; n[i] = { ...p, targetFieldId: v }; set({ matchPairs: n }); }}
                  options={sel(fields)} />
                <button className="zt-icon-btn" onClick={() => set({ matchPairs: matchPairs.filter((_, j) => j !== i) })}><MsIcon name="close" size={15} /></button>
              </div>
            ))}
            <div className="zt-op-row zt-op-pair"><span className="zt-op-label" />
              <Button size="small" type="link" disabled={!cfg.sourceTableId}
                onClick={() => set({ matchPairs: [...matchPairs, {}] })}>+ 增加匹配条件</Button></div>
            {copyPairs.map((p, i) => (
              <div className="zt-op-row zt-op-pair" key={`c${i}`}><span className="zt-op-label">{i === 0 ? '复制列' : ''}</span>
                <Select style={{ width: 130 }} placeholder="选择列" value={p.fromFieldId}
                  onChange={(v) => { const n = [...copyPairs]; n[i] = { ...p, fromFieldId: v }; set({ copyPairs: n }); }}
                  options={sel(srcFields)} />
                <span>→ 到列</span>
                <Select style={{ width: 130 }} placeholder="选择列" value={p.toFieldId}
                  onChange={(v) => { const n = [...copyPairs]; n[i] = { ...p, toFieldId: v }; set({ copyPairs: n }); }}
                  options={sel(fields.filter(writable))} />
                <button className="zt-icon-btn" onClick={() => set({ copyPairs: copyPairs.filter((_, j) => j !== i) })}><MsIcon name="close" size={15} /></button>
              </div>
            ))}
            <div className="zt-op-row zt-op-pair"><span className="zt-op-label" />
              <Button size="small" type="link" disabled={!cfg.sourceTableId}
                onClick={() => set({ copyPairs: [...copyPairs, {}] })}>+ 增加复制列</Button></div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function DataOpsPanel({ api, fields, onChanged }) {
  const [ops, setOps] = useState(null);
  const [editing, setEditing] = useState(null); // null=关, {}=新建, op=编辑
  const reload = useCallback(() => { api.list().then((r) => setOps(r.ops || r || [])).catch(() => setOps([])); }, [api]);
  useEffect(() => { reload(); }, [reload]);
  const runOp = async (op) => {
    try {
      const rowIds = op.config?.viewId && api.resolveViewRowIds ? await api.resolveViewRowIds(op.config.viewId) : null;
      const res = await api.run(op, rowIds);
      message.success(`运行完成，更新了 ${res?.updated ?? 0} 行`);
      onChanged && onChanged();
    } catch (e) { message.error(e.message || '运行失败'); }
  };
  return (
    <div className="zt-pop-panel" style={{ width: 340 }}>
      {ops === null && <div className="zt-pop-note">加载中…</div>}
      {ops && ops.length === 0 && <div className="zt-pop-note">没有数据处理</div>}
      {(ops || []).map((op) => (
        <div key={op.id} className="zt-op-item">
          <span className="zt-op-item-name">{op.name}</span>
          <span className="zt-op-item-kind">{kindLabel(op.kind)}</span>
          <span style={{ flex: 1 }} />
          <span className="zt-op-acts">
            <button className="zt-icon-btn" title="运行" onClick={() => runOp(op)}><MsIcon name="play_arrow" size={16} /></button>
            <button className="zt-icon-btn" title="编辑" onClick={() => setEditing(op)}><MsIcon name="edit" size={16} /></button>
            <button className="zt-icon-btn" title="删除" onClick={async () => { await api.remove(op.id); reload(); }}><MsIcon name="delete" size={16} /></button>
          </span>
        </div>
      ))}
      <Button size="small" type="link" onClick={() => setEditing({})}>+ 增加数据处理</Button>
      {editing && (
        <OpEditor api={api} fields={fields} op={editing.id ? editing : null}
          onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </div>
  );
}
