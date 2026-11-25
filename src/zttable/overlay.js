import { useEffect, useRef, useState, useCallback } from 'react';

// 自绘浮层（行详情/签名板/评论面板/全屏编辑器等）统一经此登记，实现 antd 浮层同等行为——
// ①入场/退场动画（配合 zttable.css 的 zt-* keyframes 与 .closing 态）
// ②Esc 只关最上层（antd 浮层开着时让 antd 先处理）
// ③打开期间锁背景滚动（body.zt-scroll-lock）
// ④关闭后焦点回到打开前的元素；⑤Tab 焦点圈在浮层内（trap 选项）
// antd Modal/Drawer/Popover 本就自带这些行为，不走此登记。

const stack = [];
let seq = 0;

function applyLock() {
  document.body.classList.toggle('zt-scroll-lock', stack.length > 0);
}

if (typeof window !== 'undefined' && !window.__ztOverlayInit) {
  window.__ztOverlayInit = true;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const top = stack[stack.length - 1];
    if (!top) return;
    // antd 浮层（弹窗/抽屉/气泡/下拉）在场时让 antd 自己处理 Esc，避免连关两层
    if (document.querySelector(
      '.ant-modal-wrap:not([style*="display: none"]) .ant-modal,' +
      '.ant-drawer-open,' +
      '.ant-popover:not(.ant-popover-hidden),' +
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden),' +
      '.ant-picker-dropdown:not(.ant-picker-dropdown-hidden),' +
      '.ant-dropdown:not(.ant-dropdown-hidden)'
    )) return;
    e.preventDefault();
    e.stopPropagation();
    top.escape();
  }, true);
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// opts: { onClose, onEscape?, exitMs?, trap?, focus?: 'container'|'first'|false }
export function useOverlay(active, opts = {}) {
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const closingRef = useRef(false);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    const ms = optsRef.current.exitMs || 0;
    if (ms > 0) {
      closingRef.current = true;
      setClosing(true);
      setTimeout(() => optsRef.current.onClose?.(), ms);
    } else {
      optsRef.current.onClose?.();
    }
  }, []);

  useEffect(() => {
    if (!active) { closingRef.current = false; setClosing(false); return undefined; }
    const entry = {
      id: ++seq,
      escape: () => {
        const esc = optsRef.current.onEscape;
        if (esc) esc(requestClose);
        else requestClose();
      },
    };
    stack.push(entry);
    applyLock();
    const prevFocus = document.activeElement;
    const el = ref.current;
    if (el && optsRef.current.focus !== false) {
      const target = el.querySelector('[data-autofocus]') ||
        (optsRef.current.focus === 'first' ? el.querySelector(FOCUSABLE) : null) || el;
      if (target && target.focus) {
        if (target === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }
    let trapHandler = null;
    if (optsRef.current.trap) {
      trapHandler = (e) => {
        if (e.key !== 'Tab' || stack[stack.length - 1] !== entry || !ref.current) return;
        const items = Array.from(ref.current.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      };
      document.addEventListener('keydown', trapHandler, true);
    }
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      applyLock();
      if (trapHandler) document.removeEventListener('keydown', trapHandler, true);
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    };
  }, [active, requestClose]);

  return { ref, closing, requestClose };
}
