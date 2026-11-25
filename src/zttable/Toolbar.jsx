// 站塔table 工具栏：过滤（条件树 Builder）/排序/分组/隐藏列/颜色/冻结/行高/表头设置/更多操作/查找
import React, { useMemo, useState } from 'react';
import { Button, Popover, Select, Input, InputNumber, DatePicker, Checkbox, Radio, Badge, Dropdown, Modal, Switch, message } from 'antd';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MsIcon from '@/components/MsIcon';
import { OPS_BY_TYPE, NO_VALUE_OPS, MULTI_VALUE_OPS, GROUPABLE, typeMeta, displayText, optionOf, isEmptyVal, CELL_COLORS, formatNumber, formatDuration } from './fields';
import { countConds, applyFilter, applySort, buildDisplay, normRowHeight, AGG_MODES } from './pipeline';
import DataOpsPanel from './DataOps';

const newCond = (fields) => {
  const f = fields[0];
  return { fieldId: f?.id, op: OPS_BY_TYPE[f?.type || 'text']?.[0]?.[0] || 'contains', value: undefined };
};

export function CondValue({ field, cond, members, onChange, linkData, flex = false }) {
  if (!field || NO_VALUE_OPS.has(cond.op)) return null;
  const multi = MULTI_VALUE_OPS.has(cond.op);
  const w = (n) => (flex ? '100%' : n);
  if (field.type === 'link') {
    const opts = (linkData?.[field.id]?.options || []).map((o) => ({ value: o.id, label: o.label || '（未命名）' }));
    return (
      <Select
        size="small" showSearch optionFilterProp="label" style={{ width: w(170) }} placeholder="选择记录"
        options={opts} value={cond.value} onChange={(v) => onChange(v)}
      />
    );
  }
  if (field.type === 'select' || field.type === 'multiselect') {
    const opts = (field.config?.options || []).map((o) => ({ value: o.id, label: o.label }));
    return (
      <Select
        size="small" mode={multi ? 'multiple' : undefined} style={{ width: w(170) }} placeholder="选择"
        options={opts} value={cond.value} onChange={(v) => onChange(v)}
      />
    );
  }
  if (field.type === 'member' || field.type === 'created_by' || field.type === 'updated_by') {
    const opts = (members || []).map((m) => ({ value: m.uid, label: m.name }));
    return (
      <Select
        size="small" mode={multi ? 'multiple' : undefined} style={{ width: w(170) }} placeholder="选择成员"
        options={opts} value={cond.value} onChange={(v) => onChange(v)}
      />
    );
  }
  if (field.type === 'date' || field.type === 'created_at' || field.type === 'updated_at') {
    const withTime = field.type !== 'date' || field.config?.precision === 'minute';
    return (
      <DatePicker
        size="small" showTime={withTime} style={{ width: w(170) }}
        onChange={(d, s) => onChange(withTime ? (d ? d.toISOString() : undefined) : s || undefined)}
      />
    );
  }
  if (field.type === 'number' || field.type === 'rating' || field.type === 'duration') {
    return <InputNumber size="small" style={{ width: w(120) }} value={cond.value} onChange={(v) => onChange(v)} placeholder={field.type === 'duration' ? '秒数' : '输入值'} />;
  }
  return <Input size="small" style={{ width: w(150) }} value={cond.value || ''} onChange={(e) => onChange(e.target.value)} placeholder="输入值" />;
}

// 运算符、值、右侧拖拽柄）；组＝浅边框嵌套盒；层级逻辑不用「满足全部条件」行，改为条目之间的
// 「并且/或者」下拉；底部「+ 增加过滤条件 / + 添加过滤组」；空态文案「此视图下没有过滤条件」。
// 条件树节点没有 id：用 WeakMap 按对象引用发稳定键，供拖拽排序与 React key 使用。
const filterKeyMap = new WeakMap();
let filterKeySeq = 0;
const filterItemKey = (it) => {
  if (!filterKeyMap.has(it)) { filterKeySeq += 1; filterKeyMap.set(it, `fk${filterKeySeq}`); }
  return filterKeyMap.get(it);
};

function DragDots() {
  return (
    <span className="zt-fdrag-dots" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => <span key={i} />)}
    </span>
  );
}

function SortableFilterItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
    >
      {children(listeners)}
    </div>
  );
}

