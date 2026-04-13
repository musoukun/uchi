import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Avatar } from './Avatar';
import { setMe as setGlobalMe } from '../useMe';

// シンプルなクライアント側の正方形クロップ:
// - file 選択 → Image 化
// - canvas にドラッグ可能な「クロップ枠」 (scale + 位置 で表示)
// - クロップ実行で 512x512 の正方形 PNG を生成 → uploadFile → updateMe(avatarUrl)
//
// アバターは「画像」または「名前の頭文字アイコン」の二択。
// (絵文字アバターは廃止)

const OUTPUT_SIZE = 512;
const PREVIEW_SIZE = 320;

// controlled モード:
//   onPendingFile / onPendingClear が指定されているとき、操作完了で
//   API を呼ばずに親に通知する。親が「保存」ボタンで一括 commit する想定。
//   uncontrolled (default) 動作は従来通り即時 API 反映。
export function AvatarSection({
  onPendingFile,
  onPendingClear,
  bare,
}: {
  onPendingFile?: (file: File) => void;
  onPendingClear?: () => void;
  bare?: boolean; // true なら外側の card / h3 を出さず、フラグメント風に描画
} = {}) {
  const controlled = !!onPendingFile;
  const [me, setMe] = useState<{ id: string; name: string; avatarUrl: string | null; avatarColor?: string | null } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // controlled 時の確定済みプレビュー
  const [previewCleared, setPreviewCleared] = useState(false); // controlled 時に「頭文字に戻す」が確定済みか
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    api.getMe().then((u) => {
      if (u) {
        setMe({ id: u.id, name: u.name, avatarUrl: u.avatarUrl, avatarColor: u.avatarColor });
        setColor(u.avatarColor || '#5fcfdc');
      }
    });
  }, []);

  // クロップ枠を描画
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !img) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // ベース fit (正方形に短辺を合わせる)
    const base = Math.min(cv.width / img.width, cv.height / img.height);
    const s = base * scale;
    const w = img.width * s;
    const h = img.height * s;
    // tx/ty は中央基準のオフセット
    const cx = cv.width / 2;
    const cy = cv.height / 2;
    ctx.drawImage(img, cx - w / 2 + tx, cy - h / 2 + ty, w, h);

    // 暗い overlay + 中央に円形クロップ枠
    const cropPx = Math.min(cv.width, cv.height) - 20;
    ctx.fillStyle = 'rgba(15,23,42,.55)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    // 円をくり抜く
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cv.width / 2, cv.height / 2, cropPx / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // 円の枠
    ctx.beginPath();
    ctx.arc(cv.width / 2, cv.height / 2, cropPx / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#5fcfdc';
    ctx.lineWidth = 3;
    ctx.stroke();
  }, [img, scale, tx, ty]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      setImg(im);
      setScale(1);
      setTx(0);
      setTy(0);
    };
    im.src = url;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, tx, ty });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart) return;
    setTx(dragStart.tx + (e.clientX - dragStart.x));
    setTy(dragStart.ty + (e.clientY - dragStart.y));
  };
  const onMouseUp = () => setDragging(false);

  const cropAndUpload = async () => {
    if (!img) return;
    setSaving(true);
    setMsg(null);
    try {
      // 出力 canvas
      const out = document.createElement('canvas');
      out.width = OUTPUT_SIZE;
      out.height = OUTPUT_SIZE;
      const octx = out.getContext('2d')!;
      // プレビューと同じスケール演算で出力 canvas に描画
      const cv = canvasRef.current!;
      const cropPx = Math.min(cv.width, cv.height) - 20;
      // プレビュー上のベース fit
      const base = Math.min(cv.width / img.width, cv.height / img.height);
      const s = base * scale;
      const w = img.width * s;
      const h = img.height * s;
      const cx = cv.width / 2;
      const cy = cv.height / 2;
      const drawX = cx - w / 2 + tx;
      const drawY = cy - h / 2 + ty;
      // クロップ範囲 (プレビュー座標)
      const cropX = (cv.width - cropPx) / 2;
      const cropY = (cv.height - cropPx) / 2;
      // ソース画像内の対応座標
      const sx = (cropX - drawX) / s;
      const sy = (cropY - drawY) / s;
      const sw = cropPx / s;
      const sh = cropPx / s;
      octx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const blob: Blob = await new Promise((resolve) =>
        out.toBlob((b) => resolve(b!), 'image/png')
      );
      const file = new File([blob], 'avatar.png', { type: 'image/png' });
      if (controlled) {
        // 親に File を渡して、自前ではプレビューを更新するだけ
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        setPreviewCleared(false);
        onPendingFile!(file);
        setImg(null);
        setMsg('画像を確定しました (保存ボタンで反映)');
      } else {
        const up = await api.uploadFile(file);
        const updated = await api.updateMe({ avatarUrl: up.url });
        setMe((prev) => (prev ? { ...prev, avatarUrl: updated.avatarUrl } : prev));
        setGlobalMe(updated); // ヘッダー等の Avatar を即時更新
        setImg(null);
        setMsg('アバターを更新しました');
      }
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  // 「頭文字アイコンに戻す」: avatarUrl を null にして、Avatar コンポーネントに
  // イニシャル文字を描画させる
  const clearAvatar = async () => {
    setSaving(true);
    setMsg(null);
    try {
      if (controlled) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPreviewCleared(true);
        onPendingClear?.();
        setMsg('頭文字アイコンに戻します (保存ボタンで反映)');
      } else {
        const updated = await api.updateMe({ avatarUrl: null });
        setMe((prev) => (prev ? { ...prev, avatarUrl: updated.avatarUrl } : prev));
        setGlobalMe(updated);
        setMsg('頭文字アイコンに戻しました');
      }
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  // カラーピッカー
  const [color, setColor] = useState('#5fcfdc');
  const [savingColor, setSavingColor] = useState(false);

  const saveColor = async () => {
    setSavingColor(true);
    setMsg(null);
    try {
      const updated = await api.updateMe({ avatarColor: color });
      setMe((prev) => (prev ? { ...prev, avatarColor: color } : prev));
      setGlobalMe(updated);
      setMsg('アイコンの色を変更しました');
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSavingColor(false);
    }
  };

  const resetColor = async () => {
    setSavingColor(true);
    setMsg(null);
    try {
      const updated = await api.updateMe({ avatarColor: null });
      setColor('#5fcfdc');
      setMe((prev) => (prev ? { ...prev, avatarColor: null } : prev));
      setGlobalMe(updated);
      setMsg('デフォルトの色に戻しました');
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSavingColor(false);
    }
  };

  // 表示用アバター (controlled 時のプレビュー優先 → クリア確定 → 現在値)
  const displayedAvatarUrl = previewCleared
    ? null
    : previewUrl || (me?.avatarUrl ?? null);

  const inner = (
    <>
      {!bare && <h3 style={{ marginTop: 0 }}>プロフィール画像</h3>}
      {me && !bare && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
          <Avatar user={{ ...me, avatarUrl: displayedAvatarUrl }} size="lg" />
          <div>
            <div style={{ fontWeight: 700 }}>{me.name}</div>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>
              {previewUrl
                ? '確定済み (保存ボタンで反映)'
                : previewCleared
                ? '頭文字アイコン (保存ボタンで反映)'
                : '現在のアバター'}
            </div>
          </div>
        </div>
      )}

      {/* 画像ファイルからクロップ */}
      <label style={{ fontWeight: 700, fontSize: 15 }}>画像をアップロードして円形にクロップ:</label>
      <div style={{ marginTop: 8 }}>
        <input type="file" accept="image/*" onChange={onFile} />
      </div>
      {img && (
        <div style={{ marginTop: 12 }}>
          <div className="avatar-crop">
            <canvas
              ref={canvasRef}
              width={PREVIEW_SIZE}
              height={PREVIEW_SIZE}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              style={{ cursor: dragging ? 'grabbing' : 'grab', borderRadius: 8 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <label style={{ fontSize: 14, color: 'var(--muted)' }}>ズーム</label>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <button className="btn" disabled={saving} onClick={cropAndUpload}>
              {saving ? '保存中…' : 'クロップして確定'}
            </button>
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
            画像をドラッグして位置を調整、スライダーでズーム。
          </div>
        </div>
      )}

      <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

      {/* 頭文字アイコンに戻す */}
      <div>
        <label style={{ fontWeight: 700, fontSize: 15 }}>または、名前の頭文字アイコンを使う:</label>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={saving}
            onClick={clearAvatar}
          >
            頭文字アイコンに戻す
          </button>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>
            画像を使わず、名前の1文字目を表示します
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 40, height: 40, padding: 2, border: '2px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'transparent' }}
          />
          <Avatar user={{ name: me?.name || '?', avatarUrl: null, avatarColor: color }} size="lg" />
          <button className="btn" disabled={savingColor} onClick={saveColor}>
            {savingColor ? '保存中…' : 'この色に変更'}
          </button>
          <button className="btn btn-ghost" disabled={savingColor} onClick={resetColor} style={{ fontSize: 13 }}>
            デフォルトに戻す
          </button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          文字色は背景に合わせて自動で白/黒に切り替わります
        </div>
      </div>

      {msg && <div style={{ marginTop: 12, color: 'var(--accent)' }}>{msg}</div>}
    </>
  );
  return bare ? inner : <div className="card">{inner}</div>;
}
