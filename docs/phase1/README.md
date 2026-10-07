# Phase 1 · 底层数据结构与多智能体 Prompt 架构

> 《地球OL / Earth Online》· 本阶段**不含任何 React / UI 代码**，只定义「数据契约」与「AI 契约」。
> 
> **当前版本：v1.5**（2026-10-06 修订，变更记录见文末）

---

## 0. 交付清单

```
docs/phase1/
  README.md              ← 本文件
  chapters-and-lore.md   ← 篇章文学设定（DAG 拓扑）+ 进化树五级阶梯

src/types/               ← 全局状态对象 EarthOnlineState 的 TypeScript 接口
  core.ts                  ID / 时间 / 金钱 / 属性 / 玩家 / 金库 / 职业 / 设置 / 事件
  quest.ts                 任务状态机 + 任务链（审核门控）+ 日常（玩家创建）
  journal.ts               成功日记
  milestones.ts            现实里程碑（签证/出国旅行/论文接收……）· 含快照（照片/链接）字段
  network.ts               社交关系图谱 (CRM)
  endgame.ts               Chapter DAG / 终极目标 / 至高隐藏目标（进化树）
  world.ts                 场景 / 空间锚点 / HUD
  agents.ts                智能体注册表 + AI 运行时 + 全部 Agent 输出契约
  state.ts                 EarthOnlineState 根对象 + 存档元数据 + 迁移
  index.ts                 统一出口

src/data/catalog/        ← 机器可读的静态设定（非 UI）
  chapters.ts               9 篇章 DAG 目录（支线 / 汇流点 / requires）
  classes.ts                职业头衔目录（4 个初始 Class）
  endgame.ts                5 大终极目标 + 进化树节点 + 里程碑标签词表
  milestones.ts             现实里程碑目录（签证 / 旅行 / 论文 / 第一块钱）
  policy.ts                 奖励区间 / 惩罚力度 / 跨天时刻 / 财富曲线（可调旋钮）
  scenes.ts                 首场景（光华楼）+ 空间锚点 + 时段分带

src/ai/
  schemas.ts               所有 Agent 输出的 JSON Schema（唯一权威）
  prompts/                 9 份提示词 + 运行时组装器 (index.ts)

src/md-raw.d.ts          `?raw` 导入声明（使类型层不依赖 vite/client）
.backup/2026-10-06-phase1-v1/    v1.1 修订前的备份
.backup/2026-10-06-phase1-v2/    v1.2 修订前的全量 src/ 与 docs/ 备份
.backup/2026-10-06-phase1-v3/    v1.3 修订前的全量 src/ 与 docs/ 备份（31 份）
.backup/2026-10-06-phase1-v4/    v1.4 修订前的全量 src/ 与 docs/ 备份（31 份）
.backup/2026-10-06-phase1-v5/    v1.5 修订前的全量 src/ 与 docs/ 备份（31 份）
```

---

## 1. 三条铁律（贯穿全项目的工程约定）

| #     | 约定                                         | 理由                                                                                                         |
| ----- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **1** | **数值由本地规则裁决，AI 只提供判定依据**                   | Arbiter 输出 `quality` 档位 + `bonusPct`；客户端先过资格审查（baseline → 0），再走 `alignBonusPct()` 按难度档位重新对齐。AI 幻觉无法破坏经济系统。 |
| **2** | **所有金额存整数美分 `UsdCents`**                   | LocalStorage 里浮点加减会累积误差，`0.1+0.2` 的账目玩家一定会发现。                                                              |
| **3** | **所有时间点存 ISO-8601 UTC 字符串，另存 `localDate`** | 日常跨天惩罚依赖「日期归属」，用 UTC 直接比较会在时区/凌晨边界出错。                                                                      |

---

## 2. 核心状态机：非日常任务流（审核门控 · 本次修订）

