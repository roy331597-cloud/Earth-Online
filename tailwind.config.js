/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * 全局色调被严格限制在 Black / White / Gold / Blue 四色内。
         *   ink    —— 底色（近黑带蓝，比纯黑透气）
         *   amber  —— 金色，直接用 Tailwind 内置的 amber 档位
         *             （需求里点名的 text-amber-400 = #fbbf24，不另造一套金）
         *   abyss  —— 冷蓝，用于环境光、进度条底、非奖励态的状态色
         */
        ink: {
          950: '#05070c',
          900: '#0a0e16',
          800: '#111726',
          700: '#1a2133',
          600: '#28324a',
        },
        abyss: {
          300: '#93b4ff',
          400: '#6d92f5',
          500: '#3b5bdb',
          600: '#2b44ab',
          700: '#1d2f7a',
          900: '#0d1533',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Noto Sans SC"',
          'system-ui',
          'sans-serif',
        ],
        // 文学性文本（题记、篇章名、日记）用衬线，日常操作文本用 sans
        serif: ['"Songti SC"', '"Noto Serif SC"', 'Georgia', 'serif'],
      },
      boxShadow: {
        /**
         * 玻璃的投影刻意比"纯黑"浅一档：画面整体提亮之后，
         * 0.55 的黑会把面板压成一块墓碑。inset 那道 1px 白是"玻璃上缘的受光"，
         * 有它才像玻璃，没有它就只是半透明的黑色方块。
         */
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.42), inset 0 1px 0 0 rgba(255, 255, 255, 0.07)',
        'glass-sm': '0 4px 16px 0 rgba(0, 0, 0, 0.34), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
        // 金色呼吸微光：hover 时的边框高亮 + 外发光
        'glow-gold': '0 0 0 1px rgba(245, 185, 66, 0.35), 0 0 26px -6px rgba(245, 185, 66, 0.55)',
        'glow-gold-lg': '0 0 0 1px rgba(245, 185, 66, 0.45), 0 0 46px -6px rgba(245, 185, 66, 0.65)',
        'glow-blue': '0 0 0 1px rgba(109, 146, 245, 0.28), 0 0 30px -8px rgba(109, 146, 245, 0.45)',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        // 背景极缓慢推近：让静态图有"在场"的感觉，48s 走完一轮，不喧哗
        kenburns: {
          '0%': { transform: 'scale(1.06) translate3d(0, 0, 0)' },
          '100%': { transform: 'scale(1.13) translate3d(-1.1%, -0.9%, 0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // 手机端：底部抽屉
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        // PC 端：右侧面板
        'panel-in': {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'dot-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.82)' },
        },
        /**
         * 打钩后那一串「+92 EXP」：向上飘走再消失。
         * 18% 处先"落定"一下（而不是全程线性上浮）—— 数字要先被看见，再被送走。
         */
        'float-up': {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.94)' },
          '18%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '70%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateY(-34px) scale(1)' },
        },
        /** 对勾落下的那一下：略过冲再收回，避免"啪"地弹出来 */
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '60%': { opacity: '1', transform: 'scale(1.14)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        /**
         * 通关仪式上那层金色微粒：缓慢上浮、中途最亮、两端隐没。
         *
         * 与 float-up 的区别是它**无限循环**（一放七秒，不是一次性的 EXP 数字），
         * 而且位移大得多（-120px）—— 一粒灰在原地闪是噪点，飘过整屏才是空气。
         * 每粒的 delay / 时长 / 横向漂移由组件用内联 style 错开，
         * 否则它们会像一队士兵同时上升，一眼看穿是动画而不是尘埃。
         */
        'gold-drift': {
          '0%': { opacity: '0', transform: 'translate3d(0, 12px, 0) scale(0.6)' },
          '18%': { opacity: '0.85' },
          '62%': { opacity: '0.7' },
          '100%': { opacity: '0', transform: 'translate3d(0, -120px, 0) scale(1.05)' },
        },
      },
      animation: {
        breathe: 'breathe 3.6s ease-in-out infinite',
        kenburns: 'kenburns 48s ease-out forwards',
        'fade-in': 'fade-in 700ms ease-out both',
        'fade-up': 'fade-up 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'sheet-up': 'sheet-up 340ms cubic-bezier(0.16, 1, 0.3, 1)',
        'panel-in': 'panel-in 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        'dot-pulse': 'dot-pulse 2.8s ease-in-out infinite',
        'float-up': 'float-up 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pop-in': 'pop-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'gold-drift': 'gold-drift 7s linear infinite',
      },
      transitionTimingFunction: {
        // AVG 里"滑出"的手感：起步快、收尾慢
        cinematic: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
