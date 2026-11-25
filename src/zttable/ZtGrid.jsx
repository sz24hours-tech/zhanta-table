// 站塔table 网格层（AG Grid Community 之上的自研插件层）：
// 字段渲染/编辑、客户端管线（筛选/排序/分组聚合）、框选、复制/粘贴、填充柄、查找。
import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community';
import { Input, message, Dropdown, Select, Switch, Button, Modal, Checkbox, Popover, Radio } from 'antd';
import MsIcon from '@/components/MsIcon';
import {
  typeMeta, optionOf, optionColor, avatarBg, memberName, displayText, copyText, NUMERIC_TYPES,
  formatNumber, formatDuration, formatDate, checkInvalid, isReadonlyType, OPS_BY_TYPE, NO_VALUE_OPS,
  CELL_COLORS, cellColorBg, isEmptyVal, checkIconMeta, ratingIconMeta, effectiveButtonActions,
} from './fields';
import { fieldsById, applyFilter, applySort, buildDisplay, matchCond, AGG_MODES, normRowHeight } from './pipeline';
import { CondValue } from './Toolbar';
import { LinkRecordPicker, LinkedRecordsPanel } from './LinkPicker';
import AddLinkRecordDialog from './AddLinkRecordDialog';
import LinkSettingsControls from './LinkSettings';
import SignaturePad from './SignaturePad';

ModuleRegistry.registerModules([AllCommunityModule]);

const ztTheme = themeQuartz.withParams({
  accentColor: '#0075ff',
  backgroundColor: '#ffffff',
  browserColorScheme: 'light',
  cellTextColor: '#212529',
  chromeBackgroundColor: '#f9f9f9',
  fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize: 14,
  foregroundColor: '#212529',
  headerBackgroundColor: '#f9f9f9',
  headerFontSize: 14,
  headerFontWeight: 400,
  headerTextColor: '#212529',
  headerColumnBorder: true,
  columnBorder: true,
  borderColor: '#dddddd',
  rowHoverColor: '#f9f9f9',
  selectedRowBackgroundColor: '#dbecfa',
  rangeSelectionBorderColor: '#66afe9',
  spacing: 5,
  cellHorizontalPadding: 10,
  wrapperBorder: false,
  checkboxCheckedBackgroundColor: '#0075ff',
  checkboxCheckedBorderColor: '#0075ff',
  checkboxBorderRadius: 4,
  inputFocusBorderColor: '#66afe9',
});

// ---------- 小组件 ----------

function ZtHeader(props) {
  const f = props.context.fieldsById[props.column.getColId()];
  const [draft, setDraft] = useState('');
  useEffect(() => { if (f) setDraft(f.name); }, [props.context.renameId, f?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return <span>{props.displayName}</span>;
  if (props.context.renameId === f.id) {
    return (
      <span className="zt-col-head">
        <MsIcon name={typeMeta(f.type).icon} size={15} className="zt-ficon" />
        <input
          className="zt-rename-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => props.context.commitRename(f, draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.context.commitRename(f, draft);
            if (e.key === 'Escape') props.context.cancelRename();
            e.stopPropagation();
          }}
        />
      </span>
    );
  }
  return (
    <span className="zt-col-head" title={f.config?.desc || undefined}>
      <MsIcon name={typeMeta(f.type).icon} size={15} className="zt-ficon" />
      <span className="zt-col-name">{f.name}</span>
      {!props.context.hideColArrows && (
        <span
          className="zt-col-arrow"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); props.context.openColMenu(f, e.clientX, e.clientY); }}
        >
          <MsIcon name="keyboard_arrow_down" size={15} />
        </span>
      )}
    </span>
  );
}

// 列头行末尾的「＋插入列」格
function AddColHeader(props) {
  return (
    <span
      className="zt-addcol"
      title="插入列"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); props.context.onAddColumn(); }}
    >
      <MsIcon name="add" size={17} />
    </span>
  );
}

function SelectChip({ field, value }) {
  const o = optionOf(field, value);
  if (!o) return null;
  const c = optionColor(o.color);
  return <span className="zt-chip-solid" style={{ background: c.solid }}>{o.label}</span>;
}

function MultiChips({ field, value }) {
  const arr = value || [];
  if (!arr.length) return null;
  const shown = arr.slice(0, 3);
  return (
    <span className="zt-chips">
      {shown.map((id) => {
        const o = optionOf(field, id);
        if (!o) return null;
        const c = optionColor(o.color);
        return <span key={id} className="zt-chip-soft" style={{ background: c.soft, color: c.fg }}>{o.label}</span>;
      })}
      {arr.length > 3 && <span className="zt-chip-more">+{arr.length - 3}</span>}
    </span>
  );
}

function MemberCell({ members, value }) {
  if (!value) return null;
  const name = memberName(members, value);
  return (
    <span className="zt-member">
      <span className="zt-avatar" style={{ background: avatarBg(name) }}>{[...(name || '?')][0]}</span>
      <span>{name}</span>
    </span>
  );
}

function RatingCell({ value, field }) {
  const max = field.config?.max || 5;
  const v = value || 0;
  const st = field.config?.ratingStyle || {};
  const icon = ratingIconMeta(st.icon).icon;
  const onColor = optionColor(st.color || 'yellow').solid;
  return (
    <span className="zt-rating">
      {Array.from({ length: Math.min(max, 10) }, (_, i) => (
        <MsIcon
          key={i} name={icon} size={14} filled={i < v}
          className={i < v ? '' : 'zt-star-off'}
          style={i < v ? { color: onColor } : undefined}
        />
      ))}
    </span>
  );
}

function CheckboxCell(props) {
  const row = props.data?.row;
  const f = props.context.fieldsById[props.column.getColId()];
  if (!row || !f) return null;
  const v = props.value === true;
  const toggle = (e) => {
    e.stopPropagation();
    props.context.commitCell(row, f, !v);
  };
  const st = f.config?.checkStyle || {};
  const icon = checkIconMeta(st.icon).icon;
  const color = optionColor(st.color || 'green').solid;
  return (
    <span className={`zt-checkbox ${v ? 'on styled' : ''}`} onMouseDown={(e) => e.stopPropagation()} onClick={toggle}>
      {v && <MsIcon name={icon} size={15} filled style={{ color }} />}
    </span>
  );
}

function SignatureCell({ value }) {
  if (!value?.url) return null;
  return <img className="zt-sig-thumb" src={value.url} alt="签名" draggable={false} />;
}

function AttachmentCell({ value }) {
  const arr = value || [];
  if (!arr.length) return null;
  return (
    <span className="zt-chips">
      {arr.slice(0, 2).map((a, i) => (
        <span key={i} className="zt-file-chip"><MsIcon name="attach_file" size={13} />{a.name || a.url || '附件'}</span>
      ))}
      {arr.length > 2 && <span className="zt-chip-more">+{arr.length - 2}</span>}
    </span>
  );
}

