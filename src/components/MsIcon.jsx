import React from 'react';
import { MS_ICONS } from './msIcons';
import './msicon.css';

// Material Symbols Rounded 图标（站小智原型外壳同款，2026-11-01 方案 2 引入，仅用于外壳层：左菜单+顶栏）。
// 默认线框态；当祖先被 antd 菜单标记选中（.ant-menu-item-selected / .ant-menu-submenu-selected）时
// 由 global.css 的 .zt-shell 规则自动切实心态，与原型「选中变实心」一致。filled 可强制实心。
export default function MsIcon({ name, size = 20, filled = false, style, className }) {
  const d = MS_ICONS[name];
  if (!d) return null;
  const svg = (path, cls) => (
    <svg className={cls} width={size} height={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  );
  // className 必须透传：antd Menu 会 cloneElement 给图标加 ant-menu-item-icon，
  // 吞掉它会让收起态「图标 + span」隐藏规则失效（2026-11-20 商城分组文字残留实锤）。
  const rootCls = className ? `ms-ic ${className}` : 'ms-ic';
  if (filled) return <span className={rootCls} style={style}>{svg(d.f, 'ms-svg')}</span>;
  return (
    <span className={rootCls} style={style}>
      {svg(d.o, 'ms-svg ms-o')}
      {svg(d.f, 'ms-svg ms-f')}
    </span>
  );
}
