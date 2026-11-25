// 站塔table 演示入口：把表格组件以纯前端方式打包成一个可独立打开的演示页。
import React from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import DemoPage from './DemoPage.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(
  <div className="demo-shell">
    <DemoPage />
  </div>,
);
