// 修改日志渲染组件：一条事件 = 操作人 + 动作句 +（单元格变更带旧值→新值）+ 时间。
import React from 'react';
import MsIcon from '@/components/MsIcon';
import { displayText } from './fields';

export const ACTION_ICON = {
  cell_update: 'edit', row_create: 'add', row_delete: 'delete', row_restore: 'undo',
  field_create: 'add', field_update: 'edit', field_delete: 'delete',
  table_create: 'table_chart', table_update: 'edit', table_delete: 'delete',
  view_create: 'grid_view', view_update: 'edit', view_delete: 'delete',
  base_rename: 'edit', base_visibility: 'visibility', base_share_add: 'share',
  base_share_remove: 'share', base_password: 'lock', base_delete: 'delete', base_restore: 'undo',
};

export const ACTION_FILTER_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'cell_update', label: '修改单元格' },
  { value: 'row_create', label: '新建记录' },
  { value: 'row_delete', label: '删除记录' },
  { value: 'row_restore', label: '恢复记录' },
  { value: 'field_create', label: '新建列' },
  { value: 'field_update', label: '修改列' },
  { value: 'field_delete', label: '删除列' },
  { value: 'table_create', label: '新建子表' },
  { value: 'table_update', label: '修改子表' },
  { value: 'table_delete', label: '删除子表' },
  { value: 'view_create', label: '新建视图' },
  { value: 'view_delete', label: '删除视图' },
  { value: 'base_rename', label: '数据表改名' },
  { value: 'base_visibility', label: '可见范围' },
  { value: 'base_share_add', label: '共享' },
  { value: 'base_share_remove', label: '移除共享' },
  { value: 'base_password', label: '打开密码' },
  { value: 'base_delete', label: '删除数据表' },
  { value: 'base_restore', label: '恢复数据表' },
];

const VIS_TEXT = { org: '全员可见', group: '指定分组可见', private: '仅指定人可见' };

// old/new 在接口里是 jsonb 文本（字符串）或 null，先还原成值
export function parseStored(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

export function fmtStored(fieldType, v) {
  const val = parseStored(v);
  if (val === null || val === undefined || val === '') return '空';
  const t = displayText({ type: fieldType || 'text', config: {} }, val, [], null);
  return t || '空';
}

function nameStr(v) {
  const x = parseStored(v);
  return typeof x === 'string' ? x : '';
}

// 动作句（不含操作人与时间）
export function LogSentence({ a }) {
  const label = a.label ? <b>「{a.label}」</b> : null;
  switch (a.action) {
    case 'cell_update':
      return <>修改了「{a.table_name}」的「{a.field_name}」</>;
    case 'row_create':
      return <>在「{a.table_name}」新建了记录{label}</>;
    case 'row_delete':
      return <>删除了「{a.table_name}」的记录{label}</>;
    case 'row_restore':
      return <>恢复了「{a.table_name}」的记录{label}</>;
    case 'field_create':
      return <>在「{a.table_name}」新建了列{label}</>;
    case 'field_update':
      return <>把「{a.table_name}」的列「{nameStr(a.old)}」改名为{label}</>;
    case 'field_delete':
      return <>删除了「{a.table_name}」的列{label}</>;
    case 'table_create':
      return <>新建了子表{label}</>;
    case 'table_update':
      return <>把子表「{nameStr(a.old)}」改名为{label}</>;
    case 'table_delete':
      return <>删除了子表{label}</>;
    case 'view_create':
      return <>在「{a.table_name}」新建了视图{label}</>;
    case 'view_update':
      return <>把「{a.table_name}」的视图「{nameStr(a.old)}」改名为{label}</>;
    case 'view_delete':
      return <>删除了「{a.table_name}」的视图{label}</>;
    case 'base_rename':
      return <>把数据表「{nameStr(a.old)}」改名为{label}</>;
    case 'base_visibility':
      return <>把数据表可见范围改为「{VIS_TEXT[a.label] || a.label}」</>;
    case 'base_share_add':
      return <>把数据表共享给了{label}{a.new ? <>（{parseStored(a.new) === 'write' ? '可编辑' : '可查看'}）</> : null}</>;
    case 'base_share_remove':
      return <>移除了{label}的共享</>;
    case 'base_password':
      return <>{a.label}</>;
    case 'base_delete':
      return <>删除了数据表</>;
    case 'base_restore':
      return <>恢复了数据表</>;
    default:
      return <>操作了「{a.table_name || a.label || ''}」</>;
  }
}

export function fmtLogTime(t) {
  if (!t) return '';
  const d = new Date(t);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

// 一条日志行：showBase 时右侧带基地名（主页跨基地流用）
export default function LogItem({ a, showBase = false, onClick }) {
  return (
    <div className="zt-activity-item" onClick={onClick} style={onClick ? undefined : { cursor: 'default' }}>
      <MsIcon name={ACTION_ICON[a.action] || 'edit'} size={16} className="zt-activity-ic" />
      <span className="zt-activity-text">
        <b>{a.actor_name || '有人'}</b>{' '}
        <LogSentence a={a} />
        {a.action === 'cell_update' && (
          <span className="zt-log-diff">
            <span className="zt-log-old">{fmtStored(a.field_type, a.old)}</span>
            <MsIcon name="arrow_forward" size={13} />
            <span className="zt-log-new">{fmtStored(a.field_type, a.new)}</span>
          </span>
        )}
      </span>
      {showBase && a.base_name ? <span className="zt-activity-base">{a.base_name}</span> : null}
      <span className="zt-activity-time">{fmtLogTime(a.created_at || a.at)}</span>
    </div>
  );
}
