// 站塔table 前端插件：通用数据表组件（零后端依赖）
// 宿主传入 fields/rows/members 与视图配置，编辑统一经 onCellCommit / onBatch 回调交回宿主保存。
// 数据契约：
//   fields: [{ id, name, type, config }]（type/config 口径见 fields.js）
//   rows:   [{ id, version, cells: { [fieldId]: value } }]
//   view:   { filter, sort, group, hidden, colWidths, rowHeight, freezeFirst, colorByField, cellColor }（见 pipeline.js）
//   结构操作回调（可选，宿主接后端时提供）：onInsertField(下标) / onEditField(field, focus) /
//     onRenameField / onCopyField / onDeleteField / onResetAutoField /
//     onInsertRows(row, 'above'|'below', count) / onCopyRow / onDeleteRow / onCopyRowUrl
//   onBatch(ops, mode)：mode='paste' 时 ops 带 raw 原始文本，'typed' 时带 value 类型化值；
//     无后端宿主可用 pipeline.js 的 applyBatchLocally 直接应用到内存行。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ZtGrid from './ZtGrid';
import ZtToolbar from './Toolbar';
import RowDetail from './RowDetail';
import { fieldsById, applyFilter, applySort } from './pipeline';
import './zttable.css';

export default function ZtTable({
  fields,
  rows,
  members = [],
  view,
  onViewChange,
  onCellCommit,
  onBatch,
  onOpenRow,
  onSelectionChange,
  showToolbar = true,
  className = '',
  user,
  onInsertField,
  onEditField,
  onRenameField,
  onCopyField,
  onDeleteField,
  onResetAutoField,
  onInsertRows,
  onAddRow,
  onCopyRow,
  onDeleteRow,
  onCopyRowUrl,
  commentCounts,
  onOpenComments,
  rowStates,
  rowDetail,
  openDetailRowId,
  onExport, viewId,
  dataOpsApi,
  viewName,
  onDataChanged,
  onToggleViewLock,
  headerLocked = false,
  onToggleHeaderLock,
  enableSetFilter = false,
  linkData,
  onPatchFieldConfig,
  baseTables,
  visitor = false,
}) {
  const [findOpen, setFindOpen] = useState(false);
  const [frOpen, setFrOpen] = useState(false);
  const fieldMap = useMemo(() => fieldsById(fields || []), [fields]);
  // 行详情弹窗：rowDetail 宿主配置存在时由插件内部接管 onOpenRow
  const [detailId, setDetailId] = useState(null);
  const [detailCmtOpen, setDetailCmtOpen] = useState(false);
  const consumedLinkRef = useRef(null);
  useEffect(() => {
    if (!rowDetail || !openDetailRowId) return;
    if (consumedLinkRef.current === openDetailRowId) return;
    if ((rows || []).some((r) => r.id === openDetailRowId)) {
      consumedLinkRef.current = openDetailRowId;
      setDetailId(openDetailRowId);
      setDetailCmtOpen(true);
    }
  }, [rowDetail, openDetailRowId, rows]);
  const orderedIds = useMemo(() => {
    if (!detailId) return [];
    const filtered = applyFilter(rows || [], view?.filter, fieldMap);
    return applySort(filtered, view?.sort, fieldMap).map((r) => r.id);
  }, [detailId, rows, view, fieldMap]);
  const detailRow = detailId ? (rows || []).find((r) => r.id === detailId) || null : null;

  // 数据来自 linkData 契约（options 带 cells/version、targetFields/targetTableName）

  const [linkedStack, setLinkedStack] = useState([]);
  const linkedDetail = linkedStack[linkedStack.length - 1] || null;
  const openLinkedRecord = useCallback((field, recordId) => {
    const ld = (linkData || {})[field.id];
    const opt = ld?.options?.find((o) => o.id === recordId);
    if (!ld || !opt) return;
    setLinkedStack((prev) => [...prev, {
      field,
      record: { id: opt.id, version: opt.version, cells: opt.cells || {} },
      targetTableId: ld.targetTableId,
      targetTableName: ld.targetTableName,
      targetFields: ld.targetFields || [],
    }]);
  }, [linkData]);
  const linkedCellCommit = useCallback(async (rid, fid, value, version) => {
    if (!linkedDetail || !rowDetail?.linkedCellCommit) return;
    const res = await rowDetail.linkedCellCommit(linkedDetail.targetTableId, rid, fid, value, version);
    setLinkedStack((prev) => {
      const top = prev[prev.length - 1];
      if (!top || top.record.id !== rid) return prev;
      const next = [...prev];
      next[next.length - 1] = {
        ...top,
        record: {
          ...top.record,
          version: res?.version ?? top.record.version,
          cells: { ...top.record.cells, [fid]: value, ...(res?.formula_cells || {}) },
        },
      };
      return next;
    });
    return res;
  }, [linkedDetail, rowDetail]);
  useEffect(() => { if (detailId && rows && !detailRow) setDetailId(null); }, [detailId, rows, detailRow]);
  const handleOpenRow = (rowDetail || visitor)
    ? (row) => { setDetailId(row.id); setDetailCmtOpen(false); }
    : onOpenRow;
  // 真锁定（）：视图锁定后，经插件的一切视图设置变更都被拦截（锁定开关在工具栏左端，不走此通道）
  const guardedViewChange = (patch) => {
    if (view?.locked) return;
    onViewChange(patch);
  };
  return (
    <div className={`zt-plugin ${className}`}>
      {showToolbar && (
        <ZtToolbar
          fields={fields} fieldMap={fieldMap} members={members} rows={rows}
          view={view} onViewChange={guardedViewChange} onOpenFind={() => setFindOpen(true)}
          onOpenFindReplace={() => setFrOpen(true)}
          onExport={onExport ? (format) => onExport(format, viewId) : undefined} dataOpsApi={dataOpsApi} viewName={viewName}
          onDataChanged={onDataChanged} onToggleViewLock={onToggleViewLock}
          headerLocked={headerLocked} enableSetFilter={enableSetFilter} linkData={linkData}
          visitor={visitor}
        />
      )}
      <ZtGrid
        fields={fields} rows={rows} members={members} view={view}
        onViewChange={guardedViewChange} onCellCommit={onCellCommit} onBatch={onBatch}
        onOpenRow={handleOpenRow} findOpen={findOpen} onCloseFind={() => setFindOpen(false)}
        frOpen={frOpen} onCloseFr={() => setFrOpen(false)}
        onSelectionChange={onSelectionChange} user={user}
        onInsertField={onInsertField} onEditField={onEditField} onRenameField={onRenameField}
        onCopyField={onCopyField} onDeleteField={onDeleteField} onResetAutoField={onResetAutoField}
        onInsertRows={onInsertRows} onAddRow={onAddRow} onCopyRow={onCopyRow} onDeleteRow={onDeleteRow} onCopyRowUrl={onCopyRowUrl}
        commentCounts={commentCounts} onOpenComments={onOpenComments}
        rowStates={rowStates}
        headerLocked={headerLocked} onToggleHeaderLock={onToggleHeaderLock}
        linkData={linkData}
        visitor={visitor}
        uploadFile={rowDetail?.uploadFile}
        buttonExec={rowDetail?.buttonExec}
        onOpenLinkedRecord={openLinkedRecord}
        onAddLinkedRecord={rowDetail?.addLinkedRecord}
        onPatchFieldConfig={onPatchFieldConfig}
        baseTables={baseTables}
      />
      {detailRow && (rowDetail || visitor) && (
        <RowDetail
          fields={fields} row={detailRow} members={members} order={orderedIds}
          onNavigate={(id) => id && setDetailId(id)}
          onClose={() => setDetailId(null)}
          onCellCommit={visitor ? undefined : onCellCommit}
          onDeleteRow={visitor ? undefined : (r) => { onDeleteRow?.(r); setDetailId(null); }}
          commentsApi={visitor ? undefined : rowDetail.commentsApi}
          tableId={visitor ? undefined : rowDetail.tableId}
          commentCount={visitor ? 0 : (commentCounts || {})[detailRow.id] || 0}
          onCommentsMutate={visitor ? undefined : rowDetail.onCommentsMutate}
          uploadFile={visitor ? undefined : rowDetail.uploadFile}
          linkForRow={visitor ? undefined : rowDetail.linkForRow}
          initialCommentsOpen={visitor ? false : detailCmtOpen}
          linkData={linkData}
          onAddLinkedRecord={visitor ? undefined : rowDetail.addLinkedRecord}
          onOpenLinkedRecord={openLinkedRecord}
          readOnly={visitor}
        />
      )}
      {linkedDetail && (rowDetail || visitor) && (
        <RowDetail
          key={`${linkedDetail.targetTableId}:${linkedDetail.record.id}:${linkedStack.length}`}
          fields={linkedDetail.targetFields} row={linkedDetail.record} members={members}
          order={[linkedDetail.record.id]}
          onNavigate={() => {}}
          onClose={() => setLinkedStack((prev) => prev.slice(0, -1))}
          onCellCommit={visitor ? undefined : linkedCellCommit}
          commentsApi={visitor ? undefined : rowDetail.commentsApi}
          tableId={linkedDetail.targetTableId}
          commentCount={0}
          onCommentsMutate={visitor ? undefined : rowDetail.onCommentsMutate}
          uploadFile={visitor ? undefined : (rowDetail.uploadFileFor ? (file) => rowDetail.uploadFileFor(linkedDetail.targetTableId, file) : undefined)}
          linkForRow={visitor ? undefined : rowDetail.linkForRow}
          linkData={linkData}
          sourceNote={`记录来自 ${linkedDetail.targetTableName || '子表'}`}
          onAddLinkedRecord={visitor ? undefined : rowDetail.addLinkedRecord}
          onOpenLinkedRecord={openLinkedRecord}
          readOnly={visitor}
        />
      )}
    </div>
  );
}