```
                ┌──────────── AI 生成（单任务或整条链） ────────────┐
                ▼                                                  │
   [draft]  ← 链式任务：**整条系列的全部任务一并列出**                │
       │        （含 Agent B 的参谋意见与建议执行顺序）               │
       │                                                           │
       │  玩家**逐条**审核 ─┬─ 通过 → 该任务 → [offered]            │
       │                     └─ 打回 → [rejected]（剔除出链）        │
       │  整条链都被打回 → 可要求重生成（仅一次）────────────────────┘
       ▼
   [offered] ──「领取」──> [claimed] ──「开始执行」──> [active]
   （前置未完成的任务可见，但不可领取）                  │
                                                 「点击完成」
                                                        ▼
                                              [turn_in_pending]   ← 结算面板
                                                 │            │
                                      留空 + 确认 │            │ 写复盘 + 确认
                                                 │            ▼
                                                 │     Arbiter 判定 quality（两步）
                                                 │     ↳ ① 是否加成（baseline → 0%）
                                                 │     ↳ ② 按难度区间对齐（难度 5 到 20%）
                                                 │     ↳ 写入 Success Journal
                                                 ▼            ▼
                                             [completed] ◄─────┘
                                                 │
                                                 ├─ 推进 Career EXP / Level
                                                 ├─ 推进 Chapter 进度（可能一次解锁多条支线）
                                                 ├─ 推进终极目标进度
                                                 └─ 静默喂给进化树（玩家不可见）

   终态旁支：[expired] [abandoned] [failed] [rejected]
```

**v1.2 修订说明**：取消"一次只露出下一个"的渐进可见性（旧 `chain.revealed` 门控），
改为**审核门控**——draft 阶段整条系列全部列出。

**v1.3 修订说明**：审核粒度细化为**逐条通过 / 打回**——玩家对每个任务单独裁决
（通过 → `[offered]`；打回 → `[rejected]`，剔除出链且**不阻塞**同链其它任务）。
只有"整条链都被打回"时，才有一次整链重生成的机会（`regenerationCount` 上限 1）。
领取时若存在未完成的前置任务，该任务**可见但不可领取**。

**另一种"任务达成"：现实里程碑（Reality Milestones）**
出国旅行、签证递交/获批、论文被接收这类**已经真实发生的事**，
不走上面的 Quest 状态机（它们没有"领取 → 执行"的过程）——
玩家在「记录一件事」面板自行声明，经冷却（该条目若设有）与月度 EXP 上限校验后直接发奖，
并点亮对应的终极目标里程碑（如 `gm_approved` 获批）。见 `types/milestones.ts`
与 `catalog/milestones.ts`。

---

## 3. 核心状态机：日常 (Dailies)（本次修订）

🔴 **红线：日常只能由玩家创建。** 系统与任何 AI 都不得自动创建、自动启用、自动修改日常。

```
   AI 推荐（DailyRecommendation）── 玩家裁决 ──┬─「采纳」（可先改标题/频率）→ 成为正式日常
                                              └─「忽略」→ 消失

次日 01:00 之后首次打开 App
        ▼
   runDailyRollover(state)
        ├─ 对每个未打钩的 Daily：扣 exp（= 该日常奖励 × 1.5），streak 归零
        ├─ 生成 RolloverResult 事件（UI 用正面措辞展示，不用羞愧文案）
        └─ 写入 dailyLogs[昨日]
```

- **结算时点：次日 01:00**（`settings.dayRolloverHour = 1`）。
  00:30 打钩仍算「昨天」；01:00 之后才触发跨天结算。
  0 点太苛刻（收尾的人会被误判），4 点等于默许熬夜到凌晨三点。
- 打钩 → 二次确认弹窗 → 直接发奖（**不进入结算面板**）。
- **惩罚范围严格限定**：只扣该条日常对应的 EXP。
  不牵连其它日常、**不扣金库**、不清除任何已有记录、不影响已获得的等级。
  连击归零，但 `bestStreak` 永久保留。
- **推荐的形态**：Class/Blueprint Agent 只产出 `recommendedDailies`（含一句推荐理由），
  进入玩家的待裁决队列；采纳后生成 `DailyDefinition`（`origin` 记为
  `ai_recommendation_adopted`），玩家可先改标题与频率——最终以玩家给的文本为准。

---

## 4. 复盘加成：两步判定（本次修订）

