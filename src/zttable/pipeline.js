// 站塔table 客户端数据管线：筛选（条件树）→ 排序 → 分组（含聚合与总计行）
// 行形态：{id, seq, version, cells:{fieldId: value}}
// 展示行：leaf {__kind:'leaf', row} / group {__kind:'group', ...} / gtotal {__kind:'gtotal', ...}
import { isEmptyVal, optionOf, GROUPABLE } from './fields';

export const fieldsById = (fields) => {
  const m = {};
  (fields || []).forEach((f) => { m[f.id] = f; });
  return m;
};

// ---------- 筛选 ----------

function evalCond(field, v, cond) {
  const { op, value } = cond;
  if (field.type === 'link') {
    const ids = Array.isArray(v) ? v : [];
    switch (op) {
      case 'empty': return ids.length === 0;
      case 'notEmpty': return ids.length > 0;
      case 'contains': return ids.includes(value);
      case 'notContains': return !ids.includes(value);
      default: return true;
    }
  }
  switch (op) {
    case 'empty': return isEmptyVal(v);
    case 'notEmpty': return !isEmptyVal(v);
    case 'contains': return !isEmptyVal(v) && String(v).toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'notContains': return isEmptyVal(v) || !String(v).toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'eq':
      if (field.type === 'number' || field.type === 'rating' || field.type === 'duration') return v !== null && v !== undefined && Number(v) === Number(value);
      if ((field.type === 'formula' || field.type === 'link_formula') && typeof v === 'number') return Number(v) === Number(value);
      return String(v ?? '') === String(value ?? '');
    case 'neq':
      if (field.type === 'number' || field.type === 'rating' || field.type === 'duration') return v === null || v === undefined || Number(v) !== Number(value);
      if ((field.type === 'formula' || field.type === 'link_formula') && typeof v === 'number') return v === null || v === undefined || Number(v) !== Number(value);
      return String(v ?? '') !== String(value ?? '');
    case 'gt': return v !== null && v !== undefined && Number(v) > Number(value);
    case 'gte': return v !== null && v !== undefined && Number(v) >= Number(value);
    case 'lt': return v !== null && v !== undefined && Number(v) < Number(value);
    case 'lte': return v !== null && v !== undefined && Number(v) <= Number(value);
    case 'in': return Array.isArray(value) && value.includes(v);
    case 'notIn': return !(Array.isArray(value) && value.includes(v));
    case 'hasAny': return Array.isArray(v) && Array.isArray(value) && value.some((x) => v.includes(x));
    case 'hasAll': return Array.isArray(v) && Array.isArray(value) && value.every((x) => v.includes(x));
    case 'before': return !isEmptyVal(v) && String(v) < String(value);
    case 'after': return !isEmptyVal(v) && String(v) > String(value);
    case 'isTrue': return v === true;
    case 'isFalse': return v !== true;
    default: return true;
  }
}

// 单条条件求值（单元格着色规则复用同一套算符语义）
export const matchCond = (field, v, cond) => evalCond(field, v, cond);

export function evalTree(fieldMap, cells, node) {
  if (!node || !Array.isArray(node.items) || node.items.length === 0) return true;
  const results = node.items.map((it) => {
    if (it && it.group) return evalTree(fieldMap, cells, it.group);
    const f = fieldMap[it.fieldId];
    if (!f) return true;
    return evalCond(f, cells[it.fieldId], it);
  });
  return node.logic === 'or' ? results.some(Boolean) : results.every(Boolean);
}

export function countConds(node) {
  if (!node || !Array.isArray(node.items)) return 0;
  return node.items.reduce((n, it) => n + (it.group ? countConds(it.group) : 1), 0);
}

export function applyFilter(rows, tree, fieldMap) {
  if (!tree || countConds(tree) === 0) return rows;
  return rows.filter((r) => evalTree(fieldMap, r.cells, tree));
}

// ---------- 排序与分组键比较 ----------