export function FilterGroup({ node, fields, fieldMap, members, onChange, depth, linkData }) {
  const items = node.items || [];
  const setItems = (next) => onChange({ ...node, items: next });
  const updateItem = (i, it) => setItems(items.map((x, j) => (j === i ? it : x)));
  const removeItem = (i) => setItems(items.filter((_, j) => j !== i));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oi = items.findIndex((it) => filterItemKey(it) === active.id);
    const ni = items.findIndex((it) => filterItemKey(it) === over.id);
    if (oi >= 0 && ni >= 0) setItems(arrayMove(items, oi, ni));
  };
  const renderLogic = () => (
    <div className="zt-flogic-row">
      <Select
        size="small" className="zt-flogic" value={node.logic || 'and'}
        options={[{ value: 'and', label: '并且' }, { value: 'or', label: '或者' }]}
        onChange={(v) => onChange({ ...node, logic: v })}
      />
    </div>
  );
  return (
    <div className="zt-fgroup2">
      {depth === 0 && items.length === 0 && <div className="zt-fempty">此视图下没有过滤条件</div>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map(filterItemKey)} strategy={verticalListSortingStrategy}>
          {items.map((it, i) => (
            <React.Fragment key={filterItemKey(it)}>
              {i > 0 && renderLogic()}
              <SortableFilterItem id={filterItemKey(it)}>
                {(listeners) => (it.group ? (
                  <div className="zt-fbox zt-fbox-group">
                    <button type="button" className="zt-fbox-x" title="删除过滤组" onClick={() => removeItem(i)}><MsIcon name="close" size={14} /></button>
                    <div className="zt-fbox-group-body">
                      <FilterGroup
                        node={it.group} fields={fields} fieldMap={fieldMap} members={members} depth={depth + 1} linkData={linkData}
                        onChange={(g) => updateItem(i, { group: g })}
                      />
                    </div>
                    <span className="zt-fdrag" title="拖动排序" {...listeners}><DragDots /></span>
                  </div>
                ) : (
                  <div className="zt-fbox">
                    <button type="button" className="zt-fbox-x" title="删除条件" onClick={() => removeItem(i)}><MsIcon name="close" size={14} /></button>
                    <Select
                      size="small" className="zt-ffield" value={it.fieldId}
                      options={fields.map((f) => ({
                        value: f.id,
                        label: (<span className="zt-fopt"><MsIcon name={typeMeta(f.type).icon} size={14} />{f.name}</span>),
                      }))}
                      onChange={(fid) => {
                        const f = fieldMap[fid];
                        updateItem(i, { fieldId: fid, op: OPS_BY_TYPE[f.type][0][0], value: undefined });
                      }}
                    />
                    <Select
                      size="small" className="zt-fop" value={it.op}
                      options={(OPS_BY_TYPE[fieldMap[it.fieldId]?.type || 'text'] || []).map(([v, l]) => ({ value: v, label: l }))}
                      onChange={(op) => updateItem(i, { ...it, op, value: undefined })}
                    />
                    <span className="zt-fval">
                      <CondValue flex field={fieldMap[it.fieldId]} cond={it} members={members} linkData={linkData} onChange={(v) => updateItem(i, { ...it, value: v })} />
                    </span>
                    <span className="zt-fdrag" title="拖动排序" {...listeners}><DragDots /></span>
                  </div>
                ))}
              </SortableFilterItem>
            </React.Fragment>
          ))}
        </SortableContext>
      </DndContext>
      <div className="zt-fgroup2-foot">
        <button type="button" className="zt-fadd" onClick={() => setItems([...items, newCond(fields)])}>+ 增加过滤条件</button>
        {depth < 2 && (
          <button type="button" className="zt-fadd" onClick={() => setItems([...items, { group: { logic: 'and', items: [newCond(fields)] } }])}>+ 添加过滤组</button>
        )}
      </div>
    </div>
  );
}

// ---------- 集合筛选：按列 distinct 值勾选，与条件树共用同一棵树（顶层 AND 的 in/hasAny 条件） ----------
const SET_OPS = ['in', 'hasAny'];
const SET_FILTERABLE = new Set(['text', 'longtext', 'url', 'email', 'phone', 'auto_number', 'number', 'select', 'multiselect', 'date', 'checkbox', 'rating', 'member', 'created_by', 'updated_by', 'created_at', 'updated_at']);

function treeHasField(node, fid) {
  if (!node || !Array.isArray(node.items)) return false;
  return node.items.some((it) => (it.group ? treeHasField(it.group, fid) : it.fieldId === fid));
}

