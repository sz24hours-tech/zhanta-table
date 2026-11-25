// 每条带「…」菜单（标记为已解决/删除，均无二次确认）；底部输入 Enter 发送、Shift+Enter 换行，
// 可附图片（经宿主 api 上传）、输入 @ 弹成员列表插入提及。评论数据经宿主注入的 api 对象读写，
// 本组件不直连后端（插件层零后端依赖，与 dataOpsApi 同口径）。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { message, Spin } from 'antd';
import MsIcon from '@/components/MsIcon';
import { useOverlay } from './overlay';

const AVATAR_COLORS = ['#2f7cf6', '#e8833a', '#3aa655', '#8b5cf6', '#d6538c', '#0e9594', '#b7791f', '#5b6b82'];
const avatarColor = (name) => {
  let h = 0;
  const s = String(name || '?');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

// 评论流（列表＋输入区）：侧栏面板与行详情弹窗共用同一份实现与数据层。
export function CommentStream({ api, tableId, row, members = [], onMutate, onCountChange }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [pendingImages, setPendingImages] = useState([]);
  const [menuFor, setMenuFor] = useState(null); // 打开「…」菜单的评论 id
  const [mention, setMention] = useState(null); // {list, at} @ 候选
  const [parts, setParts] = useState([]); // 评论参与人（新评论只通知参与人）
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const sendingRef = useRef(false);
  const fileRef = useRef(null);
  const taRef = useRef(null);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    if (!api || !tableId || !row) return;
    setLoading(true);
    try {
      const r = await api.list(tableId, row.id);
      setComments(r.comments || []);
    } catch (e) { message.error(e.message); }
    setLoading(false);
  }, [api, tableId, row]);

  const loadParts = useCallback(async () => {
    if (!api?.participants || !tableId || !row) return;
    try {
      const r = await api.participants(tableId, row.id);
      setParts(r.participants || []);
    } catch { /* 参与人加载失败不挡评论主流程 */ }
  }, [api, tableId, row]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadParts(); }, [loadParts]);
  useEffect(() => { onCountChange?.(comments.length); }, [comments.length, onCountChange]);
  useEffect(() => { setDraft(''); setPendingImages([]); setMenuFor(null); setMention(null); setPickerOpen(false); setPickerQuery(''); }, [row?.id]);
  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDown = (e) => { if (!e.target?.closest?.('.zt-cmt-picker') && !e.target?.closest?.('.zt-cmt-addpart')) setPickerOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [pickerOpen]);

  const togglePart = async (mb) => {
    const on = parts.some((p) => p.uid === mb.uid);
    try {
      const r = on ? await api.removeParticipant(tableId, row.id, mb.uid) : await api.addParticipant(tableId, row.id, mb.uid);
      setParts(r.participants || []);
    } catch (e) { message.error(e.message); }
  };
  useEffect(() => {
    if (!menuFor) return undefined;
    const onDown = (e) => { if (!e.target?.closest?.('.zt-cmt-menu')) setMenuFor(null); };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [menuFor]);

  const scrollBottom = () => {
    requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; });
  };

  const send = async () => {
    const content = draft.trim();
    if (sendingRef.current) return;
    if (!content && !pendingImages.length) return;
    sendingRef.current = true;
    try {
      const r = await api.create(tableId, row.id, { content, images: pendingImages });
      setComments((prev) => [...prev, r.comment]);
      setDraft('');
      setPendingImages([]);
      onMutate?.();
      loadParts(); // 发评论后作者/@提及者已在服务端加入参与人，刷新头像行
      scrollBottom();
    } catch (e) { message.error(e.message); }
    sendingRef.current = false;
  };

  const toggleResolved = async (cm) => {
    setMenuFor(null);
    try {
      await api.setResolved(cm.id, !cm.resolved);
      setComments((prev) => prev.map((x) => (x.id === cm.id ? { ...x, resolved: !x.resolved } : x)));
    } catch (e) { message.error(e.message); }
  };

  const remove = async (cm) => {
    setMenuFor(null);
    try {
      await api.remove(cm.id);
      setComments((prev) => prev.filter((x) => x.id !== cm.id));
      onMutate?.();
    } catch (e) { message.error(e.message); }
  };

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { message.error('图片大小不能超过 2MB'); return; }
    try {
      const r = await api.uploadImage(tableId, file);
      setPendingImages((prev) => [...prev, r.image]);
    } catch (err) { message.error(err.message); }
  };

  const onDraftChange = (e) => {
    const v = e.target.value;
    setDraft(v);
    const pos = e.target.selectionStart ?? v.length;
    const before = v.slice(0, pos);
    const m = before.match(/@([^\s@]*)$/);
    if (m && members.length) {
      const q = m[1].toLowerCase();
      const list = members.filter((mb) => (mb.name || '').toLowerCase().includes(q)).slice(0, 8);
      setMention(list.length ? { list, start: pos - m[1].length - 1 } : null);
    } else setMention(null);
  };

  const pickMention = (mb) => {
    const ta = taRef.current;
    const pos = ta?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, mention.start)}@${mb.name} ${draft.slice(pos)}`;
    setDraft(next);
    setMention(null);
    requestAnimationFrame(() => { ta?.focus(); });
  };

  if (!row) return null;
  return (
    <>
      <div className="zt-cmt-list" ref={listRef}>
        {loading ? <div className="zt-cmt-loading"><Spin size="small" /></div> : (
          comments.length === 0 ? <div className="zt-cmt-empty">暂无评论</div> : comments.map((cm) => (
            <div key={cm.id} className={`zt-cmt-item${cm.resolved ? ' resolved' : ''}`}>
              <span className="zt-cmt-avatar" style={{ background: avatarColor(cm.author_name) }}>
                {(cm.author_name || '?').slice(0, 1)}
              </span>
              <div className="zt-cmt-body">
                <div className="zt-cmt-meta">
                  <span className="zt-cmt-name">{cm.author_name}</span>
                  <span className="zt-cmt-time">{cm.created_at}</span>
                  {cm.resolved && <span className="zt-cmt-resolved-tag">已解决</span>}
                  <span style={{ flex: 1 }} />
                  <button className="zt-icon-btn zt-cmt-more" onClick={() => setMenuFor(menuFor === cm.id ? null : cm.id)}>
                    <MsIcon name="more_horiz" size={15} />
                  </button>
                </div>
                {menuFor === cm.id && (
                  <div className="zt-cmt-menu">
                    <div className="zt-ctxitem" onClick={() => toggleResolved(cm)}>
                      <MsIcon name={cm.resolved ? 'radio_button_unchecked' : 'check_circle'} size={14} />
                      <span>{cm.resolved ? '标记为未解决' : '标记为已解决'}</span>
                    </div>
                    <div className="zt-ctxitem danger" onClick={() => remove(cm)}>
                      <MsIcon name="delete" size={14} /><span>删除</span>
                    </div>
                  </div>
                )}
                {cm.content && <div className="zt-cmt-text">{cm.content}</div>}
                {Array.isArray(cm.images) && cm.images.length > 0 && (
                  <div className="zt-cmt-imgs">
                    {cm.images.map((im) => (
                      <a key={im.id} href={im.url} target="_blank" rel="noreferrer">
                        <img src={im.url} alt={im.name || ''} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="zt-cmt-foot">
        {api.participants && (
          <div className="zt-cmt-parts">
            {parts.map((p) => (
              <span key={p.uid} className="zt-cmt-avatar sm zt-cmt-part" title={p.name} style={{ background: avatarColor(p.name) }}>
                {(p.name || '?').slice(0, 1)}
              </span>
            ))}
            <button className="zt-cmt-addpart" title="添加参与人" onClick={() => setPickerOpen(!pickerOpen)}>
              <MsIcon name="add" size={14} />
            </button>
            {pickerOpen && (
              <div className="zt-cmt-picker">
                <input
                  className="zt-cmt-picker-search"
                  placeholder="搜索协作人"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  autoFocus
                />
                <div className="zt-cmt-picker-list">
                  {members
                    .filter((mb) => !pickerQuery || (mb.name || '').toLowerCase().includes(pickerQuery.toLowerCase()))
                    .map((mb) => {
                      const on = parts.some((p) => p.uid === mb.uid);
                      return (
                        <div key={mb.uid} className="zt-cmt-picker-item" onClick={() => togglePart(mb)}>
                          <span className="zt-cmt-avatar sm" style={{ background: avatarColor(mb.name) }}>{(mb.name || '?').slice(0, 1)}</span>
                          <span className="zt-cmt-picker-name">{mb.name}</span>
                          {on && <MsIcon name="check" size={16} />}
                        </div>
                      );
                    })}
                  {members.length === 0 && <div className="zt-cmt-picker-empty">暂无可选成员</div>}
                </div>
              </div>
            )}
          </div>
        )}
        {pendingImages.length > 0 && (
          <div className="zt-cmt-pending">
            {pendingImages.map((im) => (
              <span key={im.id} className="zt-cmt-pending-item">
                <img src={im.url} alt={im.name || ''} />
                <button className="zt-cmt-pending-x" onClick={() => setPendingImages((prev) => prev.filter((x) => x.id !== im.id))}>
                  <MsIcon name="close" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {mention && (
          <div className="zt-cmt-mention">
            {mention.list.map((mb) => (
              <div key={mb.uid} className="zt-cmt-mention-item" onMouseDown={(e) => { e.preventDefault(); pickMention(mb); }}>
                <span className="zt-cmt-avatar sm" style={{ background: avatarColor(mb.name) }}>{(mb.name || '?').slice(0, 1)}</span>
                <span>{mb.name}</span>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          className="zt-cmt-input"
          rows={2}
          value={draft}
          placeholder="Shift + Enter 换行，Enter 发送"
          onChange={onDraftChange}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <div className="zt-cmt-tools">
          <button className="zt-icon-btn" title="上传本地图片" onClick={() => fileRef.current?.click()}>
            <MsIcon name="image" size={17} />
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={pickImage} />
          <span style={{ flex: 1 }} />
          <button className="zt-cmt-send" disabled={!draft.trim() && !pendingImages.length} onClick={send}>
            <MsIcon name="send" size={15} />
          </button>
        </div>
      </div>
    </>
  );
}

// 侧栏评论面板：包一层标题/计数/关闭外壳，评论流本体见 CommentStream。
export default function CommentPanel({ api, tableId, row, rowTitle, members = [], onClose, onMutate }) {
  const [count, setCount] = useState(0);
  // 浮层基线：Esc 分层/退场动画/滚动锁统一走 useOverlay（代旧自管 Esc）
  const ov = useOverlay(!!row, { onClose, exitMs: 180 });
  if (!row) return null;
  return (
    <div ref={ov.ref} className={`zt-cmt-panel${ov.closing ? ' closing' : ''}`}>
      <div className="zt-cmt-head">
        <div className="zt-cmt-title" title={rowTitle}>{rowTitle || '（未命名）'}</div>
        <button className="zt-icon-btn" onClick={ov.requestClose}><MsIcon name="close" size={16} /></button>
      </div>
      <div className="zt-cmt-sub">评论（{count}）</div>
      <CommentStream api={api} tableId={tableId} row={row} members={members} onMutate={onMutate} onCountChange={setCount} />
    </div>
  );
}
