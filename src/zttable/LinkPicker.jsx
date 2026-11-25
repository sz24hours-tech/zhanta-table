// 链接列共用组件：药丸渲染 + 记录卡片 + 「链接已有记录」选择器（网格与行详情共用）。
// ‹ › 按列横滚）、卡片两行（首行展示列值、次行各列值对齐列头）、点选立即生效、
// 已链接记录不出现在列表、搜索选项行（精确匹配/可搜索的列）、搜索词底部「+ 添加记录」。
// linkData 契约（宿主提供）：{ [fieldId]: { options: [{id, label, cells}], labels, targetFields, displayFieldId } }
import React, { useState } from 'react';
import { Checkbox, Popover, Switch } from 'antd';
import MsIcon from '@/components/MsIcon';
import { displayText, optionColor } from './fields';

export const LINK_COL_W = 150;

export function LinkPills({ field, value, linkData }) {
  const arr = value || [];
  if (!arr.length) return null;
  const labels = linkData?.[field.id]?.labels || {};
  const shown = arr.slice(0, 3);
  return (
    <span className="zt-chips">
      {shown.map((id) => (
        <span key={id} className="zt-link-pill">{labels[id] || '（记录已删除）'}</span>
      ))}
      {arr.length > 3 && <span className="zt-chip-more">+{arr.length - 3}</span>}
    </span>
  );
}

// 展示列与数据列拆分：展示列＝宿主解析出的 displayFieldId（缺省目标表第一个非链接列），
// 其余目标列按字段顺序作数据列（列头与卡片第二行）
export function recordColumns(field, linkData) {
  const ld = linkData?.[field.id] || {};
  const tFields = ld.targetFields || [];
  const disp = tFields.find((f) => f.id === ld.displayFieldId)
    || tFields.find((f) => f.type !== 'link') || tFields[0] || null;
  return { dispField: disp, columns: tFields.filter((f) => !disp || f.id !== disp.id) };
}

function ColValue({ f, v, linkData, members }) {
  if (f.type === 'link') {
    const ids = v || [];
    if (!ids.length) return <span className="zt-rc-dashpill" />;
    const labels = linkData?.[f.id]?.labels || {};
    return (
      <span className="zt-rc-pills">
        {ids.map((id) => <span key={id} className="zt-rc-pill">{labels[id] || '（未命名）'}</span>)}
      </span>
    );
  }
  if (f.type === 'select') {
    const o = (f.config?.options || []).find((x) => x.id === v);
    if (!o) return <span className="zt-rc-blank" />;
    const c = optionColor(o.color);
    return <span className="zt-chip-solid" style={{ background: c.solid, color: '#fff' }}>{o.label}</span>;
  }
  if (f.type === 'multiselect') {
    const arr = v || [];
    if (!arr.length) return <span className="zt-rc-blank" />;
    return (
      <span className="zt-rc-pills">
        {arr.map((id) => {
          const o = (f.config?.options || []).find((x) => x.id === id);
          if (!o) return null;
          const c = optionColor(o.color);
          return <span key={id} className="zt-chip-soft" style={{ background: c.soft, color: c.fg }}>{o.label}</span>;
        })}
      </span>
    );
  }
  const t = displayText(f, v, members, linkData);
  return <span className="zt-rc-text">{t}</span>;
}

// variant=pairs 时为「列名 值」标签流（链接的记录视图/行详情已链卡片用）
export function RecordCard({
  label, columns, cells, linkData, members, offset = 0, variant = 'table',
  selected, onClick, onTitleClick, onRemove,
}) {
  return (
    <div className={`zt-record-card${selected ? ' sel' : ''}`} onClick={onClick}>
      <div className="zt-record-card-title">
        {onTitleClick
          ? <span className="zt-link-open" onClick={(e) => { e.stopPropagation(); onTitleClick(); }}>{label}</span>
          : label}
      </div>
      {cells && variant === 'table' && (
        <div className="zt-rc-viewport">
          <div className="zt-rc-strip" style={{ transform: `translateX(${-offset * LINK_COL_W}px)` }}>
            {columns.map((f) => (
              <span className="zt-rc-cell" key={f.id}>
                <ColValue f={f} v={cells[f.id]} linkData={linkData} members={members} />
              </span>
            ))}
          </div>
        </div>
      )}
      {cells && variant === 'pairs' && (
        <div className="zt-rc-pairs">
          {columns.map((f) => (
            <span className="zt-rc-pair" key={f.id}>
              <span className="zt-rc-pair-name">{f.name}</span>
              {displayText(f, cells[f.id], members, linkData) || '—'}
            </span>
          ))}
        </div>
      )}
      {selected && <span className="zt-record-check"><MsIcon name="check" size={12} /></span>}
      {onRemove && (
        <span
          className="zt-link-card-x zt-record-x" title="取消链接"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        ><MsIcon name="close" size={13} /></span>
      )}
    </div>
  );
}

