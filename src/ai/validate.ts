// ============================================================================
// EarthOnline · Phase 3 · Agent 输出的结构校验与 clamp (validate)
//
// 这是 `schemas.ts` 文件头写着"Phase 4 实现"的那三步的落地：
//
//     1. JSON.parse          —— 见 ai/gateway.ts（那边才知道字节长什么样）
//     2. 结构校验            —— 本文件。失败即 schema_violation，走兜底
//     3. 数值 clamp          —— 本文件。**不算失败**，记进 AgentResult.corrections
//
// 为什么 clamp 不算失败：模型把 exp 写成 2000 时，正确做法是把它削回上限
// 并记一笔，而不是把整次调用丢掉。丢掉意味着玩家白等一次网络往返，
// 而结果里 95% 的内容本来是好的。**失败**只留给"形状不对"——
// 那是没法修的，只能重来或兜底。
//
// 不引 ajv 的理由与 schemas.ts 一致：本项目的 Schema 子集小到
// 一个 200 行的校验器就能覆盖，而 ajv 会带来一份需要与之同步的第二契约。
// ============================================================================

import type { JsonSchema } from '@/ai/schemas';

export interface ValidationOk {
  ok: true;
  value: unknown;
  /** 被修正的地方（人类可读，直接进 AgentResult.corrections 展示给开发者） */
  corrections: string[];
}

export interface ValidationFail {
  ok: false;
  /** 人类可读的失败原因（写进 invocation.errorMessage，会先过 redact） */
  message: string;
  /** 出问题的字段路径，如 `quests[2].reward.exp` */
  path: string;
}

export type ValidationOutcome = ValidationOk | ValidationFail;

const typeNameOf = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * 校验 + 修正。
 *
 * ⚠️ 纯函数：不改入参，返回的是**新构造**的值。
 *    这一点很重要 —— 入参是刚 parse 出来的 JSON，改它没有任何好处，
 *    而"校验器会不会顺手改我的数据"是所有人都要重新读一遍源码才能确信的事。
 */
export const validateAgainst = (schema: JsonSchema, data: unknown): ValidationOutcome => {
  const corrections: string[] = [];
  const result = walk(schema, data, '$', corrections);
  if (!result.ok) return result;
  return { ok: true, value: result.value, corrections };
};

interface WalkOk {
  ok: true;
  value: unknown;
}

const fail = (message: string, path: string): ValidationFail => ({ ok: false, message, path });

const walk = (
  schema: JsonSchema,
  data: unknown,
  path: string,
  corrections: string[],
): WalkOk | ValidationFail => {
  // —— nullable：本项目大量使用 null 表示"没有"，它总是合法的 ——
  if (schema.nullable && data === null) return { ok: true, value: null };
  if (schema.type === 'null') {
    return data === null ? { ok: true, value: null } : fail(`期望 null，收到 ${typeNameOf(data)}`, path);
  }

  switch (schema.type) {
    case 'object': {
      if (!isPlainObject(data)) return fail(`期望对象，收到 ${typeNameOf(data)}`, path);
      const out: Record<string, unknown> = {};

      for (const key of schema.required ?? []) {
        if (data[key] === undefined) return fail(`缺少必填字段 ${key}`, `${path}.${key}`);
      }

      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (data[key] === undefined) continue; // 非必填且没给：不补默认值，让下游的 ?? 说话
        const r = walk(sub, data[key], `${path}.${key}`, corrections);
        if (!r.ok) return r;
        out[key] = r.value;
      }

      // 未声明的字段一律丢弃：它们既进不了类型，也进不了存档，
      // 留着只会在某一天被某个 spread 悄悄带上。
      for (const key of Object.keys(data)) {
        if (!(key in (schema.properties ?? {}))) {
          corrections.push(`丢弃未声明字段 ${path}.${key}`);
        }
      }

      return { ok: true, value: out };
    }

    case 'array': {
      if (!Array.isArray(data)) return fail(`期望数组，收到 ${typeNameOf(data)}`, path);
      const item = schema.items;
      if (!item) return { ok: true, value: [...data] };

      let items = data;
      if (schema.maxItems !== undefined && items.length > schema.maxItems) {
        corrections.push(`${path} 超出 ${schema.maxItems} 项，已截断（原 ${items.length} 项）`);
        items = items.slice(0, schema.maxItems);
      }
      if (schema.minItems !== undefined && items.length < schema.minItems) {
        return fail(`至少需要 ${schema.minItems} 项，收到 ${items.length} 项`, path);
      }

      const out: unknown[] = [];
      for (let i = 0; i < items.length; i++) {
        const r = walk(item, items[i], `${path}[${i}]`, corrections);
        if (!r.ok) return r;
        out.push(r.value);
      }
      return { ok: true, value: out };
    }

    case 'string': {
      if (typeof data !== 'string') return fail(`期望字符串，收到 ${typeNameOf(data)}`, path);
      let s = data.trim();
      if (s !== data) corrections.push(`${path} 首尾空白已去除`);
      if (schema.maxLength !== undefined && s.length > schema.maxLength) {
        corrections.push(`${path} 超出 ${schema.maxLength} 字，已截断`);
        s = s.slice(0, schema.maxLength);
      }
      if (schema.enum && !schema.enum.includes(s)) {
        return fail(`取值 ${s} 不在允许范围内（${schema.enum.join(' / ')}）`, path);
      }
      return { ok: true, value: s };
    }

    case 'number':
    case 'integer': {
      if (typeof data !== 'number' || !Number.isFinite(data)) {
        return fail(`期望数字，收到 ${typeNameOf(data)}`, path);
      }
      let n = data;
      if (schema.type === 'integer' && !Number.isInteger(n)) {
        n = Math.round(n);
        corrections.push(`${path} 已取整（${data} → ${n}）`);
      }
      if (schema.minimum !== undefined && n < schema.minimum) {
        corrections.push(`${path} 低于下限，已抬到 ${schema.minimum}（原 ${n}）`);
        n = schema.minimum;
      }
      if (schema.maximum !== undefined && n > schema.maximum) {
        corrections.push(`${path} 超过上限，已削到 ${schema.maximum}（原 ${n}）`);
        n = schema.maximum;
      }
      return { ok: true, value: n };
    }

    case 'boolean': {
      if (typeof data !== 'boolean') return fail(`期望布尔值，收到 ${typeNameOf(data)}`, path);
      return { ok: true, value: data };
    }

    default: {
      // 不认识的 type：拒绝而不是放行。放行会让一个拼错的 Schema
      // 变成一道永远不设防的门 —— 而这道门后面是存档。
      return fail(`未知的 Schema 类型 ${String((schema as JsonSchema).type)}`, path);
    }
  }
};

