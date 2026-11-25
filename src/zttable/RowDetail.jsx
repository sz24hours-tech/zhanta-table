// 日期/日期时间选择器、评分点星、数字系同编辑器异格式、只读类型灰底）。自动保存：改动即经
// onCellCommit 落库，顶栏左显示「保存中…/所有更改已保存」。顶栏：前/后一行、标题（首字段值）、
// 评论开关（带计数徽标）、全屏、关闭。评论列与侧栏共用
// CommentStream（同一份评论流）。删除走宿主 onDeleteRow（宿主带撤销条，为已点名偏离）。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, DatePicker, message } from 'antd';
import dayjs from 'dayjs';
import MsIcon from '@/components/MsIcon';
import { CommentStream } from './CommentPanel';
import LogItem from './LogList';
import SignaturePad from './SignaturePad';
import {
  displayText, formatNumber, isReadonlyType, optionColor, optionOf,
  memberName, ratingIconMeta, avatarBg, CURRENCY_SYMBOLS,
} from './fields';
import { LinkRecordPicker, RecordCard, recordColumns } from './LinkPicker';
import AddLinkRecordDialog from './AddLinkRecordDialog';
import { useOverlay } from './overlay';

function Avatar({ name, size = 20 }) {
  return (
    <span className="zt-dtl-avatar" style={{ background: avatarBg(name), width: size, height: size, fontSize: size * 0.55 }}>
      {(name || '?').slice(0, 1)}
    </span>
  );
}

// 通用下拉壳：点外部/Esc 关闭
function usePopoverCloser(openKey, setOpenKey) {
  useEffect(() => {
    if (!openKey) return undefined;
    const onDown = (e) => { if (!e.target?.closest?.('.zt-dtl-pop-wrap')) setOpenKey(null); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpenKey(null); } };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [openKey, setOpenKey]);
}

