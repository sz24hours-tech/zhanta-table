// 站塔table 字段类型注册表：图标、格式化、复制文本、筛选算符

export const FIELD_TYPES = [
  { type: 'text', label: '文本', icon: 'format_size', group: 'basic' },
  { type: 'longtext', label: '长文本', icon: 'edit_note', group: 'basic' },
  { type: 'number', label: '数字', icon: 'calculate', group: 'basic' },
  { type: 'member', label: '成员', icon: 'person', group: 'basic' },
  { type: 'date', label: '日期', icon: 'schedule', group: 'basic' },
  { type: 'duration', label: '时长', icon: 'timer', group: 'basic' },
  { type: 'select', label: '单选', icon: 'check_circle', group: 'basic' },
  { type: 'multiselect', label: '多选', icon: 'checklist', group: 'basic' },
  { type: 'attachment', label: '附件', icon: 'attach_file', group: 'basic' },
  { type: 'email', label: '邮件', icon: 'mail', group: 'basic' },
  { type: 'url', label: '链接', icon: 'link', group: 'basic' },
  { type: 'checkbox', label: '复选框', icon: 'task_alt', group: 'basic' },
  { type: 'rating', label: '评分', icon: 'star', group: 'basic' },
  { type: 'phone', label: '电话号码', icon: 'call', group: 'basic' },
  { type: 'formula', label: '公式', icon: 'functions', group: 'advanced' },
  { type: 'link', label: '链接其他记录', icon: 'add_link', group: 'advanced' },
  { type: 'link_formula', label: '链接公式', icon: 'account_tree', group: 'advanced' },
  { type: 'signature', label: '数字签名', icon: 'draw', group: 'advanced' },
  { type: 'created_by', label: '创建者', icon: 'person_add', group: 'advanced' },
  { type: 'created_at', label: '创建时间', icon: 'event', group: 'advanced' },
  { type: 'updated_by', label: '修改者', icon: 'manage_accounts', group: 'advanced' },
  { type: 'updated_at', label: '修改时间', icon: 'update', group: 'advanced' },
  { type: 'auto_number', label: '自动序号', icon: 'tag', group: 'advanced' },
  { type: 'button', label: '按钮', icon: 'ads_click', group: 'advanced' },
];
export const TYPE_GROUPS = [
  { id: 'basic', label: '基础' },
  { id: 'advanced', label: '高级' },
];

export const typeMeta = (t) => FIELD_TYPES.find((x) => x.type === t) || FIELD_TYPES[0];

// 只读字段型（系统四型＋自动序号＋按钮＋公式＋链接公式）：不可编辑、不可粘贴
export const READONLY_TYPES = new Set(['auto_number', 'created_by', 'created_at', 'updated_by', 'updated_at', 'button', 'formula', 'link_formula']);
export const isReadonlyType = (t) => READONLY_TYPES.has(t);

export const CURRENCY_SYMBOLS = { CNY: '¥', USD: '$', EUR: '€' };

