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
 * 从模型回复里抠出 JSON。
 *
 * 现实里模型会干这几件事，都得接住：
 *   · 包一层 ```json ... ``` 围栏；
 *   · 前后各加一句"好的，以下是……"；
 *   · 极少数情况下在 JSON 之后又补一段解释。
 *
 * 策略是先尝试整体 parse，失败再从**第一个 `{` 到最后一个 `}`** 截一段重试。
 * 只做这两步 —— 再往下就是写一个容错解析器，那属于把错误吞掉。
 */
export const extractJson = (raw: string): { ok: true; value: unknown } | { ok: false; message: string } => {
  const cleaned = raw
    .replace(/^﻿/, '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  const attempts = [cleaned];
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) attempts.push(cleaned.slice(first, last + 1));

  let lastError = '未知错误';
  for (const candidate of attempts) {
    if (candidate.length === 0) continue;
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, message: `不是合法 JSON（${lastError}）` };
};