**第一步 · 是否加成**：档位 `baseline`（套话 / 复述任务 / 无具体信息）→ **0%，不加成**。
不是"少给"，是不给。空复盘（没写）在更上游即按 0 处理，不经过 Arbiter。

**第二步 · 加成多少**：通过资格线后，按难度档位在区间内浮动：

| 难度  | 区间           | 设计意图               |
| --- | ------------ | ------------------ |
| 1   | 6% ~ 9%      | 窄。5 分钟的小事不该靠一段文字套利 |
| 2   | 6% ~ 10%     |                    |
| 3   | 6% ~ 11%     |                    |
| 4   | 5% ~ 13%     |                    |
| 5   | **5% ~ 20%** | 宽。付出越大，反思的边际价值越高   |

**为什么高难任务的下限反而更低（5% 而非 6%）**：
下限低 + 上限高，区间才真正宽。宽区间奖励的是「更深的反思确实能拿到更多」，
而不是「接了难任务就保底」。

档位 → 区间内的取值映射（`policy.ts` 与 `40-arbiter.md` 必须保持一致）：

| quality      | 取值           |
| ------------ | ------------ |
| `baseline`   | **0**（未过资格线） |
| `solid`      | 区间下限         |
| `sharp`      | 区间 60% 处     |
| `revelatory` | 区间上限         |

客户端发奖前走 `alignBonusPct(rawPct, quality, difficulty)`：
先做资格审查（`qualifiesForBonus`：baseline → 0，AI 给什么数都不认），
再对通过者按档位对齐区间（若 AI 数值落在区间内且与档位预期差距 ≤1，尊重它的判断）。

---

## 5. AI 调用数据流

```
玩家输入想法
   │
   ▼
[Dispatcher_Agent]  ← 注入 shared-context + 现有 Class 列表
   │
   ├─ 归属已存在的 Class ────────────────┐
   ├─ 归属未知领域 → [Blueprint_Generator] 生成新 Class → 落库 → 递归回上一步
   └─ 信息不足 → 返回 1 个澄清问题（最多 1 个，禁止连环追问）
                                          │
                                          ▼
                              [Class_Specific_Agent] 生成 Quest 或 QuestChain
                                          │
                                 勾选深度推演？ ── 是 ──> [Chain_Reviewer] 审核/排序/剧透检查
                                          │                        │
                                          └────────── 否 ──────────┘
                                          ▼
                              落库为 [draft]：**整条系列列给玩家审核**
                                          │ 玩家**逐条**通过 / 打回
                                          ▼
                                    [offered] → 领取 → 执行

完成时写复盘 ──> [Arbiter_Agent] ──> quality（两步判定）+ bonusPct + journal 草稿 + milestoneTags（静默）

现实事件（签证/旅行/论文接收）──（不经 AI）──> 本地校验冷却与月度上限 → 发 EXP + 点亮目标里程碑

日常推荐 ──> 玩家裁决（采纳/忽略）──> 采纳后成为正式日常（AI 不能直接创建日常）

联系人策略请求 ──> [Network_Advisor_Agent]
```

**关键洞察：Arbiter 是隐藏目标的「被动传感器」。**
玩家永远不会主动「领取」点亮进化树。每次复盘，Arbiter 在后台从**固定词表**中抽取
`milestoneTags`（如 `paradigm`、`pipeline`），写入 `evolution.techMilestones`。
累积到阈值 → `EvolutionTreeState.revealed = true`，某个节点 `lit` 变真。
**玩家永远不会知道系统在数什么**，直到它亮起来。

---

## 6. 关键设计决策

1. **AI 只写草稿，本地写账本** — 所有 EXP / 美分变动只由本地 reducer 计算。
2. **`milestoneTags` 静默通道** — 隐藏目标的唯一数据来源，UI 层禁止读取（用 ESLint/约定隔离）。
3. **Chain = 一次性生成 + 玩家审核门控** — 整链列出、可剔除、可打回一次；
   省 token、可离线解锁，且审核权在玩家手里（不再做渐进可见性）。
