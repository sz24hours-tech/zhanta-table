// 标题「数字签名」、右上「重新签名」（空板时置灰）、中央画布「请在此面板上签名」、取消/保存。
// 重开可见已有签名（图示于板面）；「重新签名」只清空画布、不删已存签名，取消退出签名仍在；
// 画布空白点保存拦截（提示先签名）。保存＝画布导出 PNG 走附件文件通道上传，值 {fileId} 落库。
import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal, message } from 'antd';
import MsIcon from '@/components/MsIcon';
import { useOverlay } from './overlay';

const PAD_W = 640;
const PAD_H = 240;

export default function SignaturePad({ value, uploadFile, onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const [hasInk, setHasInk] = useState(false);
  const [showExisting, setShowExisting] = useState(!!value?.url);
  const [saving, setSaving] = useState(false);
  // 浮层基线：Esc/遮罩/滚动锁/退场动画统一走 useOverlay；已落笔未保存时关闭先确认（防误关）
  const tryCloseRef = useRef(() => {});
  const ov = useOverlay(true, { onClose, exitMs: 150, trap: true, onEscape: () => tryCloseRef.current() });
  const tryClose = () => {
    if (hasInk && !showExisting) {
      Modal.confirm({
        title: '放弃这次签名？',
        content: '已经画好的签名还没有保存，关闭后将丢弃。',
        okText: '放弃',
        cancelText: '继续签名',
        onOk: () => ov.requestClose(),
      });
      return;
    }
    ov.requestClose();
  };
  tryCloseRef.current = tryClose;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = PAD_W * dpr;
    cv.height = PAD_H * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2733';
  }, [showExisting]);

  const posOf = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * PAD_W, y: ((e.clientY - r.top) / r.height) * PAD_H };
  };
  const onDown = (e) => {
    if (showExisting) return;
    drawingRef.current = true;
    lastRef.current = posOf(e);
    canvasRef.current.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drawingRef.current || showExisting) return;
    const ctx = canvasRef.current.getContext('2d');
    const p = posOf(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!hasInk) setHasInk(true);
  };
  const onUp = () => { drawingRef.current = false; };

  const boardEmpty = !hasInk && !showExisting;
  const resign = () => {
    setShowExisting(false);
    setHasInk(false);
    const cv = canvasRef.current;
    if (cv) cv.getContext('2d').clearRect(0, 0, PAD_W, PAD_H);
  };

  const save = async () => {
    if (hasInk) {
      if (!uploadFile) { message.error('当前环境不支持上传签名'); return; }
      setSaving(true);
      try {
        const blob = await new Promise((res) => canvasRef.current.toBlob(res, 'image/png'));
        if (!blob) throw new Error('导出失败');
        const { file } = await uploadFile(new File([blob], 'signature.png', { type: 'image/png' }));
        if (!file?.id) throw new Error('上传失败');
        onSave({ fileId: file.id, url: file.url });
      } catch (err) {
        message.error('签名保存失败，请重试');
        setSaving(false);
      }
      return;
    }
    if (showExisting) { onClose(); return; }
    message.warning('请先签名');
  };

  return (
    <div ref={ov.ref} className={`zt-sig-mask${ov.closing ? ' closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) tryClose(); }}>
      <div className="zt-sig-pad">
        <div className="zt-sig-head">
          <span className="zt-sig-title">数字签名</span>
          <span style={{ flex: 1 }} />
          <Button size="small" disabled={boardEmpty} onClick={resign}>重新签名</Button>
          <button className="zt-icon-btn" title="关闭" onClick={tryClose}>
            <MsIcon name="close" size={16} />
          </button>
        </div>
        <div className="zt-sig-board">
          {showExisting ? (
            <img className="zt-sig-existing" src={value.url} alt="已有签名" draggable={false} />
          ) : (
            <>
              <canvas
                ref={canvasRef} className="zt-sig-canvas" width={PAD_W} height={PAD_H}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
              />
              {!hasInk && <div className="zt-sig-hint">请在此面板上签名</div>}
            </>
          )}
        </div>
        <div className="zt-sig-foot">
          <Button onClick={tryClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={save}>保存</Button>
        </div>
      </div>
    </div>
  );
}
