/**
 * 条件类名拼接。只有十来个字符，不值得为它装 clsx。
 * 用法：cn('glass', isActive && 'glass-active', className)
 */
export const cn = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');