// 打开前已链接的记录不出现在列表里；本层内点过的留在列表带绿勾、可再点取消。
export function LinkRecordPicker({
  field, value, linkData, members, onToggle, onPickOne, onBack, onClose, onAddRecord,
}) {
  const ld = linkData?.[field.id] || {};
  const { dispField, columns } = recordColumns(field, linkData);
  const [q, setQ] = useState('');
  const [exact, setExact] = useState(false);
  const [optsOpen, setOptsOpen] = useState(false);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [colQuery, setColQuery] = useState('');
  const [searchable, setSearchable] = useState(() => new Set(columns.map((c) => c.id)));
  const [offset, setOffset] = useState(0);
  const [initialIds] = useState(() => new Set(value || []));
  const sel = new Set(value || []);
  const one = !!field.config?.limitOne;
  const kw = q.trim().toLowerCase();
  const maxOffset = Math.max(0, columns.length - 3);
  const off = Math.min(offset, maxOffset);
  const list = (ld.options || [])
    .filter((o) => !initialIds.has(o.id))
    .filter((o) => {
      if (!kw) return true;
      const fs = [dispField, ...columns.filter((c) => searchable.has(c.id))].filter(Boolean);
      return fs.some((f) => {
        const t = (displayText(f, o.cells?.[f.id], members, linkData) || '').toLowerCase();
        return exact ? t === kw : t.includes(kw);
      });
    });
  const colMenu = (
    <div className="zt-picker-colmenu">
      <input
        className="zt-dtl-search" placeholder="搜索列" value={colQuery}
        onChange={(e) => setColQuery(e.target.value)}
      />
      <div className="zt-picker-colmenu-list">
        {columns
          .filter((c) => !colQuery.trim() || c.name.toLowerCase().includes(colQuery.trim().toLowerCase()))
          .map((c) => (
            <div key={c.id} className="zt-picker-colmenu-row">
              <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
              <Switch
                size="small" className="zt-oswitch" checked={searchable.has(c.id)}
                onChange={(v) => setSearchable((prev) => {
                  const next = new Set(prev);
                  if (v) next.add(c.id); else next.delete(c.id);
                  return next;
                })}
              />
            </div>
          ))}
      </div>
      <div className="zt-picker-colmenu-foot">
        <button type="button" className="zt-picker-hideall" onClick={() => setSearchable(new Set())}>隐藏所有</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="zt-picker-showall" onClick={() => setSearchable(new Set(columns.map((c) => c.id)))}>显示所有</button>
      </div>
    </div>
  );
  return (
    <div className="zt-picker">
      <div className="zt-picker-head">
        {onBack && (
          <button type="button" className="zt-picker-iconbtn" title="返回" onClick={onBack}>
            <MsIcon name="arrow_back" size={17} />
          </button>
        )}
        <span className="zt-picker-title">链接已有记录</span>
        <span style={{ flex: 1 }} />
        {onClose && (
          <button type="button" className="zt-picker-iconbtn" title="关闭" onClick={onClose}>
            <MsIcon name="close" size={16} />
          </button>
        )}
      </div>
      <div className="zt-picker-searchrow">
        <input
          className="zt-picker-search" placeholder="搜索记录" autoFocus value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); } }}
        />
        <button
          type="button" className={`zt-picker-iconbtn${optsOpen ? ' on' : ''}`} title="搜索选项"
          onClick={() => setOptsOpen((o) => !o)}
        >
          <MsIcon name="tune" size={17} />
        </button>
      </div>
      {optsOpen && (
        <div className="zt-picker-opts">
          <Checkbox checked={exact} onChange={(e) => setExact(e.target.checked)}>精确匹配</Checkbox>
          <span style={{ flex: 1 }} />
          <Popover
            trigger="click" placement="bottomRight" open={colMenuOpen}
            onOpenChange={setColMenuOpen} content={colMenu}
          >
            <button type="button" className="zt-picker-colbtn">
              <MsIcon name="view_list" size={15} />可搜索的列
            </button>
          </Popover>
        </div>
      )}
      <div className="zt-picker-colhead">
        <button
          type="button" className="zt-picker-arrow" disabled={off <= 0}
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
        >
          <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><MsIcon name="chevron_right" size={15} /></span>
        </button>
        <div className="zt-rc-viewport zt-picker-colviewport">
          <div className="zt-rc-strip" style={{ transform: `translateX(${-off * LINK_COL_W}px)` }}>
            {columns.map((f) => <span className="zt-rc-cell zt-picker-colname" key={f.id}>{f.name}</span>)}
          </div>
        </div>
        <button
          type="button" className="zt-picker-arrow" disabled={off >= maxOffset}
          onClick={() => setOffset((o) => Math.min(maxOffset, o + 1))}
        >
          <MsIcon name="chevron_right" size={15} />
        </button>
      </div>
      <div className="zt-picker-list">
        {list.map((o) => (
          <RecordCard
            key={o.id}
            label={o.label || '（未命名）'}
            columns={columns} cells={o.cells} linkData={linkData} members={members} offset={off}
            selected={sel.has(o.id)}
            onClick={() => (one ? onPickOne && onPickOne(o.id) : onToggle && onToggle(o.id))}
          />
        ))}
        {list.length === 0 && <div className="zt-picker-empty">没有可选记录</div>}
      </div>
      {!!q.trim() && onAddRecord && (
        <button type="button" className="zt-picker-addbtn" onClick={() => onAddRecord(q.trim())}>
          + 添加记录 “{q.trim()}”
        </button>
      )}
    </div>
  );
}