// 数字格式化（格式口径：普通/百分比/货币＋小数位＋千分位）
export function formatNumber(field, v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  const cfg = field.config || {};
  // 小数点分隔符：',' 时走欧式（千位自动配 '.'），否则美式（千位 ','）
  const locale = cfg.decimalSep === ',' ? 'de-DE' : 'en-US';
  if (cfg.format === 'percent') {
    const dec = cfg.decimals ?? 0;
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false }).format(n * 100)}%`;
  }
  let dec = cfg.decimals;
  if (dec === undefined || dec === null) dec = cfg.format === 'currency' ? 2 : undefined;
  const opts = { useGrouping: cfg.thousands !== false };
  if (dec !== undefined) { opts.minimumFractionDigits = dec; opts.maximumFractionDigits = dec; }
  else { opts.maximumFractionDigits = 10; }
  const s = new Intl.NumberFormat(locale, opts).format(n);
  if (cfg.format === 'currency') {
    const sym = cfg.currency === 'custom' ? (cfg.symbol || '') : (CURRENCY_SYMBOLS[cfg.currency || 'CNY'] || '¥');
    return `${sym}${s}`;
  }
  return s;
}

// 时长格式化（存秒）：h:mm:ss 或 h:mm
export function formatDuration(sec, fmt) {
  if (sec === null || sec === undefined || sec === '') return '';
  if (typeof sec === 'string' && sec.includes(':')) return sec; // 编辑中的原始串直显
  const total = Math.round(Number(sec));
  if (Number.isNaN(total)) return String(sec);
  const neg = total < 0 ? '-' : '';
  const t = Math.abs(total);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p2 = (x) => String(x).padStart(2, '0');
  return fmt === 'hm' ? `${neg}${h}:${p2(m)}` : `${neg}${h}:${p2(m)}:${p2(s)}`;
}

export function checkInvalid(field, v) {
  if (isEmptyVal(v)) return false;
  const chk = field.config?.check;
  const s = String(v);
  const byPreset = (preset) => {
    if (preset === 'email') return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    if (preset === 'phone_cn') return !/^1\d{10}$/.test(s);
    if (preset === 'idcard') return !/^(\d{15}|\d{17}[\dXx])$/.test(s);
    return false;
  };
  if (field.type === 'email') return byPreset('email');
  if (field.type === 'phone') {
    if (chk?.kind === 'regex' && chk.pattern) { try { return !new RegExp(chk.pattern).test(s); } catch { return false; } }
    return byPreset('phone_cn');
  }
  if (!chk) return false;
  if (chk.kind === 'preset') return byPreset(chk.preset);
  if (chk.kind === 'regex' && chk.pattern) { try { return !new RegExp(chk.pattern).test(s); } catch { return false; } }
  if (chk.kind === 'range') {
    const n = Number(v);
    if (Number.isNaN(n)) return true;
    if (chk.min !== undefined && chk.min !== null && n < chk.min) return true;
    if (chk.max !== undefined && chk.max !== null && n > chk.max) return true;
  }
  return false;
}

export const OPTION_COLORS = {
  gray: { solid: '#8a94a6', soft: '#eef0f3', fg: '#5b6472' },
  blue: { solid: '#2f6bff', soft: '#e3ecff', fg: '#2456c9' },
  orange: { solid: '#e8930c', soft: '#fdf0d5', fg: '#b97a0c' },
  green: { solid: '#46b96e', soft: '#e0f4e8', fg: '#178a4c' },
  red: { solid: '#e05252', soft: '#fbe7e7', fg: '#c2402a' },
  purple: { solid: '#7a4fd0', soft: '#efe8fd', fg: '#7a4fd0' },
  cyan: { solid: '#0e9bb5', soft: '#ddf3f5', fg: '#0e7c86' },
  pink: { solid: '#e05a9a', soft: '#fde7f1', fg: '#c2407f' },
  yellow: { solid: '#d9b91c', soft: '#fdf6d8', fg: '#9a8410' },
  teal: { solid: '#12a594', soft: '#dcf5f1', fg: '#0b7a6d' },
};
export const optionColor = (name) => OPTION_COLORS[name] || OPTION_COLORS.gray;

// 图标样式色板（勾选/评分共用，10 色，与选项色同套）
export const ICON_COLORS = Object.keys(OPTION_COLORS);
export const CHECK_ICONS = [
  { id: 'check', icon: 'check', label: '对勾' },
  { id: 'close', icon: 'close', label: '叉' },
  { id: 'star', icon: 'star', label: '五角星' },
  { id: 'favorite', icon: 'favorite', label: '爱心' },
  { id: 'thumb_up', icon: 'thumb_up', label: '点赞' },
  { id: 'flag', icon: 'flag', label: '旗帜' },
  { id: 'circle', icon: 'circle', label: '圆点' },
];
export const checkIconMeta = (id) => CHECK_ICONS.find((x) => x.id === id) || CHECK_ICONS[0];
// 评分样式：4 图标（默认黄星）
export const RATING_ICONS = [
  { id: 'star', icon: 'star', label: '星' },
  { id: 'favorite', icon: 'favorite', label: '心' },
  { id: 'thumb_up', icon: 'thumb_up', label: '赞' },
  { id: 'flag', icon: 'flag', label: '旗' },
];
export const ratingIconMeta = (id) => RATING_ICONS.find((x) => x.id === id) || RATING_ICONS[0];

export const DATE_FORMATS = [
  { id: 'iso', label: '国际（2026-11-23）' },
  { id: 'us', label: '美国（11/23/2026）' },
  { id: 'eu', label: '欧洲（23/11/2026）' },
  { id: 'de', label: '德俄（23.11.2026）' },
];
export function formatDate(field, v) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return s;
  const [, y, mo, d, hh, mi] = m;
  const fmt = field.config?.dateFormat || 'iso';
  let out;
  if (fmt === 'us') out = `${mo}/${d}/${y}`;
  else if (fmt === 'eu') out = `${d}/${mo}/${y}`;
  else if (fmt === 'de') out = `${d}.${mo}.${y}`;
  else out = `${y}-${mo}-${d}`;
  if (field.config?.precision === 'minute' && hh) out += ` ${hh}:${mi}`;
  return out;
}

// 单元格着色预置底色（视图 colorRules 用）
export const CELL_COLORS = [
  { id: 'yellow', bg: '#fff0b3' },
  { id: 'green', bg: '#d8f3dc' },
  { id: 'blue', bg: '#dbe9ff' },
  { id: 'pink', bg: '#fde0ec' },
  { id: 'orange', bg: '#ffe7c2' },
  { id: 'red', bg: '#fbdcdc' },
  { id: 'gray', bg: '#eceff3' },
];
export const cellColorBg = (id) => (CELL_COLORS.find((c) => c.id === id) || CELL_COLORS[0]).bg;

const AVATAR_BG = ['#5b8def', '#7a4fd0', '#0e7c86', '#e8930c', '#46b96e', '#e05252'];
export const avatarBg = (name) =>
  AVATAR_BG[[...(name || '?')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_BG.length];

export const optionOf = (field, id) =>
  (field.config?.options || []).find((o) => o.id === id) || null;

export const memberName = (members, uid) => {
  const m = (members || []).find((x) => x.uid === uid);
  return m ? m.name : uid || '';
};

export const isEmptyVal = (v) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

// 展示文本（查找/复制共用口径）；linkLabels: { [fieldId]: { [rowId]: 文本 } }，链接列显示目标行首列文本
export function displayText(field, v, members, linkLabels) {
  if (isEmptyVal(v)) return '';
  switch (field.type) {
    case 'link': {
      // 第 4 参两种形状都认：裸标签表 {fid:{rowId:label}}（表单页）与
      // 完整 linkData {fid:{labels:{...}}}（行详情标题/打印/只读呈现）
      const entry = linkLabels?.[field.id];
      const map = entry?.labels || entry || {};
      return (v || []).map((id) => map[id] || '').filter(Boolean).join('、');
    }
    case 'link_formula': {
      if (typeof v === 'number') return formatNumber(field, v);
      if (typeof v === 'boolean') return v ? '是' : '否';
      return String(v);
    }
    case 'select': {
      const o = optionOf(field, v);
      return o ? o.label : String(v);
    }
    case 'multiselect':
      return (v || []).map((id) => optionOf(field, id)?.label || id).join('、');
    case 'member':
      return memberName(members, v);
    case 'created_by':
    case 'updated_by':
      return memberName(members, v);
    case 'checkbox':
      return v ? '是' : '否';
    case 'number':
      return formatNumber(field, v);
    case 'duration':
      return formatDuration(v, field.config?.durationFmt);
    case 'date':
      return formatDate(field, v);
    case 'created_at':
    case 'updated_at':
      return String(v).replace('T', ' ').slice(0, 16);
    case 'button':
      return field.config?.btnLabel || '打开';
    case 'formula': {
      if (typeof v === 'number') return formatNumber(field, v);
      if (typeof v === 'boolean') return v ? '是' : '否';
      return String(v);
    }
    case 'attachment':
      return (v || []).map((a) => a.name || a.url || '').join('、');
    case 'signature':
      return '';
    case 'rating':
      return String(v);
    default:
      return String(v);
  }
}

// 复制到剪贴板的文本（与展示同口径，金额不带千分位以便粘回解析）
export const copyText = displayText;

// 按钮有效动作：新版 actions 数组优先；存量单 URL 配置读时适配为一条 open_url
export function effectiveButtonActions(field) {
  const cfg = field?.config || {};
  if (Array.isArray(cfg.actions) && cfg.actions.length) return cfg.actions;
  if (cfg.btnUrl) return [{ kind: 'open_url', url: cfg.btnUrl }];
  return [];
}

// 筛选算符（按字段类型）
const TEXT_OPS = [['contains', '包含'], ['notContains', '不包含'], ['eq', '等于'], ['neq', '不等于'], ['empty', '为空'], ['notEmpty', '不为空']];
const NUM_OPS = [['eq', '等于'], ['neq', '不等于'], ['gt', '大于'], ['gte', '大于等于'], ['lt', '小于'], ['lte', '小于等于'], ['empty', '为空'], ['notEmpty', '不为空']];
const DATE_OPS = [['eq', '等于'], ['before', '早于'], ['after', '晚于'], ['empty', '为空'], ['notEmpty', '不为空']];
const MEMBER_OPS = [['in', '是任一'], ['notIn', '不是'], ['empty', '为空'], ['notEmpty', '不为空']];
export const OPS_BY_TYPE = {
  text: TEXT_OPS,
  longtext: TEXT_OPS,
  url: TEXT_OPS,
  email: TEXT_OPS,
  phone: TEXT_OPS,
  auto_number: TEXT_OPS,
  number: NUM_OPS,
  rating: NUM_OPS,
  duration: NUM_OPS,
  select: [['in', '属于任一'], ['notIn', '不属于'], ['empty', '为空'], ['notEmpty', '不为空']],
  member: MEMBER_OPS,
  created_by: MEMBER_OPS,
  updated_by: MEMBER_OPS,
  multiselect: [['hasAny', '包含任一'], ['hasAll', '包含全部'], ['empty', '为空'], ['notEmpty', '不为空']],
  date: DATE_OPS,
  created_at: DATE_OPS,
  updated_at: DATE_OPS,
  checkbox: [['isTrue', '已勾选'], ['isFalse', '未勾选']],
  attachment: [['empty', '为空'], ['notEmpty', '不为空']],
  signature: [['empty', '为空'], ['notEmpty', '不为空']],
  button: [['empty', '为空'], ['notEmpty', '不为空']],
  formula: [['eq', '等于'], ['neq', '不等于'], ['gt', '大于'], ['gte', '大于等于'], ['lt', '小于'], ['lte', '小于等于'], ['contains', '包含'], ['notContains', '不包含'], ['empty', '为空'], ['notEmpty', '不为空']],
  link_formula: [['eq', '等于'], ['neq', '不等于'], ['gt', '大于'], ['gte', '大于等于'], ['lt', '小于'], ['lte', '小于等于'], ['contains', '包含'], ['notContains', '不包含'], ['empty', '为空'], ['notEmpty', '不为空']],
  link: [['contains', '包含记录'], ['notContains', '不包含记录'], ['empty', '为空'], ['notEmpty', '不为空']],
};

export const NO_VALUE_OPS = new Set(['empty', 'notEmpty', 'isTrue', 'isFalse']);
export const MULTI_VALUE_OPS = new Set(['in', 'notIn', 'hasAny', 'hasAll']);

export const GROUPABLE = new Set(['select', 'member', 'date', 'number', 'text', 'checkbox', 'rating', 'created_by', 'updated_by', 'created_at', 'updated_at']);
export const NUMERIC_TYPES = new Set(['number', 'duration', 'formula', 'link_formula']);