4. **篇章是 DAG，不是线性关卡** — 从 Ch.1 分叉出学术/世界/资本/关系四条支线，
   Ch.4 / Ch.6 / Ch.7 层层汇回主线；玩家可以"先海外再论文""一边科研一边攒钱"。
   `ChapterProgressState` 因此持有多个 `activeChapterIds`。
5. **日常的创建权在玩家** — AI 只能推荐（`DailyRecommendation`），采纳前不产生任何效果。
6. **现实里程碑不经过 AI** — 已发生的事只记录、不生成；有冷却与月度 EXP 上限防刷。
7. **`turn_in_pending` 中间态** — 玩家点完「完成」刷新页面不会丢结算面板。
8. **`UsdCents` 整数 + `VaultTransaction` 追加账本** — 可审计、可回滚、可作图。
9. **A9 进度用归一化对数曲线** — 线性从 $1k 到 $100M 永远是 0.001%；裸对数（log10/8）
   建角当天就显示 **38%**，同样失真。最终形态：围绕建角刻度（¥8000 ≈ **$1,100** 启动注入）
   归一化 + **$10k 平滑常数** —— 建角当天 0%，$100M 到 100%。
   见 `catalog/policy.ts` 的 `WEALTH_CURVE` / `wealthProgressRatio`。
10. **`Difficulty` / `EffortEstimate` 定义在 core.ts** — 被奖励政策与 AI 契约共用，
    放核心层可避免 `types/` 内部循环导入。
11. **进化树的 tier 5 是「十年尺度」的** — 见下节。

---

## 7. 至高隐藏目标：进化树的两条曲线

设计上刻意区分了**两条不同的时间尺度**：

|     | 揭示（revealed）                                 | 点亮 tier 5 节点                     |
| --- | -------------------------------------------- | -------------------------------- |
| 尺度  | 持续产出 **1~2 年**                               | 可能耗掉一个人 **十年**                   |
| 触发  | 累计里程碑 15 条 / 已点亮节点 3 个 / 已触及分支 3 条 / 抵达 Ch.7 | 需要 `paradigm`、`adoption` 等高维标签累积 |
| 参照  | ——                                           | **AlphaFold 量级的方法**              |

> 如果一个节点能在三个月内点亮，那它就不该叫「点亮」。

对应地，Arbiter 被明确要求：**不要因为任务听起来厉害就打高维标签**。
误打一个 `paradigm`，等于让一个本该十年后才亮的节点虚亮——那比不亮更糟。

标签词表（`catalog/endgame.ts` 的 `MILESTONE_TAG_VOCABULARY`，共 46 个）是**封闭**的：
AI 只能选，不能自创。节点约束：`requiredTagCount ≤ tagFilter 能匹配到的标签数`，
否则该节点永远无法点亮（已在 catalog 注释中标注）。

---

## 8. Review 清单

### 已按 PO 反馈定稿 ✅

- **R3 头衔措辞** — 保持原样（湿实验学徒 → 数据炼金术士 → 模型编织者 → 首席研究员 → 学派创建者）。
- **R4 复盘加成** — 两步判定：先判"是否加成"（baseline → 0%），再按难度浮动；
  难度 5 最高到 **20%**。见第 4 节。
- **R5 日常惩罚** — 力度保持（漏一天补一天半）；范围限定为「仅该日未打钩的日常本身」；
  结算时点为**次日 01:00**。见第 3 节。
- **R6 进化树分支** — 6 分支保留，成就维度整体拉高（tier 5 = AlphaFold 量级）。见第 7 节。
- **R10 篇章 DAG** — 篇章改为"一个起点 → 多条支线并行 → 汇回主线"的有向无环图；
  可先海外再论文、可一边科研一边积累财富、「同频者」全程并行。见 `catalog/chapters.ts`。
- **R11 现实里程碑** — 出国旅行 / 签证办理等真实世界事件算作特殊任务达成，
  记录即得 EXP（小额），并点亮对应终极目标里程碑。见 `catalog/milestones.ts`。
- **R12 任务审核流** — draft 后整条系列全部列出，玩家审核通过才进入
  `[offered] → [claimed] → [active]`；打回重生成上限一次。见第 2 节。