function SetFilterPanel({ fields, fieldMap, members, rows, view, onViewChange }) {
  const usable = fields.filter((f) => SET_FILTERABLE.has(f.type));
  const [fid, setFid] = useState(usable[0]?.id);
  const [query, setQuery] = useState('');
  const field = fieldMap[fid] || usable[0];
  const tree = view.filter || { logic: 'and', items: [] };
  const topItems = tree.items || [];

  const entries = useMemo(() => {
    if (!field) return [];
    const map = new Map(); // key -> {key, raw, label, count}
    const add = (raw, label) => {
      const norm = isEmptyVal(raw) ? null : raw;
      const key = norm === null ? '__empty__' : JSON.stringify(norm);
      if (!map.has(key)) map.set(key, { key, raw: norm, label: norm === null ? '（空）' : label, count: 0 });
      map.get(key).count += 1;
    };
    (rows || []).forEach((r) => {
      const v = r.cells?.[field.id];
      if (field.type === 'multiselect') {
        if (isEmptyVal(v) || (Array.isArray(v) && v.length === 0)) add(null);
        else v.forEach((id) => add(id, optionOf(field, id)?.label || id));
      } else if (field.type === 'select') {
        add(isEmptyVal(v) ? null : v, isEmptyVal(v) ? '' : (optionOf(field, v)?.label || String(v)));
      } else if (field.type === 'member') {
        add(isEmptyVal(v) ? null : v, isEmptyVal(v) ? '' : displayText(field, v, members));
      } else {
        add(isEmptyVal(v) ? null : v, isEmptyVal(v) ? '' : displayText(field, v, members));
      }
    });
    // 定义型字段补零计数项（选项/成员全集）
    if (field.type === 'select' || field.type === 'multiselect') {
      (field.config?.options || []).forEach((o) => { if (!map.has(JSON.stringify(o.id))) map.set(JSON.stringify(o.id), { key: JSON.stringify(o.id), raw: o.id, label: o.label, count: 0 }); });
    }
    if (field.type === 'member') {
      (members || []).forEach((m) => { if (!map.has(JSON.stringify(m.uid))) map.set(JSON.stringify(m.uid), { key: JSON.stringify(m.uid), raw: m.uid, label: m.name, count: 0 }); });
    }
    const list = [...map.values()];
    if (field.type === 'select' || field.type === 'multiselect') {
      const order = new Map((field.config?.options || []).map((o, i) => [o.id, i]));
      list.sort((a, b) => (order.get(a.raw) ?? 999) - (order.get(b.raw) ?? 999));
    } else {
      list.sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
    }
    return list;
  }, [field, rows, members]);

  if (!field) return <div className="zt-pop-note">没有可集合筛选的字段</div>;

  const setCondIdx = topItems.findIndex((it) => !it.group && it.fieldId === field.id && SET_OPS.includes(it.op));
  const otherUse = topItems.some((it, i) => i !== setCondIdx && (it.group ? treeHasField(it.group, field.id) : it.fieldId === field.id));
  const blocked = otherUse || (tree.logic === 'or' && topItems.length > 0 && setCondIdx < 0);
  const op = field.type === 'multiselect' ? 'hasAny' : 'in';
  const allKeys = entries.map((e) => e.key);
  const checked = new Set(
    setCondIdx >= 0
      ? (topItems[setCondIdx].value || []).map((v) => (isEmptyVal(v) ? '__empty__' : JSON.stringify(v)))
      : allKeys,
  );

  const applyChecked = (nextChecked) => {
    const items = topItems.filter((_, i) => i !== setCondIdx);
    if (nextChecked.size < allKeys.length) {
      const values = entries.filter((e) => nextChecked.has(e.key)).map((e) => e.raw);
      items.push({ fieldId: field.id, op, value: values });
    }
    onViewChange({ filter: items.length ? { ...tree, items } : null });
  };

  const shown = entries.filter((e) => !query || e.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div>
      <div className="zt-frow">
        <Select
          size="small" style={{ width: 150 }} value={field.id}
          options={usable.map((f) => ({ value: f.id, label: f.name }))}
          onChange={(v) => { setFid(v); setQuery(''); }}
        />
        <Input size="small" style={{ width: 150 }} placeholder="搜索值" value={query} onChange={(e) => setQuery(e.target.value)} allowClear />
        <span style={{ flex: 1 }} />
        <Button size="small" type="link" disabled={blocked} onClick={() => applyChecked(new Set(allKeys))}>全选</Button>
        <Button size="small" type="link" disabled={blocked} onClick={() => applyChecked(new Set())}>清空</Button>
      </div>
      {blocked ? (
        <div className="zt-pop-note" style={{ marginTop: 8 }}>该字段已在「条件」里设置（或根逻辑为「任一」），请在条件页编辑。</div>
      ) : (
        <>
          <div className="zt-setlist">
            {shown.slice(0, 300).map((e) => (
              <label key={e.key} className="zt-setrow">
                <Checkbox
                  checked={checked.has(e.key)}
                  onChange={(ev) => {
                    const next = new Set(checked);
                    if (ev.target.checked) next.add(e.key); else next.delete(e.key);
                    applyChecked(next);
                  }}
                />
                <span className="zt-setlabel">{e.label}</span>
                <span className="zt-setcount">{e.count}</span>
              </label>
            ))}
            {shown.length === 0 && <div className="zt-pop-note">没有匹配的值</div>}
          </div>
          {shown.length > 300 && <div className="zt-pop-note">仅显示前 300 个值，可用搜索缩小范围</div>}
          <div className="zt-pop-note">已勾选 {checked.size} / {allKeys.length} 个值（计数为全部数据的出现次数）</div>
        </>
      )}
    </div>
  );
}