/**
 * 从 start 处（一个 `{`）开始，找到**第一个括号配平的位置**，把这一段切回来。
 * 字符串与转义都跳过 —— 花括号出现在 `"narrative": "…… { ……"` 里是合法的。
 *
 * 扫不到配平点（输出真的断在半句上）返回 null：那种情况救不了，
 * 也不该装作能救 —— 调用方会带着诚实的原因失败。
 */
const scanFirstValue = (text: string, start: number): string | null => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth++;
      continue;
    }
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
};

/**
 * 从模型回复里抠出 JSON。
 *
 * 现实里模型会干这几件事，都得接住：
 *   · 包一层 ```json ... ``` 围栏；
 *   · 前后各加一句"好的，以下是……"；
 *   · 在 JSON 之后又补一段。补的**不一定**是解释 —— 有时补的是另一半自己：
 *     2026-10-07 线上，审核官先写完一份**完整的** JSON（1976 字，内容全对，
 *     还把那一步从 5 小时压到了 2 小时），随后又补写了一截
 *     （`,"revisionInstructions":…}`，末尾多一个花括号）。旧策略两招：
 *     整体 parse 失败；"第一个 `{` 到最后一个 `}`"把补写的那一截也裹了进来，
 *     同样失败 —— 一次内容完全可用的审核就这样被打回本地替身。
 *
 * 所以策略是三步：
 *   ① 整体 parse —— 干净的那一种；
 *   ② 第一个 `{` 到最后一个 `}` —— 接住"前后包了话"的常见形态；
 *   ③ **第一个完整的 JSON 值**（括号平衡扫描）—— 接住"JSON 之后还有东西"
 *      的那一种：从第一个 `{` 扫到第一次配平为止，后面的全部不要。
 * 只做这三步 —— 再往下就是容错解析器（补括号、猜逗号），那属于把错误吞掉：
 * 一份 95% 正确的 JSON 被"修"成 70% 正确的东西，比诚实地失败更糟。
 *
 * 第 ③ 招接住的东西在 `recovered` 里说人话 —— 调用方（bus）会把它并进
 * corrections：这不是日志，是证据，"模型这次多写了"应该是个能被看见的事实。
 */
export const extractJson = (
  raw: string,
): { ok: true; value: unknown; recovered?: string } | { ok: false; message: string } => {
  const cleaned = raw
    .replace(/^﻿/, '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  const attempts: Array<{ text: string; recovered?: string }> = [{ text: cleaned }];
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) attempts.push({ text: cleaned.slice(first, last + 1) });
  const scanned = first === -1 ? null : scanFirstValue(cleaned, first);
  if (scanned !== null && !attempts.some((a) => a.text === scanned)) {
    attempts.push({
      text: scanned,
      recovered: '模型在第一个完整 JSON 之后又补写了一段内容，已只取前者（后面的部分被忽略）',
    });
  }

  let lastError = '未知错误';
  for (const candidate of attempts) {
    if (candidate.text.length === 0) continue;
    try {
      const value = JSON.parse(candidate.text);
      return candidate.recovered ? { ok: true, value, recovered: candidate.recovered } : { ok: true, value };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, message: `不是合法 JSON（${lastError}）` };
};