// 通用比较：空值恒置底；单选按选项定义序；其余按类型自然序
export function compareVals(field, a, b) {
  const ea = isEmptyVal(a), eb = isEmptyVal(b);
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  if ((field.type === 'formula' || field.type === 'link_formula') && typeof a === 'number' && typeof b === 'number') return a - b;
  switch (field.type) {
    case 'select': {
      const opts = field.config?.options || [];
      const ia = opts.findIndex((o) => o.id === a);
      const ib = opts.findIndex((o) => o.id === b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    }
    case 'number': case 'rating': case 'duration':
      return Number(a) - Number(b);
    case 'checkbox':
      return (a === true ? 1 : 0) - (b === true ? 1 : 0);
    case 'multiselect': {
      const sa = (a || []).join(','), sb = (b || []).join(',');
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    default:
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
}

export function applySort(rows, sortRules, fieldMap) {
  const rules = (sortRules || []).filter((r) => fieldMap[r.fieldId]);
  if (rules.length === 0) return rows;
  const out = [...rows];
  out.sort((ra, rb) => {
    for (const rule of rules) {
      const f = fieldMap[rule.fieldId];
      const c = compareVals(f, ra.cells[rule.fieldId], rb.cells[rule.fieldId]);
      if (c !== 0) {
        // 空值置底不受方向影响：compareVals 已把空值排后，降序时需修正
        const ea = isEmptyVal(ra.cells[rule.fieldId]), eb = isEmptyVal(rb.cells[rule.fieldId]);
        if (ea || eb) return c;
        return rule.dir === 'desc' ? -c : c;
      }
    }
    return ra.seq - rb.seq;
  });
  return out;
}

// ---------- 聚合 ----------

export function computeAgg(rows, aggFieldIds) {
  const agg = { count: rows.length };
  (aggFieldIds || []).forEach((fid) => {
    const vals = [];
    rows.forEach((r) => {
      const v = r.cells[fid];
      if (v !== null && v !== undefined && v !== '') { const n = Number(v); if (!Number.isNaN(n)) vals.push(n); }
    });
    const n = vals.length;
    const sum = vals.reduce((a, b) => a + b, 0);
    let median = null, min = null, max = null;
    if (n) {
      const sorted = [...vals].sort((a, b) => a - b);
      median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      min = sorted[0];
      max = sorted[n - 1];
    }
    agg[fid] = { sum, avg: n ? sum / n : null, count: n, median, min, max };
  });
  return agg;
}

// 存量旧档读时映射：36/44→29、64/72→58、108→87、144→116
export function normRowHeight(v) {

  if (v === 36 || v === 44 || v === 29) return 32;
  if (v === 64 || v === 72 || v === 58) return 64;
  if (v === 108 || v === 87) return 96;
  if (v === 144 || v === 116) return 128;
  return v || 32;
}

// 聚合模式（视图批 ）：视图 config.agg = { [fieldId]: mode }，缺省 sum
export const AGG_MODES = [
  { key: 'sum', label: '总和' },
  { key: 'avg', label: '平均值' },
  { key: 'median', label: '中位数' },
  { key: 'min', label: '最小值' },
  { key: 'max', label: '最大值' },
  { key: 'count', label: '计数' },
  { key: 'none', label: '不计算' },
];
export function aggValue(aggForField, mode) {
  if (!aggForField) return null;
  if (mode === 'count') return aggForField.count;
  return aggForField[mode] ?? null;
}

// ---------- 分组展示行构建 ----------

const keyOf = (v) => (v === null || v === undefined || v === '' ? '__empty__' : JSON.stringify(v));

export function buildDisplay(rows, opts) {
  const { groupFields, fieldMap, collapsed, aggFieldIds, checkedIds } = opts;
  const aggRows = checkedIds && checkedIds.size ? rows.filter((r) => checkedIds.has(r.id)) : rows;
  const groups = (groupFields || []).filter((fid) => fieldMap[fid] && GROUPABLE.has(fieldMap[fid].type));
  const grand = computeAgg(aggRows, aggFieldIds);
  if (groups.length === 0) {
    return { display: rows.map((row) => ({ __kind: 'leaf', row })), grand };
  }
  // 先按分组字段链排序（空值置底、单选选项序）
  const sorted = [...rows].sort((ra, rb) => {
    for (const fid of groups) {
      const c = compareVals(fieldMap[fid], ra.cells[fid], rb.cells[fid]);
      if (c !== 0) return c;
    }
    return 0; // 稳定排序：保留入参顺序（调用方已按视图排序排好组内序）
  });
  const display = [];
  const walk = (subset, level, path) => {
    const fid = groups[level];
    const field = fieldMap[fid];
    // 切分连续同键段
    const segs = [];
    let cur = null;
    subset.forEach((r) => {
      // 日期分组按月粒度：键与组头标签都取 YYYY-MM
      const isMonth = field.type === 'date' && r.cells[fid];
      const k = isMonth ? `m:${String(r.cells[fid]).slice(0, 7)}` : keyOf(r.cells[fid]);
      if (!cur || cur.key !== k) {
        cur = { key: k, raw: isMonth ? String(r.cells[fid]).slice(0, 7) : (r.cells[fid] ?? null), rows: [] };
        segs.push(cur);
      }
      cur.rows.push(r);
    });
    segs.forEach((seg) => {
      const segPath = path ? `${path}/${seg.key}` : seg.key;
      const agg = checkedIds && checkedIds.size
        ? computeAgg(seg.rows.filter((r) => checkedIds.has(r.id)), aggFieldIds)
        : computeAgg(seg.rows, aggFieldIds);
      display.push({
        __kind: 'group', key: segPath, fieldId: fid, rawKey: seg.raw,
        level, count: seg.rows.length, agg,
      });
      const isCollapsed = collapsed && collapsed.has(segPath);
      if (!isCollapsed) {
        if (level + 1 < groups.length) {
          walk(seg.rows, level + 1, segPath);
        } else {
          seg.rows.forEach((row) => display.push({ __kind: 'leaf', row }));
        }
        display.push({ __kind: 'gtotal', key: segPath, level, count: seg.rows.length, agg });
      }
    });
  };
  walk(sorted, 0, '');
  return { display, grand };
}

export { optionOf };

// ---------- 本地批量应用（与 dt-api convertRaw/批量接口同口径，供无后端宿主使用） ----------

function pad2(n) { return String(n).padStart(2, '0'); }

function parseDateStr(s) {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    || s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
    || s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (!m) return null;
  const y = +m[1]; const mo = +m[2]; const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

// 原始文本 → 类型化值，返回 { value, reason, dropped }（reason 非空 = 跳过该格）
export function convertRawValue(field, raw, members = []) {
  const rawStr = String(raw ?? '').replace(/\r$/, '');
  const trimmed = rawStr.trim();
  if (trimmed === '') return { value: null, reason: '', dropped: 0 };
  const opts = field.config?.options || [];
  if (['auto_number', 'created_by', 'created_at', 'updated_by', 'updated_at', 'button'].includes(field.type)) {
    return { value: null, reason: '只读字段不可粘贴', dropped: 0 };
  }
  switch (field.type) {
    case 'number': {
      // 欧式（小数点为逗号）时：含 ',' 才把 '.' 当千位剥掉、',' 转小数点；无 ',' 时 '.' 仍按小数点
      let s = trimmed.replace(/[\s¥￥$]/g, '').replace('，', ',');
      if (field.config?.decimalSep === ',' && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
      let pct = false;
      if (s.endsWith('%')) { s = s.slice(0, -1); pct = true; }
      const fv = Number(s);
      if (s === '' || Number.isNaN(fv)) return { value: null, reason: '不是数字', dropped: 0 };
      return { value: pct ? fv / 100 : fv, reason: '', dropped: 0 };
    }
    case 'duration': {
      if (!trimmed.includes(':')) {
        const fv = Number(trimmed);
        if (Number.isNaN(fv)) return { value: null, reason: '时长格式不对', dropped: 0 };
        return { value: Math.round(fv), reason: '', dropped: 0 };
      }
      const parts = trimmed.split(':').map((p) => Number(p.trim()));
      if (parts.length > 3 || parts.some((n) => Number.isNaN(n))) return { value: null, reason: '时长格式不对', dropped: 0 };
      let total = 0;
      parts.forEach((n) => { total = total * 60 + n; });
      return { value: Math.round(total), reason: '', dropped: 0 };
    }
    case 'select': {
      const hit = opts.find((o) => o.label === trimmed || o.id === trimmed);
      return hit ? { value: hit.id, reason: '', dropped: 0 } : { value: null, reason: `选项不存在:${trimmed}`, dropped: 0 };
    }
    case 'multiselect': {
      const parts = trimmed.split(/[、，,/／]/).map((p) => p.trim()).filter(Boolean);
      const ids = [];
      let dropped = 0;
      parts.forEach((p) => {
        const hit = opts.find((o) => o.label === p || o.id === p);
        if (hit) ids.push(hit.id); else dropped += 1;
      });
      if (!ids.length) return { value: null, reason: '选项不存在', dropped };
      return { value: ids, reason: '', dropped };
    }
    case 'date': {
      if (field.config?.precision === 'minute') {
        const dm = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (dm) {
          const ds = parseDateStr(`${dm[1]}-${dm[2]}-${dm[3]}`);
          if (ds) {
            // 无时区串按本地墙钟解释（与服务端东八区口径一致）
            const local = new Date(+dm[1], +dm[2] - 1, +dm[3], +(dm[4] || 0), +(dm[5] || 0), +(dm[6] || 0));
            return { value: local.toISOString().replace(/\.\d{3}Z$/, 'Z'), reason: '', dropped: 0 };
          }
        }
        const asDate = Date.parse(trimmed);
        if (!Number.isNaN(asDate)) return { value: new Date(asDate).toISOString().replace(/\.\d{3}Z$/, 'Z'), reason: '', dropped: 0 };
        return { value: null, reason: '时间格式不对', dropped: 0 };
      }
      const ds = parseDateStr(trimmed);
      return ds ? { value: ds, reason: '', dropped: 0 } : { value: null, reason: '日期格式不对', dropped: 0 };
    }
    case 'checkbox': {
      if (['是', 'true', 'TRUE', 'True', '1', '✓', '√', 'Y', 'y', 'yes', 'YES'].includes(trimmed)) return { value: true, reason: '', dropped: 0 };
      if (['否', 'false', 'FALSE', 'False', '0', 'N', 'n', 'no', 'NO'].includes(trimmed)) return { value: false, reason: '', dropped: 0 };
      return { value: null, reason: '无法判断是否', dropped: 0 };
    }
    case 'rating': {
      const fv = Number(trimmed);
      if (Number.isNaN(fv)) return { value: null, reason: '不是数字', dropped: 0 };
      const max = field.config?.max > 0 ? field.config.max : 5;
      return { value: Math.min(max, Math.max(0, Math.round(fv))), reason: '', dropped: 0 };
    }
    case 'member': {
      const hit = (members || []).find((mm) => mm.name === trimmed || mm.uid === trimmed);
      return hit ? { value: hit.uid, reason: '', dropped: 0 } : { value: null, reason: `成员不存在:${trimmed}`, dropped: 0 };
    }
    case 'attachment':
      return { value: null, reason: '附件不支持粘贴', dropped: 0 };
    default: // text, longtext, url：原样（未 trim，与服务端一致）
      return { value: rawStr, reason: '', dropped: 0 };
  }
}

let localRowSeq = 0;
// 把一批 ops 应用到内存行数组，返回 { rows, applied, skipped, created, droppedTokens, createdIds }
// ops: { rowId | newKey, fieldId, raw }（paste）或 { rowId | newKey, fieldId, value }（typed）
export function applyBatchLocally(rows, fieldMap, members, ops, mode) {
  const next = rows.map((r) => ({ ...r, cells: { ...r.cells } }));
  const byId = new Map(next.map((r) => [r.id, r]));
  const skipped = [];
  let applied = 0;
  let droppedTokens = 0;
  const touched = new Set();
  const createdIds = [];
  const newRowByKey = {};
  (ops || []).forEach((op, idx) => {
    const f = fieldMap[op.fieldId];
    if (!f) { skipped.push({ idx, reason: '字段不存在' }); return; }
    let row = null;
    if (op.rowId) {
      row = byId.get(op.rowId);
      if (!row) { skipped.push({ idx, reason: '行不存在' }); return; }
    } else if (op.newKey) {
      if (!newRowByKey[op.newKey]) {
        localRowSeq += 1;
        const nr = { id: `local_${Date.now()}_${localRowSeq}`, version: 1, cells: {} };
        newRowByKey[op.newKey] = nr;
        next.push(nr);
        byId.set(nr.id, nr);
        createdIds.push(nr.id);
      }
      row = newRowByKey[op.newKey];
    } else {
      skipped.push({ idx, reason: '行不存在' });
      return;
    }
    let typed;
    if (mode === 'paste') {
      const conv = convertRawValue(f, op.raw, members);
      droppedTokens += conv.dropped || 0;
      if (conv.reason) { skipped.push({ idx, reason: conv.reason }); return; }
      typed = conv.value;
    } else {
      typed = op.value;
    }
    row.cells[op.fieldId] = typed;
    applied += 1;
    touched.add(row.id);
  });
  touched.forEach((id) => { const r = byId.get(id); if (r) r.version = (r.version || 1) + 1; });
  return { rows: next, applied, skipped, created: createdIds.length, droppedTokens, createdIds };
}
