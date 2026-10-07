import { Icon, TimeOfDayGlyph } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import type { HudSnapshot } from '@/types';

interface StatusHudProps {
  hud: HudSnapshot;
  /** A9 进度 0..1（由 selectors 的 a9Progress 计算，不入库） */
  a9: number;
  /** 点净资产进金库面板 —— HUD 上那个金色数字本来就是"这里可以进去看"的意思 */
  onOpenVault?: () => void;
  /** 进控制室（AI 总线 / 存档安全）。两端共用这一个入口，见 lib/panels.ts */
  onOpenSettings?: () => void;
  /** 控制室里有需要玩家知道的事吗（密钥没配、熔断、有一份待救的备份） */
  settingsAlert?: boolean;
}

const pct = (ratio: number): string => `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%`;

/**
 * 右上角沉浸式 HUD。
 *
 * 两端是两种东西，不是同一张卡的两个尺寸：
 *   手机 —— 一只手能够到的信息密度：现在几点 + 在哪 + 有多少钱。
 *          其余的一律收进面板，屏幕就这么大。
 *   PC   —— 变成一张"作战室"战术卡：等级、职业头衔、手上有几件事、
 *          还有 A9 进度条。宽屏最不缺的就是空白，用它换信息。
 *
 * 金色的使用被严格限制：**只有净资产这一个数字是金的**。
 * 金色一旦泛滥就变成了装饰，而它在这里承担的是"目标"的语义。
 */
export function StatusHud({ hud, a9, onOpenVault, onOpenSettings, settingsAlert = false }: StatusHudProps) {
  const { quickStats } = hud;
  const hasPending = quickStats.pendingDailyCount > 0;

  /**
   * 控制室入口。两端各挂一次，位置都在最右上角 ——
   * 它是整个界面上唯一一个"不属于场景"的东西，所以索性放在最边上。
   * 红点只标**需要玩家动手**的事（密钥没配 / 熔断 / 有一份待救的存档），
   * 不是"有新功能" —— 那种红点本质上是在催人，这个应用不催人。
   */
  const settingsButton = (className: string) => (
    <button
      type="button"
      onClick={onOpenSettings}
      aria-label="打开控制室"
      className={cn(
        'glass-pill glass-hover relative shrink-0 text-white/45 transition hover:text-white',
        className,
      )}
    >
      <Icon name="gear" className="h-[0.95rem] w-[0.95rem]" />
      {settingsAlert && (
        <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
      )}
    </button>
  );

  return (
    <div
      className="pointer-events-none absolute right-3 top-3 z-30 md:right-6 md:top-6"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* ================= 手机端：紧凑药丸 ================= */}
      <div className="flex items-start justify-end gap-1.5">
        <div className="glass-pill glass-hover pointer-events-auto relative px-3 py-2 md:hidden">
          {hasPending && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-dot-pulse rounded-full bg-amber-400" />
          )}
          <div className="flex items-center gap-1.5 text-[11px] leading-none text-white/75">
            <TimeOfDayGlyph timeOfDay={hud.timeOfDay} className="h-3.5 w-3.5" />
            <span>{hud.timeOfDayLabel}</span>
            <span className="text-white/30">·</span>
            <span className="max-w-[9rem] truncate">{hud.locationLabel}</span>
          </div>
          <button
            type="button"
            onClick={onOpenVault}
            aria-label="打开金库"
            className="numeric-gold mt-1.5 block text-left text-[15px] font-semibold leading-none"
          >
            {quickStats.netWorthLabel}
          </button>
        </div>
        <span className="pointer-events-auto md:hidden">{settingsButton('p-2')}</span>
      </div>

      {/* ================= PC 端：作战室卡片 ================= */}
      <div className="glass-deep glass-hover pointer-events-auto relative hidden w-[19rem] p-4 md:block">
        {hasPending && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-dot-pulse rounded-full bg-amber-400" />
        )}

        {/* 时间 · 时段 · 控制室入口 */}
        <div className="flex items-center justify-between text-xs text-white/70">
          <div className="flex items-center gap-1.5">
            <TimeOfDayGlyph timeOfDay={hud.timeOfDay} className="h-4 w-4 text-amber-400/80" />
            <span className="tracking-widest">{hud.timeOfDayLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="numeric text-white/45">{hud.localTimeLabel}</span>
            {settingsButton('p-1.5')}
          </div>
        </div>

        {/* 地点 */}
        <div className="mt-2 text-[15px] font-medium tracking-wide text-white">
          {hud.locationLabel}
        </div>

        {/* 氛围句 —— 场景里的那句画外音 */}
        <p className="prose-cinematic mt-2 text-[12.5px] text-white/60">{hud.ambientLine}</p>

        <div className="my-3 h-px bg-white/10" />

        {/* 身份与手上的事 */}
        <div className="flex items-baseline justify-between text-[11.5px] text-white/60">
          <span className="numeric text-white/85">Lv.{quickStats.level}</span>
          <span className="max-w-[9rem] truncate text-abyss-300">{quickStats.activeClassTitle}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[11.5px] text-white/55">
          <span>
            进行中 <span className="numeric text-white/85">{quickStats.activeQuestCount}</span>
          </span>
          <span className="text-white/20">|</span>
          <span>
            待打钩{' '}
            <span className={cn('numeric', hasPending ? 'text-amber-400' : 'text-white/85')}>
              {quickStats.pendingDailyCount}
            </span>
          </span>
        </div>

        <div className="my-3 h-px bg-white/10" />

        {/* A9 —— 全屏唯一的金色数字。整块可点：数字本身就是"进去看看"的入口 */}
        <button
          type="button"
          onClick={onOpenVault}
          aria-label="打开金库"
          className="w-full text-left"
        >
          <span className="flex items-baseline justify-between">
            <span className="text-[10.5px] uppercase tracking-[0.18em] text-white/45">A9</span>
            <span className="numeric-gold text-lg font-semibold leading-none">
              {quickStats.netWorthLabel}
            </span>
          </span>
          <span className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-200 transition-[width] duration-700 ease-cinematic"
              style={{ width: `${Math.max(0.6, a9 * 100)}%` }}
            />
          </span>
          <span className="mt-1.5 flex justify-between text-[10.5px] text-white/40">
            <span>建角刻度 $ 1,100</span>
            <span className="numeric text-amber-400/70">{pct(a9)}</span>
          </span>
        </button>
      </div>

      {/* 深夜的温和提示：只提示，不阻拦（见 catalog/scenes.ts 的设计说明） */}
      {hud.suggestRest && (
        <div className="glass-pill pointer-events-auto mt-2 hidden px-3 py-1.5 text-[11px] text-white/55 md:block">
          已经深夜了。剩下的事，明天做也来得及。
        </div>
      )}
    </div>
  );
}