// 规则/高亮重复值是列头「单元格着色」的独立系统，存 view.cellColor、按列整格铺色） ----------
function ColorViewPanel({ fields, view, onViewChange }) {
  const selectFields = fields.filter((f) => f.type === 'select');
  return (
    <div className="zt-pop-panel" style={{ width: 380 }}>
      <div className="zt-frow">
        <button className="zt-icon-btn" title="清除着色" onClick={() => onViewChange({ colorByField: null })}><MsIcon name="close" size={15} /></button>
        <span>颜色同于</span>
        <Select size="small" style={{ width: 210 }} placeholder="选择单选列"
          value={view.colorByField || undefined}
          options={selectFields.map((f) => ({ value: f.id, label: f.name }))}
          onChange={(v) => onViewChange({ colorByField: v })} />
      </div>
    </div>
  );
}

// ---------- 打印（）：按打印设置把当前视图渲染为简表后调浏览器打印 ----------
const PAPER_SIZES = {
  Letter: '8.5in 11in', Tabloid: '11in 17in', Legal: '8.5in 14in', Statement: '5.5in 8.5in',
  Executive: '7.25in 10.5in', Folio: '8.5in 13in', A3: '297mm 420mm', A4: '210mm 297mm',
  A5: '148mm 210mm', B4: '250mm 353mm', B5: '176mm 250mm',
};
const PRINT_FONTS = { xs: 10, sm: 11.5, md: 13, lg: 15, xl: 17 };

function printViewHtml({ settings, title, cols, displayRows, grand, aggModes, fieldMap, members }) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fontPx = PRINT_FONTS[settings.fontSize] || 13;
  const wrap = settings.wrap ? 'normal' : 'nowrap';
  let body = '';
  displayRows.forEach((d) => {
    if (d.__kind === 'group') {
      const f = fieldMap[d.fieldId];
      const label = d.rawKey == null || d.rawKey === '' ? '未填写' : displayText(f, d.rawKey, members);
      body += `<tr class="grp"><td colspan="${cols.length + (settings.rowNumbers ? 1 : 0)}">${esc(f.name)}: ${esc(label)}（${d.count} 条）</td></tr>`;
      return;
    }
    if (d.__kind === 'gtotal') return;
    const cells = cols.map((f) => `<td>${esc(displayText(f, d.row.cells[f.id], members))}</td>`).join('');
    body += `<tr>${settings.rowNumbers ? `<td class="num">${d.__num}</td>` : ''}${cells}</tr>`;
  });
  const totals = cols.map((f) => {
    const a = grand[f.id];
    if (!a) return '<td></td>';
    const mode = aggModes[f.id] || 'sum';
    if (mode === 'none') return '<td></td>';
    const v = mode === 'count' ? a.count : a[mode];
    if (v == null) return '<td></td>';
    const vs = f.type === 'duration' ? formatDuration(v, f.config?.durationFmt) : formatNumber(f, v);
    const label = (AGG_MODES.find((m) => m.key === mode) || {}).label || '';
    return `<td>${settings.onlyNumbers ? esc(vs) : `${label} ${esc(vs)}`}</td>`;
  }).join('');
  const size = PAPER_SIZES[settings.paper] || PAPER_SIZES.Letter;
  const orient = settings.orientation === 'landscape' ? 'landscape' : 'portrait';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title || '打印视图')}</title>