export default function RowDetail({
  fields, row, members = [], order = [], onNavigate, onClose,
  onCellCommit, onDeleteRow, commentsApi, tableId, commentCount = 0,
  onCommentsMutate, uploadFile, linkForRow, initialCommentsOpen = false,
  linkData, sourceNote, onAddLinkedRecord, onOpenLinkedRecord,
  readOnly = false,
}) {
  const [commentsOpen, setCommentsOpen] = useState(initialCommentsOpen);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [histItems, setHistItems] = useState(null);
  const [full, setFull] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle|saving|saved
  const [openPop, setOpenPop] = useState(null); // 打开下拉的 fieldId
  const [cmtCount, setCmtCount] = useState(commentCount);
  usePopoverCloser(openPop, setOpenPop);
  const saveTimer = useRef(null);

  useEffect(() => { setCmtCount(commentCount); }, [commentCount, row?.id]);
  useEffect(() => { setCommentsOpen(initialCommentsOpen); }, [row?.id, initialCommentsOpen]);
  useEffect(() => { setHistoryOpen(false); setHistItems(null); }, [row?.id]);
  useEffect(() => {
    if (!historyOpen || !commentsApi?.history || !row) return;
    let alive = true;
    commentsApi.history(tableId, row.id)
      .then((d) => { if (alive) setHistItems(d.items || []); })
      .catch(() => { if (alive) setHistItems([]); });
    return () => { alive = false; };
  }, [historyOpen, row?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 浮层基线：Esc 分层（先关字段下拉/更多菜单，再关弹窗）、退场动画、滚动锁、焦点圈
  const ov = useOverlay(!!row, {
    onClose,
    exitMs: 150,
    trap: true,
    onEscape: (close) => {
      if (openPop) setOpenPop(null);
      else if (moreOpen) setMoreOpen(false);
      else close();
    },
  });

  const idx = useMemo(() => order.indexOf(row?.id), [order, row?.id]);
  const title = row && fields?.length ? displayText(fields[0], row.cells?.[fields[0].id], members, linkData) : '';

  const commit = useCallback(async (field, value) => {
    if (!row) return;
    setSaveState('saving');
    try {
      await onCellCommit(row.id, field.id, value, row.version);
      setSaveState('saved');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveState('idle'), 2400);
    } catch (e) {
      setSaveState('idle');
    }
  }, [onCellCommit, row]);

  if (!row) return null;

  const copyLink = async () => {
    const url = linkForRow ? linkForRow(row.id) : `${window.location.href.split('?')[0]}?row=${row.id}`;
    try {
      await navigator.clipboard.writeText(url);
      message.success('已复制本行链接');
    } catch (e) {
      message.error('复制失败，请手动复制地址栏链接');
    }
  };

  const printRow = () => {
    setMoreOpen(false);
    const w = window.open('', '_blank', 'width=860,height=640');
    if (!w) { message.error('打印窗口被浏览器拦截'); return; }
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rowsHtml = fields.map((f) => {
      const v = row.cells?.[f.id];
      const text = f.type === 'rating' && v ? `${v} 分` : displayText(f, v, members, linkData);
      return `<tr><td class="lb">${esc(f.name)}</td><td>${esc(text) || '<span class="em">—</span>'}</td></tr>`;
    }).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || '行详情')}</title>
      <style>body{font-family:sans-serif;padding:32px;color:#1f2733}h1{font-size:19px;margin:0 0 18px}
      table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #edf0f4;padding:9px 10px;font-size:13.5px;vertical-align:top}
      td.lb{width:150px;color:#8a94a6}.em{color:#c3cad4}</style></head>
      <body><h1>${esc(title || '行详情')}</h1><table>${rowsHtml}</table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 250);
  };

  return (
    <div ref={ov.ref} className={`zt-dtl-mask${ov.closing ? ' closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) ov.requestClose(); }}>
      <div className={`zt-dtl${full ? ' full' : ''}${(commentsOpen || historyOpen) && commentsApi ? ' with-cmt' : ''}`}>
        <div className="zt-dtl-head">
          {order.length > 1 && (
            <>
              <button className="zt-icon-btn" title="前一行" disabled={idx <= 0} onClick={() => onNavigate(order[idx - 1])}>
                <MsIcon name="keyboard_arrow_up" size={18} />
              </button>
              <button className="zt-icon-btn" title="后一行" disabled={idx < 0 || idx >= order.length - 1} onClick={() => onNavigate(order[idx + 1])}>
                <MsIcon name="keyboard_arrow_down" size={18} />
              </button>
            </>
          )}
          <div className="zt-dtl-title" title={title}>{title || '（未命名）'}</div>
          <span className="zt-dtl-savestate">
            {saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '所有更改已保存' : ''}
          </span>
          <span style={{ flex: 1 }} />
          {!readOnly && (
            <span className="zt-dtl-pop-wrap" style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
              <button className="zt-icon-btn" title="更多操作" onClick={() => setMoreOpen((v) => !v)}>
                <MsIcon name="more_horiz" size={17} />
              </button>
              {moreOpen && (
                <div className="zt-dtl-menu">
                  {onDeleteRow && (
                    <div className="zt-ctxitem danger" onClick={() => { setMoreOpen(false); onDeleteRow(row); }}>
                      <MsIcon name="delete" size={15} /><span>删除</span>
                    </div>
                  )}
                  <div className="zt-ctxitem" onClick={printRow}>
                    <MsIcon name="print" size={15} /><span>打印</span>
                  </div>
                </div>
              )}
            </span>
          )}
          {!readOnly && (
            <button className="zt-icon-btn" title="获取链接" onClick={copyLink}>
              <MsIcon name="link" size={17} />
            </button>
          )}
          {commentsApi && (
            <button className="zt-icon-btn zt-dtl-cmtbtn" title="评论" onClick={() => { setCommentsOpen((v) => !v); setHistoryOpen(false); }}>
              <MsIcon name="mode_comment" size={17} />
              {cmtCount > 0 && <span className="zt-dtl-cmtbadge">{cmtCount}</span>}
            </button>
          )}
          {commentsApi?.history && (
            <button className="zt-icon-btn" title="历史" onClick={() => { setHistoryOpen((v) => !v); setCommentsOpen(false); }}>
              <MsIcon name="history" size={17} />
            </button>
          )}
          <button className="zt-icon-btn" title={full ? '退出全屏' : '全屏'} onClick={() => setFull((v) => !v)}>
            <MsIcon name={full ? 'close_fullscreen' : 'open_in_full'} size={16} />
          </button>
          <button className="zt-icon-btn" title="关闭" onClick={ov.requestClose}>
            <MsIcon name="close" size={17} />
          </button>
        </div>
        {sourceNote && <div className="zt-dtl-source">{sourceNote}</div>}
        <div className="zt-dtl-main">
          <div className="zt-dtl-fields">
            {fields.map((f) => (
              <div key={f.id} className="zt-dtl-row">
                <div className="zt-dtl-label">{f.name}</div>
                <div className="zt-dtl-editor">
                  <FieldEditor
                    field={f} row={row} members={members} commit={commit}
                    openPop={openPop} setOpenPop={setOpenPop} uploadFile={uploadFile}
                    linkData={linkData}
                    onAddLinkedRecord={onAddLinkedRecord}
                    onOpenLinkedRecord={onOpenLinkedRecord}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            ))}
          </div>
          {commentsOpen && commentsApi && (
            <div className="zt-dtl-comments">
              <div className="zt-cmt-sub" style={{ padding: '10px 14px 6px' }}>评论（{cmtCount}）</div>
              <CommentStream
                api={commentsApi} tableId={tableId} row={row} members={members}
                onMutate={onCommentsMutate} onCountChange={setCmtCount}
              />
            </div>
          )}
          {historyOpen && commentsApi?.history && (
            <div className="zt-dtl-comments">
              <div className="zt-cmt-sub" style={{ padding: '10px 14px 6px' }}>历史记录</div>
              <div className="zt-log-wrap" style={{ paddingBottom: 8 }}>
                {histItems === null
                  ? <div style={{ padding: '8px 14px', color: '#98a1af', fontSize: 13 }}>加载中…</div>
                  : histItems.length === 0
                    ? <div style={{ padding: '8px 14px', color: '#98a1af', fontSize: 13 }}>暂无修改记录</div>
                    : histItems.map((a) => <LogItem key={a.id} a={a} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldEditor({ field, row, members, commit, openPop, setOpenPop, uploadFile, linkData, onAddLinkedRecord, onOpenLinkedRecord, readOnly = false }) {
  const v = row.cells?.[field.id];
  const open = openPop === field.id;
  const setOpen = (on) => setOpenPop(on ? field.id : null);
  const [draft, setDraft] = useState(null); // 文本类本地草稿（null=未编辑）
  const [search, setSearch] = useState('');
  const [sigOpen, setSigOpen] = useState(false);
  const [addDlg, setAddDlg] = useState(null); // 链接列「增加链接记录」对话框 {prefill}
  const fileRef = useRef(null);

  useEffect(() => { setDraft(null); setSearch(''); }, [row.id, field.id, v]);

  if (isReadonlyType(field.type)) {
    if (field.type === 'formula' && row.formula_errors?.[field.id]) {
      return <div className="zt-dtl-readonly"><span className="zt-formula-err">计算错误：{row.formula_errors[field.id]}</span></div>;
    }
    return <div className="zt-dtl-readonly">{displayText(field, v, members, linkData) || '—'}</div>;
  }

  // 只读形态（外部链接访客打开被链记录详情）：静态呈现，链接卡片仍可点开下一层，
  // 无解除/添加/上传/签名等一切写入口
  if (readOnly) {
    switch (field.type) {
      case 'link': {
        const ids = v || [];
        const labels = linkData?.[field.id]?.labels || {};
        if (!ids.length) return <div className="zt-dtl-readonly">—</div>;
        const optsById = {};
        (linkData?.[field.id]?.options || []).forEach((o) => { optsById[o.id] = o; });
        const { columns } = recordColumns(field, linkData);
        return (
          <div className="zt-dtl-linkcards2">
            {ids.map((id) => (
              <RecordCard
                key={id} variant="pairs"
                label={labels[id] || '（记录已删除）'}
                columns={columns} cells={optsById[id]?.cells}
                linkData={linkData} members={members}
                onTitleClick={onOpenLinkedRecord ? () => onOpenLinkedRecord(field, id) : undefined}
              />
            ))}
          </div>
        );
      }
      case 'attachment': {
        const arr = v || [];
        if (!arr.length) return <div className="zt-dtl-readonly">—</div>;
        return (
          <div className="zt-dtl-attach">
            {arr.map((a, i) => (
              <span key={a.id || i} className="zt-dtl-filechip">
                <MsIcon name="attach_file" size={13} />
                <a href={a.url} target="_blank" rel="noreferrer">{a.name || '附件'}</a>
              </span>
            ))}
          </div>
        );
      }
      case 'signature':
        return (
          <div className="zt-dtl-sig">
            {v?.url
              ? <img src={v.url} alt="签名" draggable={false} />
              : <span className="zt-dtl-sig-empty">尚未签名</span>}
          </div>
        );
      case 'select': {
        const cur = optionOf(field, v);
        return cur
          ? <span className="zt-chip-solid" style={{ background: optionColor(cur.color).solid }}>{cur.label}</span>
          : <div className="zt-dtl-readonly">—</div>;
      }
      case 'multiselect': {
        const sel = (v || []).map((id) => optionOf(field, id)).filter(Boolean);
        if (!sel.length) return <div className="zt-dtl-readonly">—</div>;
        return (
          <span>
            {sel.map((o) => {
              const c = optionColor(o.color);
              return <span key={o.id} className="zt-chip-soft" style={{ background: c.soft, color: c.fg }}>{o.label}</span>;
            })}
          </span>
        );
      }
      case 'member': {
        if (!v) return <div className="zt-dtl-readonly">—</div>;
        return <span className="zt-dtl-memberchip"><Avatar name={memberName(members, v)} />{memberName(members, v)}</span>;
      }
      case 'checkbox':
        return <Checkbox checked={!!v} disabled />;
      case 'rating': {
        const max = Math.min(field.config?.max || 5, 10);
        const st = field.config?.ratingStyle || {};
        const icon = ratingIconMeta(st.icon).icon;
        const onColor = optionColor(st.color || 'yellow').solid;
        return (
          <span className="zt-dtl-rating">
            {Array.from({ length: max }, (_, i) => (
              <MsIcon
                key={i} name={icon} size={20} filled={i < (v || 0)}
                className={i < (v || 0) ? '' : 'zt-star-off'}
                style={i < (v || 0) ? { color: onColor } : undefined}
              />
            ))}
          </span>
        );
      }
      case 'button':
        return <div className="zt-dtl-readonly">—</div>;
      default:
        return <div className="zt-dtl-readonly">{displayText(field, v, members, linkData) || '—'}</div>;
    }
  }

  switch (field.type) {
    case 'checkbox':
      return (
        <Checkbox
          checked={!!v}
          onChange={(e) => commit(field, e.target.checked)}
        />
      );
    case 'rating': {
      const max = Math.min(field.config?.max || 5, 10);
      const st = field.config?.ratingStyle || {};
      const icon = ratingIconMeta(st.icon).icon;
      const onColor = optionColor(st.color || 'yellow').solid;
      return (
        <span
          className="zt-dtl-rating" tabIndex={0} title="按数字键输入相应的值"
          onKeyDown={(e) => {
            const n = parseInt(e.key, 10);
            if (n >= 1 && n <= max) commit(field, n);
          }}
        >
          {Array.from({ length: max }, (_, i) => (
            <span key={i} className="zt-rating-pick" onClick={() => commit(field, i + 1 === v ? null : i + 1)}>
              <MsIcon
                name={icon} size={20} filled={i < (v || 0)}
                className={i < (v || 0) ? '' : 'zt-star-off'}
                style={i < (v || 0) ? { color: onColor } : undefined}
              />
            </span>
          ))}
        </span>
      );
    }
    case 'select': {
      const opts = field.config?.options || [];
      const cur = optionOf(field, v);
      const list = opts.filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()));
      return (
        <span className="zt-dtl-pop-wrap">
          <button className="zt-dtl-selectbox" onClick={() => setOpen(!open)}>
            {cur
              ? <span className="zt-chip-solid" style={{ background: optionColor(cur.color).solid }}>{cur.label}</span>
              : <span className="zt-dtl-placeholder">请选择</span>}
            <MsIcon name="arrow_drop_down" size={16} />
          </button>
          {open && (
            <div className="zt-dtl-pop">
              <input
                className="zt-dtl-search" placeholder="搜索选项" autoFocus value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className={`zt-pop-item ${v == null ? 'sel' : ''}`} onClick={() => { commit(field, null); setOpen(false); }}>（清空）</div>
              {list.map((o) => (
                <div key={o.id} className={`zt-pop-item ${v === o.id ? 'sel' : ''}`} onClick={() => { commit(field, o.id); setOpen(false); }}>
                  <span className="zt-chip-solid" style={{ background: optionColor(o.color).solid }}>{o.label}</span>
                  {v === o.id && <MsIcon name="check" size={15} className="zt-dtl-tick" />}
                </div>
              ))}
              {list.length === 0 && <div className="zt-dtl-noopt">没有找到选项</div>}
            </div>
          )}
        </span>
      );
    }
    case 'multiselect': {
      const opts = field.config?.options || [];
      const sel = new Set(v || []);
      const list = opts.filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()));
      const toggle = (id) => {
        const n = new Set(sel);
        if (n.has(id)) n.delete(id); else n.add(id);
        commit(field, [...n]);
      };
      return (
        <span className="zt-dtl-pop-wrap">
          <button className="zt-dtl-selectbox multi" onClick={() => setOpen(!open)}>
            {sel.size
              ? [...sel].map((id) => {
                const o = optionOf(field, id);
                if (!o) return null;
                const c = optionColor(o.color);
                return (
                  <span key={id} className="zt-chip-soft" style={{ background: c.soft, color: c.fg }}>
                    {o.label}
                    <span
                      className="zt-dtl-chipx"
                      onClick={(e) => { e.stopPropagation(); toggle(id); }}
                    ><MsIcon name="close" size={11} /></span>
                  </span>
                );
              })
              : <span className="zt-dtl-placeholder">请选择</span>}
            <MsIcon name="arrow_drop_down" size={16} />
          </button>
          {open && (
            <div className="zt-dtl-pop">
              <input
                className="zt-dtl-search" placeholder="搜索选项" autoFocus value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {opts.length === 0 && <div className="zt-dtl-noopt">没有标签</div>}
              {list.map((o) => {
                const c = optionColor(o.color);
                const on = sel.has(o.id);
                return (
                  <div key={o.id} className="zt-pop-item" onClick={() => toggle(o.id)}>
                    <span className={`zt-checkbox sm ${on ? 'on' : ''}`}>{on && <MsIcon name="check" size={11} className="zt-check" />}</span>
                    <span className="zt-chip-soft" style={{ background: c.soft, color: c.fg }}>{o.label}</span>
                    {on && <MsIcon name="check" size={15} className="zt-dtl-tick" />}
                  </div>
                );
              })}
              {opts.length > 0 && list.length === 0 && <div className="zt-dtl-noopt">没有找到标签</div>}
            </div>
          )}
        </span>
      );
    }
    case 'member': {
      const list = members.filter((m) => !search || (m.name || '').toLowerCase().includes(search.toLowerCase()));
      return (
        <span className="zt-dtl-pop-wrap">
          <button className="zt-dtl-selectbox" onClick={() => setOpen(!open)}>
            {v
              ? <span className="zt-dtl-memberchip"><Avatar name={memberName(members, v)} />{memberName(members, v)}</span>
              : <span className="zt-dtl-placeholder">请选择</span>}
            <MsIcon name="arrow_drop_down" size={16} />
          </button>
          {open && (
            <div className="zt-dtl-pop">
              <input
                className="zt-dtl-search" placeholder="搜索协作人" autoFocus value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className={`zt-pop-item ${v == null ? 'sel' : ''}`} onClick={() => { commit(field, null); setOpen(false); }}>（清空）</div>
              {list.map((m) => (
                <div key={m.uid} className={`zt-pop-item ${v === m.uid ? 'sel' : ''}`} onClick={() => { commit(field, m.uid); setOpen(false); }}>
                  <Avatar name={m.name} />
                  <span>{m.name}</span>
                  {v === m.uid && <MsIcon name="check" size={15} className="zt-dtl-tick" />}
                </div>
              ))}
              {list.length === 0 && <div className="zt-dtl-noopt">没有找到协作人</div>}
            </div>
          )}
        </span>
      );
    }
    case 'date': {
      const isDT = field.config?.precision === 'minute';
      const dv = v ? dayjs(String(v).replace(' ', 'T')) : null;
      return (
        <DatePicker
          className="zt-dtl-date"
          value={dv && dv.isValid() ? dv : null}
          format={isDT ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'}
          showTime={isDT ? { format: 'HH:mm' } : false}
          placeholder={isDT ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'}
          onChange={(d) => {
            if (!d) { commit(field, null); return; }
            commit(field, isDT ? d.toISOString() : d.format('YYYY-MM-DD'));
          }}
        />
      );
    }
    case 'link': {

      // 链接已有记录开宽选择器，hideLinkBtn 时不显示）、已链记录为多列卡片（标题开详情、× 解除）；
      // 选择器点选立即生效、已链记录不在列表内；limitOne 已满 1 条时双按钮不显示
      const ids = v || [];
      const labels = linkData?.[field.id]?.labels || {};
      const optsById = {};
      (linkData?.[field.id]?.options || []).forEach((o) => { optsById[o.id] = o; });
      const { columns } = recordColumns(field, linkData);
      const one = !!field.config?.limitOne;
      const toggle = (id) => commit(field, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
      return (
        <span className="zt-dtl-pop-wrap">
          <span className="zt-dtl-linksec">
            {!(one && ids.length >= 1) && (onAddLinkedRecord || !field.config?.hideLinkBtn) && (
              <span className="zt-dtl-linkbtns">
                {onAddLinkedRecord && (
                  <button type="button" className="zt-dtl-graybtn" onClick={() => setAddDlg({ prefill: '' })}>
                    添加记录
                  </button>
                )}
                {!field.config?.hideLinkBtn && (
                  <button type="button" className="zt-dtl-graybtn" onClick={() => setOpen(!open)}>
                    链接已有记录
                  </button>
                )}
              </span>
            )}
            <span className="zt-dtl-linkcards2">
              {ids.map((id) => (
                <RecordCard
                  key={id} variant="pairs"
                  label={labels[id] || '（记录已删除）'}
                  columns={columns} cells={optsById[id]?.cells}
                  linkData={linkData} members={members}
                  onTitleClick={onOpenLinkedRecord ? () => onOpenLinkedRecord(field, id) : undefined}
                  onRemove={() => commit(field, ids.filter((x) => x !== id))}
                />
              ))}
              {ids.length === 0 && <span className="zt-dtl-noopt">没有链接的记录</span>}
            </span>
          </span>
          {open && (
            <div className="zt-dtl-pop zt-dtl-linkpop2">
              <LinkRecordPicker
                field={field} value={ids} linkData={linkData} members={members}
                onToggle={toggle}
                onPickOne={(id) => { commit(field, [id]); setOpen(false); }}
                onBack={() => setOpen(false)}
                onClose={() => setOpen(false)}
                onAddRecord={onAddLinkedRecord ? (name) => { setOpen(false); setAddDlg({ prefill: name }); } : undefined}
              />
            </div>
          )}
          {addDlg && (
            <AddLinkRecordDialog
              field={field} linkData={linkData} members={members} prefill={addDlg.prefill}
              onCancel={() => setAddDlg(null)}
              addEmptyRecord={onAddLinkedRecord ? (f) => onAddLinkedRecord(f) : undefined}
              onSubmit={async (cells) => {
                const nid = await onAddLinkedRecord(field, cells);
                if (nid) await commit(field, one ? [nid] : [...ids, nid]);
                setAddDlg(null);
              }}
            />
          )}
        </span>
      );
    }
    case 'attachment': {
      const arr = v || [];
      const addFiles = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !uploadFile) return;
        try {
          const r = await uploadFile(file);
          commit(field, [...arr, r.file]);
        } catch (err) { message.error(err.message); }
      };
      return (
        <div className="zt-dtl-attach">
          {arr.map((a, i) => (
            <span key={a.id || i} className="zt-dtl-filechip">
              <MsIcon name="attach_file" size={13} />
              <a href={a.url} target="_blank" rel="noreferrer">{a.name || '附件'}</a>
              <span
                className="zt-dtl-chipx"
                onClick={() => commit(field, arr.filter((_, j) => j !== i))}
              ><MsIcon name="close" size={11} /></span>
            </span>
          ))}
          {uploadFile && (
            <>
              <button className="zt-dtl-addfile" onClick={() => fileRef.current?.click()}>添加文件</button>
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={addFiles} />
            </>
          )}
        </div>
      );
    }
    case 'signature': {
      return (
        <div className="zt-dtl-sig">
          {v?.url
            ? <img src={v.url} alt="签名" draggable={false} />
            : <span className="zt-dtl-sig-empty">尚未签名</span>}
          <Button size="small" onClick={() => setSigOpen(true)}>{v?.url ? '重新签名' : '签名'}</Button>
          {v?.url && <Button size="small" onClick={() => commit(field, null)}>清除</Button>}
          {sigOpen && (
            <SignaturePad
              value={v || null}
              uploadFile={uploadFile}
              onSave={(nv) => { commit(field, nv); setSigOpen(false); }}
              onClose={() => setSigOpen(false)}
            />
          )}
        </div>
      );
    }
    case 'longtext':
      return (
        <textarea
          className="zt-dtl-textarea"
          rows={3}
          value={draft ?? (v ?? '')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== null && draft !== (v ?? '')) commit(field, draft === '' ? null : draft); }}
        />
      );
    case 'number': {
      const cfg = field.config || {};
      const isPct = cfg.format === 'percent';
      const shown = draft ?? (v === null || v === undefined || v === ''
        ? ''
        : String(isPct ? parseFloat((Number(v) * 100).toFixed(6)) : v));
      const sym = cfg.format === 'currency'
        ? (cfg.currency === 'custom' ? (cfg.symbol || '') : (CURRENCY_SYMBOLS[cfg.currency || 'CNY'] || '¥'))
        : '';
      return (
        <span className="zt-dtl-numwrap">
          {sym && <span className="zt-dtl-affix">{sym}</span>}
          <input
            className="zt-dtl-input" inputMode="decimal"
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft === null) return;
              const raw = draft.trim();
              if (raw === '') { if (v !== null && v !== undefined) commit(field, null); return; }
              const n = Number(raw);
              if (!Number.isNaN(n)) commit(field, isPct ? n / 100 : n);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          />
          {isPct && <span className="zt-dtl-affix">%</span>}
          {v !== null && v !== undefined && v !== '' && <span className="zt-dtl-fmt">{formatNumber(field, v)}</span>}
        </span>
      );
    }
    case 'duration': {
      const shown = draft ?? (v === null || v === undefined ? '' : String(v));
      return (
        <span className="zt-dtl-numwrap">
          <input
            className="zt-dtl-input" inputMode="numeric"
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft === null) return;
              const raw = draft.trim();
              if (raw === '') { if (v != null) commit(field, null); return; }
              const n = Number(raw);
              if (!Number.isNaN(n)) commit(field, n);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          />
          <span className="zt-dtl-fmt">秒</span>
        </span>
      );
    }
    default: // text / email / url / phone
      return (
        <input
          className="zt-dtl-input"
          value={draft ?? (v ?? '')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== null && draft !== (v ?? '')) commit(field, draft === '' ? null : draft); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        />
      );
  }
}
