// ============================================================================
// 里程碑上的图 —— 拍照 / 选图的那两枚零件
//
// 从 `MilestoneSheet` 里搬出来，是因为它有两个**不同时机**的入口：
//
//   ① 「记下来」的时候一起交（`PhotoPicker`）—— 图跟着表单走，提交前还能反悔；
//   ② 事后补一张（`AttachPhotoButton`）—— 挂在档案馆的里程碑墙上。
//
// 第二个入口是后来才有的，而且是**必须**有的：录入结果页上那句
// "照片可以过几天补 —— 事情发生的当时你往往在忙"如果背后没有落点，
// 它就成了一句空话（`attachMilestoneSnapshot` 在此之前没有任何调用方）。
//
// 两条路共用同一套压缩与同一套上限，所以"压到多大""能放几张"只有一种答案。
// ============================================================================

import { useRef, useState } from 'react';
import { MILESTONE_PHOTO_MAX } from '@/data/catalog/milestones';
import { formatBytes } from '@/lib/format';
import { compressImageFile } from '@/lib/image';
import { useEarthOnlineStore, useMutate } from '@/store/useEarthOnlineStore';
import { attachMilestoneSnapshot } from '@/store/operations';

/**
 * 表单里那一张（或几张）**还没提交**的照片。
 *
 * 只带 `url` 与 `bytes`：`addedAt` 到提交那一刻才写进去
 * （一张还没落库的图，不该有一个"加进来的时间"）。
 */
export interface PhotoDraft {
  url: string;
  bytes: number;
}

/** 文件选择器 + 压缩。两条路的失败都要翻译成人话再由调用方显示 */
const useCompress = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined, onDone: (draft: PhotoDraft) => void) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const image = await compressImageFile(file);
      onDone({ url: image.dataUrl, bytes: image.bytes });
    } catch (err) {
      setError(err instanceof Error ? err.message : '这张图没能读进来');
    } finally {
      setBusy(false);
      // 清空 input 的值：选了同一张图两次也要能再次触发 change
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return { busy, error, inputRef, pick };
};

/** 那个藏起来的 `<input type="file">`。`capture` 是手机上"直接开相机"的开关 */
const PhotoInput = ({
  inputRef,
  onPick,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File | undefined) => void;
}) => (
  <input
    ref={inputRef}
    type="file"
    accept="image/*"
    capture="environment"
    aria-label="拍照或选一张图"
    onChange={(e) => onPick(e.target.files?.[0])}
    className="hidden"
  />
);

/**
 * 写盘失败过就说一声。
 *
 * 照片是唯一能让存档真的撑爆的东西，而"存不进去"如果没人说，
 * 玩家只会看到自己拍的照片过一天不见了。（`persistError` 这个字段
 * 在 store 里被维护了很久，却一直没有任何界面读它。）
 */
const PersistWarning = () => {
  const persistError = useEarthOnlineStore((s) => s.persistError);
  if (persistError === null) return null;
  return (
    <p className="mt-1 text-[10.5px] leading-relaxed text-amber-300/85">
      上一次写盘没成功（{persistError}）—— 浏览器给的空间可能满了，先删几张旧图再试。
    </p>
  );
};

/**
 * 录入表单里的那一格：拍照 / 选图。
 *
 * 三件事必须让玩家看得见，否则这个功能会以一种很伤人的方式失败：
 *
 *   ① **图会被压。** 手机原图 4 MB，压完约 200 KB —— 不写这一句，
 *      玩家会以为存进去的是原图，然后疑惑"为什么放大有点糊"。
 *   ② **它占了多大地方。** 存档是浏览器给的那几 MB，不是云。
 *      这里报的是**估算**，带一个"约"字 —— 报精确到字节是在假装准确。
 *   ③ **最多几张。** 到上限就把加号收起来并说明，而不是让他点了没反应。
 *
 * 桌面浏览器忽略 `capture`，退回普通文件选择器 —— 两条路都走得通。
 */
export function PhotoPicker({ photos, onChange }: { photos: PhotoDraft[]; onChange: (next: PhotoDraft[]) => void }) {
  const { busy, error, inputRef, pick } = useCompress();
  const totalBytes = photos.reduce((sum, p) => sum + p.bytes, 0);
  const full = photos.length >= MILESTONE_PHOTO_MAX;

  return (
    <div className="mt-3.5">
      <span className="text-[11px] tracking-wide text-white/55">拍下来（选填）</span>

      {photos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={`${i}-${p.bytes}`} className="relative">
              <img
                src={p.url}
                alt={`照片 ${i + 1}`}
                className="h-16 w-16 rounded-lg border border-white/15 object-cover"
              />
              <button
                type="button"
                aria-label={`去掉第 ${i + 1} 张照片`}
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full border border-white/20 bg-ink-900/90 text-[10px] leading-none text-white/60 transition hover:text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <PhotoInput inputRef={inputRef} onPick={(f) => void pick(f, (d) => onChange([...photos, d].slice(0, MILESTONE_PHOTO_MAX)))} />

      <div className="mt-1.5 flex items-center gap-2.5">
        {!full && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="glass-pill glass-hover px-3 py-1.5 text-[11px] text-amber-100/85 disabled:opacity-50"
          >
            {busy ? '正在压…' : photos.length > 0 ? '＋ 再加一张' : '＋ 拍一张 / 选一张'}
          </button>
        )}
        <span className="numeric text-[10px] text-white/30">
          {photos.length > 0 ? `已放 ${photos.length} 张 · 约 ${formatBytes(totalBytes)}` : `最多 ${MILESTONE_PHOTO_MAX} 张`}
          {full && photos.length > 0 && ' · 到上限了'}
        </span>
      </div>

      <p className="mt-1 text-[10px] leading-relaxed text-white/30">
        图会先压到长边 1280 再存进来（一张约 200 KB，不是云相册）。
      </p>

      {error && <p className="mt-1 text-[10.5px] leading-relaxed text-amber-300/85">{error}</p>}
      <PersistWarning />
    </div>
  );
}

/**
 * 事后补一张 —— 挂在里程碑墙上，每条记录旁边。
 *
 * 它**不弹窗、不确认**：选完图当场落库，因为这里没有任何需要再决定的事
 * （分类、标题、日期早就定了，缺的只有那张图）。
 *
 * 到上限就整枚收起来 —— 标题行那句"最多 3 张"在录入时说过一次，
 * 这里不需要再说第二遍。
 */
export function AttachPhotoButton({ recordId, photoCount }: { recordId: string; photoCount: number }) {
  const mutate = useMutate();
  const { busy, error, inputRef, pick } = useCompress();

  if (photoCount >= MILESTONE_PHOTO_MAX) return null;

  return (
    <>
      <PhotoInput
        inputRef={inputRef}
        onPick={(f) =>
          void pick(f, (d) => {
            mutate((s) =>
              attachMilestoneSnapshot(
                s,
                recordId,
                { kind: 'photo', url: d.url, caption: null, addedAt: new Date().toISOString() },
                new Date(),
              ),
            );
          })
        }
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="text-[10px] text-white/30 transition hover:text-amber-200/80 disabled:opacity-50"
      >
        {busy ? '正在压…' : '＋ 补一张图'}
      </button>
      {error && <span className="text-[10px] text-amber-300/85">{error}</span>}
    </>
  );
}