- **R13 日常创建权** — 日常由玩家设置；AI 只能推荐，采纳与否由玩家裁定。见第 3 节。
- **R14 命名权** — 保留（每完成一个篇章，玩家为下一章命名）。
- **R1 进度曲线** — 按现值定稿（A9 用 log、身份/Lab 用 sqrt、关系用 linear）。
- **R7 里程碑重叠** — 不去重：一笔记录可以同时点亮多个目标的里程碑
  （如"第一笔自己赚的钱"同时计入 A9 与地理无关工作），这是设计意图。
- **R8 离线模式** — 不做完整的离线 / 无 API Key 降级设计；
  保留现有 `MOCK_FALLBACK` 最小兜底（开发与故障期用），不扩充本地模板库。
- **R9 分支阈值** — 保留「触及 3 个分支」作为揭示条件之一，不放宽为 2。
- **R15 Ch.4 汇流条件** — **只要其一**：`requires` 之外新增 `requiresOneOf`，
  Ch.4 由「Ch.2 与 Ch.3 都完成」改为「Ch.2 / Ch.3 任一完成即进入」。
  世界支线从此不构成任何篇章的硬前置——它由目标驱动，而非门锁。
- **R16 里程碑参数** — 按现值定稿；「一段海外旅行」**取消 90 天冷却**
  （可重复、不限间隔；防刷由月度上限 1200 EXP 兜底）。
- **R17 审核粒度** — **逐条通过**：每个任务单独 resolve（approve / reject）；
  仅当整条链都被打回时，可整链重生成一次（`regenerationCount` 上限 1）。

### 仍待确认 ⏳

当前清单已清零（R2 由 DAG 解决，R1 / R7 / R8 / R9 / R15 / R16 / R17 均已裁定）。
下一批问题会在进入 Phase 2 前统一整理。

---

## 9. 变更记录

### v1.5 · 2026-10-06

PO 两项命名裁定。术语级修订，无逻辑变更。

**「圣遗物」→「快照」**（PO 裁定：原词浮夸；英文标识同步更名）

| 文件                        | 变更                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/milestones.ts` | `MilestoneArtifact` → `MilestoneSnapshot`；`RealityMilestoneRecord.artifacts` → `snapshots`；注释改用「快照」，并注明与 Vault「净资产快照」的区别（数值口径 vs 照片） |
| `src/types/state.ts`      | `RecordRealityMilestone` 输入 `artifacts` → `snapshots`；`AttachMilestoneArtifact` → `AttachMilestoneSnapshot`                                 |

**influencer 线的 creator 统一译为「内容创作者」**（弃用「手艺人」）

| 文件                                      | 变更                                                        |
| --------------------------------------- | --------------------------------------------------------- |
| `src/data/catalog/classes.ts`           | influencer 的 `agentDisplayName`：'表达 · 内容手艺人' → '表达 · 内容创作者' |
| `src/ai/prompts/22-class-influencer.md` | 角色开篇：「做了很多年内容的手艺人」→「做了很多年的内容创作者」                          |

**文档同步**：本 README（标题版本 / §0 清单 / v1.4 条目术语 / 文末备忘引用）与
`docs/phase1/chapters-and-lore.md` §四 同步更新。

### v1.4 · 2026-10-06

按 PO 四条优化建议落实。前两条产生契约变更，第三条记入文末「给 Phase 2 / 3 的备忘」
（本阶段不写 UI 代码），第四条修正财富曲线。

**快照（Snapshot）：给现实里程碑配一件实物证据**

| 文件                        | 变更                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/types/milestones.ts` | 新增 `MilestoneSnapshot`（photo / link + caption + addedAt，含客户端压缩存储约定）；`RealityMilestoneRecord` 增加 `snapshots` |
| `src/types/state.ts`      | `RecordRealityMilestone` 输入增加 `snapshots`；新增 `AttachMilestoneSnapshot` 契约（事后补照片）                         |

**A9 财富曲线：归一化对数 + 建角注入（修正裸对数）**