// 按钮字段：点击经宿主回调逐个执行动作；
// 宿主未接执行通道时降级——仅 open_url 动作可本地打开，其余点击给提示（不报错）
function ButtonCell(props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const row = props.data?.row;
  const f = props.context.fieldsById[props.column.getColId()];
  if (!row || !f) return null;
  const cfg = f.config || {};
  const label = cfg.btnLabel || '打开';
  const actions = effectiveButtonActions(f);
  const buildUrl = (tpl) => {
    if (!tpl) return '';
    return tpl.replace(/\{([^{}]+)\}/g, (m, name) => {
      if (name === 'user.name') return encodeURIComponent(props.context.user?.name || '');
      if (name === 'user.id') return encodeURIComponent(props.context.user?.id || '');
      const target = Object.values(props.context.fieldsById).find((x) => x.name === name);
      if (!target) return '';
      return encodeURIComponent(displayText(target, row.cells[target.id], props.context.members));
    });
  };
  const onClick = async (e) => {
    e.stopPropagation();
    if (busy || !actions.length) return;
    const exec = props.context.buttonExec;
    if (!exec) {
      if (actions.every((a) => a.kind === 'open_url')) {
        actions.forEach((a) => { const u = buildUrl(a.url); if (u) window.open(u, '_blank', 'noopener'); });
      } else {
        message.warning('当前环境未接入按钮动作执行');
      }
      return;
    }
    setBusy(true);
    try {
      const res = await exec(row, f);
      const failed = (res?.results || []).some((r) => r.status === 'failed');
      if (res && !failed) {
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }
    } catch {
      // 宿主已提示错误
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className={`zt-btn-cell${done ? ' zt-btn-cell-done' : ''}`}
      disabled={!actions.length || busy}
      title={!actions.length ? '未配置动作' : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      {done ? '✓' : label}
    </button>
  );
}

// 格式检查无效值：粉红底高亮（空值不高亮）
function CheckedTextCell(props) {
  const f = props.context.fieldsById[props.column.getColId()];
  const v = props.value;
  if (v === null || v === undefined || v === '') return null;
  const bad = f && checkInvalid(f, v);
  return <span className={bad ? 'zt-invalid' : undefined}>{String(v)}</span>;
}

function RowNumCell(props) {
  const row = props.data?.row;
  if (!row) return null;
  const n = props.context.ordinalOf(row.id);
  const checked = props.context.isRowChecked(row.id);
  const bar = props.context.rowColorOf?.(row);
  return (
    <span className="zt-rownum">
      {bar && <span className="zt-rowbar" style={{ background: bar }} />}
      <span
        className={`zt-rownum-cb${checked ? ' on' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={checked} onChange={() => props.context.toggleRowChecked(row.id)} />
      </span>
      <span className="zt-rownum-n">{n}</span>
      <span className="zt-rownum-open" onMouseDown={(e) => e.stopPropagation()} onClick={() => props.context.onOpenRow(row)}>
        <MsIcon name="open_in_full" size={14} />
      </span>
    </span>
  );
}

function NumHeader(props) {
  const info = props.context.checkedInfo();
  const hl = props.context.headerLocked;
  return (
    <span className="zt-numhead" onClick={(e) => e.stopPropagation()}>
      <Checkbox
        checked={info.all}
        indeterminate={!info.all && info.some}
        onChange={() => props.context.toggleAllChecked()}
      />
      {props.context.onToggleHeaderLock && (
        <span
          className={`zt-headlock${hl ? ' on' : ''}`}
          title={hl ? '解锁表头（可以更改列与内容）' : '锁定表头（无法更改列与内容）'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); props.context.onToggleHeaderLock(); }}
        >
          <MsIcon name={hl ? 'lock' : 'lock_open'} size={13} />
        </span>
      )}
    </span>
  );
}

// ---------- 编辑器（浮层卡片；动作里直接 setDataValue 提交，v36 口径） ----------

const popCommit = (props, v) => {
  props.node.setDataValue(props.column.getColId(), v);
  props.stopEditing();
};

const SelectEditor = forwardRef((props, ref) => {
  useImperativeHandle(ref, () => ({ getValue: () => props.value }));
  const field = props.context.fieldsById[props.column.getColId()];
  const opts = field?.config?.options || [];
  return (
    <div className="zt-pop-editor">
      <div className={`zt-pop-item ${props.value == null ? 'sel' : ''}`} onClick={() => popCommit(props, null)}>（清空）</div>
      {opts.map((o) => {
        const c = optionColor(o.color);
        return (
          <div key={o.id} className={`zt-pop-item ${props.value === o.id ? 'sel' : ''}`} onClick={() => popCommit(props, o.id)}>
            <span className="zt-chip-solid" style={{ background: c.solid }}>{o.label}</span>
          </div>
        );
      })}
    </div>
  );
});

const MultiEditor = forwardRef((props, ref) => {
  const [sel, setSel] = useState(() => new Set(props.value || []));
  useImperativeHandle(ref, () => ({ getValue: () => props.value }));
  const field = props.context.fieldsById[props.column.getColId()];
  const opts = field?.config?.options || [];
  const toggle = (id) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="zt-pop-editor">
      {opts.map((o) => {
        const c = optionColor(o.color);
        const on = sel.has(o.id);
        return (
          <div key={o.id} className="zt-pop-item" onClick={() => toggle(o.id)}>
            <span className={`zt-checkbox sm ${on ? 'on' : ''}`}>{on && <MsIcon name="check" size={11} className="zt-check" />}</span>
            <span className="zt-chip-soft" style={{ background: c.soft, color: c.fg }}>{o.label}</span>
          </div>
        );
      })}
      <div className="zt-pop-foot">
        <button className="zt-pop-btn" onClick={() => props.stopEditing()}>取消</button>
        <button className="zt-pop-btn primary" onClick={() => popCommit(props, [...sel])}>确定</button>
      </div>
    </div>
  );
});

const DateEditor = forwardRef((props, ref) => {
  useImperativeHandle(ref, () => ({ getValue: () => props.value }));
  const fld = props.context.fieldsById[props.column.getColId()];
  const isDateTime = fld?.type === 'date' && fld?.config?.precision === 'minute';
  const val = isDateTime ? (props.value ? String(props.value).slice(0, 16) : '') : (props.value || '');
  return (
    <div className="zt-pop-editor zt-date-editor">
      <input
        type={isDateTime ? 'datetime-local' : 'date'}
        defaultValue={val}
        autoFocus
        onChange={(e) => {
          const v = e.target.value;
          popCommit(props, v ? (isDateTime ? new Date(v).toISOString() : v) : null);
        }}
      />
      <button className="zt-pop-btn" onClick={() => popCommit(props, null)}>清空</button>
    </div>
  );
});

const RatingEditor = forwardRef((props, ref) => {
  useImperativeHandle(ref, () => ({ getValue: () => props.value }));
  const field = props.context.fieldsById[props.column.getColId()];
  const max = Math.min(field?.config?.max || 5, 10);
  const st = field?.config?.ratingStyle || {};
  const icon = ratingIconMeta(st.icon).icon;
  const onColor = optionColor(st.color || 'yellow').solid;
  return (
    <div className="zt-pop-editor zt-rating-editor">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="zt-rating-pick" onClick={() => popCommit(props, i + 1)}>
          <MsIcon
            name={icon} size={20} filled={i < (props.value || 0)}
            className={i < (props.value || 0) ? '' : 'zt-star-off'}
            style={i < (props.value || 0) ? { color: onColor } : undefined}
          />
        </span>
      ))}
      <button className="zt-pop-btn" onClick={() => popCommit(props, null)}>清除</button>
    </div>
  );
});

const MemberEditor = forwardRef((props, ref) => {
  useImperativeHandle(ref, () => ({ getValue: () => props.value }));
  const members = props.context.members || [];
  return (
    <div className="zt-pop-editor">
      <div className={`zt-pop-item ${props.value == null ? 'sel' : ''}`} onClick={() => popCommit(props, null)}>（清空）</div>
      {members.map((m) => (
        <div key={m.uid} className={`zt-pop-item ${props.value === m.uid ? 'sel' : ''}`} onClick={() => popCommit(props, m.uid)}>
          <MemberCell members={members} value={m.uid} />
        </div>
      ))}
    </div>
  );
});

// ---------- 分组/总计整行 ----------

function aggText(data, context) {
  const parts = [];
  (context.aggFieldIds || []).forEach((fid) => {
    const f = context.fieldsById[fid];
    const a = data.agg?.[fid];
    if (!f || !a) return;
    const mode = (context.aggModes || {})[fid] || 'sum';
    if (mode === 'none') return;
    const fmt = (n) => (f.type === 'duration' ? formatDuration(n, f.config?.durationFmt) : formatNumber(f, n));
    if (mode === 'count') { parts.push(`${f.name}计数 ${a.count}`); return; }
    if (a.count === 0 || a[mode] == null) return;
    const label = { sum: '合计', avg: '平均', median: '中位数', min: '最小值', max: '最大值' }[mode] || '合计';
    parts.push(`${f.name}${label} ${fmt(a[mode])}`);
  });
  return parts.join(' · ');
}

function FullWidthRow(props) {
  const d = props.data;
  const ctx = props.context;
  if (d.__kind === 'group') {
    const f = ctx.fieldsById[d.fieldId];
    const label = d.rawKey === null || d.rawKey === undefined || d.rawKey === ''
      ? '未填写'
      : (f.type === 'date' && /^\d{4}-\d{2}$/.test(String(d.rawKey)) ? String(d.rawKey) : displayText(f, d.rawKey, ctx.members));
    const collapsed = ctx.isCollapsed(d.key);
    return (
      <div className="zt-group-row" style={{ paddingLeft: 8 + d.level * 22 }} onClick={() => ctx.toggleGroup(d.key)}>
        <MsIcon name={collapsed ? 'chevron_right' : 'keyboard_arrow_down'} size={18} className="zt-group-caret" />
        <MsIcon name={typeMeta(f.type).icon} size={15} className="zt-ficon" />
        <span className="zt-group-name">{f.name}:</span>
        <span className="zt-group-key">{label}</span>
        <span className="zt-group-count">{d.count} 条</span>
        <span className="zt-group-agg">{aggText(d, ctx)}</span>
      </div>
    );
  }
  if (d.__kind === 'addrow') {
    return (
      <div className="zt-addrow" onClick={() => ctx.onAddRow?.()} title="在末尾添加一行">
        <MsIcon name="add" size={16} />
      </div>
    );
  }
  return (
    <div className="zt-total-row" style={{ paddingLeft: 30 + d.level * 22 }}>
      <span className="zt-total-label">总计</span>
      <span className="zt-group-count">{d.count} 条</span>
      <span className="zt-group-agg">{aggText(d, ctx)}</span>
    </div>
  );
}

// {mode:'rules', rules:[{conditions, color}]} 或 {mode:'duplicates'}；渲染为该列整格底色，
// 与工具栏「颜色同于」（行首竖条）并存不互斥；面板内改动即时保存、无保存钮 ----------

const CELL_COLOR_RULE_TYPES = new Set(['text', 'longtext', 'url', 'email', 'phone', 'auto_number', 'member', 'created_by', 'updated_by', 'number', 'select', 'multiselect', 'date', 'checkbox', 'rating', 'duration', 'created_at', 'updated_at']);

function ColorPanel({ field, fields, fieldMap, members, view, onViewChange, onClose, pos }) {
  const entry = (view.cellColor || {})[field.id] || null;
  const ruleFields = (fields || []).filter((f) => CELL_COLOR_RULE_TYPES.has(f.type));
  const [editIdx, setEditIdx] = useState(-1);
  const [palIdx, setPalIdx] = useState(-1);
  const saveEntry = (next) => {
    const cc = { ...(view.cellColor || {}) };
    if (next) cc[field.id] = next; else delete cc[field.id];
    onViewChange({ cellColor: cc });
  };
  const rules = entry && entry.mode === 'rules' ? (entry.rules || []) : [];
  const setRules = (next) => saveEntry(next.length ? { mode: 'rules', rules: next } : null);
  const updateRule = (i, patch) => setRules(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const firstOpOf = (f) => (OPS_BY_TYPE[f?.type] || OPS_BY_TYPE.text)[0][0];
  const newCond = () => {
    const f = ruleFields[0];
    return { fieldId: f?.id, op: f ? firstOpOf(f) : 'contains', value: undefined };
  };
  const condText = (c) => {
    const f = fieldMap[c.fieldId];
    if (!f) return '';
    const op = (OPS_BY_TYPE[f.type] || []).find(([v]) => v === c.op)?.[1] || c.op;
    return NO_VALUE_OPS.has(c.op) ? `${f.name} ${op}` : `${f.name} ${op} ${displayText(f, c.value, members)}`;
  };
  return (
    <div
      className="zt-color-panel"
      style={{ left: Math.min(pos.x, window.innerWidth - 470), top: Math.min(pos.y, window.innerHeight - 430), width: 450 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="zt-color-head">
        <span>单元格着色 · {field.name}</span>
        <button className="zt-icon-btn" onClick={onClose}><MsIcon name="close" size={15} /></button>
      </div>
      {!entry && (
        <>
          <div className="zt-color-mode" onClick={() => {
            const f0 = (fields || [])[0];
            saveEntry({ mode: 'rules', rules: [{ conditions: [{ fieldId: f0?.id, op: f0 ? firstOpOf(f0) : 'contains', value: undefined }], color: 'yellow' }] });
            setEditIdx(0);
          }}>
            <MsIcon name="rule" size={18} />
            <span className="zt-color-mode-main">
              <span className="zt-color-mode-title">使用规则</span>
              <span className="zt-color-mode-desc">根据规则对单元格着色</span>
            </span>
          </div>
          <div className="zt-color-mode" onClick={() => saveEntry({ mode: 'duplicates' })}>
            <MsIcon name="layers" size={18} />
            <span className="zt-color-mode-main">
              <span className="zt-color-mode-title">高亮重复值</span>
              <span className="zt-color-mode-desc">基于重复值的着色单元格</span>
            </span>
          </div>
        </>
      )}
      {entry && entry.mode === 'rules' && (
        <>
          <div className="zt-frow" style={{ marginBottom: 4 }}>
            <span className="zt-color-sec" style={{ margin: 0 }}>使用规则</span>
            <span style={{ flex: 1 }} />
            <Button size="small" type="link" danger onClick={() => { saveEntry(null); setEditIdx(-1); setPalIdx(-1); }}>清除着色</Button>
          </div>
          {rules.map((r, i) => (
            <div key={i}>
              <div className="zt-frow">
                <span className="zt-color-swatch" style={{ background: cellColorBg(r.color) }}
                  onClick={() => setPalIdx(palIdx === i ? -1 : i)}>
                  <MsIcon name="expand_more" size={12} />
                </span>
                <span className="zt-rule-sum" title={(r.conditions || []).map(condText).join('，')}
                  onClick={() => setEditIdx(editIdx === i ? -1 : i)}>
                  {(r.conditions || []).map(condText).join('，') || '（未设置条件）'}
                </span>
                <span style={{ flex: 1 }} />
                <button className="zt-icon-btn" onClick={() => { setRules(rules.filter((_, j) => j !== i)); setEditIdx(-1); setPalIdx(-1); }}>
                  <MsIcon name="delete" size={15} />
                </button>
              </div>
              {palIdx === i && (
                <div className="zt-pal">
                  {CELL_COLORS.map((c) => (
                    <span key={c.id} className={`zt-pal-cell${c.id === r.color ? ' on' : ''}`} style={{ background: c.bg }}
                      onClick={() => { updateRule(i, { color: c.id }); setPalIdx(-1); }} />
                  ))}
                </div>
              )}
              {editIdx === i && (
                <div className="zt-rule-edit">
                  {(r.conditions || []).map((c, ci) => (
                    <div key={ci} className="zt-frow">
                      <button className="zt-icon-btn" onClick={() => {
                        const conds = (r.conditions || []).filter((_, k) => k !== ci);
                        if (!conds.length) { setRules(rules.filter((_, j) => j !== i)); setEditIdx(-1); }
                        else updateRule(i, { conditions: conds });
                      }}><MsIcon name="close" size={14} /></button>
                      <Select size="small" style={{ width: 110 }} value={c.fieldId} placeholder="列"
                        options={ruleFields.map((f) => ({ value: f.id, label: f.name }))}
                        onChange={(fid) => {
                          const f = fieldMap[fid];
                          updateRule(i, { conditions: (r.conditions || []).map((x, k) => (k === ci ? { fieldId: fid, op: firstOpOf(f), value: undefined } : x)) });
                        }} />
                      <Select size="small" style={{ width: 92 }} value={c.op}
                        options={(OPS_BY_TYPE[fieldMap[c.fieldId]?.type || 'text'] || []).map(([v, l]) => ({ value: v, label: l }))}
                        onChange={(op) => updateRule(i, { conditions: (r.conditions || []).map((x, k) => (k === ci ? { ...x, op, value: undefined } : x)) })} />
                      {fieldMap[c.fieldId] && (
                        <CondValue field={fieldMap[c.fieldId]} cond={c} members={members}
                          onChange={(v) => updateRule(i, { conditions: (r.conditions || []).map((x, k) => (k === ci ? { ...x, value: v } : x)) })} />
                      )}
                    </div>
                  ))}
                  <Button size="small" type="link" onClick={() => updateRule(i, { conditions: [...(r.conditions || []), newCond()] })}>+ 添加条件</Button>
                </div>
              )}
            </div>
          ))}
          <Button size="small" type="link" disabled={!ruleFields.length}
            onClick={() => { setRules([...rules, { conditions: [newCond()], color: 'yellow' }]); setEditIdx(rules.length); }}>
            + 增加规则
          </Button>
        </>
      )}
      {entry && entry.mode === 'duplicates' && (
        <>
          <div className="zt-frow" style={{ marginBottom: 4 }}>
            <span className="zt-color-sec" style={{ margin: 0 }}>高亮重复值</span>
            <span style={{ flex: 1 }} />
            <Button size="small" type="link" danger onClick={() => saveEntry(null)}>清除着色</Button>
          </div>
          <div className="zt-pop-note">当选定列有重复值时，为单元格着色</div>
        </>
      )}
    </div>
  );
}

// 评论徽标：React 合成事件的 stopPropagation 拦不住 AG Grid 在单元格祖先上的
// 原生 mousedown（双击编辑时第二下会点开编辑、徽标随渲染器替换消失），
// 故用原生监听在目标相位直接拦截 mousedown 并打开面板。
function CmtBadge({ count, onOpen }) {
  const ref = useRef(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onDown = (e) => { e.stopPropagation(); e.preventDefault(); openRef.current(); };
    el.addEventListener('mousedown', onDown);
    return () => el.removeEventListener('mousedown', onDown);
  }, []);
  return (
    <span ref={ref} className="zt-cmt-badge">
      <MsIcon name="mode_comment" size={12} />{count}
    </span>
  );
}

// 链接单元格内小钮（同 CmtBadge 口径：原生 mousedown 拦截，避免触发 AG 单击编辑）
function LinkCellBtn({ title, onFire, children, className }) {
  const ref = useRef(null);
  const fireRef = useRef(onFire);
  fireRef.current = onFire;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onDown = (e) => { e.stopPropagation(); e.preventDefault(); fireRef.current(e); };
    el.addEventListener('mousedown', onDown);
    return () => el.removeEventListener('mousedown', onDown);
  }, []);
  return <span ref={ref} className={className} title={title}>{children}</span>;
}

// 访客只读态：只留药丸与「…」，不给「+」写入口
function LinkCell({ field, value, linkData, onOpenRecord, onMore, onAdd, readOnly = false }) {
  const arr = value || [];
  if (!arr.length) {

    if (readOnly) return null;
    return (
      <span className="zt-link-cell">
        <LinkCellBtn className="zt-link-add" title="链接记录" onFire={(e) => onAdd(e.currentTarget.getBoundingClientRect())}>+</LinkCellBtn>
      </span>
    );
  }
  const labels = linkData?.[field.id]?.labels || {};
  const first = arr[0];
  return (
    <span className="zt-link-cell">
      <LinkCellBtn className="zt-link-pill zt-link-pill-btn" onFire={() => onOpenRecord(first)}>
        {labels[first] || '（记录已删除）'}
      </LinkCellBtn>
      {arr.length > 1 && (
        <LinkCellBtn className="zt-link-more" title="查看全部链接记录" onFire={(e) => onMore(e.currentTarget.getBoundingClientRect())}>…</LinkCellBtn>
      )}
      {!readOnly && <LinkCellBtn className="zt-link-add" title="链接记录" onFire={(e) => onAdd(e.currentTarget.getBoundingClientRect())}>+</LinkCellBtn>}
    </span>
  );
}

function LinkCfgPop({ field, tableName, targetFields, targetViews, members, onPatch }) {
  const [cfg, setCfg] = useState(() => ({ ...(field.config || {}) }));
  const set = (k, v) => {
    setCfg((prev) => {
      const next = { ...prev, [k]: v };
      onPatch(field, next);
      return next;
    });
  };
  return (
    <div className="zt-linkcfg-pop">
      <div className="zt-linkcfg-note">从链接的子表 “{tableName}” 中选择要显示的列</div>
      <div className="zt-fold-body">
        <LinkSettingsControls cfg={cfg} set={set} targetFields={targetFields} targetViews={targetViews} members={members} />
      </div>
    </div>
  );
}

// ---------- 主组件 ----------

const DEFAULT_WIDTH = { text: 180, longtext: 240, number: 120, select: 140, multiselect: 190, date: 130, duration: 110, checkbox: 90, rating: 120, member: 150, url: 180, email: 190, phone: 140, attachment: 180, signature: 140, auto_number: 130, created_by: 150, created_at: 165, updated_by: 150, updated_at: 165, button: 110 };

export default function ZtGrid(props) {
  const {
    fields, rows, members, view, onViewChange, onCellCommit, onBatch, onOpenRow, findOpen, onCloseFind, frOpen, onCloseFr, user,
    onInsertField, onEditField, onRenameField, onCopyField, onDeleteField, onResetAutoField,
    onInsertRows, onAddRow, onCopyRow, onDeleteRow, onCopyRowUrl,
    commentCounts, onOpenComments,
    rowStates,
    headerLocked = false, onToggleHeaderLock,
    linkData,
    uploadFile,
    buttonExec,
    onOpenLinkedRecord,
    onAddLinkedRecord,
    onPatchFieldConfig,
    baseTables,
    visitor = false,
  } = props;
  const headerLockedRef = useRef(headerLocked);
  headerLockedRef.current = headerLocked;
  const fieldMap = useMemo(() => fieldsById(fields), [fields]);
  const aggFieldIds = useMemo(() => fields.filter((f) => NUMERIC_TYPES.has(f.type)).map((f) => f.id), [fields]);
  const visibleFields = useMemo(
    () => fields.filter((f, i) => i === 0 || !(view.hidden || []).includes(f.id)),
    [fields, view.hidden],
  );
  const colOrder = useMemo(() => visibleFields.map((f) => f.id), [visibleFields]);
  const colOrderRef = useRef(colOrder);
  colOrderRef.current = colOrder;

  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggleGroup = useCallback((key) => {
    setCollapsed((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);
  useEffect(() => { setCollapsed(new Set()); }, [view.group]);

  // 查找「整张表」范围定位到当前视图之外的行时，临时绕过视图过滤/排序/分组显示全部数据（会话态，不改视图配置）
  const [findShowAll, setFindShowAll] = useState(false);
  const filtered = useMemo(
    () => (findShowAll ? rows : applyFilter(rows, view.filter, fieldMap)),
    [rows, view.filter, fieldMap, findShowAll],
  );
  const sorted = useMemo(
    () => (findShowAll ? filtered : applySort(filtered, view.sort, fieldMap)),
    [filtered, view.sort, fieldMap, findShowAll],
  );


  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const checkedRef = useRef(checkedIds);
  checkedRef.current = checkedIds;
  useEffect(() => {
    // 行被删后修剪失效勾选
    const alive = new Set(rows.map((r) => r.id));
    setCheckedIds((prev) => {
      if (![...prev].some((id) => !alive.has(id))) return prev;
      return new Set([...prev].filter((id) => alive.has(id)));
    });
  }, [rows]);
  const toggleRowChecked = useCallback((id) => {
    setCheckedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const toggleAllChecked = useCallback(() => {
    setCheckedIds((prev) => {
      const ids = sorted.map((r) => r.id);
      return ids.length && ids.every((id) => prev.has(id)) ? new Set() : new Set(ids);
    });
  }, [sorted]);
  const checkedInfo = useCallback(() => {
    const ids = sorted.map((r) => r.id);
    const n = ids.filter((id) => checkedRef.current.has(id)).length;
    return { count: checkedRef.current.size, all: ids.length > 0 && n === ids.length, some: n > 0 };
  }, [sorted]);

  const { display, grand } = useMemo(
    () => buildDisplay(sorted, { groupFields: findShowAll ? [] : (view.group || []), fieldMap, collapsed, aggFieldIds, checkedIds }),
    [sorted, view.group, fieldMap, collapsed, aggFieldIds, checkedIds, findShowAll],
  );
  const displayRef = useRef(display);
  displayRef.current = display;
  const ordinalMap = useMemo(() => {
    const m = new Map();
    let n = 0;
    display.forEach((d) => { if (d.__kind === 'leaf') { n += 1; m.set(d.row.id, n); } });
    return m;
  }, [display]);

  const apiRef = useRef(null);
  const wrapRef = useRef(null);
  useEffect(() => {
    apiRef.current?.refreshCells?.({ force: true });
    apiRef.current?.refreshHeader?.();
  }, [checkedIds]);
  // 着色配置（规则/单选列/高亮重复）变化后必须整行重绘：cellStyle 返回 undefined 时 AG Grid
  // 不清除已写入的行内 background（设置生效、取消残留），refreshCells 不够，须 redrawRows

  useEffect(() => {
    apiRef.current?.refreshCells?.({ force: true });
    apiRef.current?.redrawRows?.();
  }, [view.cellColor, view.colorByField]);

  // colorByField（颜色同于）原样保留；每个视图只迁一次（cellColor 出现即视为已迁）
  useEffect(() => {
    const legacyRules = view.colorRules || [];
    const legacyDups = view.highlightDuplicates || [];
    if (view.cellColor !== undefined || (!legacyRules.length && !legacyDups.length)) return;
    const cc = {};
    legacyRules.forEach((r) => {
      const conds = r.conditions || [{ fieldId: r.fieldId, op: r.op, value: r.value }];
      const t = conds[0]?.fieldId;
      if (!t) return;
      const e = cc[t] || (cc[t] = { mode: 'rules', rules: [] });
      if (e.mode === 'rules') e.rules.push({ conditions: conds, color: r.color || 'yellow' });
    });
    legacyDups.forEach((fid) => { if (!cc[fid]) cc[fid] = { mode: 'duplicates' }; });
    onViewChange({ cellColor: cc, colorRules: [], highlightDuplicates: [], colorMode: null });
    // view 是配置对象（无 id 字段），依赖整个对象：配置异步加载到位后也要能触发迁移；
    // 迁移后 cellColor 出现即被上面的守卫拦住，不会循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  // ----- 列头菜单 / 重命名 / 着色面板 -----
  const [colMenu, setColMenu] = useState(null); // {field, x, y}
  const [colorPanel, setColorPanel] = useState(null); // {field, x, y}
  const [renameId, setRenameId] = useState(null);
  useEffect(() => { apiRef.current?.refreshHeader?.(); }, [renameId]);
  useEffect(() => {
    if (!colMenu && !colorPanel) return undefined;
    const close = (e) => {
      if (!e.target?.closest?.('.zt-colmenu') && !e.target?.closest?.('.zt-color-panel') && !e.target?.closest?.('.zt-col-arrow')) {
        setColMenu(null);
        setColorPanel(null);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') { setColMenu(null); setColorPanel(null); } };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [colMenu, colorPanel]);
  const openColMenu = useCallback((f, x, y) => { setColorPanel(null); setColMenu({ field: f, x, y }); }, []);
  const commitRename = useCallback((f, name) => {
    setRenameId(null);
    const n = (name || '').trim();
    if (n && n !== f.name && onRenameField) onRenameField(f, n);
    setTimeout(() => apiRef.current?.refreshHeader?.(), 30);
  }, [onRenameField]);
  const cancelRename = useCallback(() => {
    setRenameId(null);
    setTimeout(() => apiRef.current?.refreshHeader?.(), 30);
  }, []);

  // 高亮重复值：按列统计展示文本出现次数（>1 的值集合），列集合取自 cellColor 的 duplicates 条目
  const dupSets = useMemo(() => {
    const out = {};
    Object.entries(view.cellColor || {}).forEach(([fid, e]) => {
      if (!e || e.mode !== 'duplicates') return;
      const f = fieldMap[fid];
      if (!f) return;
      const counts = new Map();
      rows.forEach((r) => {
        const v = r.cells[fid];
        if (isEmptyVal(v)) return;
        const k = displayText(f, v, members);
        counts.set(k, (counts.get(k) || 0) + 1);
      });
      out[fid] = new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
    });
    return out;
  }, [view.cellColor, rows, fieldMap, members]);


  // 列头「单元格着色」是独立系统（cellColorOf），按列存、只给该列命中格整格铺色，两者并存
  const rowColorOf = useCallback((row) => {
    if (!row) return null;
    const cbf = fieldMap[view.colorByField];
    if (cbf?.type === 'select') {
      const opt = (cbf.config?.options || []).find((x) => x.id === row.cells[cbf.id]);
      if (opt?.color) return cellColorBg(opt.color);
    }
    return null;
  }, [view.colorByField, fieldMap]);

  const cellColorOf = useCallback((row, fid) => {
    const entry = (view.cellColor || {})[fid];
    if (!entry || !row) return null;
    if (entry.mode === 'rules') {
      for (const r of entry.rules || []) {
        const ok = (r.conditions || []).every((c) => {
          const f = fieldMap[c.fieldId];
          if (!f) return false;
          const v = row.cells[c.fieldId];
          return c.op === 'isCurrentUser'
            ? !isEmptyVal(v) && String(v) === String(user?.id ?? '')
            : matchCond(f, v, c);
        });
        if (ok) return cellColorBg(r.color);
      }
      return null;
    }
    if (entry.mode === 'duplicates') {
      const f = fieldMap[fid];
      const set = dupSets[fid];
      if (f && set && !isEmptyVal(row.cells[fid]) && set.has(displayText(f, row.cells[fid], members))) return '#fbc2d3';
    }
    return null;
  }, [view.cellColor, fieldMap, dupSets, members, user]);

  const ctxRef = useRef({});
  ctxRef.current = {
    fieldsById: fieldMap,
    members,
    linkData,
    uploadFile,
    buttonExec,
    addLinkedRecord: onAddLinkedRecord,
    openLinkedRecord: onOpenLinkedRecord,
    user,
    rowColorOf,
    aggFieldIds,
    aggModes: view.agg || {},
    hideColArrows: !!view.hideColArrows,
    isCollapsed: (k) => collapsed.has(k),
    toggleGroup,
    ordinalOf: (id) => ordinalMap.get(id) || '',
    isRowChecked: (id) => checkedRef.current.has(id),
    toggleRowChecked,
    toggleAllChecked,
    checkedInfo,
    headerLocked,
    onToggleHeaderLock,
    onOpenRow,
    openColMenu,
    renameId,
    commitRename,
    cancelRename,
    onAddColumn: () => { if (onInsertField) onInsertField(fields.length); },
    onAddRow: () => { if (onAddRow) onAddRow(); },
    commitCell: (row, f, v) => {
      if (headerLockedRef.current) { message.warning('表头已锁定，无法更改内容'); return; }
      row.cells[f.id] = v;
      apiRef.current?.refreshCells({ force: true });
      onCellCommit(row.id, f.id, v, row.version)
        .then((res) => { if (res?.version) row.version = res.version; })
        .catch(() => { /* 父层已提示并回滚刷新 */ });
    },
  };

  // ----- 框选 -----
  const selRef = useRef({ anchor: null, end: null });
  const draggingRef = useRef(false);
  const shiftRef = useRef(false);
  const [sel, setSel] = useState(null); // {r1,c1,r2,c2}
  const selStateRef = useRef(null);
  const [fillTarget, setFillTarget] = useState(null);
  const [fillPos, setFillPos] = useState(null);

  const normSel = useCallback(() => {
    const { anchor, end } = selRef.current;
    if (!anchor || !end) return null;
    return {
      r1: Math.min(anchor.r, end.r), r2: Math.max(anchor.r, end.r),
      c1: Math.min(anchor.c, end.c), c2: Math.max(anchor.c, end.c),
    };
  }, []);

  const updateFillPos = useCallback(() => {
    const s = selStateRef.current;
    const wrap = wrapRef.current;
    if (!s || !wrap) { setFillPos(null); return; }
    const fid = colOrderRef.current[s.c2];
    const el = wrap.querySelector(`.ag-row[row-index="${s.r2}"] .ag-cell[col-id="${fid}"]`);
    if (!el) { setFillPos(null); return; }
    const wr = wrap.getBoundingClientRect();
    const cr = el.getBoundingClientRect();
    setFillPos({ left: cr.right - wr.left - 5, top: cr.bottom - wr.top - 5 });
  }, []);

  const applySel = useCallback(() => {
    const s = normSel();
    selStateRef.current = s;
    setSel(s);
    apiRef.current?.refreshCells({ force: true });
    requestAnimationFrame(updateFillPos);
    if (props.onSelectionChange) {
      if (!s) props.onSelectionChange(null);
      else {
        const rowIds = [];
        for (let r = s.r1; r <= s.r2; r++) {
          const d = displayRef.current[r];
          if (d?.__kind === 'leaf') rowIds.push(d.row.id);
        }
        props.onSelectionChange({ range: s, rowIds });
      }
    }
  }, [normSel, updateFillPos, props]);

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.ag-cell');
      if (!el || !wrapRef.current?.contains(el)) return;
      const r = parseInt(el.closest('.ag-row')?.getAttribute('row-index'), 10);
      const c = colOrderRef.current.indexOf(el.getAttribute('col-id'));
      if (Number.isNaN(r) || c < 0) return;
      if (displayRef.current[r]?.__kind !== 'leaf') return;
      const end = selRef.current.end;
      if (!end || end.r !== r || end.c !== c) { selRef.current.end = { r, c }; applySel(); }
    };
    const onUp = () => { draggingRef.current = false; };
    const onKey = (e) => { shiftRef.current = e.shiftKey; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [applySel]);

  const onCellMouseDown = useCallback((p) => {
    if (p.event.button !== 0 || p.data?.__kind !== 'leaf') return;
    const c = colOrderRef.current.indexOf(p.column.getColId());
    if (c < 0) return;
    const r = p.node.rowIndex;
    if (p.event.shiftKey && selRef.current.anchor) {
      selRef.current.end = { r, c };
    } else {
      selRef.current.anchor = { r, c };
      selRef.current.end = { r, c };
    }
    draggingRef.current = true;
    applySel();
  }, [applySel]);

  const onCellFocused = useCallback((p) => {
    if (!shiftRef.current || !selRef.current.anchor || !p.column) return;
    const c = colOrderRef.current.indexOf(p.column.getColId());
    if (c < 0 || p.rowIndex == null) return;
    if (displayRef.current[p.rowIndex]?.__kind !== 'leaf') return;
    selRef.current.end = { r: p.rowIndex, c };
    applySel();
  }, [applySel]);

  // ----- 复制 / 粘贴 / 清除 -----
  const buildTSV = useCallback((withHeader) => {
    const s = selStateRef.current;
    if (!s) return '';
    const lines = [];
    if (withHeader) lines.push(colOrderRef.current.slice(s.c1, s.c2 + 1).map((fid) => fieldMap[fid]?.name || '').join('\t'));
    for (let r = s.r1; r <= s.r2; r++) {
      const d = displayRef.current[r];
      if (d?.__kind !== 'leaf') continue;
      const cells = [];
      for (let c = s.c1; c <= s.c2; c++) {
        const f = fieldMap[colOrderRef.current[c]];
        cells.push(f ? copyText(f, d.row.cells[f.id], members) : '');
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\r\n');
  }, [fieldMap, members]);

  const doPaste = useCallback((text) => {
    if (headerLockedRef.current) { message.warning('表头已锁定，无法更改内容'); return; }
    const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    while (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop();
    if (!rawLines.length) return;
    const grid = rawLines.map((l) => l.split('\t'));
    const s = selStateRef.current;
    const anchor = s ? { r: s.r1, c: s.c1 } : { r: 0, c: 0 };
    const ops = [];
    // 1×1 剪贴板 + 多格选区 → 填充整个选区
    if (grid.length === 1 && grid[0].length === 1 && s && (s.r2 > s.r1 || s.c2 > s.c1)) {
      for (let r = s.r1; r <= s.r2; r++) {
        const d = displayRef.current[r];
        if (d?.__kind !== 'leaf') continue;
        for (let c = s.c1; c <= s.c2; c++) {
          ops.push({ rowId: d.row.id, fieldId: colOrderRef.current[c], raw: grid[0][0] });
        }
      }
    } else {
      const newKeyByOffset = {};
      let seq = 0;
      grid.forEach((cellsArr, i) => {
        const dr = anchor.r + i;
        const disp = displayRef.current[dr];
        cellsArr.forEach((raw, j) => {
          const dc = anchor.c + j;
          if (dc >= colOrderRef.current.length) return;
          const fid = colOrderRef.current[dc];
          if (disp?.__kind === 'leaf') ops.push({ rowId: disp.row.id, fieldId: fid, raw });
          else if (!disp) {
            if (!newKeyByOffset[i]) { seq += 1; newKeyByOffset[i] = `n${seq}`; }
            ops.push({ newKey: newKeyByOffset[i], fieldId: fid, raw });
          }
        });
      });
    }
    if (ops.length) onBatch(ops, 'paste');
  }, [onBatch]);

  const clearSelection = useCallback(() => {
    if (headerLockedRef.current) { message.warning('表头已锁定，无法更改内容'); return; }
    const s = selStateRef.current;
    if (!s) return;
    const ops = [];
    for (let r = s.r1; r <= s.r2; r++) {
      const d = displayRef.current[r];
      if (d?.__kind !== 'leaf') continue;
      for (let c = s.c1; c <= s.c2; c++) {
        const f = fieldMap[colOrderRef.current[c]];
        if (f && f.type !== 'attachment' && !isReadonlyType(f.type)) ops.push({ rowId: d.row.id, fieldId: f.id, value: null });
      }
    }
    if (ops.length) onBatch(ops, 'typed');
  }, [fieldMap, onBatch]);

  const onWrapKeyDown = useCallback((e) => {
    const api = apiRef.current;
    const editing = api?.getEditingCells()?.length > 0;
    if (editing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'c' || e.key === 'C')) {
      if (!selStateRef.current) return;
      e.preventDefault();
      const tsv = buildTSV(e.shiftKey);
      if (tsv) navigator.clipboard?.writeText(tsv).then(() => message.success('已复制')).catch(() => {});
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selStateRef.current) {
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      clearSelection();
    }
  }, [buildTSV, clearSelection]);

  // ----- 右键菜单 -----
  const [ctxMenu, setCtxMenu] = useState(null); // {x, y, row}
  const [ctxInsert, setCtxInsert] = useState(null); // 'above' | 'below'（行菜单内展开数量框）
  const [ctxInsertN, setCtxInsertN] = useState(1);
  useEffect(() => { if (!ctxMenu) { setCtxInsert(null); setCtxInsertN(1); } }, [ctxMenu]);
  useEffect(() => {
    if (!ctxMenu) return undefined;
    const close = (e) => { if (!e.target?.closest?.('.zt-ctxmenu')) setCtxMenu(null); };
    const onKey = (e) => { if (e.key === 'Escape') setCtxMenu(null); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', () => setCtxMenu(null), true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', () => setCtxMenu(null), true);
    };
  }, [ctxMenu]);

  const onWrapContextMenu = useCallback((e) => {
    // 列头右击 = 列头下拉同一菜单
    const headCell = e.target?.closest?.('.ag-header-cell');
    if (headCell && wrapRef.current?.contains(headCell)) {
      const f = fieldMap[headCell.getAttribute('col-id')];
      if (f) {
        e.preventDefault();
        openColMenu(f, e.clientX, e.clientY);
        return;
      }
    }
    const cell = e.target?.closest?.('.ag-cell');
    if (!cell || !wrapRef.current?.contains(cell)) return;
    const r = parseInt(cell.closest('.ag-row')?.getAttribute('row-index'), 10);
    const colId = cell.getAttribute('col-id');
    const c = colId === '__num' ? 0 : colOrderRef.current.indexOf(colId);
    const d = displayRef.current[r];
    if (Number.isNaN(r) || c < 0 || d?.__kind !== 'leaf') return;
    e.preventDefault();
    const s = selStateRef.current;
    if (!s || r < s.r1 || r > s.r2 || c < s.c1 || c > s.c2) {
      selRef.current.anchor = { r, c };
      selRef.current.end = { r, c };
      applySel();
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, row: d.row });
  }, [applySel, fieldMap, openColMenu]);

  const fillDownSelection = useCallback(() => {
    if (headerLockedRef.current) { message.warning('表头已锁定，无法更改内容'); return; }
    const s = selStateRef.current;
    if (!s || s.r2 <= s.r1) return;
    const disp = displayRef.current;
    const leafRowsInRange = [];
    for (let r = s.r1; r <= s.r2; r++) if (disp[r]?.__kind === 'leaf') leafRowsInRange.push(disp[r].row);
    if (leafRowsInRange.length < 2) return;
    const first = leafRowsInRange[0];
    const ops = [];
    for (let c = s.c1; c <= s.c2; c++) {
      const f = fieldMap[colOrderRef.current[c]];
      if (!f || f.type === 'attachment' || f.type === 'signature' || isReadonlyType(f.type)) continue;
      const v = first.cells[f.id] ?? null;
      leafRowsInRange.slice(1).forEach((row) => ops.push({ rowId: row.id, fieldId: f.id, value: Array.isArray(v) ? [...v] : v }));
    }
    if (ops.length) onBatch(ops, 'typed');
  }, [fieldMap, onBatch]);

  const onWrapPaste = useCallback((e) => {
    const api = apiRef.current;
    if (api?.getEditingCells()?.length > 0) return;
    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    doPaste(text);
  }, [doPaste]);

  // ----- 填充柄 -----
  const fillDragRef = useRef(null);
  const onFillMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (headerLockedRef.current) { message.warning('表头已锁定，无法更改内容'); return; }
    const s = selStateRef.current;
    if (!s) return;
    fillDragRef.current = { target: null };
    const onMove = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.ag-cell');
      if (!el || !wrapRef.current?.contains(el)) return;
      const r = parseInt(el.closest('.ag-row')?.getAttribute('row-index'), 10);
      if (Number.isNaN(r) || displayRef.current[r]?.__kind !== 'leaf') return;
      if (r !== fillDragRef.current.target) {
        fillDragRef.current.target = r;
        setFillTarget(r);
        apiRef.current?.refreshCells({ force: true });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const target = fillDragRef.current?.target;
      fillDragRef.current = null;
      setFillTarget(null);
      if (target == null || !selStateRef.current) return;
      const cur = selStateRef.current;
      if (target === cur.r2 || (target >= cur.r1 && target <= cur.r2)) return;
      const disp = displayRef.current;
      const leafIdx = [];
      disp.forEach((d, i) => { if (d.__kind === 'leaf') leafIdx.push(i); });
      const srcRows = leafIdx.filter((i) => i >= cur.r1 && i <= cur.r2);
      const tgtRows = target > cur.r2
        ? leafIdx.filter((i) => i > cur.r2 && i <= target)
        : leafIdx.filter((i) => i >= target && i < cur.r1).reverse();
      if (!srcRows.length || !tgtRows.length) return;
      const ops = [];
      for (let c = cur.c1; c <= cur.c2; c++) {
        const f = fieldMap[colOrderRef.current[c]];
        if (!f || f.type === 'attachment' || f.type === 'signature' || isReadonlyType(f.type)) continue;
        const seeds = srcRows.map((i) => disp[i].row.cells[f.id] ?? null);
        const gen = genFillValues(f, seeds, tgtRows.length, target < cur.r1);
        tgtRows.forEach((di, k) => ops.push({ rowId: disp[di].row.id, fieldId: f.id, value: gen[k] }));
      }
      if (ops.length) onBatch(ops, 'typed');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [fieldMap, onBatch]);

  // ----- 查找（范围：当前视图＝视图过滤后的行+可见列；整张表＝全表行+全部列，命中不在当前视图时临时显示全部数据定位） -----
  const [findText, setFindText] = useState('');
  const [findCur, setFindCur] = useState(0);
  const [findScope, setFindScope] = useState('view');
  useEffect(() => { if (!findOpen) setFindShowAll(false); }, [findOpen]);
  const matches = useMemo(() => {
    if (!findOpen || !findText.trim()) return [];
    const q = findText.trim().toLowerCase();
    const out = [];
    if (findScope === 'all') {
      rows.forEach((r) => {
        const hit = fields.some((f) => displayText(f, r.cells[f.id], members).toLowerCase().includes(q));
        if (hit) out.push(r.id);
      });
    } else {
      display.forEach((d) => {
        if (d.__kind !== 'leaf') return;
        const hit = visibleFields.some((f) => displayText(f, d.row.cells[f.id], members).toLowerCase().includes(q));
        if (hit) out.push(d.row.id);
      });
    }
    return out;
  }, [findOpen, findText, findScope, rows, fields, display, visibleFields, members]);
  useEffect(() => { setFindCur(0); }, [findText, findScope]);
  const jumpMatch = useCallback((idx) => {
    const rid = matches[idx];
    if (rid == null || !apiRef.current) return;
    const di = displayRef.current.findIndex((d) => d.__kind === 'leaf' && d.row.id === rid);
    if (di < 0) {
      // 命中行不在当前视图里：临时显示全部数据后再定位（display 变化后本 effect 会再跑一次）
      if (findScope === 'all' && !findShowAll) setFindShowAll(true);
      return;
    }
    apiRef.current.ensureIndexVisible(di, 'middle');
    const node = apiRef.current.getDisplayedRowAtIndex(di);
    if (node) setTimeout(() => apiRef.current.flashCells({ rowNodes: [node] }), 60);
  }, [matches, findScope, findShowAll]);
  useEffect(() => { if (matches.length) jumpMatch(Math.min(findCur, matches.length - 1)); }, [matches, findCur, jumpMatch, display]);

  // ----- 查找和替换（，悬浮面板；限文本类字段，显示文本即原始值） -----
  const FR_TYPES = ['text', 'longtext', 'url', 'email', 'phone'];
  const frFields = useMemo(() => fields.filter((f) => FR_TYPES.includes(f.type)), [fields]);
  const [frFieldId, setFrFieldId] = useState(null);
  const [frText, setFrText] = useState('');
  const [frReplace, setFrReplace] = useState('');
  const [frExact, setFrExact] = useState(false);
  const [frCur, setFrCur] = useState(0);
  const frField = fieldMap[frFieldId] || frFields[0] || null;
  const frMatches = useMemo(() => {
    if (!frOpen || !frField || !frText) return [];
    const q = frText.toLowerCase();
    const out = [];
    display.forEach((d, i) => {
      if (d.__kind !== 'leaf') return;
      const raw = d.row.cells[frField.id];
      if (raw == null) return;
      const s = String(raw);
      const hit = frExact ? s.toLowerCase() === q : s.toLowerCase().includes(q);
      if (hit) out.push({ di: i, rowId: d.row.id, raw: s });
    });
    return out;
  }, [frOpen, frField, frText, frExact, display]);
  const frMatchRef = useRef({ ids: new Set(), curId: null });
  useEffect(() => {
    const cur = frMatches[Math.min(frCur, Math.max(0, frMatches.length - 1))];
    frMatchRef.current = { ids: new Set(frMatches.map((m) => m.rowId)), curId: cur?.rowId || null };
    apiRef.current?.refreshCells({ force: true });
    if (cur && apiRef.current) {
      apiRef.current.ensureIndexVisible(cur.di, 'middle');
    }
  }, [frMatches, frCur]);
  useEffect(() => { setFrCur(0); }, [frText, frFieldId, frExact]);
  // 行高是 getRowHeight 闭包值，变化后须显式让 AG Grid 重算行高
  useEffect(() => { apiRef.current?.resetRowHeights?.(); }, [view.rowHeight]);
  useEffect(() => { if (!frOpen) { frMatchRef.current = { ids: new Set(), curId: null }; apiRef.current?.refreshCells({ force: true }); } }, [frOpen]);

  useEffect(() => {
    if (!frOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.ant-modal-confirm')) return;
      onCloseFr();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frOpen, onCloseFr]);
  const frNewValue = useCallback((raw) => {
    if (frExact) return frReplace;
    const idx = raw.toLowerCase().indexOf(frText.toLowerCase());
    if (idx < 0) return raw;
    return raw.slice(0, idx) + frReplace + raw.slice(idx + frText.length);
  }, [frExact, frReplace, frText]);
  const frDoReplace = (all) => {
    if (headerLocked) { message.warning('表头已锁定，无法更改内容'); return; }
    if (!frField || !frMatches.length) return;
    const targets = all ? frMatches : [frMatches[Math.min(frCur, frMatches.length - 1)]];
    const ops = targets.map((m) => ({ rowId: m.rowId, fieldId: frField.id, value: frNewValue(m.raw) }));
    onBatch(ops, 'typed');
    message.success(all ? `已替换 ${ops.length} 处` : '已替换 1 处');
  };

  // ----- 列定义 -----
  const columnDefs = useMemo(() => {
    const inSel = (p) => {
      const s = selStateRef.current;
      if (!s || p.data?.__kind !== 'leaf' || p.node.rowIndex == null) return '';
      const c = colOrderRef.current.indexOf(p.column.getColId());
      if (c < s.c1 || c > s.c2 || p.node.rowIndex < s.r1 || p.node.rowIndex > s.r2) return '';
      return 'zt-sel';
    };
    const inFill = (p) => {
      if (fillTarget == null || !selStateRef.current || p.data?.__kind !== 'leaf' || p.node.rowIndex == null) return '';
      const s = selStateRef.current;
      const c = colOrderRef.current.indexOf(p.column.getColId());
      if (c < s.c1 || c > s.c2) return '';
      const r = p.node.rowIndex;
      const hit = fillTarget > s.r2 ? (r > s.r2 && r <= fillTarget) : (r >= fillTarget && r < s.r1);
      return hit ? 'zt-fill-preview' : '';
    };
    const defs = [{
      colId: '__num', headerName: '', width: 80, pinned: 'left', sortable: false,
      resizable: false, suppressMovable: true, editable: false,
      cellRenderer: RowNumCell,
      headerComponent: NumHeader,
      cellClass: (p) => (p.data?.__kind === 'leaf' && checkedRef.current.has(p.data.row.id) ? 'zt-numcell zt-row-checked-cell' : 'zt-numcell'),
    }];
    visibleFields.forEach((f, vi) => {
      const base = {
        colId: f.id, field: f.id, headerName: f.name, headerComponent: ZtHeader,
        width: view.colWidths?.[f.id] || DEFAULT_WIDTH[f.type] || 160,
        pinned: (view.freezeCount ?? (view.freezeFirst ? 1 : 0)) > vi ? 'left' : null,
        editable: !headerLocked && f.type !== 'attachment' && !isReadonlyType(f.type),
        cellClass: (p) => {
          const cls = [inSel(p), inFill(p)];
          if (p.data?.__kind === 'leaf' && checkedRef.current.has(p.data.row.id)) cls.push('zt-row-checked-cell');
          if (frOpen && p.data?.__kind === 'leaf' && p.column.getColId() === frField?.id) {
            if (frMatchRef.current.curId === p.data.row.id) cls.push('zt-fr-cur');
            else if (frMatchRef.current.ids.has(p.data.row.id)) cls.push('zt-fr-hit');
          }
          return cls.filter(Boolean).join(' ');
        },
        // 列头「单元格着色」整格铺色（cellColorOf，独立于行首竖条）；无色返回 undefined，
        // 残留清理由着色配置变化的 redrawRows effect 兜底
        cellStyle: (p) => {
          if (p.data?.__kind !== 'leaf') return undefined;
          const bg = cellColorOf(p.data.row, f.id);
          return bg ? { background: bg } : undefined;
        },
        valueGetter: (p) => (p.data?.__kind === 'leaf' ? p.data.row.cells[f.id] ?? null : null),
        valueSetter: (p) => {
          if (p.data?.__kind !== 'leaf') return false;
          if (p.data.row.cells[f.id] === p.newValue) return false;
          p.data.row.cells[f.id] = p.newValue;
          return true;
        },
      };
      switch (f.type) {
        case 'select':
          base.cellRenderer = (p) => (p.value != null ? <SelectChip field={f} value={p.value} /> : null);
          base.cellEditor = SelectEditor;
          base.cellEditorPopup = true;
          break;
        case 'multiselect':
          base.cellRenderer = (p) => <MultiChips field={f} value={p.value} />;
          base.cellEditor = MultiEditor;
          base.cellEditorPopup = true;
          break;
        case 'member':
          base.cellRenderer = (p) => <MemberCell members={members} value={p.value} />;
          base.cellEditor = MemberEditor;
          base.cellEditorPopup = true;
          break;
        case 'rating':
          base.cellRenderer = (p) => <RatingCell field={f} value={p.value} />;
          base.cellEditor = RatingEditor;
          base.cellEditorPopup = true;
          break;
        case 'date':
          base.cellEditor = DateEditor;
          base.cellEditorPopup = true;
          base.valueFormatter = (p) => (p.value ? formatDate(f, p.value) : '');
          break;
        case 'created_at': case 'updated_at':
          base.valueFormatter = (p) => (p.value ? String(p.value).replace('T', ' ').slice(0, 16) : '');
          break;
        case 'created_by': case 'updated_by':
          base.cellRenderer = (p) => <MemberCell members={members} value={p.value} />;
          break;
        case 'checkbox':
          base.editable = false;
          base.cellRenderer = CheckboxCell;
          break;
        case 'attachment':
          base.cellRenderer = (p) => <AttachmentCell value={p.value} />;
          break;
        case 'signature':
          // 签名板是全屏遮罩层，不走 AG 浮层编辑器（点板内按钮会被 AG 判为外部点击关编辑）：
          // 列不可编辑，双击单元格由网格层 sigPad 状态开板、保存走 onCellCommit 直提交
          base.cellRenderer = (p) => <SignatureCell value={p.value} />;
          base.editable = false;
          break;
        case 'number':
          base.valueFormatter = (p) => (p.value == null || p.value === '' ? '' : formatNumber(f, p.value));
          base.cellEditor = 'agNumberCellEditor';
          break;
        case 'duration':
          base.valueFormatter = (p) => (p.value == null || p.value === '' ? '' : formatDuration(p.value, f.config?.durationFmt));
          base.cellEditor = 'agTextCellEditor';
          break;
        case 'email': case 'phone':
          base.cellRenderer = CheckedTextCell;
          break;
        case 'text':
          if (f.config?.check) base.cellRenderer = CheckedTextCell;
          break;
        case 'button':
          base.cellRenderer = ButtonCell;
          break;
        case 'formula':
          base.valueFormatter = (p) => (p.value == null || p.value === '' ? '' : (typeof p.value === 'number' ? formatNumber(f, p.value) : displayText(f, p.value, members)));
          base.cellRenderer = (p) => {
            if (p.data?.__kind !== 'leaf') return null;
            const err = p.data.row.formula_errors?.[f.id];
            if (err) return <span className="zt-formula-err" title={err}>计算错误</span>;
            return <span>{p.valueFormatted ?? (p.value == null ? '' : String(p.value))}</span>;
          };
          break;
        case 'link':
          base.cellRenderer = (p) => (p.data?.__kind === 'leaf' ? (
            <LinkCell
              field={f} value={p.value} linkData={linkData}
              onOpenRecord={(id) => onOpenLinkedRecord?.(f, id)}
              onMore={(rect) => setLinkPop({ rowId: p.data.row.id, field: f, x: rect.left, y: rect.bottom + 4, view: 'linked' })}
              onAdd={(rect) => setLinkPop({ rowId: p.data.row.id, field: f, x: rect.left, y: rect.bottom + 4, view: 'picker' })}
              readOnly={visitor}
            />
          ) : null);

          base.editable = false;
          break;
        case 'link_formula':
          base.valueFormatter = (p) => (p.value == null || p.value === '' ? '' : (typeof p.value === 'number' ? formatNumber(f, p.value) : displayText(f, p.value, members)));
          break;
        case 'url':
          base.cellClass = (p) => ['zt-linkcell', inSel(p), inFill(p)].filter(Boolean).join(' ');
          break;
        default:
          break;
      }
      if (f.type === 'rating' && base.cellRenderer) { /* rating 已设 */ }
      // 评论行：第一列单元格右侧常显气泡＋计数徽标，点徽标打开评论面板
      // 同步行状态标（已移出范围/源已删除）同挂第一列
      if (vi === 0 && (onOpenComments || rowStates)) {
        const orig = base.cellRenderer;
        base.cellRenderer = (p) => {
          // 无自定义渲染器时 AG Grid 默认显示 valueFormatted；无格式化器时该值为 undefined，须回退原始值
          const plain = p.valueFormatted ?? (p.value == null ? '' : String(p.value));
          if (p.data?.__kind !== 'leaf') return orig ? React.createElement(orig, p) : (plain || null);
          const n = commentCounts?.[p.data.row.id] || 0;
          const st = rowStates?.[p.data.row.id];
          return (
            <span className="zt-firstcell">
              <span className="zt-firstcell-main">{orig ? React.createElement(orig, p) : plain}</span>
              {st === 'out_of_scope' && <span className="zt-sync-tag out">已移出范围</span>}
              {st === 'src_deleted' && <span className="zt-sync-tag del">源已删除</span>}
              {n > 0 && onOpenComments && <CmtBadge count={n} onOpen={() => onOpenComments(p.data.row)} />}
            </span>
          );
        };
      }
      defs.push(base);
    });
    if (onInsertField && !headerLocked) {
      defs.push({
        colId: '__add', headerName: '', width: 80, sortable: false, resizable: false,
        suppressMovable: true, editable: false, headerComponent: AddColHeader,
        cellRenderer: () => null, cellClass: 'zt-addcell',
      });
    }
    return defs;
  }, [visibleFields, members, linkData, view.colWidths, view.freezeFirst, view.freezeCount, view.cellColor, cellColorOf, fieldMap, dupSets, fillTarget, user, onInsertField, headerLocked, commentCounts, onOpenComments, rowStates]);

  const onCellValueChanged = useCallback((p) => {
    if (p.data?.__kind !== 'leaf') return;
    const row = p.data.row;
    const fid = p.column.getColId();
    onCellCommit(row.id, fid, p.newValue ?? null, row.version)
      .then((res) => { if (res?.version) row.version = res.version; })
      .catch(() => { /* 父层提示并回滚（refetch） */ });
  }, [onCellCommit]);

  // 链接列弹层（网格层状态，锚定单元格下方；点外部关闭）：view=linked「链接的记录」/ picker「链接已有记录」。
  // 宿主 onCellCommit 成功后以新对象替换行，弹层只存 rowId、每次从 rows 现取行；
  // 连续点选靠 linkTxRef 同步镜像 cells/version 串行提交，避免同 version 并发 409。
  const [linkPop, setLinkPop] = useState(null);
  const [addDlg, setAddDlg] = useState(null); // {field, prefill}
  const [, setLinkTick] = useState(0);
  const linkTxRef = useRef(null); // {rowId, fieldId, cells, version}
  useEffect(() => {
    if (!linkPop) return undefined;
    const onDown = (e) => {
      if (!e.target?.closest?.('.zt-link-pop, .ant-modal-wrap, .ant-popover')) { setLinkPop(null); linkTxRef.current = null; }
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [linkPop]);
  const applyLinkCells = useCallback((pop, next) => {
    const row = rows.find((r) => r.id === pop.rowId);
    if (!row) return;
    let tx = linkTxRef.current;
    if (!tx || tx.rowId !== pop.rowId || tx.fieldId !== pop.field.id) {
      tx = { rowId: pop.rowId, fieldId: pop.field.id, cells: [...(row.cells[pop.field.id] || [])], version: row.version };
      linkTxRef.current = tx;
    }
    tx.cells = next;
    setLinkTick((n) => n + 1);
    onCellCommit(pop.rowId, pop.field.id, next, tx.version)
      .then((res) => { if (res?.version && linkTxRef.current === tx) tx.version = res.version; })
      .catch(() => { if (linkTxRef.current === tx) linkTxRef.current = null; });
  }, [rows, onCellCommit]);
  const popCells = useCallback((pop) => {
    const row = rows.find((r) => r.id === pop.rowId);
    const tx = linkTxRef.current;
    if (tx && tx.rowId === pop.rowId && tx.fieldId === pop.field.id) return tx.cells;
    return row?.cells[pop.field.id] || [];
  }, [rows]);
  const toggleLinked = useCallback((pop, id, replace = false) => {
    const cur = popCells(pop);
    applyLinkCells(pop, replace ? [id] : (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, [popCells, applyLinkCells]);
  const removeLinked = useCallback((pop, id) => {
    applyLinkCells(pop, popCells(pop).filter((x) => x !== id));
  }, [popCells, applyLinkCells]);
  const popRow = linkPop ? rows.find((r) => r.id === linkPop.rowId) : null;
  const popValue = linkPop ? popCells(linkPop) : [];

  // 「编辑链接设置」浮层（列头菜单打开，锚定菜单位置；点外部关闭，antd 下拉/弹层除外）
  const [linkCfgPop, setLinkCfgPop] = useState(null); // {field, x, y}
  useEffect(() => {
    if (!linkCfgPop) return undefined;
    const onDown = (e) => {
      if (!e.target?.closest?.('.zt-linkcfg-wrap, .ant-popover, .ant-select-dropdown, .ant-tooltip')) setLinkCfgPop(null);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [linkCfgPop]);

  // 数字签名：双击单元格开签名板（全屏遮罩层，不走 AG 浮层编辑器），保存直提交
  const [sigPad, setSigPad] = useState(null);
  const onCellDoubleClicked = useCallback((p) => {
    if (p.data?.__kind !== 'leaf' || headerLocked) return;
    const f = fieldMap[p.column.getColId()];
    if (!f || f.type !== 'signature') return;
    setSigPad({ row: p.data.row, field: f });
  }, [fieldMap, headerLocked]);
  const saveSignature = useCallback((v) => {
    if (!sigPad) return;
    const { row, field } = sigPad;
    setSigPad(null);
    onCellCommit(row.id, field.id, v, row.version)
      .then((res) => {
        row.cells[field.id] = v;
        if (res?.version) row.version = res.version;
        apiRef.current?.refreshCells?.({ force: true });
      })
      .catch(() => { /* 父层提示并回滚（refetch） */ });
  }, [sigPad, onCellCommit]);

  const onColumnResized = useCallback((e) => {
    if (!e.finished || !e.column) return;
    const fid = e.column.getColId();
    if (fid === '__num') return;
    onViewChange({ colWidths: { ...(view.colWidths || {}), [fid]: Math.round(e.column.getActualWidth()) } });
  }, [onViewChange, view.colWidths]);

  // 底部汇总（）：每数值列可切换聚合方式，视图级持久化 view.agg
  const aggFooter = (
    <div className="zt-grid-foot">
      <span>{checkedIds.size > 0 ? `${checkedIds.size} 行被选择` : `共 ${grand.count} 条`}</span>
      {aggFieldIds.map((fid) => {
        const f = fieldMap[fid];
        const a = grand[fid];
        if (!f || !a) return null;
        const mode = view.agg?.[fid] || 'sum';
        const modeLabel = (AGG_MODES.find((m) => m.key === mode) || AGG_MODES[0]).label;
        let valText = '';
        if (mode === 'none') valText = '不计算';
        else if (mode === 'count') valText = String(a.count);
        else if (a.count === 0 || a[mode] == null) valText = '—';
        else valText = f.type === 'duration' ? formatDuration(a[mode], f.config?.durationFmt) : formatNumber(f, a[mode]);
        return (
          <Dropdown key={fid} trigger={['click']}
            menu={{
              items: AGG_MODES.map((m) => ({ key: m.key, label: m.key === mode ? `${m.label} ✓` : m.label })),
              onClick: ({ key }) => onViewChange({ agg: { ...(view.agg || {}), [fid]: key } }),
            }}>
            <span className="zt-agg-chip" title="点击切换汇总方式">{f.name} {modeLabel} {valText}</span>
          </Dropdown>
        );
      })}
    </div>
  );

  return (
    <div className="zt-grid-wrap" ref={wrapRef} onKeyDown={onWrapKeyDown} onPaste={onWrapPaste} onContextMenu={onWrapContextMenu}>
      <div className="zt-grid-body">
      <AgGridReact
        theme={ztTheme}
        context={ctxRef.current}
        rowData={onAddRow && !headerLocked ? [...display, { __kind: 'addrow', key: 'addrow' }] : display}
        columnDefs={columnDefs}
        getRowId={(p) => (p.data.__kind === 'leaf' ? p.data.row.id : `${p.data.__kind}:${p.data.key}:${p.data.level || 0}`)}
        isFullWidthRow={(p) => p.rowNode.data?.__kind === 'group' || p.rowNode.data?.__kind === 'gtotal' || p.rowNode.data?.__kind === 'addrow'}
        fullWidthCellRenderer={FullWidthRow}
        headerHeight={(view.headerScale || 1) * 32}
        getRowHeight={(p) => (p.data?.__kind === 'group' ? 42 : p.data?.__kind === 'gtotal' ? 29 : p.data?.__kind === 'addrow' ? 32 : normRowHeight(view.rowHeight))}
        rowBuffer={25}
        scrollbarWidth={8}
        stopEditingWhenCellsLoseFocus
        animateRows={false}
        suppressMovableColumns
        suppressRowClickSelection
        localeText={{ noRowsToShow: '暂无数据', loadingOoo: '加载中…' }}
        defaultColDef={{ sortable: false, resizable: true }}
        onGridReady={(e) => { apiRef.current = e.api; }}
        onCellMouseDown={onCellMouseDown}
        onCellFocused={onCellFocused}
        onCellDoubleClicked={onCellDoubleClicked}
        onCellValueChanged={onCellValueChanged}
        onColumnResized={onColumnResized}
        onBodyScroll={() => requestAnimationFrame(updateFillPos)}
        onModelUpdated={() => requestAnimationFrame(updateFillPos)}
      />
      </div>
      {fillPos && sel && !headerLocked && (
        <div className="zt-fill-handle" style={{ left: fillPos.left, top: fillPos.top }} onMouseDown={onFillMouseDown} />
      )}
      {sigPad && (
        <SignaturePad
          value={sigPad.row.cells[sigPad.field.id] || null}
          uploadFile={uploadFile}
          onSave={saveSignature}
          onClose={() => setSigPad(null)}
        />
      )}
      {linkPop && popRow && (
        <div
          className="zt-link-pop zt-link-pop2"
          style={{ left: Math.max(8, Math.min(linkPop.x, window.innerWidth - 616)), top: linkPop.y }}
        >
          {linkPop.view === 'picker' && !visitor ? (
            <LinkRecordPicker
              field={linkPop.field} value={popValue} linkData={linkData} members={members}
              onToggle={(id) => toggleLinked(linkPop, id)}
              onPickOne={(id) => { toggleLinked(linkPop, id, true); setLinkPop((p) => (p ? { ...p, view: 'linked' } : p)); }}
              onBack={() => setLinkPop((p) => (p ? { ...p, view: 'linked' } : p))}
              onClose={() => { setLinkPop(null); linkTxRef.current = null; }}
              onAddRecord={onAddLinkedRecord ? (name) => setAddDlg({ field: linkPop.field, prefill: name }) : undefined}
            />
          ) : (
            <LinkedRecordsPanel
              field={linkPop.field} value={popValue} linkData={linkData} members={members}
              readOnly={visitor}
              onOpenRecord={(f, id) => { setLinkPop(null); linkTxRef.current = null; onOpenLinkedRecord?.(f, id); }}
              onRemove={(id) => removeLinked(linkPop, id)}
              onAddClick={onAddLinkedRecord ? () => setAddDlg({ field: linkPop.field, prefill: '' }) : undefined}
              onPickClick={() => setLinkPop((p) => (p ? { ...p, view: 'picker' } : p))}
            />
          )}
        </div>
      )}
      {addDlg && (
        <AddLinkRecordDialog
          field={addDlg.field} linkData={linkData} members={members} prefill={addDlg.prefill}
          onCancel={() => setAddDlg(null)}
          addEmptyRecord={onAddLinkedRecord ? (f) => onAddLinkedRecord(f) : undefined}
          onSubmit={async (cells) => {
            const nid = await onAddLinkedRecord(addDlg.field, cells);
            if (nid && linkPop && linkPop.field.id === addDlg.field.id) {
              toggleLinked(linkPop, nid, !!addDlg.field.config?.limitOne);
              setLinkPop((p) => (p ? { ...p, view: 'linked' } : p));
            }
            setAddDlg(null);
          }}
        />
      )}
      {linkCfgPop && (() => {
        const f = linkCfgPop.field;
        const bt = (baseTables || []).find((t) => t.id === f.config?.targetTableId);
        return (
          <div
            className="zt-linkcfg-wrap"
            style={{ left: Math.max(8, Math.min(linkCfgPop.x, window.innerWidth - 330)), top: linkCfgPop.y }}
          >
            <LinkCfgPop
              field={f}
              tableName={bt?.name || linkData?.[f.id]?.targetTableName || ''}
              targetFields={bt?.fields || linkData?.[f.id]?.targetFields || []}
              targetViews={bt?.views || []}
              members={members}
              onPatch={(fld, config) => onPatchFieldConfig?.(fld, config)}
            />
          </div>
        );
      })()}
      <Popover
        trigger="click" placement="bottomRight"
        content={
          <div className="zt-pop-panel" style={{ width: 240 }}>
            <div className="zt-frow">
              <span className="zt-frow-label">表头行高</span>
              <Radio.Group size="small" value={view.headerScale || 1}
                onChange={(e) => onViewChange({ headerScale: e.target.value })}>
                <Radio value={1}>默认</Radio>
                <Radio value={2}>两倍</Radio>
              </Radio.Group>
            </div>
            <div className="zt-frow">
              <Checkbox checked={!view.hideColArrows}
                onChange={(e) => onViewChange({ hideColArrows: !e.target.checked })}>
                显示表头下拉箭头
              </Checkbox>
            </div>
            <div className="zt-pop-note">隐藏箭头后，仍可右击列头打开列菜单。</div>
          </div>
        }
      >
        <button className="zt-icon-btn zt-header-gear" title="表头设置" data-zt-setting="1"
          style={{ top: ((view.headerScale || 1) * 36) / 2 - 11 }}
          onClickCapture={(e) => {
            if (view.locked) { e.stopPropagation(); e.preventDefault(); message.warning('视图已锁定，无法更改视图设置'); }
          }}>
          <MsIcon name="settings" size={16} />
        </button>
      </Popover>
      {findOpen && (
        <div className="zt-find-bar">
          <Input
            size="small" autoFocus placeholder="在表中查找" value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (matches.length) setFindCur((c) => (c + 1) % matches.length); }
              if (e.key === 'Escape') onCloseFind();
            }}
            style={{ width: 180 }}
          />
          <span className="zt-find-count">{matches.length ? `${Math.min(findCur + 1, matches.length)} / ${matches.length}` : '0 / 0'}</span>
          <button className="zt-icon-btn" onClick={() => matches.length && setFindCur((c) => (c - 1 + matches.length) % matches.length)}><MsIcon name="keyboard_arrow_up" size={16} /></button>
          <button className="zt-icon-btn" onClick={() => matches.length && setFindCur((c) => (c + 1) % matches.length)}><MsIcon name="keyboard_arrow_down" size={16} /></button>
          <span className="zt-find-scope">
            <button className={findScope === 'view' ? 'on' : ''} onClick={() => { setFindScope('view'); setFindShowAll(false); }}>当前视图</button>
            <button className={findScope === 'all' ? 'on' : ''} onClick={() => setFindScope('all')}>整张表</button>
          </span>
          {findShowAll && (
            <button className="zt-find-showall" onClick={() => { setFindShowAll(false); setFindScope('view'); }} title="恢复当前视图的过滤与排序">
              已临时显示全部数据 ×
            </button>
          )}
          <button className="zt-icon-btn" onClick={onCloseFind}><MsIcon name="close" size={16} /></button>
        </div>
      )}
      {frOpen && (
        <div className="zt-fr-panel">
          <div className="zt-fr-row">
            <span className="zt-fr-label">查找列</span>
            <Select size="small" style={{ width: 130 }} value={frField?.id}
              onChange={(v) => setFrFieldId(v)}
              options={frFields.map((f) => ({ value: f.id, label: f.name }))} />
            <span className="zt-fr-label">精确匹配</span>
            <Switch size="small" checked={frExact} onChange={setFrExact} />
          </div>
          <div className="zt-fr-row">
            <span className="zt-fr-label">查找内容</span>
            <Input size="small" style={{ width: 190 }} autoFocus value={frText} placeholder="输入查找内容"
              onChange={(e) => setFrText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onCloseFr(); }}
              suffix={frText ? <span className="zt-find-count">{frMatches.length ? `${Math.min(frCur + 1, frMatches.length)} / ${frMatches.length}` : '0 / 0'}</span> : null} />
          </div>
          <div className="zt-fr-row">
            <span className="zt-fr-label">替换为</span>
            <Input size="small" style={{ width: 190 }} value={frReplace} placeholder="输入替换内容"
              onChange={(e) => setFrReplace(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onCloseFr(); }} />
          </div>
          <div className="zt-fr-row zt-fr-btns">
            <Button size="small" disabled={!frText || !frMatches.length}
              onClick={() => setFrCur((c) => (c - 1 + frMatches.length) % frMatches.length)}>上一个</Button>
            <Button size="small" disabled={!frText || !frMatches.length}
              onClick={() => setFrCur((c) => (c + 1) % frMatches.length)}>下一个</Button>
            <Button size="small" type="primary" disabled={!frText || !frMatches.length} onClick={() => frDoReplace(false)}>替换</Button>
            <Button size="small" type="primary" disabled={!frText || !frMatches.length}
              onClick={() => Modal.confirm({
                title: '全部替换',
                content: `将把「${frField?.name}」列中 ${frMatches.length} 处「${frText}」全部替换为「${frReplace}」，确定继续吗？`,
                okText: '全部替换', cancelText: '取消',
                onOk: () => frDoReplace(true),
              })}>全部替换</Button>
          </div>
        </div>
      )}
      {colMenu && (() => {
        const f = colMenu.field;
        const idx = fields.findIndex((x) => x.id === f.id);
        const isFirst = idx === 0;
        const items = [];
        const push = (label, fn, opts = {}) => items.push({ label, fn, ...opts });

        if (onEditField && f.type === 'select') { push('编辑单选', () => onEditField(f, 'options'), { disabled: headerLocked, icon: 'radio_button_checked' }); push('设置级联', () => {}, { disabled: true, icon: 'account_tree' }); }
        if (onEditField && f.type === 'multiselect') { push('编辑多选', () => onEditField(f, 'options'), { disabled: headerLocked, icon: 'checklist' }); push('设置级联', () => {}, { disabled: true, icon: 'account_tree' }); }
        if (onEditField && f.type === 'date') push('编辑格式设置', () => onEditField(f), { disabled: headerLocked, icon: 'date_range' });
        if (onEditField && f.type === 'formula') { push('编辑公式', () => onEditField(f, 'formula'), { disabled: headerLocked, icon: 'functions' }); push('编辑格式设置', () => onEditField(f, 'format'), { disabled: headerLocked, icon: 'date_range' }); }
        if (f.type === 'link' && onPatchFieldConfig) push('编辑链接设置', () => { setLinkCfgPop({ field: f, x: colMenu.x, y: colMenu.y }); setColMenu(null); }, { disabled: headerLocked, icon: 'link' });
        if (f.type === 'attachment') push('下载全部', () => {
          const files = [];
          (rows || []).forEach((r) => { const v = r.cells?.[f.id]; if (Array.isArray(v)) v.forEach((a) => { if (a?.url) files.push(a); }); });
          if (!files.length) { message.info('该列暂无附件'); return; }
          files.forEach((a, i) => setTimeout(() => {
            const el = document.createElement('a');
            el.href = a.url; el.download = a.name || ''; el.target = '_blank'; el.rel = 'noopener';
            document.body.appendChild(el); el.click(); el.remove();
          }, i * 350));
          message.success(`开始下载 ${files.length} 个附件`);
        }, { icon: 'download' });
        if (onEditField && !isReadonlyType(f.type) && f.type !== 'attachment') push('设置默认值', () => onEditField(f, 'default'), { icon: 'tune' });
        if (onRenameField) push('重命名列', () => setRenameId(f.id), { disabled: headerLocked, icon: 'edit' });
        if (onEditField) push('编辑列描述', () => onEditField(f, 'desc'), { disabled: headerLocked, icon: 'edit_note' });
        if (onEditField && !(f.type === 'link' && onPatchFieldConfig)) push('编辑列', () => onEditField(f), { disabled: headerLocked, icon: 'edit_square' });
        push('单元格着色', () => { setColorPanel({ field: f, x: colMenu.x, y: colMenu.y }); setColMenu(null); }, { icon: 'format_color_fill' });
        if (onCopyField) push('复制列', () => onCopyField(f), { disabled: headerLocked, icon: 'content_copy' });
        if (!isFirst) push('隐藏列', () => onViewChange({ hidden: [...(view.hidden || []), f.id] }), { icon: 'visibility_off' });
        if (onInsertField) push('向左插入', () => onInsertField(idx), { disabled: isFirst || headerLocked, icon: 'arrow_back' });
        if (onInsertField) push('向右插入', () => onInsertField(idx + 1), { disabled: headerLocked, icon: 'arrow_forward' });
        push('升序排列', () => onViewChange({ sort: [...(view.sort || []).filter((r) => r.fieldId !== f.id), { fieldId: f.id, dir: 'asc' }] }), { disabled: f.type === 'attachment' || f.type === 'signature', icon: 'arrow_upward' });
        push('降序排列', () => onViewChange({ sort: [...(view.sort || []).filter((r) => r.fieldId !== f.id), { fieldId: f.id, dir: 'desc' }] }), { disabled: f.type === 'attachment' || f.type === 'signature', icon: 'arrow_downward' });
        if (isFirst) {
          const fc = view.freezeCount ?? (view.freezeFirst ? 1 : 0);
          push(fc >= 1 ? '取消冻结列' : '冻结首列', () => onViewChange({ freezeCount: fc >= 1 ? 0 : 1, freezeFirst: false }), { disabled: headerLocked, icon: fc >= 1 ? 'lock_open' : 'lock' });
        }
        if (f.type === 'auto_number' && onResetAutoField) push('重置序列号', () => onResetAutoField(f), { disabled: headerLocked, icon: 'refresh' });
        if (!isFirst && onDeleteField) { items.push({ sep: true }); push('删除列', () => onDeleteField(f), { danger: true, disabled: headerLocked, icon: 'delete' }); }
        return (
          <div
            className="zt-colmenu"
            style={{ left: Math.min(colMenu.x, window.innerWidth - 210), top: Math.min(colMenu.y, window.innerHeight - 480) }}
          >
            {items.map((it, i) => (it.sep ? <div key={i} className="zt-ctxsep" /> : (
              <div
                key={i}
                className={`zt-ctxitem ${it.danger ? 'danger' : ''} ${it.disabled ? 'disabled' : ''}`}
                onClick={() => {
                  if (it.disabled) return;
                  if (!it.keep) setColMenu(null);
                  it.fn();
                }}
              >
                {it.icon && <MsIcon name={it.icon} size={15} />}
                <span>{it.label}</span>
              </div>
            )))}
          </div>
        );
      })()}
      {colorPanel && (
        <ColorPanel
          field={colorPanel.field} fields={fields} fieldMap={fieldMap} members={members} view={view} onViewChange={onViewChange}
          pos={{ x: colorPanel.x, y: colorPanel.y }}
          onClose={() => { setColorPanel(null); setColMenu(null); }}
        />
      )}
      {ctxMenu && (
        <div
          className="zt-ctxmenu"
          style={{ left: Math.min(ctxMenu.x, window.innerWidth - 230), top: Math.min(ctxMenu.y, window.innerHeight - 430) }}
        >
          {(onInsertRows || onCopyRow || onDeleteRow || onCopyRowUrl) && (
            <>
              {onInsertRows && ['above', 'below'].map((pos) => (
                ctxInsert === pos ? (
                  <div key={pos} className="zt-ctxinsert" onMouseDown={(e) => e.stopPropagation()}>
                    <span>{pos === 'above' ? '上方' : '下方'}插入</span>
                    <input
                      type="number" min={1} max={100} autoFocus value={ctxInsertN}
                      onChange={(e) => setCtxInsertN(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { onInsertRows(ctxMenu.row, pos, ctxInsertN); setCtxMenu(null); } }}
                    />
                    <span>行</span>
                    <button className="zt-pop-btn primary" onClick={() => { onInsertRows(ctxMenu.row, pos, ctxInsertN); setCtxMenu(null); }}>确定</button>
                  </div>
                ) : (
                  <div key={pos} className={`zt-ctxitem${headerLocked ? ' disabled' : ''}`} onClick={() => { if (!headerLocked) setCtxInsert(pos); }}>
                    <MsIcon name="add" size={15} /><span>{pos === 'above' ? '上方插入行' : '下方插入行'}</span>
                  </div>
                )
              ))}
              {onDeleteRow && (
                <div className={`zt-ctxitem danger${headerLocked ? ' disabled' : ''}`} onClick={() => { if (headerLocked) return; onDeleteRow(ctxMenu.row); setCtxMenu(null); }}>
                  <MsIcon name="delete" size={15} /><span>删除行</span>
                </div>
              )}
              {onCopyRow && (
                <div className={`zt-ctxitem${headerLocked ? ' disabled' : ''}`} onClick={() => { if (headerLocked) return; onCopyRow(ctxMenu.row); setCtxMenu(null); }}>
                  <MsIcon name="content_copy" size={15} /><span>复制行</span>
                </div>
              )}
              {onOpenComments && (
                <div className="zt-ctxitem" onClick={() => { onOpenComments(ctxMenu.row); setCtxMenu(null); }}>
                  <MsIcon name="mode_comment" size={15} /><span>评论行</span>
                </div>
              )}
              {onCopyRowUrl && (
                <div className="zt-ctxitem" onClick={() => { onCopyRowUrl(ctxMenu.row); setCtxMenu(null); }}>
                  <MsIcon name="link" size={15} /><span>复制行链接</span>
                </div>
              )}
              <div className="zt-ctxsep" />
            </>
          )}
          <div
            className="zt-ctxitem"
            onClick={() => {
              const tsv = buildTSV(false);
              if (tsv) navigator.clipboard?.writeText(tsv).then(() => message.success('已复制')).catch(() => {});
              setCtxMenu(null);
            }}
          >
            <MsIcon name="content_copy" size={15} /><span>复制</span><span className="zt-ctxkey">Ctrl+C</span>
          </div>
          <div
            className="zt-ctxitem"
            onClick={() => {
              const tsv = buildTSV(true);
              if (tsv) navigator.clipboard?.writeText(tsv).then(() => message.success('已复制（含表头）')).catch(() => {});
              setCtxMenu(null);
            }}
          >
            <MsIcon name="content_copy" size={15} /><span>复制带表头</span><span className="zt-ctxkey">Ctrl+Shift+C</span>
          </div>
          <div
            className={`zt-ctxitem${headerLocked ? ' disabled' : ''}`}
            onClick={() => {
              if (headerLocked) return;
              setCtxMenu(null);
              if (navigator.clipboard?.readText) {
                navigator.clipboard.readText().then((t) => { if (t) doPaste(t); }).catch(() => message.info('浏览器未授权读取剪贴板，请按 Ctrl+V 粘贴'));
              } else {
                message.info('请按 Ctrl+V 粘贴');
              }
            }}
          >
            <MsIcon name="content_paste" size={15} /><span>粘贴</span><span className="zt-ctxkey">Ctrl+V</span>
          </div>
          <div className="zt-ctxsep" />
          <div
            className={`zt-ctxitem${headerLocked ? ' disabled' : ''}`}
            onClick={() => { if (headerLocked) return; fillDownSelection(); setCtxMenu(null); }}
          >
            <MsIcon name="arrow_downward" size={15} /><span>向下填充</span><span className="zt-ctxkey">首行值向下复制</span>
          </div>
          <div
            className={`zt-ctxitem danger${headerLocked ? ' disabled' : ''}`}
            onClick={() => { if (headerLocked) return; clearSelection(); setCtxMenu(null); }}
          >
            <MsIcon name="close" size={15} /><span>清空选区</span><span className="zt-ctxkey">Delete</span>
          </div>
          {onOpenRow && (
            <>
              <div className="zt-ctxsep" />
              <div
                className="zt-ctxitem"
                onClick={() => { onOpenRow(ctxMenu.row); setCtxMenu(null); }}
              >
                <MsIcon name="open_in_full" size={15} /><span>打开行详情</span>
              </div>
            </>
          )}
        </div>
      )}
      {aggFooter}
    </div>
  );
}

// 填充值生成：数字两格以上等差，其余循环平铺；up=true 时向生成
function genFillValues(field, seeds, count, up) {
  const out = [];
  const numeric = (field.type === 'number' || field.type === 'rating' || field.type === 'duration')
    && seeds.length >= 2 && seeds.every((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)));
  if (numeric) {
    const vals = seeds.map(Number);
    const step = (vals[vals.length - 1] - vals[0]) / (vals.length - 1);
    for (let k = 1; k <= count; k++) {
      let v = up ? vals[0] - step * (count - k + 1) : vals[vals.length - 1] + step * k;
      if (field.type === 'rating') v = Math.max(0, Math.min(field.config?.max || 5, Math.round(v)));
      if (field.type === 'duration') v = Math.round(v);
      out.push(v);
    }
    return out;
  }
  const seq = up ? [...seeds].reverse() : seeds;
  for (let k = 0; k < count; k++) out.push(seq[k % seq.length] ?? null);
  return out;
}
