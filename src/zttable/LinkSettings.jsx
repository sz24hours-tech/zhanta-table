// 新建列面板（FieldPanel 折叠内）与列头菜单「编辑链接设置」即时浮层共用同一实现。
// cfg/set 语义与 FieldPanel 一致：set(key, value) 更新整份 config 的对应键。
import React from 'react';
import { Select, Switch, Tooltip } from 'antd';
import MsIcon from '@/components/MsIcon';
import { OPS_BY_TYPE } from './fields';
import { CondValue } from './Toolbar';

export default function LinkSettingsControls({ cfg, set, targetFields, targetViews, members }) {
  const condField = targetFields.find((x) => x.id === cfg.rowFilterCond?.fieldId);
  return (
    <>
      <div>
        <div style={{ marginBottom: 4, fontSize: 13 }}>选择展示的列</div>
        <Select
          style={{ width: '100%' }} value={cfg.displayFieldId} allowClear
          placeholder={cfg.targetTableId ? '默认展示目标子表的第一列' : '先选择链接的子表'}
          onChange={(v) => set('displayFieldId', v)}
          options={targetFields.map((f) => ({ value: f.id, label: f.name }))}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, flex: 1 }}>限制链接最多一行</span>
        <Switch checked={!!cfg.limitOne} onChange={(v) => set('limitOne', v)} />
      </div>
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, flex: 1 }}>限制行的选择范围到一个视图</span>
          <Switch checked={!!cfg.scopeViewId} onChange={(v) => set('scopeViewId', v ? (targetViews[0]?.id || '') : undefined)} />
        </div>
        {!!cfg.scopeViewId && (
          <Select
            style={{ width: '100%', marginTop: 6 }} value={cfg.scopeViewId}
            onChange={(v) => set('scopeViewId', v)}
            options={targetViews.map((v) => ({ value: v.id, label: v.name }))}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, flex: 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          不显示"链接已有记录"按钮
          <Tooltip title="开启此选项后，链接列只支持添加记录，不支持链接已有记录">
            <span style={{ display: 'inline-flex', color: '#98a1af', cursor: 'help' }}><MsIcon name="help" size={15} /></span>
          </Tooltip>
        </span>
        <Switch checked={!!cfg.hideLinkBtn} onChange={(v) => set('hideLinkBtn', v)} />
      </div>
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, flex: 1 }}>按条件筛选行选择</span>
          <Switch
            checked={!!cfg.rowFilterOn}
            onChange={(v) => {
              set('rowFilterOn', v);
              if (v && !cfg.rowFilterCond && targetFields[0]) {
                const f0 = targetFields[0];
                set('rowFilterCond', { fieldId: f0.id, op: OPS_BY_TYPE[f0.type]?.[0]?.[0] || 'contains', value: '' });
              }
            }}
          />
        </div>
        {!!cfg.rowFilterOn && cfg.rowFilterCond && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <Select
              style={{ width: 130 }} value={cfg.rowFilterCond.fieldId}
              onChange={(v) => {
                const f0 = targetFields.find((x) => x.id === v);
                set('rowFilterCond', { fieldId: v, op: OPS_BY_TYPE[f0?.type]?.[0]?.[0] || 'contains', value: '' });
              }}
              options={targetFields.map((f) => ({ value: f.id, label: f.name }))}
            />
            <Select
              style={{ width: 110 }} value={cfg.rowFilterCond.op}
              onChange={(v) => set('rowFilterCond', { ...cfg.rowFilterCond, op: v })}
              options={(OPS_BY_TYPE[condField?.type] || []).map(([v, l]) => ({ value: v, label: l }))}
            />
            <span style={{ flex: 1 }}>
              <CondValue
                field={condField}
                cond={cfg.rowFilterCond} members={members}
                onChange={(v) => set('rowFilterCond', { ...cfg.rowFilterCond, value: v })}
              />
            </span>
          </div>
        )}
      </div>
    </>
  );
}