| 文件                           | 变更                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/data/catalog/policy.ts` | 新增 §3 财富曲线：`INITIAL_VAULT_USD_CENTS`（¥8000 ≈ $1,100）、`WEALTH_CURVE`（start / target / $10k 平滑常数）、纯函数 `wealthProgressRatio()` |
| `src/types/core.ts`          | Vault 的 A9 进度说明重写：废除裸对数 `log10/8` 写法（建角即 38%），改引 policy.ts 的归一化实现                                                           |

**Ch.5 准入：基线快照语义明确（PO 确认无代码变更）**

| 文件                             | 变更                                                         |
| ------------------------------ | ---------------------------------------------------------- |
| `src/data/catalog/chapters.ts` | Ch.5 离开条件措辞明确：基线 = 进入本章时的净资产快照——Ch.1 起赚到的钱已计入快照，"再跃升一个数量级" |

### v1.3 · 2026-10-06

按 PO 对 Review 清单七项裁定的落实。其中 R15 / R16 / R17 产生代码变更，
R1 / R7 / R8 / R9 为定稿登记（无代码变更）。

**Ch.4 汇流条件：二选一（R15）**

| 文件                             | 变更                                                                       |
| ------------------------------ | ------------------------------------------------------------------------ |
| `src/types/endgame.ts`         | `ChapterDefinition` 新增 `requiresOneOf`（**至少其一**完成；与 `requires` 为 AND 关系） |
| `src/data/catalog/chapters.ts` | Ch.4 改为「Ch.2 / Ch.3 任一完成即可进入」；其余篇章补空数组；`isChapterUnlocked` 支持二选一         |

**任务审核：逐条通过（R17）**

| 文件                                    | 变更                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/quest.ts`                  | `ChainApproval` → `ChainReview`（链级只保留 playerNote / regenerationCount / reviewedAt，整体状态改为派生）；`QuestStatus` 新增 `rejected`；`QuestChain.approval` → `review` |
| `src/types/state.ts`                  | `ApproveQuestDraft` + `ReviewQuestChain` → `ReviewQuestDraft`（逐条 approve / reject）+ `RegenerateQuestChain`（整链全打回时一次）                                     |
| `src/types/core.ts`                   | 事件类型新增 `quest.reviewed`                                                                                                                                  |
| `src/ai/prompts/00-shared-context.md` | 链审核描述改为"逐条通过或打回"                                                                                                                                         |
| `src/ai/prompts/50-chain-reviewer.md` | 同上；整条链都被打回时可要求重生成一次                                                                                                                                      |

**现实里程碑：一段海外旅行取消 90 天冷却（R16）**

| 文件                               | 变更                                                             |
| -------------------------------- | -------------------------------------------------------------- |
| `src/data/catalog/milestones.ts` | `rm_overseas_trip` 的 `cooldownDays` 90 → null（防刷由月度上限 1200 兜底） |
| `src/types/milestones.ts`        | `cooldownDays` 注释更新（可重复条目不设冷却时同样为 null）                        |

### v1.2 · 2026-10-06

**篇章 DAG（可跳关、可并行）**

