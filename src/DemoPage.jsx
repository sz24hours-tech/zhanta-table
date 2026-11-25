// 站塔table 演示页：纯前端、零后端调用。数据在本页内存里，编辑经 applyBatchLocally 应用。
import React, { useCallback, useMemo, useState } from 'react';
import { Button, Drawer, message } from 'antd';
import MsIcon from '@/components/MsIcon';
import ZtTable from '@/zttable/ZtTable';
import { applyBatchLocally, fieldsById } from '@/zttable/pipeline';
import { typeMeta, memberName, displayText } from '@/zttable/fields';
import '@/zttable/zttable.css';

const MEMBERS = [
  { uid: 'm1', name: '张敏' },
  { uid: 'm2', name: '李强' },
  { uid: 'm3', name: '王芳' },
  { uid: 'm4', name: '刘洋' },
];

const FIELDS = [
  { id: 'f_no', name: '订单号', type: 'text', config: {} },
  { id: 'f_customer', name: '客户', type: 'text', config: {} },
  {
    id: 'f_region', name: '地区', type: 'select',
    config: { options: [
      { id: 'r1', label: '华东', color: 'blue' }, { id: 'r2', label: '华南', color: 'green' },
      { id: 'r3', label: '华北', color: 'orange' }, { id: 'r4', label: '西南', color: 'purple' },
      { id: 'r5', label: '华中', color: 'cyan' },
    ] },
  },
  {
    id: 'f_product', name: '产品', type: 'select',
    config: { options: [
      { id: 'p1', label: '蓝牙耳机', color: 'blue' }, { id: 'p2', label: '智能手表', color: 'teal' },
      { id: 'p3', label: '充电宝', color: 'orange' }, { id: 'p4', label: '数据线', color: 'gray' },
    ] },
  },
  { id: 'f_qty', name: '数量', type: 'number', config: {} },
  { id: 'f_amount', name: '金额', type: 'number', config: { format: 'currency', currency: 'CNY' } },
  {
    id: 'f_status', name: '状态', type: 'select',
    config: { options: [
      { id: 's1', label: '待付款', color: 'gray' }, { id: 's2', label: '已付款', color: 'blue' },
      { id: 's3', label: '已发货', color: 'orange' }, { id: 's4', label: '已完成', color: 'green' },
      { id: 's5', label: '已取消', color: 'red' },
    ] },
  },
  {
    id: 'f_tags', name: '标签', type: 'multiselect',
    config: { options: [
      { id: 't1', label: '大促', color: 'red' }, { id: 't2', label: '复购', color: 'blue' },
      { id: 't3', label: '新客', color: 'green' }, { id: 't4', label: '加急', color: 'orange' },
    ] },
  },
  { id: 'f_owner', name: '负责人', type: 'member', config: {} },
  { id: 'f_date', name: '下单日期', type: 'date', config: {} },
  { id: 'f_shipped', name: '已发货', type: 'checkbox', config: {} },
  { id: 'f_rating', name: '满意度', type: 'rating', config: { max: 5 } },
  { id: 'f_btn_url', name: '查单', type: 'button', config: { btnLabel: '查单', btnUrl: 'https://example.com/order/{订单号}' } },
  {
    id: 'f_btn_multi', name: '快捷操作', type: 'button',
    config: {
      btnLabel: '快捷操作',
      actions: [
        { kind: 'modify_row', sets: [{ fieldId: 'f_qty', value: 99 }] },
        { kind: 'open_url', url: 'https://example.com/order/{订单号}' },
      ],
    },
  },
];

const CUSTOMERS = ['明州贸易', '华创电子', '云启科技', '锦江食品', '白云制药', '西湖文旅', '恒力新材', '光谷半导体', '海沧物流', '清源环保'];
const pad = (n) => String(n).padStart(2, '0');

function seedRows() {
  const rows = [];
  for (let i = 0; i < 120; i++) {
    const qty = (i % 9) + 1;
    const price = [199, 899, 129, 39][i % 4];
    rows.push({
      id: `demo_${i + 1}`,
      version: 1,
      cells: {
        f_no: `DD${20261101 + i}`,
        f_customer: `${CUSTOMERS[i % 10]}${Math.floor(i / 10) + 1}号`,
        f_region: ['r1', 'r2', 'r3', 'r4', 'r5'][i % 5],
        f_product: ['p1', 'p2', 'p3', 'p4'][i % 4],
        f_qty: qty,
        f_amount: qty * price,
        f_status: ['s1', 's2', 's3', 's4', 's5'][(i * 7) % 5],
        f_tags: i % 3 === 0 ? ['t1', 't3'] : i % 3 === 1 ? ['t2'] : ['t4'],
        f_owner: MEMBERS[i % 4].uid,
        f_date: `2026-11-${pad((i % 28) + 1)}`,
        f_shipped: i % 5 >= 2,
        f_rating: (i % 5) + 1,
      },
    });
  }
  return rows;
}

export default function ZtGridDemo() {
  const [rows, setRows] = useState(seedRows);
  const [view, setView] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ztgrid_demo_view') || '{}'); } catch { return {}; }
  });
  const [lastLog, setLastLog] = useState('');
  const fieldMap = useMemo(() => fieldsById(FIELDS), []);

  const onViewChange = useCallback((patch) => {
    setView((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem('ztgrid_demo_view', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const onCellCommit = useCallback((rowId, fieldId, value) => {
    setRows((prev) => prev.map((r) => (r.id === rowId
      ? { ...r, version: (r.version || 1) + 1, cells: { ...r.cells, [fieldId]: value } }
      : r)));
    return Promise.resolve({ version: 2 });
  }, []);

  const onBatch = useCallback((ops, mode) => {
    setRows((prev) => {
      const res = applyBatchLocally(prev, fieldMap, MEMBERS, ops, mode);
      const parts = [`已应用 ${res.applied} 格`];
      if (res.created) parts.push(`新增 ${res.created} 行`);
      if (res.skipped.length) parts.push(`跳过 ${res.skipped.length} 格`);
      const text = parts.join('，');
      setLastLog(text);
      if (res.skipped.length) message.warning(text); else message.success(text);
      return res.rows;
    });
  }, [fieldMap]);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 660, padding: 14, gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>站塔table</span>
        <span style={{ flex: 1 }} />
        {lastLog && <span style={{ fontSize: 12.5, color: '#5b6472' }}>最近操作：{lastLog}</span>}
        <Button
          size="small"
          onClick={() => { setRows(seedRows()); setView({}); try { localStorage.removeItem('ztgrid_demo_view'); } catch { /* ignore */ } message.success('已重置演示数据'); }}
        >
          重置数据
        </Button>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: '#fff', borderRadius: 12, border: '1px solid #edf0f4', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ZtTable
          fields={FIELDS} rows={rows} members={MEMBERS}
          view={view} onViewChange={onViewChange}
          onCellCommit={onCellCommit} onBatch={onBatch}
          rowDetail={{}}
          onDeleteRow={(row) => setRows((prev) => prev.filter((r) => r.id !== row.id))}
          enableSetFilter
        />
      </div>
    </div>
  );
}