// 已链记录为「列名 值」标签流卡片（标题点开详情、× 取消链接）；空态文案＋居中双按钮。
// limitOne 已满 1 条时双按钮不显示。
export function LinkedRecordsPanel({
  field, value, linkData, members, readOnly, onOpenRecord, onRemove, onAddClick, onPickClick,
}) {
  const labels = linkData?.[field.id]?.labels || {};
  const optsById = {};
  (linkData?.[field.id]?.options || []).forEach((o) => { optsById[o.id] = o; });
  const { columns } = recordColumns(field, linkData);
  const ids = value || [];
  const one = !!field.config?.limitOne;
  const showBtns = !readOnly && !(one && ids.length >= 1);
  const btns = (
    <>
      {onAddClick && <button type="button" className="zt-orange-outline-btn" onClick={onAddClick}>添加记录</button>}
      {!field.config?.hideLinkBtn && onPickClick && (
        <button type="button" className="zt-orange-outline-btn" onClick={onPickClick}>链接已有记录</button>
      )}
    </>
  );
  return (
    <div className="zt-linked-panel">
      <div className="zt-linked-panel-head">
        <span className="zt-picker-title">链接的记录</span>
        <span style={{ flex: 1 }} />
        {ids.length > 0 && showBtns && <span className="zt-linked-btns">{btns}</span>}
      </div>
      {ids.length > 0 ? (
        <div className="zt-linked-panel-list">
          {ids.map((id) => (
            <RecordCard
              key={id} variant="pairs"
              label={labels[id] || '（记录已删除）'}
              columns={columns} cells={optsById[id]?.cells}
              linkData={linkData} members={members}
              onTitleClick={onOpenRecord ? () => onOpenRecord(field, id) : undefined}
              onRemove={!readOnly && onRemove ? () => onRemove(id) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="zt-linked-empty">
          <div className="zt-linked-empty-text">没有链接的记录</div>
          {showBtns && <div className="zt-linked-btns center">{btns}</div>}
        </div>
      )}
    </div>
  );
}

// 已链记录列表（旧形态，保留兼容）：卡片纵列，标题点开被链记录详情，右上 × 取消链接
export function LinkedList({ field, value, linkData, onOpenRecord, onRemove }) {
  const labels = linkData?.[field.id]?.labels || {};
  const arr = value || [];
  if (!arr.length) return <div className="zt-dtl-noopt">没有链接的记录</div>;
  return (
    <div className="zt-linked-list">
      {arr.map((id) => (
        <div key={id} className="zt-link-card-item static">
          <span
            className="zt-link-picker-label zt-link-open"
            onClick={() => onOpenRecord && onOpenRecord(field, id)}
          >{labels[id] || '（记录已删除）'}</span>
          {onRemove && (
            <span
              className="zt-link-card-x" title="取消链接"
              onClick={() => onRemove(id)}
            ><MsIcon name="close" size={13} /></span>
          )}
        </div>
      ))}
    </div>
  );
}