| 文件                             | 变更                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/types/endgame.ts`         | `ChapterDefinition` 增加 `branch` / `requires` / `isConvergence`，移除 `parallelizable`；`ChapterProgressState.currentChapterId` → `activeChapterIds` + `focusedChapterId`                 |
| `src/data/catalog/chapters.ts` | 重写为 DAG：Ch.1 →{Ch.2 学术、Ch.3 世界、Ch.5 资本、Ch.8 关系}→ Ch.4 汇流 → Ch.6 汇流 → Ch.7 → Ch.9；新增 `isChapterUnlocked` / `getActiveChapters` / `CHAPTER_BRANCH_LABELS`；修正 Ch.7 标题与 lore 统一为「白墙与服务器」 |

**现实里程碑（签证/旅行等特殊任务达成）**

| 文件                               | 变更                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `src/types/milestones.ts`        | **新增**：`RealityMilestoneDefinition` / `RealityMilestoneRecord` / `MilestonesState` |
| `src/data/catalog/milestones.ts` | **新增**：16 条现实里程碑（移动 8 / 学术 5 / 资本 3），含 EXP 额度、冷却、目标里程碑挂接                           |
| `src/types/index.ts`             | 统一出口增加 `export * from './milestones'`                                              |
| `src/types/state.ts`             | `EarthOnlineState` 增加 `milestones`；新增 `RecordRealityMilestone` 契约                  |

**任务审核门控（取代 revealed 渐进可见）**

| 文件                                    | 变更                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/quest.ts`                  | 移除 `ChainMembership.revealed`；`QuestChain.revealedUpTo` → `approval: ChainApproval`（pending_review / approved / rejected + 剔除列表 + 重生成计数） |
| `src/types/state.ts`                  | 移除 `AdvanceChain`；新增 `ApproveQuestDraft` / `ReviewQuestChain`；`ClaimQuest` 契约更新（offered → claimed，前置未完成不可领）                              |
| `src/types/agents.ts`                 | `ChainReviewOutput.spoilerCheck` 语义改为"降压版剧透"（整链可见，但后置任务不得写破前序结论）                                                                         |
| `src/ai/prompts/50-chain-reviewer.md` | 重写角色定位（玩家是最终裁决者）与第 3 项检查                                                                                                                 |
| `src/ai/prompts/00-shared-context.md` | 新增"任务链整条列出审核"的生成约束                                                                                                                       |

**日常由玩家创建（AI 只能推荐）**

| 文件                                               | 变更                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `src/types/quest.ts`                             | `DailyDefinition` 增加 `origin` / `adoptedFromRecommendationId`；新增 `DailyRecommendation`；`DailyState` 增加 `recommendations` |
| `src/types/state.ts`                             | 新增 `ResolveDailyRecommendation` 契约（adopt / dismiss）                                                                      |
| `src/types/agents.ts`                            | `BlueprintOutput.suggestedDailies` → `recommendedDailies`（新增 `rationale`）                                                |
| `src/data/catalog/classes.ts`                    | 四条职业线 `suggestedDailies` → `recommendedDailies`，各补一句推荐理由                                                                 |
| `src/ai/schemas.ts`                              | `blueprintOutput` 同步改名与字段                                                                                                |
| `src/ai/prompts/24-class-blueprint-generator.md` | 第五步与输出契约同步改名，明确"推荐≠创建"                                                                                                   |
| `src/ai/prompts/00-shared-context.md`            | 红线新增第 7 条：不得替玩家设定日常                                                                                                      |

**加成两步判定（难度 5 上限 20%）**