<style>
@page { size: ${size} ${orient}; margin: 12mm; }
body { font-family: sans-serif; font-size: ${fontPx}px; zoom: ${(settings.scale || 100) / 100}; }
h1 { font-size: ${fontPx + 4}px; }
table { border-collapse: collapse; width: ${settings.fitWidth ? '100%' : 'auto'}; }
th, td { border: 1px solid #ccc; padding: 4px 8px; white-space: ${wrap}; text-align: left; }
tr.grp td { background: #f2f4f7; font-weight: 600; }
td.num { color: #888; width: 36px; }
tfoot td { font-weight: 600; background: #fafafa; }
</style></head><body>
${title ? `<h1>${esc(title)}</h1>` : ''}
<table><thead><tr>${settings.rowNumbers ? '<th></th>' : ''}${cols.map((f) => `<th>${esc(f.name)}</th>`).join('')}</tr></thead>
<tbody>${body}</tbody>
<tfoot><tr>${settings.rowNumbers ? '<td></td>' : ''}${totals}</tr></tfoot></table>
</body></html>`;
}

export default function ZtToolbar({ fields, fieldMap, members, rows, view, onViewChange, onOpenFind, onOpenFindReplace, onExport, dataOpsApi, viewName, onDataChanged, onToggleViewLock, headerLocked = false, enableSetFilter = false, linkData, visitor = false }) {

  const [hideSearch, setHideSearch] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [printSettings, setPrintSettings] = useState({
    paper: 'Letter', orientation: 'portrait', fitWidth: false, fontSize: 'md', scale: 100,
    titleMode: 'view', customTitle: '', rowNumbers: true, wrap: false, onlyNumbers: false,
  });
  const filterCount = countConds(view.filter);
  const groupableFields = fields.filter((f) => GROUPABLE.has(f.type));
  const group = view.group || [];
  const setGroupAt = (idx, fid) => {
    const next = [...group];
    if (!fid) next.splice(idx, 1); else next[idx] = fid;
    onViewChange({ group: next.filter(Boolean) });
  };
  const sort = view.sort || [];
  const locked = !!view.locked;
  // 真锁定：视图设置类按钮（带 data-zt-setting 的触发区）在锁定态点击只给提示、不打开面板
  const guardSettings = (e) => {
    if (!locked) return;
    if (e.target.closest('[data-zt-setting]')) {
      e.stopPropagation();
      e.preventDefault();
      message.warning('视图已锁定，无法更改视图设置');
    }
  };
  const visibleFields = useMemo(
    () => fields.filter((f, i) => i === 0 || !(view.hidden || []).includes(f.id)),
    [fields, view.hidden],
  );
  const viewRows = useMemo(() => {
    const filtered = applyFilter(rows || [], view.filter, fieldMap);
    return applySort(filtered, view.sort, fieldMap);
  }, [rows, view.filter, view.sort, fieldMap]);
  const doPrint = () => {
    const aggIds = visibleFields.filter((f) => f.type === 'number' || f.type === 'duration').map((f) => f.id);
    const { display, grand } = buildDisplay(viewRows, {
      groupFields: view.group || [], fieldMap, collapsed: new Set(), aggFieldIds: aggIds,
    });
    let num = 0;
    const numbered = display.map((d) => (d.__kind === 'leaf' ? { ...d, __num: ++num } : d));
    const title = printSettings.titleMode === 'none' ? '' : printSettings.titleMode === 'custom' ? printSettings.customTitle : (viewName || '');
    const html = printViewHtml({
      settings: printSettings, title, cols: visibleFields, displayRows: numbered,
      grand, aggModes: view.agg || {}, fieldMap, members,
    });
    const w = window.open('', '_blank');
    if (!w) { message.error('打印窗口被浏览器拦截，请允许弹窗后重试'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
    setPrintOpen(false);
  };
  const toolbarBtn = (icon, label, active) => (
    <span className={`zt-tool-btn ${active ? 'active' : ''}`}>
      <MsIcon name={icon} size={16} />
      <span>{label}</span>
    </span>
  );
  const moreItems = [
    onExport && { key: 'export', label: '导出视图到 XLSX', icon: <MsIcon name="download" size={15} /> },
    onExport && { key: 'exportcsv', label: '导出视图到 CSV', icon: <MsIcon name="download" size={15} /> },
    !visitor && { key: 'findreplace', label: '查找和替换', icon: <MsIcon name="search" size={15} /> },
    dataOpsApi && { key: 'dataops', label: '数据处理', disabled: headerLocked, icon: <MsIcon name="rule" size={15} /> },
    { key: 'print', label: '打印视图', icon: <MsIcon name="print" size={15} /> },
  ].filter(Boolean);
  return (
    <div className="zt-toolbar" onClickCapture={guardSettings}>
      {onToggleViewLock && (
        <span
          className="zt-tool-btn zt-lock-tool"
          title={view.locked ? '解锁视图（可以更改视图设置，例如过滤、排序和分组）' : '锁定视图（无法更改视图设置，例如过滤、排序和分组）'}
          onClick={onToggleViewLock}
        >
          <MsIcon name={view.locked ? 'lock' : 'lock_open'} size={16} />
        </span>
      )}
      <Popover
        trigger="click" placement="bottomLeft"
        content={
          <div className="zt-pop-panel" style={{ width: 400 }}>
            <FilterGroup
              node={view.filter || { logic: 'and', items: [] }}
              fields={fields} fieldMap={fieldMap} members={members} depth={0} linkData={linkData}
              onChange={(t) => onViewChange({ filter: countConds(t) ? t : null })}
            />
          </div>
        }
      >
        <span data-zt-setting="1">
          {filterCount > 0 ? (
            <span className="zt-tool-btn zt-filter-on"><MsIcon name="filter_alt" size={16} /><span>{filterCount} 个过滤条件</span></span>
          ) : toolbarBtn('filter_alt', '过滤', false)}
        </span>
      </Popover>
      <Popover
        trigger="click" placement="bottomLeft"
        content={
          <div className="zt-pop-panel" style={{ width: 380 }}>
            {sort.map((r, i) => (
              <div key={i} className="zt-frow">
                <Select
                  size="small" style={{ width: 140 }} value={r.fieldId}
                  options={fields.map((f) => ({ value: f.id, label: f.name }))}
                  onChange={(fid) => onViewChange({ sort: sort.map((x, j) => (j === i ? { ...x, fieldId: fid } : x)) })}
                />
                <Select
                  size="small" style={{ width: 90 }} value={r.dir}
                  options={[{ value: 'asc', label: '升序' }, { value: 'desc', label: '降序' }]}
                  onChange={(dir) => onViewChange({ sort: sort.map((x, j) => (j === i ? { ...x, dir } : x)) })}
                />
                <button className="zt-icon-btn" onClick={() => onViewChange({ sort: sort.filter((_, j) => j !== i) })}><MsIcon name="close" size={15} /></button>
              </div>
            ))}
            <Button size="small" type="link" disabled={!fields.length}
              onClick={() => fields.length && onViewChange({ sort: [...sort, { fieldId: fields[0].id, dir: 'asc' }] })}>
              + 添加排序
            </Button>
          </div>
        }
      >
        <span data-zt-setting="1">{toolbarBtn('swap_vert', `排序${sort.length ? ` (${sort.length})` : ''}`, sort.length > 0)}</span>
      </Popover>
      <Popover
        trigger="click" placement="bottomLeft"
        content={
          <div className="zt-pop-panel" style={{ width: 300 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="zt-frow">
                <span className="zt-frow-label">{i === 0 ? '分组' : `子分组 ${i}`}</span>
                <Select
                  size="small" style={{ width: 180 }} allowClear placeholder="不分组" value={group[i]}
                  options={groupableFields.filter((f) => f.id === group[i] || !group.includes(f.id)).map((f) => ({ value: f.id, label: f.name }))}
                  onChange={(fid) => setGroupAt(i, fid)}
                />
              </div>
            ))}
            <div className="zt-pop-note">分组按字段顺序逐级展开，组行带计数与合计。</div>
          </div>
        }
      >
        <span data-zt-setting="1">{toolbarBtn('group_work', `分组${group.length ? ` (${group.length})` : ''}`, group.length > 0)}</span>
      </Popover>
      <Popover
        trigger="click" placement="bottomLeft"
        content={
          <div className="zt-pop-panel" style={{ width: 260 }}>
            <Input
              size="small" placeholder="搜索列" value={hideSearch} allowClear
              onChange={(e) => setHideSearch(e.target.value)} style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
              <a onClick={() => onViewChange({ hidden: [] })}>显示所有</a>
              <a onClick={() => onViewChange({ hidden: fields.slice(1).map((f) => f.id) })}>隐藏所有</a>
            </div>
            {fields.slice(1).filter((f) => !hideSearch || f.name.includes(hideSearch)).map((f) => {
              const hidden = (view.hidden || []).includes(f.id);
              return (
                <div key={f.id} className="zt-frow">
                  <Checkbox
                    checked={!hidden}
                    onChange={(e) => {
                      const cur = new Set(view.hidden || []);
                      e.target.checked ? cur.delete(f.id) : cur.add(f.id);
                      onViewChange({ hidden: [...cur] });
                    }}
                  >
                    <MsIcon name={typeMeta(f.type).icon} size={14} className="zt-ficon" /> {f.name}
                  </Checkbox>
                </div>
              );
            })}
            <div className="zt-pop-note">首列不可隐藏（冻结与行定位锚点）。</div>
          </div>
        }
      >
        <span data-zt-setting="1">{toolbarBtn('visibility_off', (view.hidden || []).length ? `${(view.hidden || []).length} 列被隐藏` : '隐藏列', (view.hidden || []).length > 0)}</span>
      </Popover>
      <Popover
        trigger="click" placement="bottomLeft"
        content={<ColorViewPanel fields={fields} fieldMap={fieldMap} members={members} view={view} onViewChange={onViewChange} />}
      >
        <span data-zt-setting="1">{toolbarBtn('palette', '颜色', !!view.colorByField)}</span>
      </Popover>
      <Popover
        trigger="click" placement="bottomLeft"
        content={
          <div className="zt-pop-panel" style={{ width: 230 }}>
            <div className="zt-frow">
              <span className="zt-frow-label">冻结列数</span>
              <InputNumber
                size="small" min={0} max={Math.min(5, fields.length)} style={{ width: 90 }}
                value={view.freezeCount ?? (view.freezeFirst ? 1 : 0)}
                onChange={(v) => onViewChange({ freezeCount: v || 0, freezeFirst: false })}
              />
            </div>
            <div className="zt-pop-note">从左侧起冻结前 N 列，横向滚动时保持可见。</div>
          </div>
        }
      >
        <span data-zt-setting="1">{toolbarBtn('view_column', `冻结${(view.freezeCount ?? (view.freezeFirst ? 1 : 0)) ? ` (${view.freezeCount ?? 1})` : ''}`, (view.freezeCount ?? (view.freezeFirst ? 1 : 0)) > 0)}</span>
      </Popover>
      <Popover
        trigger="click" placement="bottomLeft"
        content={
          <div className="zt-pop-panel" style={{ width: 200 }}>
            <Radio.Group
              value={normRowHeight(view.rowHeight)}
              onChange={(e) => onViewChange({ rowHeight: e.target.value })}
            >
              <div className="zt-frow"><Radio value={32}>默认</Radio></div>
              <div className="zt-frow"><Radio value={64}>两倍</Radio></div>
              <div className="zt-frow"><Radio value={96}>三倍</Radio></div>
              <div className="zt-frow"><Radio value={128}>四倍</Radio></div>
            </Radio.Group>
          </div>
        }
      >
        <span data-zt-setting="1">{toolbarBtn('format_line_spacing', '行高')}</span>
      </Popover>
      {opsOpen && dataOpsApi && (
        <>
          <div className="zt-ops-backdrop" onClick={() => setOpsOpen(false)} />
          <div className="zt-ops-anchor"><DataOpsPanel api={dataOpsApi} fields={fields} onChanged={onDataChanged} /></div>
        </>
      )}
      <Dropdown trigger={['click']}
        menu={{
          items: moreItems,
          onClick: ({ key }) => {
            if (key === 'export') onExport && onExport('xlsx');
            if (key === 'exportcsv') onExport && onExport('csv');
            if (key === 'findreplace') onOpenFindReplace && onOpenFindReplace();
            if (key === 'print') setPrintOpen(true);
            if (key === 'dataops') setOpsOpen(true);
          },
        }}>
        <span>{toolbarBtn('more_horiz', '更多操作')}</span>
      </Dropdown>
      <span onClick={onOpenFind}>{toolbarBtn('search', '查找')}</span>
      <Modal open={printOpen} title="打印设置" onCancel={() => setPrintOpen(false)} width={460}
        footer={[
          <Button key="c" onClick={() => setPrintOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" onClick={doPrint}>打印</Button>,
        ]}>
        <div className="zt-op-form">
          <div className="zt-op-row"><span className="zt-op-label">纸张尺寸</span>
            <Select style={{ width: 220 }} value={printSettings.paper}
              onChange={(v) => setPrintSettings({ ...printSettings, paper: v })}
              options={Object.keys(PAPER_SIZES).map((k) => ({ value: k, label: { Letter: 'Letter(8.5" x 11")', Tabloid: 'Tabloid(11" x 17")', Legal: 'Legal(8.5" x 14")', Statement: 'Statement(5.5" x 8.5")', Executive: 'Executive(7.25" x 10.5")', Folio: 'Folio(8.5" x 13")', A3: 'A3(297mm x 420mm)', A4: 'A4(210mm x 297mm)', A5: 'A5(148mm x 210mm)', B4: 'B4(250mm x 353mm)', B5: 'B5(176mm x 250mm)' }[k] }))} /></div>
          <div className="zt-op-row"><span className="zt-op-label">布局</span>
            <Select style={{ width: 220 }} value={printSettings.orientation}
              onChange={(v) => setPrintSettings({ ...printSettings, orientation: v })}
              options={[{ value: 'portrait', label: '纵向打印格式' }, { value: 'landscape', label: '横向打印格式' }]} /></div>
          <div className="zt-op-row"><span className="zt-op-label">列调整</span>
            <Select style={{ width: 220 }} value={printSettings.fitWidth ? 'fit' : 'real'}
              onChange={(v) => setPrintSettings({ ...printSettings, fitWidth: v === 'fit' })}
              options={[{ value: 'fit', label: '适合页面宽度' }, { value: 'real', label: '真实大小' }]} /></div>
          <div className="zt-op-row"><span className="zt-op-label">字体大小</span>
            <Select style={{ width: 220 }} value={printSettings.fontSize}
              onChange={(v) => setPrintSettings({ ...printSettings, fontSize: v })}
              options={[{ value: 'xs', label: '非常小' }, { value: 'sm', label: '小' }, { value: 'md', label: '正常' }, { value: 'lg', label: '大' }, { value: 'xl', label: '非常大' }]} /></div>
          <div className="zt-op-row"><span className="zt-op-label">缩放</span>
            <InputNumber style={{ width: 120 }} min={10} max={400} value={printSettings.scale}
              onChange={(v) => setPrintSettings({ ...printSettings, scale: v || 100 })} addonAfter="%" /></div>
          <div className="zt-op-row"><span className="zt-op-label">标题</span>
            <Radio.Group value={printSettings.titleMode}
              onChange={(e) => setPrintSettings({ ...printSettings, titleMode: e.target.value })}>
              <Radio value="none">不使用</Radio>
              <Radio value="view">视图名</Radio>
              <Radio value="custom">自定义标题</Radio>
            </Radio.Group></div>
          {printSettings.titleMode === 'custom' && (
            <div className="zt-op-row"><span className="zt-op-label" />
              <Input style={{ width: 220 }} value={printSettings.customTitle} placeholder="输入标题"
                onChange={(e) => setPrintSettings({ ...printSettings, customTitle: e.target.value })} /></div>
          )}
          <div className="zt-op-row"><span className="zt-op-label">包括行号</span>
            <Switch checked={printSettings.rowNumbers} onChange={(v) => setPrintSettings({ ...printSettings, rowNumbers: v })} /></div>
          <div className="zt-op-row"><span className="zt-op-label">将长文字换行</span>
            <Switch checked={printSettings.wrap} onChange={(v) => setPrintSettings({ ...printSettings, wrap: v })} /></div>
          <div className="zt-op-row"><span className="zt-op-label">只显示归总数字</span>
            <Switch checked={printSettings.onlyNumbers} onChange={(v) => setPrintSettings({ ...printSettings, onlyNumbers: v })} /></div>
          <div className="zt-pop-note">分组头部和表格底部只显示归总数字，不显示归总类型。</div>
        </div>
      </Modal>
    </div>
  );
}
