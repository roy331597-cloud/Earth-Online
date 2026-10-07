// ============================================================================
// EarthOnline · Phase 2 收官 · 属性目录 (attributes.ts)
//
// 六维的展示层元数据。两条纪律：
//   · 顺序不在这里发明 —— 取 core.ts 的 ATTRIBUTE_KEYS，全项目只有一份顺序；
//   · 每条只给「标签 + 一句定位」。定位写的是这一维**在生活里长什么样**，
//     不是数值说明。面板上的小字要经得起看第二遍，所以宁可具体，不要漂亮。
// ============================================================================

import { ATTRIBUTE_KEYS } from '@/types';
import type { AttributeKey } from '@/types';

export interface AttributeMeta {
  key: AttributeKey;
  /** 中文标签：体魄 / 智识 / 心力 / 魅力 / 意志 / 财商 */
  label: string;
  /** 一句定位。写"它长什么样"，不写"它有什么用"。 */
  line: string;
}

export const ATTRIBUTE_META: Record<AttributeKey, AttributeMeta> = {
  vit: {
    key: 'vit',
    label: '体魄',
    line: '还能熬几个通宵、坐几个小时不塌 —— 这一维管的是硬件。',
  },
  int: {
    key: 'int',
    label: '智识',
    line: '啃得下多难的东西，以及看懂之后能讲多明白。',
  },
  foc: {
    key: 'foc',
    label: '心力',
    line: '把注意力摁回一件事上的能力；也是情绪不塌的能力。',
  },
  cha: {
    key: 'cha',
    label: '魅力',
    line: '你说的话，有多少人愿意听、并且听完。',
  },
  wil: {
    key: 'wil',
    label: '意志',
    line: '没人看着的时候，你还做不做。',
  },
  cap: {
    key: 'cap',
    label: '财商',
    line: '钱在你手里是活的还是死的，由这一维说了算。',
  },
};

/** 六维的展示顺序（= core 的顺序，不另起一套） */
export const ATTRIBUTE_ORDER: AttributeMeta[] = ATTRIBUTE_KEYS.map((k) => ATTRIBUTE_META[k]);

/** ['int','foc'] → '智识 · 心力'（TurnInSheet 的记账行与属性面板共用） */
export const attributeLabels = (keys: AttributeKey[]): string =>
  keys.map((k) => ATTRIBUTE_META[k].label).join(' · ');

/**
 * 横条的尺子上限。60 不是数值天花板，只是"一眼看出差距"的刻度 ——
 * 属性没有上限，尺子只是尺子。
 */
export const ATTRIBUTE_BAR_MAX = 60;

/** 尺子上的刻度线（30 / 40 / 50 —— 三个人们下意识会认的坎） */
export const ATTRIBUTE_BAR_TICKS = [30, 40, 50] as const;