| 文件                             | 变更                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/catalog/policy.ts`   | `bonusForQuality`：baseline → **0**、solid → 区间下限；新增 `qualifiesForBonus`；`alignBonusPct` 先过资格审查；`RewardPolicy` 新增 `realityMilestoneMonthlyExpCap`       |
| `src/types/core.ts`            | `RewardPolicy` 注释更新（两步判定、难度 5 到 20%）；事件类型：`chain.advanced` → `chain.reviewed`，新增 `milestone.recorded` / `daily.recommendation_*` / `chapter.unlocked` |
| `src/types/journal.ts`         | `ReflectionQuality.baseline` 语义与 `bonusPct` 注释更新                                                                                                      |
| `src/ai/schemas.ts`            | Arbiter `bonusPct` 上下界 5~15 → **0~20**；`MOCK_FALLBACK` 注释更新（baseline = 0）                                                                             |
| `src/ai/prompts/40-arbiter.md` | 重写为两步判定；映射表 baseline → 0；区间说明改为难度 5 → 5%~20%                                                                                                          |
| `src/types/agents.ts`          | `ArbiterInput.policy` 注释更新；`PromptContextDigest.chapter` 增加 `parallelChapterTitles`                                                                   |
| `src/ai/prompts/index.ts`      | 上下文摘要渲染并行支线                                                                                                                                           |

### v1.1 · 2026-10-06

**篇幅线重构（按 PO 提供的人生路径）**

| 文件                                    | 变更                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `docs/phase1/chapters-and-lore.md`    | 重写：7 章 → 9 章（3 幕）；新增「课表之外」「候鸟的第一段航程」「把问题磨成针」；进化树五级阶梯重写                                            |
| `src/data/catalog/chapters.ts`        | 重写：9 篇章 + `CHAPTER_ACTS` 幕分组                                                                      |
| `src/data/catalog/endgame.ts`         | 重写：进化树 18 → 22 节点，维度整体拉高（tier 5 = AlphaFold 量级）；标签词表扩充至 46 个；揭示阈值调整；目标里程碑补充（海外经历、第一篇署名论文、第一笔副业收入） |
| `src/ai/prompts/00-shared-context.md` | 当前篇章改为 Ch.1「课表之外」，并补全主线路径                                                                         |
| `src/types/endgame.ts`                | `EvolutionTier` 五级语义注释重写；`requiredTagCount` 增加可达性约束说明                                             |
| `src/data/catalog/classes.ts`         | 投资线种子任务「痛苦审计」改为兼容"尚无交易记录"的玩家（校园起点前提）                                                              |

**奖励与惩罚调整**

| 文件                             | 变更                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/core.ts`            | `RewardPolicy` 由固定 min/max 改为 `reflectionBonusBands`（按难度分档）；新增 `reflectionWordCountFloor`；`dayRolloverHour` 默认 4 → **1**；新增 `Difficulty` / `EffortEstimate`（上移至核心层） |
| `src/data/catalog/policy.ts`   | **新增**：`REFLECTION_BONUS_BANDS`、`bonusForQuality`、`alignBonusPct`、`DEFAULT_REWARD_POLICY`、`DEFAULT_APP_SETTINGS`                                                    |
| `src/types/quest.ts`           | `Difficulty` / `EffortEstimate` 改为从 core 导入并重新导出；日常惩罚范围注释明确化                                                                                                        |
| `src/types/journal.ts`         | `bonusPct` 注释改为「按难度档位对齐」                                                                                                                                            |
| `src/types/state.ts`           | `RunDailyRollover` / `CompleteQuest` 契约注释更新                                                                                                                         |
| `src/ai/schemas.ts`            | Arbiter `bonusPct` 的 schema 上下界 6~10 → 5~15（产品最宽区间）；`MOCK_FALLBACK` 不再写死加成数值                                                                                        |
| `src/ai/prompts/40-arbiter.md` | 加成映射改为**区间相对**（不背固定数字）；新增高维标签的稀缺性约束；示例补充数值推导说明                                                                                                                      |

**其它**

- 修复 `src/types/agents.ts` 中 `Difficulty` / `EffortEstimate` 从 `./core` 导入的悬空引用（v1.0 的缺陷）。
- 品牌化 ID 改为可选品牌（`__id?: Tag`），catalog 中不再需要 `as` 断言。
- 备份：`.backup/2026-10-06-phase1-v1/`（12 个文件，修改前原样）。

---

## 附：给 Phase 2 / 3 的备忘（本阶段不实现，先记下）

1. **串行 Agent 链的 AVG 式加载动画**：勾选「深度推演」时，一条任务链要串行调用
   2~3 次（Dispatcher → 生成 → Chain Reviewer），实测等待 **15~30 秒**。
   前端必须把它包装成**沉浸式过场**，而不是骨架屏——屏幕暗下、金色光标逐字打印
   （如「Architect Agent 正在推演可能的分支……」），用情绪价值覆盖 API 延迟。
   运行时数据已在 `EphemeralUiState.pendingAgentCalls` 预留。
2. **照片的存储策略**：LocalStorage 约 5MB 上限，照片必须在客户端压缩后
   再入库（长边 ≤ 1280、JPEG q≈0.72、单张 ≤ 300KB，见 `MilestoneSnapshot` 注释）；
   存档体积接近上限时提示导出（`SaveFile` 会随之变大）。放不下的素材用 `kind: 'link'`。
3. **「相对进入时基线」类判据**（如 Ch.5 的 10 倍台阶）：Phase 3 实现 selector 时，
   需要把"进入本章时的净资产快照"写进 `ChapterProgress`（字段形态到那时再定）。
   若不想要快照机制，备选口径是"固定绝对阶梯"（如首次跨越 $10k / $100k / $1M
   各算一级台阶）——两条路都通向同一个叙事，等实现时再裁定。
