// ============================================================================
// 纯函数行为校验（不是"能编译"，而是"算得对"）
//
//   node scripts/verify-ops.mjs        （或 npm run verify:ops）
//
// 走 Vite 的 SSR 管线加载 TS 源码，因此 @/ 别名与 ?raw 导入都能正常解析，
// 不需要另配一套测试工具链。
//
// 覆盖：
//   ① 日常打钩  ② 任务流转  ③ 结算判定  ④ 样式类静态扫描  ⑤ 接单闭环
//   ⑥ 逐条审核  ⑦ 日记      ⑧ 升级发点  ⑨ 预览 = 实发
//   ⑩ 金库流水  ⑪ 职业经验  ⑫ 联系人状态 ⑬ 场景锚点
//   ⑭ 持久化    ⑮ 跨天结算  ⑯ 进化树迷雾
//   ⑰ 每周结算  ⑱ 属性加点  ⑲ 四联状态机
//   ⑳ 篇章 DAG  ㉑ 里程碑封顶 ㉒ 状态机补齐 ㉓ 存档往返
//   ㉔ 导航角标（合并计数）  ㉕ 异步外壳（两条轨道端到端）
//   ㉖ 手动添加联系人（观测值必须缺席）
//   ㉗ 自己写一件事（目录之外的那条通路）
//   ㉘ 成就引擎（命名、补发、只增不减、雾里不点名）
//   ㉙ 进化树引擎（点亮、回填、掀雾、统计）
//   ㉚ 终局目标引擎（点亮、重算、圣殿视图）
//   ㉛ 出厂封装（PWA 清单 / iOS meta / Docker / nginx / compose / README / 裸机配置）
//   ㉜ 出厂清场（空档：结构完整 / 引用隔离 / 全空清单 / 漏斗空转两遍）
//
// ①–⑨ 验的是**写**（状态怎么流转）；⑩–⑬ 验的是**读**（selector 从状态里读出什么）。
// 读错了不抛异常，只会安静地显示一个错的东西 —— 所以更值得钉住。
//
// ⑭–⑯ 是收官三件套，各钉住一条"错了也不会报错"的约定：
//   ⑭ 存档必须是纯 JSON —— Map / Set / Date 全都能通过 JSON.stringify **而不报错**，
//      它们只是各自变成一个 {}，等到水合时才发作；
//   ⑮ 跨天结算扣谁的分 —— 扣错了只是数字不对，不会有异常；
//   ⑯ 进化树的迷雾 —— 少写一行判断，整个隐藏目标就在开屏第一秒剧透完了。
// 这三条的共同点：它们都不会崩，只会安静地错。所以它们只能被断言钉住。
//
// ⑰–⑲ 是 Phase 2 收官批，同一个家族：周一 01:00 的周结算（早一分钟都不能翻牌）、
// 属性点的唯一出口（任务只记账）、悬赏四联的三桶互斥 —— 同样，错了不会崩，只会安静地错。
//
// ⑳–㉓ 是 Phase 3 批，钉的是**这一阶段新长出来的四条"沉默的权利"**：
//   ⑳ 篇章引擎 —— 离章是自动判定，"一次只通关一章"这条规则如果没生效，
//      多出来的那几章会在无人看见的地方翻页，玩家永远不会知道少看了一场仪式；
//   ㉑ 里程碑 —— 冷却与月度封顶都是"拦下来"的逻辑。拦错了（拦太狠或拦不住）
//      不会报错，只会让玩家觉得"点了没反应"或者"这游戏能刷"；
//   ㉒ 重抽 / 换做法 —— 额度是终身 1 次 vs 链级 2 次，都是**只减不增**的账。
//      算错一次，玩家就永久少一次机会，而没有任何地方会提醒他；
//   ㉓ 存档往返 —— 导出再导入必须逐字节相同。少一个字段不会崩，
//      它会在三天后变成一句"我的存档怎么少了一章"。
//
// ㉔ 是 PO 裁定批：Dock 上「日常」那一格算的是**今日未打钩 + 本周未打钩**之和。
//    合并计数错了不会崩 —— 它只会让手机端周一早上少显示一个数字，
//    而玩家永远不会知道自己漏看了什么。这类"少一个提示"的 bug 只能被断言钉住。
//
// ㉕ 是 Phase 4 的接线批，也是本脚本里唯一**跑异步**的一节：它不验"某个函数算得对"，
//    而是把整个外壳（thunk → bus → gateway → 适配器 → 纯函数落库）在
//    Mock 与 Live 两条轨道上各跑一遍。管线全是注入的 —— 一个可变的状态格子、
//    一个会记账的假 fetch、一个假时钟。两条轨道共用同一段适配器与同一套闸门，
//    于是"一个只在配了密钥的机器上才执行的防线，等于没有防线"这句话在这里有了证据。
//    它抓到过的真问题（都不是崩溃，而是**安静的谎**）：
//      · 一步的"链"被当可用落库，`source` 还标着 api；
//      · 同一次操作里的第二次失败拿开局快照重算，把刚记下的熔断计数覆盖掉；
//      · 一次点击弹两条一字不差的提示条。
//    这一批的共同点同上：错了不会崩，只会安静地错 —— 所以只能被断言钉住。
//
// ㉖ 是"手动添加一个人"那一小片。它钉的东西只有一句：**加进来的人身上没有什么是编的。**
//    全项目只有这一个入口能凭空造出一个 Contact，所以也只有它能把
//    "我们替玩家填了一个他不认识的人"塞进档案 —— 而那种错看起来跟真的一样：
//    卡片上多一个字母、名单上多一条行程，玩家会以为那是自己记过的。
//    所以本节一半的断言在问同一个问题：**这个字段还是空的吗。**
//
// ㉗ 是"自己写一件事"。在此之前，记录一件事的每一步都由 `REALITY_MILESTONES`
//    里那一行数据驱动 —— EXP 阶梯、点灯名单、冷却、计数器。现在多了一种
//    **没有定义**的记录，于是所有"按 counters 遍历""按 grantsGoalMilestoneIds 点灯"
//    的代码都会遇见它。这类错不会崩：它只会安静地把 `undefined` 当成一条正常的定义，
//    然后少发一点、多发一点，或者替玩家编出一个标题。
//
// ㉘ 是 Phase 5 的成就引擎。成就这一类东西坏起来特别安静 ——
//    它不像任务那样有状态机兜着，也不像金库那样有账可对：**一枚没亮的徽记
//    不会报错，一枚错亮的徽记也不会**。所以这一节只钉四件事：
//      ① 判据的**边界**（"早八之前"含不含 08:00 那一刻、"能撑几个月"量的是
//         全部身家还是手头现金）—— 差一格就是另一个意思，而两种写法都能跑；
//      ② **只增不减** —— 条件后来退回去（净值跌了、关系被改回「认识」）时，
//         徽记不许跟着退。漏了这一条，症状是"我的徽记怎么少了一枚"，无从复现；
//      ③ **补发** —— 老档第一次加载要把已经做到的事补齐，少补了没有任何提示；
//      ④ **雾** —— 维度 F 那三条在树显形之前一枚都不许亮，而且陈列馆发出去的
//         那份 slot 里**连名字都不能有**。漏一行判断，至高隐藏目标就在
//         陈列馆第一屏上剧透完了（与 ⑯ 的进化树迷雾是同一件事的两端）。
//
// ㉙ 是同一件事的另一半。⑯ 管的是"雾没散时一个字都不许漏"，㉙ 管的是
//    **雾后面那台机器算得对不对**：什么时候点亮一颗星、那条记录最后算谁的、
//    四条揭示条件各自怎么算、雾散那一刻统计长什么样。这些错了都不会崩 ——
//    少亮一颗星，玩家只会觉得"我明明做到了"；雾晚散一次点击，
//    那一刻的因果看起来就莫名其妙，而没有任何地方会报错。
//    它还钉了一条**次序**（终局 → 篇章 → 进化树 → 成就），因为次序反了不会崩，
//    只会让"雾散"与"两枚至高徽记上墙"分成两次点击。
//
// ㉚ 是 Phase 5 模块三的终局目标引擎 —— 很远的地方那本账：五大终极目标下
//    每一格什么时候点亮、一条目标什么时候算走完、圣殿抬头那份"全通关综合
//    进度"怎么算。它的错法与成就同族而更闷：格子多亮一格，玩家只觉得
//    "这也算？"；少亮一格，是"我明明做到了"；综合进度算错时它看起来仍然
//    是一个百分比 —— 只是永远到不了 100。本节还钉两件事：**判据表与目录
//    不许各说各话**（键必须指向真里程碑、A9 五档的金额与文案是同一个数），
//    以及**藏着的格在视图层就不给名字**（忘了判 null，圣殿第一屏就把
//    "原来这一步也算"剧透完了）。
//
// ㉛ 是出厂封装。这一节是脚本里唯一一节**不跑代码**的校验：读的是文件本身 ——
//    manifest 里的每一条图标路径、index.html 里每一行 iOS meta、Dockerfile 的
//    两个阶段、nginx.conf 的三档缓存与安全头。这些东西错了都不会崩，
//    只会安静地少一点什么：图标少一档，安卓上"安装"就退化成"书签"；
//    viewport-fit=cover 掉了，灵动岛那一条会盖住 HUD；
//    顺手添一条 Permissions-Policy: geolocation=()，世界页的定位就静默失效。
//    它们全都要等"真的装到手机主屏幕上"才暴露 —— 所以在离开这台机器之前先钉住。
//
//    发布之后又补了两件：README（仓库的门面 —— 说清这是什么、怎么跑、怎么部署）
//    与「没有 Docker」的裸机配置 deploy/nginx-bare.conf。后者与容器版 nginx.conf
//    是同一套策略的两个落点，所以这一节还钉了一条**防漂移**：两份配置的安全头
//    与缓存三档必须逐条同款 —— 只改一份，闸门会响。
//
// ㉜ 是出厂清场：PO 裁定"开发期为验收造的那批测试内容全部清空"。
//    清的姿势是分家 —— mockState 继续当夹具（本脚本近千条断言长在上面），
//    玩家的初始档换上 `newGameState.ts` 的空档。这一节钉住那份空档的四件事：
//    结构完整（"空白"是每层容器都在场、只是没有数）、引用隔离（目录模板必须
//    深拷贝，两次建档互不共享）、全空清单（PO 点名的每日 / 金钱 / 社交逐项归零）、
//    以及**漏斗空转两遍**（第一遍只许派生 Ch.1 的条件行，第二遍原引用返回）。
//    这类错全都不会崩：多留一条 daily，玩家会以为是自己建的；少拷一层目录，
//    点亮的格子会反向污染模板；凭空点亮一格，是最难查的那种"我没做过啊"。
//
// 还有一条只有这条脚本能钉住的东西：**纯函数的拒绝路径必须原对象返回**。
// 全项目所有 operation 都遵守这条自律（见 operations.ts），而它一旦破掉，
// 症状是"点一下没反应但存档被写了一次"—— 没有任何单点能看出来。
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

let failed = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : `\n     期望 ${JSON.stringify(expected)}\n     实际 ${JSON.stringify(actual)}`}`);
};
const truthy = (label, v) => check(label, Boolean(v), true);

try {
  const { createMockState } = await server.ssrLoadModule('/src/store/mockState.ts');
  const {
    checkDaily, startQuest, openTurnIn, completeQuest, claimQuest, reviewQuestDraft, generateQuestChain,
    successorOf,
  } = await server.ssrLoadModule('/src/store/operations.ts');
  const { mockArbiter, toTurnInInput } = await server.ssrLoadModule('/src/lib/mockArbiter.ts');
  const { localDateKey } = await server.ssrLoadModule('/src/lib/format.ts');
  // ⚠️ `networkSummary` 不在这里取 —— 它在 ⑫ 关系图谱那一段已单独解构过，
  //    同块内重复声明是语法错误。㉔ 用那边那一份即可（同一份模块实例）。
  const {
    inProgressQuests, claimableQuests, draftQuests,
    navBadges, pendingDailies, pendingWeeklies, questsByStatus,
  } = await server.ssrLoadModule('/src/lib/selectors.ts');

  const now = new Date();
  const today = localDateKey(now);

  // -------------------------------------------------------------------------
  console.log('\n【① 日常打钩】');
  // -------------------------------------------------------------------------
  let s = createMockState();
  const before = structuredClone(s);
  const target = 'd_paper_figure'; // mock 里今天唯一还没打钩的那条（streak 6）

  const s1 = checkDaily(s, target, now);
  truthy('返回了新状态（不是原对象）', s1 !== s);
  check('打钩后该条进入今日 checkedIds', s1.dailies.logs[today]?.checkedIds.includes(target), true);

  const def = s1.dailies.definitions.find((d) => d.id === target);
  check('连击 6 → 7', def?.streak, 7);
  check('bestStreak 未被降低', def?.bestStreak, 12);

  // 连击 6 → 加成 12% → 80 × 1.12 = 89.6 → 90
  const logBefore = before.dailies.logs[today]?.expEarned ?? 0;
  const logAfter = s1.dailies.logs[today]?.expEarned ?? 0;
  check('当日 EXP 增加 90（含 12% 连击加成）', logAfter - logBefore, 90);

  const track = s1.careers.tracks.find((t) => t.classId === 'computational_biology');
  const trackBefore = before.careers.tracks.find((t) => t.classId === 'computational_biology');
  check('归属职业线也拿到这 90 EXP', track.exp - trackBefore.exp, 90);

  const s2 = checkDaily(s1, target, now);
  check('重复打钩幂等（返回原对象）', s2 === s1, true);
  check('重复打钩不改连击', s2.dailies.definitions.find((d) => d.id === target)?.streak, 7);

  // 时空胶囊：原状态必须没被就地改动
  check('入参未被就地修改', s.dailies.definitions.find((d) => d.id === target)?.streak, 6);

  // -------------------------------------------------------------------------
  console.log('\n【② + ③ 任务流转与结算】');
  // -------------------------------------------------------------------------
  const runFlow = (reflection) => {
    let st = createMockState();
    const id = 'q_inv_pain_audit'; // claimed · 难度 3 · 基础 300 EXP · 无前置

    st = startQuest(st, id, now);
    check('[痛苦审计] claimed → active', st.quests.byId[id].status, 'active');

    st = openTurnIn(st, id, now);
    check('[痛苦审计] active → turn_in_pending', st.quests.byId[id].status, 'turn_in_pending');
    truthy('turnInOpenedAt 已落定', st.quests.byId[id].turnInOpenedAt);

    const input = reflection
      ? toTurnInInput(mockArbiter({ reflection, questTitle: '痛苦审计', difficulty: 3, floorChars: 30 }), reflection)
      : { reflection: '', bonusPct: 0, bonusReason: null, verdict: null };

    st = completeQuest(st, id, input, now);
    return st;
  };

  // —— 有复盘，且命中里程碑关键词（「亏」→ failure_mode）——
  const withText = runFlow(
    '我复盘了去年那三笔亏损，发现它们不是选错了标的，而是都发生在同一周里 —— 那一周我在赶一个截止日期，每天只睡五小时。更具体地说，我把「不想再想了」误当成「想清楚了」，两个感觉长得很像，但一个是疲劳一个是结论。下次我打算先睡一觉，第二天再看同一件事还成不成立。',
  );
  const q1 = withText.quests.byId['q_inv_pain_audit'];
  check('状态 → completed', q1.status, 'completed');
  check('加成对齐到 9%（难度 3 · 区间 6~11 的 60% 处）', q1.grant.bonusPct, 9);
  check('结算 EXP = 300 × 1.09 = 327', q1.grant.final.exp, 327);
  truthy('写复盘 → 生成日记条目 id', q1.journalEntryId);
  check('成功日记新增 1 条', withText.journal.entries.length, 2);
  check('日记条目内容与输入一致', withText.journal.entries[0].entryText.startsWith('我复盘了去年那三笔亏损'), true);
  check('加成理由已落库', typeof q1.grant.bonusReason === 'string', true);
  check('静默里程碑已入库 2 → 3 条', withText.evolution.techMilestones.length, 3);
  const latest = withText.evolution.techMilestones[2];
  check('新里程碑标签 = failure_mode（「亏」命中）', latest.tag, 'failure_mode');
  check('里程碑挂在正确的任务上', latest.questId, 'q_inv_pain_audit');
  check('里程碑置信度 0.8', latest.confidence, 0.8);
  check('里程碑尚未点亮任何节点（留给 Phase 5）', latest.consumedByNodeId, null);
  check('隐藏目标仍未被揭示', withText.evolution.revealed, false);
  check('avgBonusPct 重算为 (8 + 9)/2 = 8.5', withText.journal.stats.averageBonusPct, 8.5);
  check('totalBonusExp 累加 14 + 27 = 41', withText.journal.stats.totalBonusExp, 41);

  // —— 有复盘但没命中任何标签：仍给加成、仍落日记，但**不入里程碑** ——
  // 这条区分很要紧：成功日记记的是"你写了什么"，进化树只记"你碰到了哪个技术面"。
  // 两者若混为一谈，隐藏目标会被情绪化的记录刷满。
  const noTag = runFlow(
    '今天状态不好，坐了两个小时基本上什么都没推进，一直在改一段根本不影响结果的措辞。意识到这一点的时候已经晚上了，于是决定直接停手，明天先做最难的那部分。',
  );
  check('无标签复盘 → 仍然给 9% 加成', noTag.quests.byId['q_inv_pain_audit'].grant.bonusPct, 9);
  check('无标签复盘 → 仍然生成日记条目', noTag.journal.entries.length, 2);
  check('无标签复盘 → 里程碑不新增', noTag.evolution.techMilestones.length, 2);

  // —— 无复盘 ——
  const noText = runFlow('');
  const q2 = noText.quests.byId['q_inv_pain_audit'];
  check('留空 → 加成 0%', q2.grant.bonusPct, 0);
  check('留空 → 基础奖励原样发放 300', q2.grant.final.exp, 300);
  check('留空 → 不产生日记条目 id', q2.journalEntryId, null);
  check('留空 → 成功日记条数不变', noText.journal.entries.length, 1);
  check('留空 → 里程碑不新增', noText.evolution.techMilestones.length, 2);

  // —— 幂等 ——
  const again = completeQuest(withText, 'q_inv_pain_audit', { reflection: 'x'.repeat(50), bonusPct: 8, bonusReason: null, verdict: null }, now);
  check('已完成的任务不能二次结算', again, withText);

  // —— 前置门控 ——
  const blocked = startQuest(createMockState(), 'q_inv_rulebook', now);
  check('draft 任务不能直接开始', blocked.quests.byId['q_inv_rulebook'].status, 'draft');

  // -------------------------------------------------------------------------
  console.log('\n【④ 静默失效的样式类】');
  // -------------------------------------------------------------------------
  /**
   * Tailwind v3 的透明度刻度是 5 的倍数（0,5,10,15,…,100）。
   * 写 `bg-amber-400/12` 不会报错、不会警告，**只是那条规则根本不存在** ——
   * 按钮少了一层金底，看起来"有点怪"但没人能一眼说出哪里怪。
   * 这类 bug 只能靠扫源码挡住：要么是 5 的倍数，要么用 `/[0.12]` 括号写法。
   */
  const offenders = [];
  const OPACITY = /\b(?:[a-z-]+:)?(?:bg|text|border|ring|from|to|via|divide|placeholder|shadow)-[a-z0-9-]+\/(\d+)\b/g;

  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(e.name)) {
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(OPACITY)) {
          if (Number(m[1]) % 5 !== 0) offenders.push(`${p.slice(root.length + 1)} → ${m[0]}`);
        }
      }
    }
  };
  walk(join(root, 'src'));
  check('没有落在刻度之外的透明度写法', offenders, []);

  /**
   * 同一类失效的第二种：**刻度之外的色阶**。
   *
   * `text-abyss-200` 与 `/12` 是同一种病 —— 调色板里没有 `abyss-200`
   * （只有 300/400/500/600/700/900），于是这条规则根本不存在，
   * 那行字就退回继承色。写的时候"看起来对"，因为 `abyss-200` 听起来
   * 完全像是一个该有的颜色。
   *
   * 判定不靠人记调色板：**直接从 tailwind.config.js 里把色阶读出来**。
   * 改了配置，这把尺子跟着改 —— 否则它自己会先过期。
   */
  const twConfig = readFileSync(join(root, 'tailwind.config.js'), 'utf8');
  const scaleOf = (name) =>
    new Set(
      [...(twConfig.match(new RegExp(`${name}:\\s*\\{([^}]*)\\}`))?.[1] ?? '').matchAll(/(\d+):/g)].map((m) => m[1]),
    );
  const PALETTE = { ink: scaleOf('ink'), abyss: scaleOf('abyss') };
  truthy('从配置里读到了 ink 色阶', PALETTE.ink.size > 0);
  truthy('从配置里读到了 abyss 色阶', PALETTE.abyss.size > 0);

  const offPalette = [];
  const PALETTE_CLASS = /\b(?:[a-z-]+:)?(?:bg|text|border|ring|ring-offset|from|to|via|divide|placeholder|caret|fill|stroke|shadow)-(ink|abyss)-(\d+)\b/g;

  const walk2 = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk2(p);
      else if (/\.(tsx?|css)$/.test(e.name)) {
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(PALETTE_CLASS)) {
          if (!PALETTE[m[1]].has(m[2])) offPalette.push(`${p.slice(root.length + 1)} → ${m[0]}（${m[1]} 没这个色阶）`);
        }
      }
    }
  };
  walk2(join(root, 'src'));
  check('没有落在调色板之外的色阶', offPalette, []);

  // -------------------------------------------------------------------------
  console.log('\n【⑤ 接单闭环：offered → claimed → active】');
  // -------------------------------------------------------------------------
  const REFLECTION = '我把那段脚本重写了一遍，发现真正的坑不在算法，而在输入数据的编码假设上。'.repeat(2);

  /** 把一条 claimed 的任务一路推到 completed */
  const finish = (st, id) => {
    let s = startQuest(st, id, now);
    s = openTurnIn(s, id, now);
    return completeQuest(s, id, toTurnInInput(mockArbiter({ reflection: REFLECTION, questTitle: 't', difficulty: 3, floorChars: 30 }), REFLECTION), now);
  };

  const fresh = createMockState();
  check('初始：q_cb_questions 是待领取', fresh.quests.byId['q_cb_questions'].status, 'offered');
  check('初始：悬赏板上有 1 条可接', claimableQuests(fresh).map((q) => q.id), ['q_cb_questions']);

  // —— 前置未完成：领取必须被拒，而且是"原样返回" ——
  const blockedClaim = claimQuest(fresh, 'q_cb_questions', now);
  check('前置未完成时领取被拒（返回原对象）', blockedClaim, fresh);
  check('被拒后状态不变', blockedClaim.quests.byId['q_cb_questions'].status, 'offered');

  // —— 完成前置，再领 ——
  let s2s = finish(fresh, 'q_cb_docker');
  check('前置 q_cb_docker 已结算', s2s.quests.byId['q_cb_docker'].status, 'completed');

  const claimedState = claimQuest(s2s, 'q_cb_questions', now);
  check('前置满足 → offered 变 claimed', claimedState.quests.byId['q_cb_questions'].status, 'claimed');
  truthy('claimedAt 已落定', claimedState.quests.byId['q_cb_questions'].claimedAt);
  check('领取后不再出现在可接列表', claimableQuests(claimedState).map((q) => q.id), []);

  const activeState = startQuest(claimedState, 'q_cb_questions', now);
  check('claimed → active', activeState.quests.byId['q_cb_questions'].status, 'active');
  truthy('startedAt 已落定', activeState.quests.byId['q_cb_questions'].startedAt);
  // 这一条就是"自动同步到 QuestPanel 的进行中列表"的机制本身
  check(
    '已同步进「进行中」（QuestPanel 的数据源）',
    inProgressQuests(activeState).map((q) => q.id).sort(),
    ['q_cb_questions'],
  );

  check('重复领取幂等', claimQuest(activeState, 'q_cb_questions', now), activeState);
  check('不能跳过领取直接开始', startQuest(s2s, 'q_cb_questions', now), s2s);

  // -------------------------------------------------------------------------
  console.log('\n【⑥ 逐条审核：通过 / 打回 / 整合链路】');
  // -------------------------------------------------------------------------
  /**
   * 认出"由这句灵感铸出来的那条链"。
   * 不能用 `draftQuests(state)[0]` —— order 里排在前面的是存档自带的那条草稿，
   * 那样测的是 mock 数据，不是铸造本身。
   */
  const chainFromIdea = (st, idea) => {
    const q = draftQuests(st).find((d) => d.origin.sourceIdea === idea);
    return st.quests.chains[q.chain.chainId];
  };

  // —— 通过：draft -> offered，且全部 resolve 后链的 reviewedAt 落定 ——
  let s3 = createMockState();
  check('初始：风控链 reviewedAt 为空（还有 draft）', s3.quests.chains['ch_risk_discipline'].review.reviewedAt, null);
  s3 = reviewQuestDraft(s3, 'q_inv_rulebook', 'approve', now);
  check('草稿通过 → offered', s3.quests.byId['q_inv_rulebook'].status, 'offered');
  truthy('全部成员 resolve → 链 reviewedAt 落定', s3.quests.chains['ch_risk_discipline'].review.reviewedAt);
  check('通过不改动链成员', s3.quests.chains['ch_risk_discipline'].questIds.length, 2);
  check('已审核过的链不再重复落时间', reviewQuestDraft(s3, 'q_inv_rulebook', 'approve', now), s3);

  // —— 铸造：一句灵感 → 2~3 条 draft ——
  const IDEA = '我想把收藏夹里的论文真正跑通一遍，而不是只收藏';
  let s4 = createMockState();
  const draftsBefore = draftQuests(s4).length;

  s4 = generateQuestChain(s4, { idea: IDEA, deepDeliberation: false, classId: null }, now);

  // 用 sourceIdea 认出"刚铸出来的那一批"，而不是拿 draftQuests()[0] ——
  // 后者会取到存档里本来就有的草稿（order 里排在前面），那样测的就不是铸造了
  const minted = draftQuests(s4).filter((q) => q.origin.sourceIdea === IDEA);
  check('铸出 3 条草稿（原 1 条 + 新 3 条）', minted.length, 3);
  check('存档里草稿总数 1 → 4', draftQuests(s4).length, draftsBefore + 3);
  check('全部落在 draft（铸造 ≠ 生效）', minted.every((q) => q.status === 'draft'), true);
  check('未勾深度推演 → 无参谋意见', minted[0].origin.reviewed, false);
  check('未勾深度推演 → reviewerNote 为空', minted[0].origin.reviewerNote, null);

  const newChainId = minted[0].chain.chainId;
  const newChain = s4.quests.chains[newChainId];
  truthy('链已入库', newChain);
  check('链标题取自玩家的原话', newChain.title.startsWith('我想把收藏夹里的论文'), true);
  check('灵感命中文凭关键词 → 路由到计算生物学', newChain.classId, 'computational_biology');
  check('新链 reviewedAt 为空（一条都还没审）', newChain.review.reviewedAt, null);
  check('新链未完成', newChain.completed, false);
  check(
    '链已登记进该职业线的 chainIds',
    s4.careers.tracks.find((t) => t.classId === 'computational_biology').chainIds.includes(newChainId),
    true,
  );
  check(
    '未命中的职业线不受影响',
    s4.careers.tracks.find((t) => t.classId === 'investor').chainIds.includes(newChainId),
    false,
  );

  // 链内前置：第 1 步无前置，后两步各以前一步为前置
  const chainQuests = newChain.questIds.map((id) => s4.quests.byId[id]);
  check('链内第 1 步无前置', chainQuests[0].prerequisiteQuestIds, []);
  check('链内第 2 步的前置是第 1 步', chainQuests[1].prerequisiteQuestIds, [chainQuests[0].id]);
  check('链内序号连续', chainQuests.map((q) => q.chain.index), [0, 1, 2]);
  check('链内 total 一致', chainQuests.map((q) => q.chain.total), [3, 3, 3]);
  check('草稿的 id 与 tempId 不是同一个（已换成真 QuestId）', chainQuests[0].id.startsWith('q_'), true);
  check('空灵感不产生任何东西', generateQuestChain(createMockState(), { idea: '   ', deepDeliberation: false, classId: null }, now).quests.order.length, 5);

  // —— 深度推演：勾上就有参谋意见 ——
  let s4b = createMockState();
  s4b = generateQuestChain(s4b, { idea: '想想怎么把投资纪律变成规则', deepDeliberation: true, classId: null }, now);
  const deepDraft = draftQuests(s4b).find((q) => q.origin.sourceIdea === '想想怎么把投资纪律变成规则');
  check('钩了深度推演 → reviewed 为 true', deepDraft.origin.reviewed, true);
  truthy('钩了深度推演 → 有参谋意见', deepDraft.origin.reviewerNote);
  check('灵感含「投资」→ 路由到 investor', deepDraft.classId, 'investor');

  // —— 打回：必须真的解开下游的前置，否则整条链当场作废 ——
  let s5 = createMockState();
  s5 = generateQuestChain(s5, { idea: IDEA, deepDeliberation: false, classId: null }, now);
  const c5 = chainFromIdea(s5, IDEA);
  const [step0, step1, step2] = c5.questIds.map((id) => s5.quests.byId[id]);

  s5 = reviewQuestDraft(s5, step0.id, 'reject', now);
  check('打回 → 状态为 rejected', s5.quests.byId[step0.id].status, 'rejected');
  check('打回 → 从链中剔除', s5.quests.chains[c5.id].questIds, [step1.id, step2.id]);
  check('打回 → 下游不再前置它（这是"不阻塞"的机制）', s5.quests.byId[step1.id].prerequisiteQuestIds, []);
  check('打回 → 序号不重排，缺口即痕迹', s5.quests.byId[step1.id].chain.index, 1);
  check('打回 → 任务本身仍在存档里（痕迹保留）', s5.quests.byId[step0.id].title, step0.title);
  check('打回 → 链尚未审核完毕（还剩 1 条 draft）', s5.quests.chains[c5.id].review.reviewedAt, null);

  // 被摘掉前置之后，第二步真的领得动 —— 这就是"不阻塞"的可执行证据
  s5 = reviewQuestDraft(s5, step1.id, 'approve', now);
  const claimedAfterReject = claimQuest(s5, step1.id, now);
  check('打回一步之后，下一步仍然领得动', claimedAfterReject.quests.byId[step1.id].status, 'claimed');
  check('此时链仍未审完（第 3 条还是 draft）', claimedAfterReject.quests.chains[c5.id].review.reviewedAt, null);

  // 全部 resolve 之后 reviewedAt 才落定
  const s6 = reviewQuestDraft(claimedAfterReject, step2.id, 'approve', now);
  truthy('全部成员 resolve → reviewedAt 落定', s6.quests.chains[c5.id].review.reviewedAt);

  // 整条链全被打回：remaining 为空，同样视为审核结束
  let s7 = createMockState();
  s7 = generateQuestChain(s7, { idea: IDEA, deepDeliberation: false, classId: null }, now);
  const c7 = chainFromIdea(s7, IDEA);
  for (const id of c7.questIds) s7 = reviewQuestDraft(s7, id, 'reject', now);
  check('全被打回 → 链成员清空', s7.quests.chains[c7.id].questIds, []);
  truthy('全被打回 → 同样视为审核结束', s7.quests.chains[c7.id].review.reviewedAt);
  check('全被打回 → 任务都还在（作为偏好信号）', c7.questIds.every((id) => s7.quests.byId[id].status === 'rejected'), true);

  // -------------------------------------------------------------------------
  console.log('\n【⑦ 日记：结算 → 可回溯】');
  // -------------------------------------------------------------------------
  const before8 = createMockState();
  const after8 = finish(before8, 'q_inv_pain_audit');
  const q8 = after8.quests.byId['q_inv_pain_audit'];

  check('结算后日记 +1', after8.journal.entries.length, before8.journal.entries.length + 1);
  const newest = after8.journal.entries[0];
  check('最新条目排在最前（查看器直接顺序渲染）', newest.id, q8.journalEntryId);
  check('条目记住了任务名', newest.questTitle, q8.title);
  check('条目带上了完整判定（查看器要显示档位徽标）', newest.verdict.quality, 'sharp');
  check('条目的加成百分比可供查看器金色高亮', newest.verdict.bonusPct, 9);
  truthy('条目的点评可供查看器显示', newest.verdict.comment);
  check('本地日期归到写入那天', newest.localDate, today);
  truthy('创建时间可排序', newest.createdAt);
  check('条目原文未被改动', newest.entryText, REFLECTION.trim());

  // -------------------------------------------------------------------------
  console.log('\n【⑧ 升级发属性点：每级 1 点】');
  // -------------------------------------------------------------------------
  /**
   * 属性点有**两个互不相干的来源**：任务自带奖励、以及升级发放。
   * mock 里那条任务自带 `{ cap: 1 }`，所以直接测 delta 会把它算成升级点 ——
   * 必须把两者分开断言，否则这条校验只是在证明"有数字变了"。
   *
   * 起点手工摆成"曲线门槛 100 / 当前 1 级 / 已积累 0"：这条任务给 327 EXP，
   * 依次跨过 100 与 200 两级、卡在 300 前面，**必然净升 2 级** ——
   * 顺带验证了"一次结算跨两级就发两点"，而不是每次只发一点。
   */
  const investIdx = (st) => st.careers.tracks.findIndex((t) => t.classId === 'investor');
  const craft = (st, patch) => ({
    ...st,
    careers: {
      ...st.careers,
      tracks: st.careers.tracks.map((t, i) => (i === investIdx(st) ? { ...t, ...patch } : t)),
    },
    player: { ...st.player, freeAttributePoints: 0 },
  });
  const CURVE = { base: 100, exponent: 1, maxLevel: 99 };

  const before9 = craft(createMockState(), { level: 1, exp: 0, expToNext: 100, expCurve: CURVE });
  const after9 = finish(before9, 'q_inv_pain_audit'); // 300 × 1.09 = 327 EXP
  const track9 = after9.careers.tracks[investIdx(after9)];
  const levels = track9.level - 1;
  const rewardAp = Object.values(after9.quests.byId['q_inv_pain_audit'].grant.final.attributePoints ?? {}).reduce(
    (sum, v) => sum + (v ?? 0),
    0,
  );

  check('跨了 2 级（100 + 200 ≤ 327 < 300 + 400）', levels, 2);
  check('这条任务自带的属性点是 1 点（cap）', rewardAp, 1);
  check('升级点 = 净升级数 × 1，与任务自带的点各算各的', after9.player.freeAttributePoints - rewardAp, levels);
  check('合计入池 3 点', after9.player.freeAttributePoints, 3);

  // 已满级：不该再发点（也不会因为 exp 溢出而无限发）
  const maxedState = craft(createMockState(), { level: 99, exp: 0, expToNext: 0, expCurve: CURVE });
  const afterMax = finish(maxedState, 'q_inv_pain_audit');
  check('已满级 → 不发升级点', afterMax.careers.tracks[investIdx(afterMax)].level, 99);
  check('已满级 → 池子里只有任务自带的那 1 点', afterMax.player.freeAttributePoints, 1);



  // -------------------------------------------------------------------------
  console.log('\n【⑨ 预览 = 实发（跨全部难度）】');
  // -------------------------------------------------------------------------
  /**
   * 界面上「预计加成 N%」与实际入账的 N% 必须是同一个数。
   * 这两者若能从不同地方推导出来，迟早会漂 —— 所以直接钉死这个不变式：
   * 替身给出的建议值，经过 alignBonusPct 这道闸门后必须**原样通过**。
   */
  const { alignBonusPct, bonusBandFor, bonusForQuality } = await server.ssrLoadModule('/src/data/catalog/policy.ts');
  const long = '这是一段足够长的复盘'.repeat(6);
  const short = '太短了';

  for (const d of [1, 2, 3, 4, 5]) {
    const sharp = mockArbiter({ reflection: long, questTitle: 't', difficulty: d, floorChars: 30 });
    const solid = mockArbiter({ reflection: short, questTitle: 't', difficulty: d, floorChars: 30 });
    const band = bonusBandFor(d);
    check(`难度 ${d} · sharp 建议值不被闸门改写`, alignBonusPct(sharp.bonusPct, sharp.quality, d), sharp.bonusPct);
    check(`难度 ${d} · solid 建议值不被闸门改写`, alignBonusPct(solid.bonusPct, solid.quality, d), solid.bonusPct);
    check(`难度 ${d} · sharp = 区间 60% 处 (${bonusForQuality('sharp', band)}%)`, sharp.bonusPct, bonusForQuality('sharp', band));
    check(`难度 ${d} · solid = 区间下限 (${band.minPct}%)`, solid.bonusPct, band.minPct);
  }

  // -------------------------------------------------------------------------
  console.log('\n【⑩ 金库：账本顺序、净资产、对数进度】');
  // -------------------------------------------------------------------------
  /**
   * 这一节护的是**读法的前提**，不是数值本身。
   *
   * `recentTransactions` 直接 slice(-n) 取"最近几笔"，它信账本是追加写的。
   * 一旦有人在中间插一笔，流水就会开始倒着显示 —— 不报错、不崩，
   * 只是某个玩家看到 10 月 1 日的支出排在 10 月 2 日的收入上面。
   * 这类错误没有断言就只能靠肉眼，所以钉在这里。
   */
  const { netWorthUsdCents, a9Progress, wealthMagnitude, recentTransactions } = await server.ssrLoadModule(
    '/src/lib/selectors.ts',
  );
  const { WEALTH_CURVE, wealthProgressRatio } = await server.ssrLoadModule('/src/data/catalog/policy.ts');

  const save = createMockState();
  const vault = save.vault;
  const txns = vault.transactions;
  const ledgerAscending = (pick) => txns.filter((t, i) => i > 0 && pick(txns[i - 1]) > pick(t)).map((t) => t.id);

  check('账本按 ts 升序（追加型：写入方只许往后加）', ledgerAscending((t) => t.ts), []);
  check('账本的 localDate 也不倒挂', ledgerAscending((t) => t.localDate), []);

  const holdingsValue = vault.holdings.reduce((sum, h) => sum + h.marketValue, 0);
  check('净资产 = 现金 + 持仓市值 − 负债', netWorthUsdCents(vault), vault.cash + holdingsValue - vault.liabilities);
  check('模拟存档净资产 $12,500.00', netWorthUsdCents(vault), 1_250_000);

  const recent = recentTransactions(vault, 3);
  check('近期流水最新在前', recent.map((t) => t.id), ['txn_010', 'txn_009', 'txn_008']);
  truthy('返回值不是账本本身', recent !== vault.transactions);
  check('limit 大于总数时给全部，不补空', recentTransactions(vault, 99).length, txns.length);
  check('读流水不改账本', vault.transactions.map((t) => t.id), txns.map((t) => t.id));

  // —— 数量级阶梯 ——
  const netWorth = netWorthUsdCents(vault);
  const mag = wealthMagnitude(netWorth);
  check('数量级下界是 10 的幂', Math.log10(mag.decadeUsdCents) % 1, 0);
  check('净资产落在 [下界, 上界) 里', netWorth >= mag.decadeUsdCents && netWorth < mag.nextDecadeUsdCents, true);
  check('区间内进度落在 0..1', mag.ratioWithinDecade >= 0 && mag.ratioWithinDecade < 1, true);
  check('$12,500 站在 $10k 这一档', mag.decadeUsdCents, 1_000_000);
  check('距 A9 还差 4 个数量级', mag.decadesToTarget, 4);

  // 身无分文也必须有个刻度可站：log10(0) 是负无穷，兜底要在下界上生效
  const broke = wealthMagnitude(0);
  check('净资产 0 时不炸（兜底到 1 分）', broke.decadeUsdCents, 1);
  check('净资产 0 时区间进度仍是 0', broke.ratioWithinDecade, 0);

  // —— A9 对数曲线 ——
  check('建角刻度 = 0%', wealthProgressRatio(WEALTH_CURVE.startUsdCents), 0);
  check('低于建角刻度也按 0%', wealthProgressRatio(0), 0);
  check('目标 $100M = 100%', wealthProgressRatio(WEALTH_CURVE.targetUsdCents), 1);
  check('越过目标仍是 100%（不回绕）', wealthProgressRatio(WEALTH_CURVE.targetUsdCents * 100), 1);

  const ladder = [1e3, 1e5, 1e6, 1e7, 1e9, WEALTH_CURVE.targetUsdCents];
  check(
    '沿数量级走：总进度单调不减',
    ladder.every((x, i) => i === 0 || wealthProgressRatio(x) >= wealthProgressRatio(ladder[i - 1])),
    true,
  );
  check(
    '沿数量级走：剩余数量级单调不增',
    ladder.every((_, i) => i === 0 || wealthMagnitude(ladder[i]).decadesToTarget <= wealthMagnitude(ladder[i - 1]).decadesToTarget),
    true,
  );
  check('模拟存档 A9 进度 ≈ 7.8%', Math.round(a9Progress(save) * 1000) / 1000, 0.078);
  // 反例守卫：裸对数（log10(netWorth)/8）会给出 76%。它把"从 $1,100 起步"这件事
  // 算成了从 $1 起步，于是建角就白送了 40 个点的进度。这条断言就是那句警告的哨兵。
  truthy('不是裸对数（裸对数会给 76%）', a9Progress(save) < 0.15);

  // -------------------------------------------------------------------------
  console.log('\n【⑪ 职业经验：比率、头衔门槛、经验曲线】');
  // -------------------------------------------------------------------------
  const { expRatio: expRatioOf, trackTitle, portfolioLevel } = await server.ssrLoadModule('/src/lib/selectors.ts');
  const { CLASSES, expToNext, titleForLevel, classLabelOf } = await server.ssrLoadModule(
    '/src/data/catalog/classes.ts',
  );

  // 面板遍历的是 catalog、数据来自存档：两边错位不会报错，只会少一张卡
  check(
    'catalog 里每条职业线都有存档',
    CLASSES.map((c) => c.classId).filter((id) => !save.careers.tracks.some((t) => t.classId === id)),
    [],
  );
  check(
    '存档里没有 catalog 之外的职业线',
    save.careers.tracks.filter((t) => !CLASSES.some((c) => c.classId === t.classId)).map((t) => t.classId),
    [],
  );
  // 曾经踩过的坑：拿 agentDisplayName.split('·')[0] 当职业名，会拼出「资本」「表达」这种半截词
  check(
    '职业名不是 Agent 名（不含分隔符）',
    CLASSES.map((c) => classLabelOf(c.classId)).filter((l) => l.includes('·')),
    [],
  );

  check('经验比率落在 0..1', save.careers.tracks.every((t) => expRatioOf(t) >= 0 && expRatioOf(t) <= 1), true);
  check('刚开线（0 EXP）= 0%', expRatioOf({ exp: 0, expToNext: 90 }), 0);
  check('正好攒够 = 100%', expRatioOf({ exp: 100, expToNext: 100 }), 1);
  check('攒超了也钳在 100%（脏数据不越界）', expRatioOf({ exp: 250, expToNext: 100 }), 1);
  check('负数钳到 0%', expRatioOf({ exp: -5, expToNext: 100 }), 0);
  // 满级这条最容易写错：返回 0 会让练满的人看到一条空槽，返回 NaN 会让进度条消失
  check('满级（expToNext 0）= 100%，不是 0 也不是 NaN', expRatioOf({ exp: 0, expToNext: 0 }), 1);
  check('内容创作 Lv.1 起步进度（12 / 90）', Math.round(expRatioOf(save.careers.tracks.find((t) => t.classId === 'social_media_influencer')) * 1000) / 1000, 0.133);
  check('总等级 = 各线之和', portfolioLevel(save), save.careers.tracks.reduce((sum, t) => sum + t.level, 0));

  // 头衔门槛：level 正好等于 fromLevel 时应当已经换了新头衔（最经典的 off-by-one 位置）
  for (const entry of CLASSES) {
    const off = entry.titleTiers.filter((tier, i) => titleForLevel(entry, tier.fromLevel) !== tier.title);
    check(`${classLabelOf(entry.classId)} · 门槛上取新头衔`, off.map((t) => t.title), []);
    const below = entry.titleTiers
      .slice(1)
      .filter((tier, i) => titleForLevel(entry, tier.fromLevel - 1) !== entry.titleTiers[i].title);
    check(`${classLabelOf(entry.classId)} · 门槛前仍是旧头衔`, below.map((t) => t.title), []);
  }
  check('计算生物 Lv.5 → 数据炼金术士', trackTitle(save.careers.tracks[0]), '数据炼金术士');

  for (const entry of CLASSES) {
    const grew = [1, 2, 3, 5, 8, 13].every((lv) => expToNext(entry.expCurve, lv + 1) > expToNext(entry.expCurve, lv));
    check(`${classLabelOf(entry.classId)} · 经验需求随等级递增`, grew, true);
    check(`${classLabelOf(entry.classId)} · 满级后归 0`, expToNext(entry.expCurve, entry.expCurve.maxLevel), 0);
  }

  // -------------------------------------------------------------------------
  console.log('\n【⑫ 关系：联系人状态读数与社交智囊】');
  // -------------------------------------------------------------------------
  /**
   * 时间钉死，不用 new Date()。
   * 「赵启超期了」这件事只在某几天里成立 —— 用它当断言，脚本会在某个周二的早上开始说谎。
   */
  const NET_NOW = new Date('2026-10-07T12:00:00.000Z');
  const { networkSummary, getContact, daysSinceContact, LOPSIDED_GAP: GAP } = await server.ssrLoadModule(
    '/src/lib/selectors.ts',
  );
  const { RELATION_STAGES, RELATION_TYPES } = await server.ssrLoadModule('/src/data/catalog/network.ts');
  const { daysBetween } = await server.ssrLoadModule('/src/lib/format.ts');
  const { mockNetworkAdvisor } = await server.ssrLoadModule('/src/lib/mockAdvisor.ts');
  const { askNetworkAdvisor } = await server.ssrLoadModule('/src/store/operations.ts');

  const summary = networkSummary(save, NET_NOW);
  const ids = (arr) => arr.map((c) => c.id);
  check('联系人数 = 3', summary.totalContacts, save.network.contacts.length);
  check('byType 是全键的（九种关系一个不少，没人的记 0）', Object.keys(summary.byType).sort(), [...RELATION_TYPES].sort());
  check('byType 计数之和 = 总人数', Object.values(summary.byType).reduce((a, b) => a + b, 0), summary.totalContacts);
  check('单向消耗：只有赵启（76 − 34 = 42 ≥ 25）', ids(save.network.contacts.filter((c) => summary.lopsidedContactIds.includes(c.id))), ['c_zhao']);
  check('单向消耗的阈值确实是 25', GAP, 25);

  // PO 裁定撤下的两本账：「该联系了」（超期）与「核心圈」（grade S/A）。
  // 这里钉的是**账本本身不在了**（键的集合），而不是"今天刚好都是 0" ——
  // 后者会在某次数据变化后悄悄变成"它们又回来了"。
  check(
    '聚合视图里不再有「该联系了」与「核心圈」',
    Object.keys(summary).sort(),
    ['byLevel', 'byType', 'lopsidedContactIds', 'totalContacts'],
  );

  // 顶上那行统计现在数的是**玩家自己定过的等级** —— 数他写下的东西，不替他排座次
  check('等级分布是全键的（八档一个不少，没人的记 0）', Object.keys(summary.byLevel).sort(), [...RELATION_STAGES].sort());
  check(
    '等级分布：三个人各占自己那一档（陈立可托付小事 / 林昭有来往 / 赵启沉寂中）',
    [summary.byLevel.trusted, summary.byLevel.connected, summary.byLevel.dormant],
    [1, 1, 1],
  );
  check(
    '等级分布之和 = 定过等级的人数（不是总人数 —— 没定过的不进任何一档）',
    Object.values(summary.byLevel).reduce((a, b) => a + b, 0),
    save.network.contacts.filter((c) => c.stage !== null).length,
  );

  // 「超期两个口径必须一致」那条断言随功能一起撤了：它存在的理由是
  // summary 读写入方算好的 nextTouchAt、智囊自己重算一遍 —— 一对账就有两个口径。
  // 现在两边读的是同一个 daysSinceContact，再对一遍就是自说自话。
  //
  // 但**记账没有停**（撤下的是"露账"）：nextTouchAt 仍由写入方按 cadence 维护。
  // 这条断言钉的就是这个 —— 免得日后有人把"界面上没人读它"当成"它没用了"顺手删掉。
  check(
    '联系节奏仍在记账：nextTouchAt = lastContactAt + cadence（只是界面上不再念它）',
    save.network.contacts.map(
      (c) => c.nextTouchAt === null || daysBetween(c.lastContactAt, new Date(c.nextTouchAt)) === c.contactCadenceDays,
    ),
    [true, true, true],
  );

  check('查一个不存在的人 → undefined', getContact(save, 'c_nobody'), undefined);
  check('从没联系过 → null（不是 0，也不是一个巨大的数）', daysSinceContact({ lastContactAt: null }, NET_NOW), null);

  // —— 智囊的三条规则，各取一个真实联系人 ——
  const chen = getContact(save, 'c_chen');
  const lin = getContact(save, 'c_lin');
  const zhao = getContact(save, 'c_zhao');
  const ask = (contact, situation = '') => mockNetworkAdvisor({ contact, situation, now: NET_NOW });

  check('陈立：压着承诺且说好了期限 → 在自己的期限之前交付', ask(chen).suggestedAction.timing, '在你自己说过的时间之前');
  check('赵启：压着承诺但没定期限 → 这周内交付', ask(zhao).suggestedAction.timing, '这周内');
  truthy('建议里点得到称呼（陈立 → 陈老师）', ask(chen).advice.includes(chen.alias));
  truthy('建议里点得到称呼（林昭，无别名 → 用本名）', ask(lin).advice.includes(lin.name));
  // 玩家亲手定的那条等级必须被原样读出来 —— 它是这段关系上唯一一句"他本人说的"。
  // 用林昭验（陈立那段话被"压着承诺"抢先，走不到念等级的那一句）。
  truthy('智囊按玩家定的等级称呼这段关系（林昭：有来往）', ask(lin).advice.includes('处在一个稳定的位置：有来往'));
  // 位置是稳的时候，智囊给的是一句「不用联系」—— 这条分支存在的意义就是不生成待办
  check('林昭：位置稳 → 不给动作（允许不做）', ask(lin).suggestedAction, null);
  truthy('但心法仍然带走一句', ask(lin).principle.length > 0);

  // 「这周先不动」那条规则用真实数据到不了（三位联系人都有别的事优先），
  // 所以就地造一个：单向消耗、无承诺、无待跟进。它验的是规则，不是数据。
  const drained = { ...lin, openCommitments: [], interactions: [], dimensions: { ...lin.dimensions, warmth: 90, reciprocity: 30 } };
  check('单向消耗 → 建议是「这周先不动」', ask(drained).suggestedAction.timing, '这周先不动');
  const absent = { ...lin, lastContactAt: '2026-09-01T00:00:00.000Z' };
  truthy('超期 → 建议这周内主动一次', ask(absent).suggestedAction.timing.startsWith('这周内'));

  check('禁忌不留重复项', save.network.contacts.every((c) => { const a = ask(c).avoid; return new Set(a).size === a.length; }), true);
  check('同一输入两次 → 同一结果（纯函数，不掷骰子）', JSON.stringify(ask(chen, '我想问他要数据')), JSON.stringify(ask(chen, '我想问他要数据')));
  check('不写处境也成立（空不是错误路径）', ask(chen).advice.length > 0, true);
  truthy('处境会被先接住', ask(chen, '有三个月没联系').advice.includes('有三个月没联系'));

  // —— 入库 ——
  const asked1 = askNetworkAdvisor(save, 'c_chen', '  想请他给一份数据  ', NET_NOW);
  const hist1 = getContact(asked1, 'c_chen').adviceHistory;
  check('恰好追加一条', hist1.length, chen.adviceHistory.length + 1);
  const rec = hist1[hist1.length - 1];
  check('记录挂在本人名下', rec.contactId, 'c_chen');
  check('出处是智囊 Agent', rec.agentId, 'agent_network_advisor');
  check('处境已 trim', rec.situation, '想请他给一份数据');
  check('helpful 留给玩家（AI 不替自己打分）', rec.helpful, null);
  check('executed 默认未执行', rec.executed, false);
  check('入参未被就地修改', getContact(save, 'c_chen').adviceHistory.length, 1);
  check('别人的档案没被碰', getContact(asked1, 'c_lin').adviceHistory.length, 0);

  const asked2 = askNetworkAdvisor(asked1, 'c_chen', '再问一次', NET_NOW);
  const hist2 = getContact(asked2, 'c_chen').adviceHistory;
  check('非幂等：再问一次是再记一条', hist2.length, hist1.length + 1);
  check('同一毫秒连问两次，id 也不撞', new Set(hist2.map((r) => r.id)).size, hist2.length);
  check('未知联系人 → 原对象返回（调用方以此判断"什么都没发生"）', askNetworkAdvisor(save, 'c_nobody', '你好', NET_NOW) === save, true);

  // -------------------------------------------------------------------------
  console.log('\n【⑬ 场景锚点：可见性判定】');
  // -------------------------------------------------------------------------
  const { visibleAnchors, buildAnchorContext } = await server.ssrLoadModule('/src/lib/selectors.ts');
  const { GUANGHUA_SCENE, TIME_OF_DAY_BANDS } = await server.ssrLoadModule('/src/data/catalog/scenes.ts');

  const anchorCtx = buildAnchorContext(save, NET_NOW);
  check('已解锁篇章进了上下文', anchorCtx.unlockedChapterIds, ['CH1']);
  truthy('时段落在分带里', TIME_OF_DAY_BANDS.some((b) => b.timeOfDay === anchorCtx.timeOfDay));

  const vis = visibleAnchors(GUANGHUA_SCENE, anchorCtx);
  check('可见锚点不重复', new Set(vis.map((a) => a.id)).size, vis.length);
  check('雾里：隐藏目标那一扇窗不在其中', vis.some((a) => a.binding.type === 'evolution_tree'), false);
  truthy('关系面板有入口（移动端唯一的入口）', vis.some((a) => a.binding.type === 'network'));
  truthy('属性面板也有入口（玻璃幕墙：不进 Dock 的第二块）', vis.some((a) => a.binding.type === 'attributes'));
  // 圣殿（天边）与那扇窗刻意相反：它不受 revealed 影响，雾里雾外都在 ——
  // 它是明牌入口，五张目标卡对任何玩家都不是秘密。
  truthy('圣殿也有入口（天边：不进 Dock 的第三块）', vis.some((a) => a.binding.type === 'sanctuary'));
  check('判定不改场景', GUANGHUA_SCENE.anchors.length, 9);
  // 这条以前写成"可见数 === unlocked 数"，因为当时目录里恰有一个 unlocked:false 的锚点。
  // 那是巧合不是规则 —— Phase 5 把那扇窗的静态闸打开之后等式就不成立了。
  // 规则本身是"unlocked 为假的锚点一个都不许冒出来"，现在就照规则写。
  check('未解锁的一律不渲染（哪怕别的条件都满足）', vis.every((a) => a.unlocked), true);
  check('雾没散：八个锚点（九减一）', vis.length, 8);

  // —— 雾散了：那扇窗自己亮起来 ——
  // 它是"某一扇窗，从此不再是暗的"，所以它不该由任何一次点击挂上去，
  // 而是 visibleAnchors 每一帧照着 revealed 现算的。
  const revealedCtx = { ...anchorCtx, evolutionRevealed: true };
  const visRevealed = visibleAnchors(GUANGHUA_SCENE, revealedCtx);
  truthy('雾散：那一扇窗出现了', visRevealed.some((a) => a.binding.type === 'evolution_tree'));
  check('雾散：只多这一扇', visRevealed.length, vis.length + 1);
  check(
    '除了 revealed 这一个布尔，上下文里没有任何来自进化树的东西',
    Object.keys(revealedCtx).sort(),
    ['evolutionRevealed', 'hasActiveQuest', 'hasPendingDaily', 'timeOfDay', 'unlockedChapterIds'],
  );

  // 铁律①：拿 catalog 里那个锚点测是测不出东西的 —— 它自己 unlocked 就是 false，
  // 两层保护里弱的那层也能挡住，会掩盖 selector 少写一行。所以造一个"别的都满足"的。
  const probe = (visibleWhen, patch = {}) => ({
    ...GUANGHUA_SCENE,
    anchors: [{ ...GUANGHUA_SCENE.anchors[0], id: 'probe', unlocked: true, visibleWhen, ...patch }],
  });
  const seen = (scene, ctx = anchorCtx) => visibleAnchors(scene, ctx).length;

  const otherBand = TIME_OF_DAY_BANDS.find((b) => b.timeOfDay !== anchorCtx.timeOfDay).timeOfDay;
  check('requiresEvolutionRevealed → 一律不渲染（哪怕其它条件全满足）', seen(probe({ requiresEvolutionRevealed: true })), 0);
  check('timeOfDay 命中 → 可见', seen(probe({ timeOfDay: [anchorCtx.timeOfDay] })), 1);
  check('timeOfDay 未命中 → 不可见', seen(probe({ timeOfDay: [otherBand] })), 0);
  check('chapterIds 是「任一命中即可」', seen(probe({ chapterIds: ['CH1', 'CH9'] })), 1);
  check('chapterIds 全不命中 → 不可见', seen(probe({ chapterIds: ['CH9'] })), 0);
  check('requiresPendingDaily 满足 → 可见', seen(probe({ requiresPendingDaily: true })), 1);
  check('requiresPendingDaily 不满足 → 不可见', seen(probe({ requiresPendingDaily: true }), { ...anchorCtx, hasPendingDaily: false }), 0);
  check('requiresActiveQuest 不满足 → 不可见', seen(probe({ requiresActiveQuest: true }), { ...anchorCtx, hasActiveQuest: false }), 0);
  // 所有条件是 AND：两个条件同时写，满足一个不够
  check(
    '多条件之间是 AND',
    seen(probe({ timeOfDay: [anchorCtx.timeOfDay], requiresActiveQuest: true }), { ...anchorCtx, hasActiveQuest: false }),
    0,
  );
  check('unlocked: false 一律不出现', seen(probe(null, { unlocked: false })), 0);
  check('没有任何条件 → 直接可见', seen(probe(null)), 1);

  // -------------------------------------------------------------------------
  console.log('\n【⑭ 持久化：序列化 / 水合 / 分流】');
  // -------------------------------------------------------------------------
  const { encodeSave, decodeSave, resolveStorage, createMemoryStorage } =
    await server.ssrLoadModule('/src/lib/persistence.ts');
  const { STORAGE_KEYS, CURRENT_SCHEMA_VERSION } = await server.ssrLoadModule('/src/types/state.ts');

  // 「纯 JSON」这条约定不靠自觉，靠这只走遍全树的探针。
  // 为什么必须钉：Map / Set / Date 全都能通过 JSON.stringify **而不报错** ——
  // 它们各自序列化成一个 {}，等到水合时才变成一堆空对象，
  // 而那时候离现场已经很远了。
  const scan = (v, path = '$', depth = 0) => {
    if (v === null) return null;
    const t = typeof v;
    if (t === 'undefined') return `${path} 是 undefined（可空请写 null）`;
    if (t === 'function') return `${path} 是函数（存档里不许有行为）`;
    if (t === 'symbol' || t === 'bigint') return `${path} 是 ${t}`;
    if (t === 'number') return Number.isFinite(v) ? null : `${path} 是 ${String(v)}（JSON 会把它变成 null）`;
    if (t !== 'object') return null;
    if (v instanceof Date) return `${path} 是 Date（时间请写 ISO 字符串）`;
    if (v instanceof Map) return `${path} 是 Map（集合请写数组）`;
    if (v instanceof Set) return `${path} 是 Set（集合请写数组）`;
    if (depth > 14) return null; // 存档是树不是图；走到这儿说明有环
    for (const [k, child] of Object.entries(v)) {
      const hit = scan(child, Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`, depth + 1);
      if (hit) return hit;
    }
    return null;
  };

  const pristine = createMockState();
  check('初始存档里没有一处非 JSON 值', scan(pristine), null);
  check('序列化后原样读回（含字段顺序）', JSON.stringify(JSON.parse(encodeSave(pristine))), JSON.stringify(pristine));

  const noSave = decodeSave(null, CURRENT_SCHEMA_VERSION);
  check('无存档 → 交给调用方去建新的，且不产生噪音', [noSave.save, noSave.note, noSave.diverted], [null, null, false]);
  check('空串与无存档等价', decodeSave('', CURRENT_SCHEMA_VERSION).save, null);

  const loaded = decodeSave(encodeSave(pristine), CURRENT_SCHEMA_VERSION);
  truthy('正常存档能水合回来', loaded.save);
  check('水合出来的就是那份存档', loaded.save.meta.revision, pristine.meta.revision);
  check('水合不产生提示', [loaded.note, loaded.diverted], [null, false]);
  // 水合出来的必须能继续往下跑：读得回来但用不了，等于没读回来
  check('水合后仍可被纯函数推进', checkDaily(loaded.save, 'd_paper_figure', now) !== loaded.save, true);

  // 版本落后的存档分两条路：迁移链里有步骤就走迁移（用例在下面），
  // 缺步才分流。v0 是"史前版本"—— 迁移链没有 v0→v1 这一步，所以它必须被挡住。
  const stale = decodeSave(encodeSave({ ...pristine, meta: { ...pristine.meta, schemaVersion: 0 } }), CURRENT_SCHEMA_VERSION);
  check('缺迁移步的旧档 → 拒不加载', stale.save, null);
  check('缺迁移步的旧档 → 标记为已分流（调用方据此转存 backup 键）', stale.diverted, true);
  truthy('提示里说清缺的是哪一步', stale.note?.includes('缺少 v1 的迁移'));

  const future = decodeSave(encodeSave({ ...pristine, meta: { ...pristine.meta, schemaVersion: 99 } }), CURRENT_SCHEMA_VERSION);
  check('版本超前的存档 → 拒不加载（读不懂新字段的老代码会静默丢数据）', [future.save, future.diverted], [null, true]);
  truthy('提示里带上两边的版本号', future.note?.includes('schemaVersion'));

  const garbage = decodeSave('{这不是 JSON', CURRENT_SCHEMA_VERSION);
  check('坏存档 → 拒不加载', garbage.save, null);
  check('坏存档 → 同样分流（不静默丢掉玩家一年的记录）', garbage.diverted, true);
  truthy('提示里说清是解析失败', garbage.note?.includes('解析失败'));

  // ---- 迁移成功路径：v1 老档 → v2 ----
  // 这条用例的使命是先把 v1→v2 **钉死**（见 migrations.ts 的说明）：
  // 将来加了 v2→v3，这条用例就是"迁移链没有在迭代中退化成只能升最新版"的证据。
  const { MIGRATIONS } = await server.ssrLoadModule('/src/lib/migrations.ts');
  const MIG_NOW = new Date(2026, 9, 7, 2, 0); // 10-07 凌晨 2 点：归属日已是 10-07，所在周为 10-05
  const legacy = structuredClone(pristine);
  legacy.meta.schemaVersion = 1;
  // 造一份"真实的老档"：v2 时代才有的字段一律删掉，模拟 v1 的形状
  delete legacy.weeklies;
  delete legacy.player.attributeHistory;
  delete legacy.network.solverLog;
  for (const q of Object.values(legacy.quests.byId)) delete q.linkedContactIds;
  // v4 才有的 Contact.note 也一样删掉 —— 不删的话这条用例验的就不是迁移，
  // 而是"迁移对已经齐全的字段什么也没做"
  for (const c of legacy.network.contacts) delete c.note;
  // v5 才有的两个字段同理（老记录全是"从目录里挑的"，这两栏本来不存在）
  for (const r of legacy.milestones.records) {
    delete r.customTitle;
    delete r.customCategory;
  }
  // v6 才有的那两格（成就的解锁时刻与待看队列）同理 —— 老档里它们根本不存在
  delete legacy.unlockables.achievementUnlockedAt;
  delete legacy.unlockables.pendingAchievementIds;
  // 但 `achievementIds` 从 Phase 1 起就在那儿：给它塞一枚，
  // 下面"一字不动"那条才有东西可对质（对着一个空数组说"没动"等于没说）
  legacy.unlockables.achievementIds = ['ac_fudan_gravity'];

  const migrated = decodeSave(encodeSave(legacy), CURRENT_SCHEMA_VERSION, MIGRATIONS, MIG_NOW);
  truthy('v1 老档 → 迁移成功，而不是分流', migrated.save);
  check('迁移成功不转存 backup（数据没丢，凭什么转存）', migrated.diverted, false);
  truthy('提示里说明发生了迁移', migrated.note?.includes('迁移'));
  check('版本已升到当前', migrated.save.meta.schemaVersion, CURRENT_SCHEMA_VERSION);
  // 不写死 [[1,2]]：链上每长出一节，这条就该跟着长一节。
  // 它真正要钉的是"**逐级**升级"——如果哪天有人图省事把它改成 v1 直蹦最新版，
  // 中间那几节的历史就再也补不回来了（老档里 v2 才有的字段会缺一大块）。
  const hops = migrated.save.meta.migrationHistory.map((m) => [m.from, m.to]);
  check('迁移史留痕：从哪来、到哪去', hops, Array.from({ length: CURRENT_SCHEMA_VERSION - 1 }, (_, i) => [i + 1, i + 2]));
  check(
    '迁移是逐级走的，没有一步蹦到最新版',
    hops.every(([from, to]) => to === from + 1),
    true,
  );
  check(
    '补齐 weeklies：幂等键定在"迁移这一周"，老档刚迁完不弹一张空的上周结算',
    migrated.save.weeklies.lastSettledWeekStart,
    '2026-10-05',
  );
  check(
    '补齐的容器是空的，不是编出来的假账',
    [migrated.save.weeklies.definitions, migrated.save.weeklies.logs, migrated.save.network.solverLog, migrated.save.player.attributeHistory],
    [[], {}, [], []],
  );
  check(
    '老任务一律补 linkedContactIds: []（老任务没绑过任何人）',
    Object.values(migrated.save.quests.byId).every((q) => Array.isArray(q.linkedContactIds) && q.linkedContactIds.length === 0),
    true,
  );
  // v3 → v4：给老联系人补 `note: null` —— **补的是空，不是内容**。
  // 这条很容易被写成"给老档也补一段描述"，那样卡片上就会多出一句
  // 玩家从没写过的话。迁移只许补形状，不许替玩家说话。
  check(
    'v3 老档的联系人一律补 note: null（不是空串，更不是一句编的话）',
    migrated.save.network.contacts.map((c) => c.note),
    [null, null, null],
  );
  // v4 → v5：老里程碑记录一律补两个 null，而 `definitionId` **一个字都不动**。
  // 这一条最容易被写成"顺手把查不到定义的记录标成自定义" —— 那样做的话，
  // 目录里某天真的删掉一条定义，老玩家那条记录就会当场变成"自己写的"，
  // 而它是从目录里挑的（`milestoneWall` 的 `custom` 判据专门为此写成 definitionId === null）。
  check(
    'v4 老档的里程碑记录一律补 customTitle / customCategory: null',
    migrated.save.milestones.records.map((r) => [r.customTitle, r.customCategory]),
    [[null, null]],
  );
  check(
    '不搬动已有数据：老记录的 definitionId 原样（有定义的谁也不许被改成"自己写的"）',
    migrated.save.milestones.records.map((r) => r.definitionId),
    ['rm_first_income'],
  );
  // v5 → v6：成就那两格补空。**尤其不补造日期** —— 那些事发生在哪一天，老档里
  // 没有人记过；编一个出来，陈列馆就会把那行假日子印在徽记下面。
  // 补发也不在这里做：那是 `syncAchievements` 每次从头重算的活（见 ㉘）。
  check('v5 老档补 achievementUnlockedAt: {}（不补造日期）',
    migrated.save.unlockables.achievementUnlockedAt, {});
  check('v5 老档补 pendingAchievementIds: []（补发是引擎的活，不是迁移的活）',
    migrated.save.unlockables.pendingAchievementIds, []);
  check('v5 老档的已解锁名单一字不动',
    migrated.save.unlockables.achievementIds, legacy.unlockables.achievementIds);

  // "只补数据，不搬立场"：迁移不借机改写玩家的记录 —— 拿一条旧任务的标题对质
  check('不搬动已有数据：任务标题原样', migrated.save.quests.byId['q_cb_repro_figure'].title, '复现一张图的尊严');
  check('不搬动已有数据：玩家数值原样', migrated.save.player.freeAttributePoints, 2);
  // 阶段与评级是**已经发生过的观测**，迁移不许把它们改成"没观测"
  check(
    '不搬动已有数据：老联系人的阶段与评级原样（有观测的人不许被迁移成"还没定过"）',
    migrated.save.network.contacts.map((c) => [c.stage, c.currentGrade]),
    [['trusted', 'A'], ['connected', 'B'], ['dormant', 'C']],
  );
  check('迁移产物仍是纯 JSON', scan(migrated.save), null);
  check('迁移后仍可被纯函数推进', checkDaily(migrated.save, 'd_paper_figure', MIG_NOW) !== migrated.save, true);

  // 存储通道本身
  check('服务端没有 window → 不抛错，返回 null', resolveStorage(), null);

  const mem = createMemoryStorage();
  mem.setItem(STORAGE_KEYS.state, 'x');
  check('内存兜底可读可写', mem.getItem(STORAGE_KEYS.state), 'x');
  check('读不存在的键 → null', mem.getItem('nope'), null);
  mem.removeItem(STORAGE_KEYS.state);
  check('删掉就真没了', mem.getItem(STORAGE_KEYS.state), null);

  // -------------------------------------------------------------------------
  console.log('\n【⑮ 跨天结算：扣谁的分，扣多少】');
  // -------------------------------------------------------------------------
  const { runDailyRollover, dismissRolloverNotice } = await server.ssrLoadModule('/src/store/operations.ts');
  const { activeDayKey, shiftDayKey, endOfDay } = await server.ssrLoadModule('/src/lib/format.ts');

  // 01:00 是切换线：00:59 还算昨天，01:00 已经是今天
  check('00:59 仍算前一天', activeDayKey(new Date(2026, 9, 7, 0, 59), 1), '2026-10-06');
  check('01:00 翻到今天', activeDayKey(new Date(2026, 9, 7, 1, 0), 1), '2026-10-07');
  check('23:59 是今天', activeDayKey(new Date(2026, 9, 7, 23, 59), 1), '2026-10-07');
  check('切换时刻可配置（设为 4 点时 02:00 仍是昨天）', activeDayKey(new Date(2026, 9, 7, 2, 0), 4), '2026-10-06');
  check('跨月往回退', shiftDayKey('2026-03-01', -1), '2026-02-28');
  check('跨年往回退', shiftDayKey('2026-01-01', -1), '2025-12-31');
  check('往前推也一样', shiftDayKey('2026-02-28', 1), '2026-03-01');
  // 用时间戳算命会在这里出错：2026-10-06 的次日等于它 + 86400s，
  // 而"一天"并不总是 86400 秒（夏令时）。所以这条必须由日历算出来。
  check('结算末尾时刻落在该日 23:59', endOfDay('2026-10-06').getDate(), 6);

  const R_NOW = new Date(2026, 9, 7, 2, 0); // 10-07 凌晨 2 点：已过 01:00，昨天该结账了
  const r0 = createMockState();
  check('结算前：指针停在 10-05', r0.dailies.lastSettledLocalDate, '2026-10-05');
  check('结算前：没有待看的浮层', r0.dailies.pendingRolloverNotice, null);

  const { next: r1, result: res } = runDailyRollover(r0, R_NOW);
  truthy('跨天 → 产出结算结果', res);
  check('结算的是刚结束的那一天，不是"今天"', [res.fromLocalDate, res.toLocalDate], ['2026-10-06', '2026-10-07']);
  check('漏做的只有一条：d_commit', res.missed.map((m) => m.id), ['d_commit']);
  check('扣分 = 两条目的 penaltyExp 之和吗？不是 —— 只扣漏的那条', res.totalExpPenalty, 105);
  check('连击断的是它，长度 14', res.brokenStreaks, [{ id: 'd_commit', title: '代码提交（哪怕只有一行）', streakLost: 14 }]);
  check('保住的连击数 2（正面反馈优先展示）', res.keptStreakCount, 2);
  check('当日净收 = 已得 161 − 罚 105', res.netExp, 56);

  const dCommit = r1.dailies.definitions.find((d) => d.id === 'd_commit');
  check('漏做的连击归零', dCommit.streak, 0);
  check('bestStreak 不被抹掉（它确实发生过）', dCommit.bestStreak, 14);
  check('打满的两条连击不动', r1.dailies.definitions.find((d) => d.id === 'd_sleep').streak, 22);

  const cb0 = r0.careers.tracks.find((t) => t.classId === 'computational_biology');
  const cb1 = r1.careers.tracks.find((t) => t.classId === 'computational_biology');
  check('扣的是归属职业线的经验', cb0.exp - cb1.exp, 105);
  // d_sleep 没有归属职业线 → 它要是漏了，就只断连击、不扣任何一条线的经验
  check('无归属的日常不动职业线', r1.careers.tracks.length, r0.careers.tracks.length);

  check('结算痕迹写进当日日志', [r1.dailies.logs['2026-10-06'].missedIds, r1.dailies.logs['2026-10-06'].expPenalized], [['d_commit'], 105]);
  check('指针推进到已结算的那一天', r1.dailies.lastSettledLocalDate, '2026-10-06');
  check('结果挂进存档，等 UI 取走', r1.dailies.pendingRolloverNotice.fromLocalDate, '2026-10-06');
  check('入参未被就地修改', r0.dailies.lastSettledLocalDate, '2026-10-05');

  // 幂等：开机、切回前台、每分钟问一次 —— 它会被反复调用
  const r2 = runDailyRollover(r1, R_NOW);
  check('同一天再问一次 → 原对象返回（store 靠引用相等短路，不写盘）', r2.next === r1, true);
  check('同一天不会再结算一次', r2.result, null);
  const r3 = runDailyRollover(r1, new Date(2026, 9, 7, 23, 30)); // 同一天的白天
  check('同一天的其它时刻也不会再触发', r3.result, null);

  // 只结算一天。缺席五天不是五倍的账 —— 那是收债，而且是对刚回来的人收债
  const away = runDailyRollover(r0, new Date(2026, 9, 11, 9, 0));
  check('离开 4 天后回来，只结最近这一天的账', away.result.fromLocalDate, '2026-10-10');
  check('指针只推到最近这一天，不逐日补算', away.next.dailies.lastSettledLocalDate, '2026-10-10');

  // 只罚"那天已经存在"的日常：昨天才建的，不该为昨天扣分
  const newborn = {
    ...r0,
    dailies: {
      ...r0.dailies,
      definitions: r0.dailies.definitions.map((d) =>
        d.id === 'd_commit' ? { ...d, createdAt: '2026-10-06T23:00:00.000Z' } : d,
      ),
    },
  };
  check(
    '昨晚 23:00 才建的日常，不为昨天扣分',
    runDailyRollover(newborn, R_NOW).result.missed.map((m) => m.id),
    [],
  );
  check('于是罚分为 0，但结算照常发生', runDailyRollover(newborn, R_NOW).result.totalExpPenalty, 0);

  // 扣分不做 0 下限：见 operations.ts 的说明 —— 一旦钳住，
  // 这个惩罚就会在最需要它的时候（经验见底时）完全失效
  const lowExp = {
    ...r0,
    careers: {
      ...r0.careers,
      tracks: r0.careers.tracks.map((t) => (t.classId === 'computational_biology' ? { ...t, exp: 10 } : t)),
    },
  };
  check('经验见底时照样扣穿，不钳到 0', runDailyRollover(lowExp, R_NOW).next.careers.tracks.find((t) => t.classId === 'computational_biology').exp, -95);

  // 全打满的日子：结果依然生成（"今天全部打满"也要说一声），但不扣分
  const perfect = {
    ...r0,
    dailies: {
      ...r0.dailies,
      logs: { ...r0.dailies.logs, '2026-10-06': { ...r0.dailies.logs['2026-10-06'], checkedIds: ['d_sleep', 'd_paper_figure', 'd_commit'] } },
    },
  };
  const perfectRun = runDailyRollover(perfect, R_NOW);
  check('全部打满 → 不扣分、不断连击', [perfectRun.result.totalExpPenalty, perfectRun.result.brokenStreaks], [0, []]);
  check('全部打满 → 三条连击都还在往前走', perfectRun.result.keptStreakCount, 3);
  truthy('全部打满 → 仍然出浮层（"一件没落"值得说）', perfectRun.result);

  const dismissed = dismissRolloverNotice(r1);
  check('收起浮层', dismissed.dailies.pendingRolloverNotice, null);
  check('收起浮层不碰别的（连击还是 0）', dismissed.dailies.definitions.find((d) => d.id === 'd_commit').streak, 0);
  check('没浮层时再收一次 → 原对象返回', dismissRolloverNotice(dismissed) === dismissed, true);

  // -------------------------------------------------------------------------
  console.log('\n【⑯ 进化树：迷雾里不许漏出任何内容】');
  // -------------------------------------------------------------------------
  const { evolutionView, chapterMap, milestoneWall } = await server.ssrLoadModule('/src/lib/selectors.ts');
  const { EVOLUTION_BRANCH_LABELS, EVOLUTION_FOG_LINE } = await server.ssrLoadModule('/src/data/catalog/endgame.ts');

  const fogState = createMockState();
  check('初始存档里它是静默的', fogState.evolution.revealed, false);

  const fog = evolutionView(fogState);
  check('迷雾态的判别式', fog.revealed, false);
  // 「只读 revealed 一个字段」这件事得能被测出来：多读一个，键就会多一个
  check('迷雾态只有四个键，没多读任何一个字段', Object.keys(fog).sort(), ['branchCount', 'line', 'maxTier', 'revealed']);
  check('迷雾态不携带分支', 'branches' in fog, false);

  const fogText = JSON.stringify(fog);
  for (const [id, label] of Object.entries(EVOLUTION_BRANCH_LABELS)) {
    check(`迷雾里查不到分支名「${label}」(${id})`, fogText.includes(label), false);
  }
  for (const node of fogState.evolution.nodes) {
    if (fogText.includes(node.name)) {
      check(`迷雾里查到了节点名「${node.name}」`, false, true);
      break;
    }
  }
  truthy('全树节点名都没有漏出去', fogState.evolution.nodes.every((n) => !fogText.includes(n.name)));
  check('连"点亮了几个"都不说', /litNodeCount|totalNodeCount|progress/.test(fogText), false);
  check('题记就是那一句', fog.line, EVOLUTION_FOG_LINE);

  // 迷雾的形状是几何信息（肉眼本来就看得见），但它不该随进度变化 ——
  // 否则"迷雾的厚度"会变成一根进度条
  const litMore = { ...fogState, evolution: { ...fogState.evolution, stats: { ...fogState.evolution.stats, litNodeCount: 5 } } };
  check('点亮更多节点，迷雾一个字都不变', JSON.stringify(evolutionView(litMore)), fogText);

  // 揭晓之后才给真身
  const revealed = { ...fogState, evolution: { ...fogState.evolution, revealed: true, revealedAt: '2026-10-07T00:00:00.000Z' } };
  const view = evolutionView(revealed);
  check('揭晓态的判别式', view.revealed, true);
  check('六条分支，顺序固定', view.branches.length, 6);
  check('分支是按"先驯服了什么"排的，不是枚举顺序', view.branches.map((b) => b.label).slice(0, 2), ['生命的计算', '衰老的边界']);
  check('每条分支都带题记', view.branches.every((b) => typeof b.epigraph === 'string' && b.epigraph.length > 0), true);
  check('点亮数 = 节点里 lit 的个数', view.litNodeCount, revealed.evolution.nodes.filter((n) => n.lit).length);
  check('节点总数对得上', view.totalNodeCount, revealed.evolution.nodes.length);
  check('分支内节点按阶层升序', view.branches.every((b) => b.nodes.every((n, i) => i === 0 || b.nodes[i - 1].tier <= n.tier)), true);
  check('每个节点都带阶层名', view.branches.every((b) => b.nodes.every((n) => typeof n.tierLabel === 'string' && n.tierLabel.length > 0)), true);

  // 九章地图：Ch.9 与进化树是同一个秘密，它必须是一个空槽位
  const map = chapterMap(fogState);
  check('九章一座不缺', map.length, 9);
  const ch9 = map.find((n) => n.id === 'CH9');
  check('Ch.9 是隐藏态', ch9.status, 'hidden');
  check('隐藏的章节连标题都不给', [ch9.title, ch9.subtitle], ['——', '']);
  check('未完成的章节照样显示名字（遮住地图只会让人迷路）', map.find((n) => n.id === 'CH4').title.length > 0, true);
  check('Ch.1 正在进行', map.find((n) => n.id === 'CH1').status, 'active');
  check('没有一章被算成完成', map.filter((n) => n.status === 'completed').length, 0);

  // 里程碑墙
  const wall = milestoneWall(fogState);
  check('墙上只有一条（mock 就记了一条）', wall.length, 1);
  check('按"写下来的时间"倒序，不是事件发生的日期', wall.map((w) => w.record.id), ['rmr_0001']);
  check('标题来自 catalog，不是存档里的裸 id', wall[0].title, '第一笔自己赚的钱');
  check('展示日期优先取"事情发生的日子"', wall[0].displayDate, '2026-09-25');
  check('没填发生日期时退回记录日', (() => {
    const noOccurred = { ...fogState, milestones: { ...fogState.milestones, records: [{ ...fogState.milestones.records[0], occurredOn: null }] } };
    return milestoneWall(noOccurred)[0].displayDate;
  })(), '2026-09-25');
  check('墙不改存档', fogState.milestones.records.length, 1);

  // -------------------------------------------------------------------------
  console.log('\n【⑰ 每周规程：周一 01:00 统一结算】');
  // -------------------------------------------------------------------------
  const { checkWeekly, createWeekly } = await server.ssrLoadModule('/src/store/operations.ts');

  const W_MON_0030 = new Date(2026, 9, 5, 0, 30); // 周一 00:30：归属日还停在周日
  const W_MON_0100 = new Date(2026, 9, 5, 1, 0); // 周一 01:00：归属日跨进新的一周 —— 翻牌线
  const w0 = createMockState();
  check('结算前：周幂等键停在 09-21', w0.weeklies.lastSettledWeekStart, '2026-09-21');

  // 00:30 —— 上一周还没被锁死（activeDay 还在周日），两条线都不许动
  const monEarly = runDailyRollover(w0, W_MON_0030);
  check('周一 00:30：日账不结（周日才刚开始）', monEarly.result, null);
  check('周一 00:30：周账也不结 —— 差半小时也不能提前翻牌', monEarly.next === w0, true);

  // 01:00 —— 上周被完整锁定，翻牌
  const mon = runDailyRollover(w0, W_MON_0100);
  check('周一 01:00：日账仍不结（昨天 10-04 早已结过）', mon.result, null);
  const wNotice = mon.next.weeklies.pendingWeeklyNotice;
  truthy('周一 01:00：周账翻牌', wNotice);
  check('结算的是刚结束的那个完整周（周一 → 周日）', [wNotice.weekStart, wNotice.weekEnd], ['2026-09-28', '2026-10-04']);
  check('漏的只有 w_run 一条', wNotice.missed.map((m) => m.id), ['w_run']);
  check('罚分 = 该条的 penaltyExp', wNotice.totalExpPenalty, 150);
  check('断的是它的 2 周连击', wNotice.brokenStreaks, [{ id: 'w_run', title: '跑两次步', streakLost: 2 }]);
  check('保住的 2 条照常计数（正面反馈优先展示）', wNotice.keptStreakCount, 2);
  check('那周完成了 2/3', wNotice.completedCount, 2);
  check('上周净收 = 已得 210 − 罚 150', wNotice.netExp, 60);

  const wRunDef = mon.next.weeklies.definitions.find((w) => w.id === 'w_run');
  check('漏的连击归零', wRunDef.streak, 0);
  check('bestStreak 不被抹掉（它确实发生过）', wRunDef.bestStreak, 6);
  check('打满的两条连击不动', mon.next.weeklies.definitions.find((w) => w.id === 'w_plan').streak, 3);

  // 扣分只扣归属线：w_run 是通用周常（classId 为 null）——
  // 它漏了只清零连击，一条职业线都不许动（与日常同一套口径）
  const wCb0 = w0.careers.tracks.find((t) => t.classId === 'computational_biology');
  const wCb1 = mon.next.careers.tracks.find((t) => t.classId === 'computational_biology');
  check('通用周常不进任何职业线', wCb0.exp - wCb1.exp, 0);

  check(
    '结算痕迹写进那一周自己的记录里（账本要能自证）',
    [
      mon.next.weeklies.logs['2026-09-28'].missedIds,
      mon.next.weeklies.logs['2026-09-28'].expPenalized,
      mon.next.weeklies.logs['2026-09-28'].settled,
    ],
    [['w_run'], 150, true],
  );
  check('幂等键推进到已结算的那一周', mon.next.weeklies.lastSettledWeekStart, '2026-09-28');
  check('入参未被就地修改', w0.weeklies.lastSettledWeekStart, '2026-09-21');

  const monAgain = runDailyRollover(mon.next, W_MON_0100);
  check('同一时刻再问一次 → 原对象返回', monAgain.next === mon.next, true);
  const monLater = runDailyRollover(mon.next, new Date(2026, 9, 7, 2, 0)); // 周三凌晨
  check('这一周之内不会再结第二次', monLater.next.weeklies.lastSettledWeekStart, '2026-09-28');
  check('周三那次翻的是日牌（10-06 漏了 d_commit）', monLater.result.fromLocalDate, '2026-10-06');

  // 空周：不留空结算、不弹空浮层 —— 只安静地把幂等键推过去
  const hollow = {
    ...w0,
    weeklies: { definitions: [], logs: {}, lastSettledWeekStart: '2026-09-21', pendingWeeklyNotice: null },
  };
  const hollowRun = runDailyRollover(hollow, W_MON_0100);
  check('空周：只推进幂等键', hollowRun.next.weeklies.lastSettledWeekStart, '2026-09-28');
  check('空周：不弹空浮层、不留空记录', [hollowRun.next.weeklies.pendingWeeklyNotice, Object.keys(hollowRun.next.weeklies.logs)], [null, []]);

  // 只罚"整周都已经存在"的周常：周中新写的条目不背上一周的账
  const newbornWeekly = {
    ...w0,
    weeklies: {
      ...w0.weeklies,
      definitions: w0.weeklies.definitions.map((w) =>
        w.id === 'w_run' ? { ...w, createdAt: '2026-09-30T10:00:00.000Z' } : w,
      ),
    },
  };
  const nwRun = runDailyRollover(newbornWeekly, W_MON_0100);
  check('周中新写的周常，不为那一周负责', nwRun.next.weeklies.pendingWeeklyNotice.missed, []);
  check('于是罚分 0，但结算照常发生', nwRun.next.weeklies.pendingWeeklyNotice.totalExpPenalty, 0);

  // 漏了归属周常：罚分扣进那条职业线（w_reading → 计算生物学）
  const missReading = {
    ...w0,
    weeklies: {
      ...w0.weeklies,
      logs: { ...w0.weeklies.logs, '2026-09-28': { ...w0.weeklies.logs['2026-09-28'], checkedIds: ['w_plan'] } },
    },
  };
  const mr = runDailyRollover(missReading, W_MON_0100);
  const mrCb0 = missReading.careers.tracks.find((t) => t.classId === 'computational_biology');
  const mrCb1 = mr.next.careers.tracks.find((t) => t.classId === 'computational_biology');
  check('漏了归属周常 → 扣到那条职业线上', mrCb0.exp - mrCb1.exp, 225);

  // ---- 打钩与创建（与日常同一套骨架，两处刻意的不一样）----
  const wk0 = createMockState();
  const wk1 = checkWeekly(wk0, 'w_run', W_MON_0100);
  truthy('打钩返回新状态', wk1 !== wk0);
  check('打钩进入本周的记账盘', wk1.weeklies.logs['2026-10-05'].checkedIds.includes('w_run'), true);
  check('连击 2 → 3', wk1.weeklies.definitions.find((w) => w.id === 'w_run').streak, 3);
  check(
    '周常没有连击加成：发多少就是多少（streakBonusPerDay 是按天的尺子）',
    wk1.weeklies.logs['2026-10-05'].expEarned - wk0.weeklies.logs['2026-10-05'].expEarned,
    100,
  );
  check('重复打钩 → 原对象返回', checkWeekly(wk1, 'w_run', W_MON_0100) === wk1, true);
  const wr0 = wk0.careers.tracks.find((t) => t.classId === 'computational_biology');
  const wr1 = checkWeekly(wk0, 'w_reading', W_MON_0100).careers.tracks.find(
    (t) => t.classId === 'computational_biology',
  );
  check('归属周常的经验记进职业线', wr1.exp - wr0.exp, 150);

  check('空标题 → 原对象返回', createWeekly(wk0, { title: '   ', classId: null, rewardExp: 60 }, W_MON_0100) === wk0, true);
  const wkNew = createWeekly(wk0, { title: '  写一封信  ', classId: null, rewardExp: 60 }, W_MON_0100);
  const newDef = wkNew.weeklies.definitions.at(-1);
  check('红线：新建的一律记为玩家创建', newDef.origin, 'player_created');
  check('标题已 trim', newDef.title, '写一封信');
  check('惩罚在创建时定格：60 × 1.5', [newDef.reward.exp, newDef.penaltyExp], [60, 90]);
  check('新周常从 0 开始数', [newDef.streak, newDef.bestStreak], [0, 0]);
  check(
    '奖励封顶走同一枚旋钮（改政策不影响已创建的条目）',
    createWeekly(wk0, { title: '巨款', classId: null, rewardExp: 999999 }, W_MON_0100).weeklies.definitions.at(-1).reward.exp,
    wk0.settings.rewardPolicy.maxExpPerQuest,
  );

  // -------------------------------------------------------------------------
  console.log('\n【⑱ 人物属性：任务只记账，涨点只走手动分配】');
  // -------------------------------------------------------------------------
  const { spendAttributePoint } = await server.ssrLoadModule('/src/store/operations.ts');
  const { attributeRows, recentAttributeNotes } = await server.ssrLoadModule('/src/lib/selectors.ts');
  const { ATTRIBUTE_BAR_MAX } = await server.ssrLoadModule('/src/data/catalog/attributes.ts');

  const a0 = createMockState();
  check('池里有 2 点（mock 预设）', a0.player.freeAttributePoints, 2);

  const a1 = spendAttributePoint(a0, 'foc', W_MON_0100);
  truthy('加点返回新状态', a1 !== a0);
  check('值 +1', a1.player.attributes.foc, a0.player.attributes.foc + 1);
  check('池 −1', a1.player.freeAttributePoints, 1);
  const pointDelta = a1.player.attributeHistory.at(-1);
  check(
    '留痕：questId 为 null —— 这一次点击是"我的决定"，不是任务的账',
    [pointDelta.key, pointDelta.delta, pointDelta.reason, pointDelta.questId],
    ['foc', 1, '手动分配', null],
  );
  check('入参未被就地修改', [a0.player.attributes.foc, a0.player.freeAttributePoints], [17, 2]);

  const a2 = spendAttributePoint(spendAttributePoint(a1, 'vit', W_MON_0100), 'cha', W_MON_0100);
  check('池子清空', a2.player.freeAttributePoints, 0);
  check('池空 → 原对象返回（没有可花的东西时什么都不发生）', spendAttributePoint(a2, 'vit', W_MON_0100) === a2, true);

  // 任务只记账：造一份"这条练到 2 维"的 fixture，走 执行中 → 待结算 → 完成
  const k0 = createMockState();
  const kLinked = {
    ...k0,
    quests: {
      ...k0.quests,
      byId: { ...k0.quests.byId, q_cb_docker: { ...k0.quests.byId.q_cb_docker, linkedAttributes: ['int', 'foc'] } },
    },
  };
  const kDone = completeQuest(
    openTurnIn(kLinked, 'q_cb_docker', NET_NOW),
    'q_cb_docker',
    { reflection: '', bonusPct: 0, bonusReason: null, verdict: null },
    NET_NOW,
  );
  check(
    '完成不涨属性值、不动池子（任务只记账）',
    [kDone.player.attributes.int, kDone.player.freeAttributePoints],
    [kLinked.player.attributes.int, kLinked.player.freeAttributePoints],
  );
  check(
    '只留痕"这条练到了"：delta 0、questId 指向那条任务',
    kDone.player.attributeHistory.slice(-2).map((d) => [d.key, d.delta, d.questId]),
    [['int', 0, 'q_cb_docker'], ['foc', 0, 'q_cb_docker']],
  );
  check('留痕的理由就是任务标题', kDone.player.attributeHistory.at(-1).reason, kLinked.quests.byId.q_cb_docker.title);

  const kNote = recentAttributeNotes(kDone, 8)[0];
  check('近期记录：同一任务的记账折叠成一行', [kNote.questId, kNote.attributeKeys.sort(), kNote.allocated], ['q_cb_docker', ['foc', 'int'], 0]);
  const spentNote = recentAttributeNotes(spendAttributePoint(kDone, 'wil', NET_NOW), 8)[0];
  check('手动分配行独立成行，且带着 +1', [spentNote.questId, spentNote.allocated, spentNote.label], [null, 1, '手动分配']);

  // 面板行视图（selector）：顺序、尺子、权重全都现读
  const rows = attributeRows(a0);
  check('六维齐全、顺序取 core 的顺序', rows.map((r) => r.key), ['vit', 'int', 'foc', 'cha', 'wil', 'cap']);
  check(
    '尺子位置 = 值 / 60（60 只是刻度，不是上限）',
    [rows.find((r) => r.key === 'foc').value, rows.find((r) => r.key === 'foc').ratio],
    [17, 17 / ATTRIBUTE_BAR_MAX],
  );
  check(
    '超过刻度不截断数值，只把条画满',
    attributeRows({ ...a0, player: { ...a0.player, attributes: { ...a0.player.attributes, foc: 999 } } }).find(
      (r) => r.key === 'foc',
    ).ratio,
    1,
  );
  check(
    '权重从职业线现读：智识关联三条线，按高→低（不是 catalog 硬编码）',
    rows.find((r) => r.key === 'int').weights.map((w) => [w.classId, w.weight]),
    [['computational_biology', 0.4], ['social_media_influencer', 0.2], ['investor', 0.15]],
  );
  check(
    '魅力的权重来自两条"对外"的线',
    rows.find((r) => r.key === 'cha').weights.map((w) => [w.classId, w.weight]),
    [['social_media_influencer', 0.4], ['startup_entrepreneur', 0.3]],
  );

  // -------------------------------------------------------------------------
  console.log('\n【⑲ 悬赏中枢四联：四个桶各走各的】');
  // -------------------------------------------------------------------------
  const { consultNetworkSolver, createContactQuest } = await server.ssrLoadModule('/src/store/operations.ts');
  const { inHandQuests } = await server.ssrLoadModule('/src/lib/selectors.ts');

  const t0 = createMockState();
  const tIn = inHandQuests(t0).map((q) => q.id);
  check('进行中 = 已领取 + 执行中 + 待结算', tIn, ['q_cb_docker', 'q_inv_pain_audit']);
  check('悬赏板 = 已过审、等领取', claimableQuests(t0).map((q) => q.id), ['q_cb_questions']);
  check('待议 = 等逐条审核的草稿', draftQuests(t0).map((q) => q.id), ['q_inv_rulebook']);
  const bucketIds = [inHandQuests(t0), claimableQuests(t0), draftQuests(t0)].flatMap((b) => b.map((q) => q.id));
  check('三个桶互斥：没有一条任务同时在两处', new Set(bucketIds).size, bucketIds.length);

  // 「进行中」的完整走位：执行中 → 点击完成（先进待结算）→ 结算
  const tTurn = openTurnIn(t0, 'q_cb_docker', NET_NOW);
  check('点击完成 → 先进待结算（中途刷新也不丢）', tTurn.quests.byId['q_cb_docker'].status, 'turn_in_pending');
  check('待结算也在「进行中」里（就差你确认）', inHandQuests(tTurn).map((q) => q.id).includes('q_cb_docker'), true);
  const tDone = completeQuest(tTurn, 'q_cb_docker', { reflection: '', bonusPct: 0, bonusReason: null, verdict: null }, NET_NOW);
  check('结算 → completed，离开四个桶', inHandQuests(tDone).map((q) => q.id).includes('q_cb_docker'), false);

  // 闭环：任务完成 → 关系账本上落一条（channel 记 other：它不必真的发生过"沟通"）
  const lin0 = t0.network.contacts.find((c) => c.id === 'c_lin');
  const lin1 = tDone.network.contacts.find((c) => c.id === 'c_lin');
  const linkedIt = lin1.interactions.at(-1);
  check('绑定联系人名下多一条互动', lin1.interactions.length - lin0.interactions.length, 1);
  check(
    '互动记得住是哪条任务驱动的',
    [linkedIt.channel, linkedIt.questId, linkedIt.summary],
    ['other', 'q_cb_docker', `完成了「${t0.quests.byId.q_cb_docker.title}」`],
  );
  check(
    '温度 / 信任微升 2，不是刷分',
    [lin1.dimensions.warmth - lin0.dimensions.warmth, lin1.dimensions.trust - lin0.dimensions.trust],
    [2, 2],
  );

  // 前置换挡：桥上那条解禁之前，悬赏板上的它是灰的 —— 而且状态机上真的领不动
  check('前置未完成 → 领取原对象返回（UI 的 disabled 只是展示，状态机自己拦）', claimQuest(t0, 'q_cb_questions', NET_NOW) === t0, true);
  check('前置完成 → 同一条解禁', claimQuest(tDone, 'q_cb_questions', NET_NOW) !== tDone, true);

  // 派生行动任务：玩家亲手写的，一步到位进「进行中」，不经过审核门控
  const der = createContactQuest(t0, 'c_zhao', { title: '  请老赵喝一次咖啡  ' }, NET_NOW);
  const derId = der.quests.order.at(-1);
  check('直接落在「进行中」', der.quests.byId[derId].status, 'active');
  check('绑定的是这个人', der.quests.byId[derId].linkedContactIds, ['c_zhao']);
  check(
    '不进悬赏板、不进待议（它不是 AI 草稿，没有需要防的东西）',
    [claimableQuests(der).length, draftQuests(der).length],
    [claimableQuests(t0).length, draftQuests(t0).length],
  );
  check('origin.agentId 为 null：这是玩家写的，不是 AI 浇的', der.quests.byId[derId].origin.agentId, null);
  check('标题已 trim', der.quests.byId[derId].title, '请老赵喝一次咖啡');
  check('未知联系人 → 原对象返回', createContactQuest(t0, 'c_nobody', { title: 'x' }, NET_NOW) === t0, true);
  check('空标题 → 原对象返回', createContactQuest(t0, 'c_zhao', { title: '   ' }, NET_NOW) === t0, true);

  // 派生 → 完成 → 关系账本也落一条（同一条闭环，入口在卡片上）
  const derDone = completeQuest(
    openTurnIn(der, derId, NET_NOW),
    derId,
    { reflection: '', bonusPct: 0, bonusReason: null, verdict: null },
    NET_NOW,
  );
  const zhao0 = t0.network.contacts.find((c) => c.id === 'c_zhao');
  const zhao1 = derDone.network.contacts.find((c) => c.id === 'c_zhao');
  check('派生任务完成 → 老赵那边的互动 +1', zhao1.interactions.length - zhao0.interactions.length, 1);
  check(
    '温度 76 → 78、信任 74 → 76',
    [zhao1.dimensions.warmth, zhao1.dimensions.trust],
    [zhao0.dimensions.warmth + 2, zhao0.dimensions.trust + 2],
  );
  check('评级是快照，不重算（重算留到 Phase 5）', zhao1.currentGrade, zhao0.currentGrade);

  // 全局社交检索：「人话」与「诚实」两条路各钉一遍
  check('空问题 → 原对象返回（没有可检索的东西）', consultNetworkSolver(t0, '   ', NET_NOW) === t0, true);
  const sol1 = consultNetworkSolver(t0, '想找陈立聊聊下一步', NET_NOW);
  const solRec = sol1.network.solverLog[0];
  check('求助一次记一条', sol1.network.solverLog.length, 1);
  check('记录出处是智囊 Agent', solRec.agentId, 'agent_network_advisor');
  truthy('id 带 sol_ 前缀（玩家回看时认得出来它是什么）', solRec.id.startsWith('sol_'));
  truthy('问"陈立"命中的就是陈立本人（强信号：整词命中）', solRec.recommendations.some((r) => r.contactId === 'c_chen'));
  truthy('报告是一段人话', typeof solRec.report === 'string' && solRec.report.length > 20);
  check('每条推荐都带理由和开口方式（不是光给个人名）', solRec.recommendations.every((r) => r.reason.length > 0 && r.approach.length > 0), true);
  truthy('推荐不超过 2 位（不把通讯录倒给你）', solRec.recommendations.length <= 2);

  const solHonest = consultNetworkSolver(t0, 'zxqv wkk', NET_NOW);
  check('没有合适的人时不硬凑', solHonest.network.solverLog[0].recommendations, []);
  truthy('诚实原则写在 principle 里', solHonest.network.solverLog[0].principle.includes('撑大'));

  check('非幂等：再问一次是再记一条', consultNetworkSolver(sol1, 'x', NET_NOW).network.solverLog.length, 2);
  let ring = t0;
  for (let i = 0; i < 55; i++) ring = consultNetworkSolver(ring, `第${i}件困境`, NET_NOW);
  check('检索记录环形保留最近 50 条（存档不养大象）', ring.network.solverLog.length, 50);
  check('留下的确实是最新的', ring.network.solverLog.at(-1).question, '第54件困境');
  check('被丢掉的是最旧的', ring.network.solverLog[0].question, '第5件困境');
  // -------------------------------------------------------------------------
  console.log('\n【⑳ 篇章 DAG：离章自动判定与拓扑解锁】');
  // -------------------------------------------------------------------------
  const { syncChapters } = await server.ssrLoadModule('/src/lib/chapterEngine.ts');
  const { nameChapter, dismissChapterCeremony, milestoneGate, recordRealityMilestone, regenerateQuestChain, rerouteQuestDraft, chainsAwaitingRegeneration } =
    await server.ssrLoadModule('/src/store/operations.ts');
  const { HIDDEN_CHAPTER_IDS } = await server.ssrLoadModule('/src/data/catalog/chapters.ts');
  const { buildSaveFile, parseSaveFile, saveFileName, journalToPlainText, SAVE_FORMAT, looksLikeSaveFile } =
    await server.ssrLoadModule('/src/lib/saveFile.ts');
  const { localMonthKey } = await server.ssrLoadModule('/src/lib/format.ts');

  // 所有新用例共用同一个"现在"：10-07 晚上。注入 now 是全项目的纪律，
  // 没有任何一条判据被允许自己去读时钟。
  const P3_NOW = new Date(2026, 9, 7, 20, 0);

  // 引擎被挂在 store.mutate 上，每次点击都要跑一遍。它的第一纪律就是
  // "无事发生时返回同一个对象" —— 这条一旦破了，整个应用会在每一次点击后写一次盘。
  const chIdle = syncChapters(createMockState(), P3_NOW);
  check('引擎无实质变化时收敛（第二次调用返回同一引用）', syncChapters(chIdle, P3_NOW) === chIdle, true);

  // Ch.1 的离开条件照**真身**喂：连续 30 天打卡，用 checkDaily 一天一天打出来。
  // 不伪造"30 天有记录"这个结论，只造出导致它的事实。
  let chState = createMockState();
  for (let i = 29; i >= 0; i--) {
    chState = checkDaily(chState, 'd_sleep', new Date(2026, 9, 7 - i, 20, 0));
  }
  const ch1 = syncChapters(chState, P3_NOW).chapters.chapters.find((c) => c.id === 'CH1');
  check('30 天记录 → 离章条件逐条达成', ch1.conditionProgress.map((r) => [r.label.includes('连续'), r.met]), [[true, true], [false, true], [false, true]]);
  check('条件齐了 → Ch.1 自动通关（不靠玩家点任何按钮）', ch1.completed, true);

  const chDone = syncChapters(chState, P3_NOW);
  const ceremony = chDone.chapters.pendingCeremony;
  check('通关 → 排队一场待看的仪式，而不是静默翻页', ceremony.completedChapterId, 'CH1');
  check('仪式上显示目录里的代号（玩家还没给它起名字）', ceremony.completedCodename, 'BEYOND_TIMETABLE');
  check('DAG 拓扑解锁：Ch.2 / Ch.3 / Ch.5 / Ch.8 同时开门', ceremony.unlockedChapterIds, ['CH2', 'CH3', 'CH5', 'CH8']);
  check('没有前瞻解锁：Ch.4 要 Ch.2 或 Ch.3，此刻不开', ceremony.unlockedChapterIds.includes('CH4'), false);
  check('命名权交给新解锁的第一条非隐藏支线', ceremony.namingForChapterId, 'CH2');
  truthy('命名幕上给出下一章的目标作为语境（"为这个起个名字"）', typeof ceremony.namingContext === 'string' && ceremony.namingContext.length > 0);
  check('解锁的章进入 active，Ch.1 退出', chDone.chapters.activeChapterIds, ['CH2', 'CH3', 'CH5', 'CH8']);
  check('聚焦自动交接给刚解锁的那一章（玩家的目光本来就在那儿）', chDone.chapters.focusedChapterId, 'CH2');
  check('隐藏章不在仪式名单里（Ch.9 不该在任何地方被提前看见）', ceremony.unlockedChapterIds.some((id) => HIDDEN_CHAPTER_IDS.includes(id)), false);

  // —— 命名权交接 ——
  const named = nameChapter(chDone, 'CH2', '  墨线  ', 'candidate', P3_NOW);
  const ch2 = named.chapters.chapters.find((c) => c.id === 'CH2');
  check('命名写进那一章的存档', ch2.playerChosenCodename, '墨线');
  check('代号两侧空白被裁掉（空格不该成为一章的名字）', ch2.playerChosenCodename.length, 2);
  check('命名来源一并留档：候选池 vs 自拟', ch2.codenameSource, 'candidate');
  check('空白代号 → 原对象返回（命名权包含不起名的权利）', nameChapter(chDone, 'CH3', '   ', 'custom', P3_NOW) === chDone, true);
  check('重名同源 → 原对象返回（不产生无意义的写入）', nameChapter(named, 'CH2', '墨线', 'candidate', P3_NOW) === named, true);

  // 收起仪式是**独立的动作**，而它自己也要过一次引擎（store.mutate 的最后一道工序）：
  // 玩家合上一场仪式的同一个瞬间，引擎已经去看下一章够不够格了。
  const chDismissed = dismissChapterCeremony(chDone, P3_NOW);
  check('收起仪式 → 待看队列当场清空', chDismissed.chapters.pendingCeremony, null);
  check('收起仪式不会把已通关的事实也一起收走', chDismissed.chapters.chapters.find((c) => c.id === 'CH1').completed, true);

  // 一路收下去。Ch.8「同频者」的条件（一段双向深度关系）在初始存档里就已达成，
  // 所以 Ch.1 的仪式一收，紧接着站到面前的就是它 —— 这是对的：
  // 它全程并行、不阻塞任何线，够格就该办自己的那一场。
  let drive = chDone;
  let ceremonies = 0;
  for (let i = 0; i < 10; i++) {
    if (drive.chapters.pendingCeremony === null) break;
    ceremonies += 1;
    // 收起这一场 → 同一次写入里引擎去看下一章够不够格
    drive = syncChapters(dismissChapterCeremony(drive, P3_NOW), P3_NOW);
  }
  check('排队看完 → 队列清空，共办了两场（Ch.1 / Ch.8）', [drive.chapters.pendingCeremony, ceremonies], [null, 2]);
  check('两章各自通关一次，不吞也不叠', drive.chapters.chapters.filter((c) => c.completed).map((c) => c.id), ['CH1', 'CH8']);
  check('Ch.8 通关后聚焦不会留在已完成的章上', drive.chapters.activeChapterIds.includes(drive.chapters.focusedChapterId), true);

  // —— 一次只通关一章 ——
  // Ch.2 / Ch.3 的条件同时达成：仪式不能叠着弹，一章一章来。
  let multi = recordRealityMilestone(drive, { definitionId: 'rm_preprint_public', occurredOn: '2026-10-01', note: '', snapshots: [] }, P3_NOW);
  multi = recordRealityMilestone(multi, { definitionId: 'rm_overseas_experience', occurredOn: '2026-08-01', note: '', snapshots: [] }, P3_NOW);
  const firstOfTwo = syncChapters(multi, P3_NOW);
  check('两章同时够格 → 一次只通关一章', firstOfTwo.chapters.chapters.filter((c) => c.completed).map((c) => c.id), ['CH1', 'CH2', 'CH8']);
  check('这一场办的是排名靠前的那一章', firstOfTwo.chapters.pendingCeremony.completedChapterId, 'CH2');
  const ch3Pending = firstOfTwo.chapters.chapters.find((c) => c.id === 'CH3');
  check('另一章没有凭空通关，但进度条已经满了', [ch3Pending.completed, ch3Pending.conditionProgress.every((r) => r.met)], [false, true]);
  check('这一场仪式解锁了 Ch.4（汇流点：学术或世界二选一）', firstOfTwo.chapters.pendingCeremony.unlockedChapterIds, ['CH4']);
  const secondOfTwo = syncChapters(dismissChapterCeremony(firstOfTwo, P3_NOW), P3_NOW);
  check('收起第一场后的下一次写入 → 第二场接上', secondOfTwo.chapters.chapters.filter((c) => c.completed).map((c) => c.id), ['CH1', 'CH2', 'CH3', 'CH8']);
  const ch4Row = secondOfTwo.chapters.chapters.find((c) => c.id === 'CH4');
  check('Ch.4 的两条条件：第一作者成果还没有，海外经历（附加）已有', ch4Row.conditionProgress.map((r) => r.met), [false, true]);
  check('Ch.3 已通关 → Ch.4 的两条前置同时满足（汇流点不必二选一也走得通）', secondOfTwo.chapters.chapters.find((c) => c.id === 'CH4').unlocked, true);
  check('再同步一次 → 完全收敛，不再产新引用', syncChapters(secondOfTwo, P3_NOW) === secondOfTwo, true);

  // -------------------------------------------------------------------------
  console.log('\n【㉑ 现实里程碑：冷却与月度 1200 EXP 封顶】');
  // -------------------------------------------------------------------------
  const mBase = createMockState();
  check('月度上限就是 PO 定下的 1200', mBase.settings.rewardPolicy.realityMilestoneMonthlyExpCap, 1200);

  // 一次性事件
  const border = recordRealityMilestone(mBase, { definitionId: 'rm_first_border', occurredOn: '2026-09-01', note: '浦东飞法兰克福', snapshots: [] }, P3_NOW);
  check('第一次记录 → 放行', border.milestones.records.length, mBase.milestones.records.length + 1);
  const borderRec = border.milestones.records.at(-1);
  check('事件发生的日子与写下来的日子分开记（记不清日期时才有东西可留）', [borderRec.occurredOn, borderRec.recordedAt], ['2026-09-01', P3_NOW.toISOString()]);
  check('一次性事件第二次被拦下', milestoneGate(border, 'rm_first_border', P3_NOW).reason, 'already_recorded');
  check('被拦时状态原地不动（拒绝路径只返回原对象，全项目同一条自律）', recordRealityMilestone(border, { definitionId: 'rm_first_border', occurredOn: '2026-09-01', note: '', snapshots: [] }, P3_NOW) === border, true);
  check('未知定义 → 原对象返回，且理由说得出是"没有这条定义"', [milestoneGate(mBase, 'rm_nope', P3_NOW).reason, recordRealityMilestone(mBase, { definitionId: 'rm_nope', occurredOn: null, note: '', snapshots: [] }, P3_NOW) === mBase], ['unknown_definition', true]);

  // 可重复 + 冷却
  const trip = recordRealityMilestone(mBase, { definitionId: 'rm_overseas_experience', occurredOn: '2026-08-01', note: '', snapshots: [] }, P3_NOW);
  const coolGate = milestoneGate(trip, 'rm_overseas_experience', new Date(2026, 9, 8, 20, 0));
  check('冷却期内被拦下', [coolGate.ok, coolGate.reason], [false, 'cooldown']);
  check('并且说得出还要等几天（UI 要写"冷却中 · 还有 N 天"）', coolGate.daysLeft, 179);
  check('冷却期满 → 再次放行', milestoneGate(trip, 'rm_overseas_experience', new Date(2027, 3, 10, 20, 0)).ok, true);

  // 属性点：目录里配了就得真的发
  const ptsBase = createMockState();
  const pts = recordRealityMilestone(ptsBase, { definitionId: 'rm_visa_approved', occurredOn: '2026-09-30', note: '', snapshots: [] }, P3_NOW);
  check('目录里配的属性点真的进了待分配池', pts.player.freeAttributePoints, ptsBase.player.freeAttributePoints + 1);
  check('发的是"待分配"，没有替玩家决定加在哪一维', JSON.stringify(pts.player.attributes), JSON.stringify(ptsBase.player.attributes));

  // 点亮终极目标里程碑
  const lit = recordRealityMilestone(createMockState(), { definitionId: 'rm_language_key', occurredOn: '2026-09-20', note: '', snapshots: [] }, P3_NOW);
  const litMilestone = lit.endgame.goals.find((g) => g.id === 'GLOBAL_MOBILITY').milestones.find((m) => m.id === 'gm_language');
  check('记录一条里程碑 → 对应终极目标下的子里程碑点亮', litMilestone.achievedAt, P3_NOW.toISOString());
  check('点亮记在 goals 上，不是另开一份并行状态', lit.endgame.goals.some((g) => g.milestones.some((m) => m.id === 'gm_language' && m.achievedAt !== null)), true);

  // EXP 归属：说得出进哪条线，且真的进去了
  const litRec = lit.milestones.records.at(-1);
  truthy('记录里写明了这笔经验记进哪条职业线（玩家有权知道经验去哪了）', litRec.creditedClassId !== null);
  const mTrackBefore = createMockState().careers.tracks.find((t) => t.classId === litRec.creditedClassId);
  const mTrackAfter = lit.careers.tracks.find((t) => t.classId === litRec.creditedClassId);
  check('经验真的记在那条线上（不是只在记录里写个数）', mTrackAfter.stats.expEarnedTotal - mTrackBefore.stats.expEarnedTotal, litRec.expGranted);

  // —— 月度封顶：1200 / 1200 ——
  const cappedBase = createMockState();
  cappedBase.milestones.monthlyExpGranted[localMonthKey(P3_NOW)] = 1150;
  const partial = milestoneGate(cappedBase, 'rm_first_remote_income', P3_NOW);
  check('本月已发 1150 → 只补发剩下的 50，而不是 250', [partial.ok, partial.expGranted, partial.cappedByMonth], [true, 50, true]);
  const capped = recordRealityMilestone(cappedBase, { definitionId: 'rm_first_remote_income', occurredOn: '2026-10-02', note: '', snapshots: [] }, P3_NOW);
  check('实发值是被削过的那 50，封顶账目停在 1200', [capped.milestones.records.at(-1).expGranted, capped.milestones.monthlyExpGranted[localMonthKey(P3_NOW)]], [50, 1200]);

  const fullGate = milestoneGate(capped, 'rm_first_client', P3_NOW);
  check('额度用尽 → 仍然放行，只是 EXP 为 0', [fullGate.ok, fullGate.expGranted, fullGate.cappedByMonth], [true, 0, true]);
  const overCap = recordRealityMilestone(capped, { definitionId: 'rm_first_client', occurredOn: '2026-10-03', note: '给一家小公司做数据清洗', snapshots: [] }, P3_NOW);
  check('超限后**照样记录事件**（PO 原话：仅记录事件、不发放额外 EXP）', overCap.milestones.records.length, capped.milestones.records.length + 1);
  check('这条记录实发 0，不是目录里的 250', overCap.milestones.records.at(-1).expGranted, 0);
  check('零 EXP 时不给它硬安一条职业线', overCap.milestones.records.at(-1).creditedClassId, null);
  check('账目仍然封在 1200，不会超发', overCap.milestones.monthlyExpGranted[localMonthKey(P3_NOW)], 1200);
  // 额度按月切分、不结转：同一条目在"本月已满 / 下月归零"两种处境下的实发值应当不同
  const nextMonthBase = createMockState();
  nextMonthBase.milestones.monthlyExpGranted[localMonthKey(P3_NOW)] = 1200;
  check('本月额度已满 → 这条实发 0', milestoneGate(nextMonthBase, 'rm_first_client', P3_NOW).expGranted, 0);
  check('下个月从零开始，额度不结转 → 同一条恢复全价 250', milestoneGate(nextMonthBase, 'rm_first_client', new Date(2026, 10, 3, 20, 0)).expGranted, 250);

  // -------------------------------------------------------------------------
  console.log('\n【㉒ 任务状态机补齐：整链重抽 · 换个做法】');
  // -------------------------------------------------------------------------
  const RG_IDEA = '把这条链的做法整个换一遍';
  let rg = generateQuestChain(createMockState(), { idea: RG_IDEA, deepDeliberation: false, classId: null }, NET_NOW);
  const rgChain = chainFromIdea(rg, RG_IDEA);
  check('刚铸出来的链不在"可重抽"名单里（一条草稿都还没被否）', chainsAwaitingRegeneration(rg).some((c) => c.chainId === rgChain.id), false);

  const rgOldIds = [...rgChain.questIds];
  const rgOldTitles = rgOldIds.map((id) => rg.quests.byId[id].title);
  check('只打回一部分 → 仍不可重抽（它是"整条链方向都不对"时的一次重来）', chainsAwaitingRegeneration(reviewQuestDraft(rg, rgOldIds[0], 'reject', NET_NOW)).some((c) => c.chainId === rgChain.id), false);

  for (const id of rgOldIds) rg = reviewQuestDraft(rg, id, 'reject', NET_NOW);
  const cands = chainsAwaitingRegeneration(rg);
  check('整链全被打回 → 出现在"可重抽"名单里', cands.map((c) => c.chainId), [rgChain.id]);
  check('名单带上了被打回的条数', cands[0].rejectedCount, rgOldIds.length);
  check('名单说得出还剩几次机会', [cands[0].remaining, cands[0].playerNote], [1, null]);

  const rgOnce = regenerateQuestChain(rg, rgChain.id, NET_NOW);
  const rgChainAfter = rgOnce.quests.chains[rgChain.id];
  check('重抽额度：1 → 0（终身一次）', rgChainAfter.review.regenerationCount, 1);
  check('新一批接上，且仍是 draft —— 重抽不等于过审', rgChainAfter.questIds.every((id) => rgOnce.quests.byId[id].status === 'draft'), true);
  check('重抽后成员数不减（换一批做法，不是砍掉几步）', rgChainAfter.questIds.length, rgOldIds.length);
  check('旧成员进归档、不删除（它们是下一轮生成的负样本）', rgOldIds.every((id) => rgOnce.quests.archivedIds.includes(id)), true);
  check('旧成员仍在 byId 里，痕迹保留', rgOldIds.every((id) => rgOnce.quests.byId[id]?.status === 'rejected'), true);
  check('新旧两批的 id 一个都不重合（否则新草稿会把旧痕迹原地顶掉）', rgChainAfter.questIds.some((id) => rgOldIds.includes(id)), false);
  check('归档的是"那几条旧的"，不是新来的', rgOldIds.every((id) => rgOnce.quests.archivedIds.includes(id)), true);
  check('新成员不进归档（它们正是要被展示的那一批）', rgChainAfter.questIds.some((id) => rgOnce.quests.archivedIds.includes(id)), false);
  // 这条断言的前身是 Phase 3 留下的一条"已知局限"：当时每条职业线只有 3 条种子，
  // 而 MAX_DRAFTS = 3 —— 替身重抽时"没出过的"是空的，只能把同一批标题原样再铸一遍。
  // 数据上是新的一批（id 全新、旧的留档），文案上却逐字相同。
  // Phase 4 把池子扩到 9 条之后，重抽必须**真的换一批**，所以那条"局限"升级成了断言。
  check(
    '重抽后新一批标题与旧一批零重合（扩容要兑现的正是这一条）',
    rgChainAfter.questIds.some((id) => rgOldTitles.includes(rgOnce.quests.byId[id].title)),
    false,
  );
  check(
    '新一批内部也不重复',
    new Set(rgChainAfter.questIds.map((id) => rgOnce.quests.byId[id].title)).size,
    rgChainAfter.questIds.length,
  );

  // —— 目录：种子池的形状 ——
  // 上面那条只证明了"第一次重抽是fresh的"。池子到底有多深，得直接问目录。
  const { mockForge } = await server.ssrLoadModule('/src/lib/mockForge.ts');
  const seedTitles = (c) => c.seedQuests.map((s) => s.title);
  check(
    '目录：四条职业线的种子池都 ≥8 条（重抽要有fresh的可抽）',
    CLASSES.every((c) => c.seedQuests.length >= 8),
    true,
  );
  check(
    '目录：种子 tempId 在职业线内唯一（重复会让前置关系指向一个说不清的东西）',
    CLASSES.every((c) => new Set(c.seedQuests.map((s) => s.tempId)).size === c.seedQuests.length),
    true,
  );
  // 替身排重**按标题**做（见 mockForge 的 existingTitles），所以标题撞车等价于池子浅一格
  check(
    '目录：种子标题在职业线内唯一（替身就是按标题判"这条出过没有"）',
    CLASSES.every((c) => new Set(seedTitles(c)).size === c.seedQuests.length),
    true,
  );
  check(
    '目录：每条线跨 ≥4 个星级（否则重抽换的是文案，不是分量）',
    CLASSES.every((c) => new Set(c.seedQuests.map((s) => s.difficulty)).size >= 4),
    true,
  );
  check(
    '目录：每条线不止一种工时单位（8 条全是 2 小时的题，池子再深也是同一种日子）',
    CLASSES.every((c) => new Set(c.seedQuests.map((s) => s.effortEstimate.unit)).size >= 2),
    true,
  );

  // 连续三轮整链重抽：每一轮都把上一轮出过的标题喂回去（regenerateQuestChain 内部
  // 正是这么做的 —— rejectedTitles 就是上一批的标题）。9 条池子、每轮取 3 条，
  // 三轮应当两两不重合。这是"池子深度"唯一能被机器验证的兑现方式。
  const forgeRounds = [];
  let seenTitles = [];
  for (let round = 0; round < 3; round += 1) {
    const out = mockForge({
      idea: RG_IDEA,
      classId: null,
      deepDeliberation: false,
      existingTitles: [...seenTitles],
    });
    const titles = out.drafts.map((d) => d.title);
    forgeRounds.push(titles);
    seenTitles = [...seenTitles, ...titles];
  }
  check('三轮重抽共出 9 条标题，一条不重（池子真的被用起来了，不是躺在那儿）', new Set(seenTitles).size, 9);
  check('第二轮与第一轮零重合', forgeRounds[1].some((t) => forgeRounds[0].includes(t)), false);
  check('第三轮与前两轮零重合', forgeRounds[2].some((t) => forgeRounds[0].includes(t) || forgeRounds[1].includes(t)), false);
  check('reroute 额度随之重置（换了做法就是一条新链的审核周期）', rgChainAfter.review.rerouteCount, 0);
  check('新链的 reviewedAt 归零，等这一批重新过审', rgChainAfter.review.reviewedAt, null);
  check('玩家上一次给的整链意见被原样带进新链（它是这次重抽唯一的输入）', rgChainAfter.review.playerNote, rgChain.review.playerNote);

  check('第二次重抽 → 原对象返回（终身仅限 1 次，防无限抽卡）', regenerateQuestChain(rgOnce, rgChain.id, NET_NOW) === rgOnce, true);
  check('用掉之后就不再出现在名单里', chainsAwaitingRegeneration(rgOnce).some((c) => c.chainId === rgChain.id), false);

  // 守卫的镜像：名单说"不能"，操作就必须真的"不能" —— 两处漂移会长出一颗点了没反应的按钮
  check('没全被打回的链 → 不给重抽', regenerateQuestChain(rg, 'ch_repro_dignity', NET_NOW) === rg, true);
  check('不存在的链 → 原对象返回', regenerateQuestChain(rg, 'ch_nope', NET_NOW) === rg, true);

  // —— 换个做法（形状 B）——
  const RR_IDEA = '把投资纪律变成一条能执行的规则';
  let rr = generateQuestChain(createMockState(), { idea: RR_IDEA, deepDeliberation: false, classId: null }, NET_NOW);
  const rrChain = chainFromIdea(rr, RR_IDEA);
  const rrStep = rr.quests.byId[rrChain.questIds[0]];
  const rrStepIdx = rrChain.questIds.indexOf(rrStep.id);

  check('不是草稿 → 原对象返回（已生效的任务不能偷偷换掉）', rerouteQuestDraft(rr, 'q_cb_docker', '换一个', NET_NOW) === rr, true);

  const rrNew = rerouteQuestDraft(rr, rrStep.id, '  这一步我做不动，换成先写一页  ', NET_NOW);
  const rrNewId = rrNew.quests.chains[rrChain.id].questIds[rrStepIdx];
  const rrNewQuest = rrNew.quests.byId[rrNewId];
  check('旧的那一步留档为 rerouted，不删', rrNew.quests.byId[rrStep.id].status, 'rerouted');
  check('新的一步落回同一条链的**同一个 index**（在原地换做法，不跳到队尾）', rrNewQuest.chain.index, rrStep.chain.index);
  check('新的一步仍是 draft —— 它还要过一次审核', rrNewQuest.status, 'draft');
  check('序号与总数不变（第 2/3 步还是第 2/3 步，换的是做法）', [rrNewQuest.chain.total, rrChain.questIds.length], [rrStep.chain.total, rrChain.questIds.length]);
  check('reroute 额度用掉一次', rrNew.quests.chains[rrChain.id].review.rerouteCount, 1);

  const rrHist = rrNewQuest.origin.rerouteHistory;
  check('留档：改之前 / 改之后 / 玩家原话，三样都在', [rrHist.length, rrHist[0].request, rrHist[0].before.title], [1, '这一步我做不动，换成先写一页', rrStep.title]);
  check('留档记下了这一改的出处', rrNewQuest.origin.reroutedFrom, rrStep.id);
  check(
    '红线①：降了难度就必须降奖励（否则 reroute 成了刷分工具）',
    rrHist[0].after.difficulty < rrHist[0].before.difficulty ? rrHist[0].after.exp < rrHist[0].before.exp : true,
    true,
  );
  check('难度不会被降穿地板', rrHist[0].after.difficulty >= 1, true);
  check('前置原样继承（"这一步之前的那些步骤"与做法无关）', rrNewQuest.prerequisiteQuestIds, rrStep.prerequisiteQuestIds);

  const rrNextId = rrNew.quests.chains[rrChain.id].questIds[rrStepIdx + 1];
  check('下游原来指着旧 id 的前置，被改指到新的那一步上（否则它永远领不动）', rrNew.quests.byId[rrNextId].prerequisiteQuestIds, [rrNewId]);
  check('原本指着旧 id 的地方一处不剩', Object.values(rrNew.quests.byId).some((q) => q.prerequisiteQuestIds.includes(rrStep.id)), false);
  truthy(
    '红线②：新做法把后继任务的 objective 原文写进了自己的口径里（改法的合法性 = 它还通得向下一步）',
    rrNewQuest.objective.includes(rrNew.quests.byId[rrNextId].objective),
  );
  check('玩家那句诉求也进了叙述（改的是我点的那一处，不是别的地方）', rrNewQuest.narrative.includes('先写一页'), true);

  // 链级软上限 2 次
  let rrTwice = rerouteQuestDraft(rrNew, rrNewId, '还是做不动，再换一次', NET_NOW);
  const rrTwiceId = rrTwice.quests.chains[rrChain.id].questIds[rrStepIdx];
  const rrThree = rerouteQuestDraft(rrTwice, rrTwiceId, '第三次', NET_NOW);
  check('链级软上限：第 3 次换做法被拦下（原对象返回）', rrThree === rrTwice, true);
  check('额度确实停在 2', rrTwice.quests.chains[rrChain.id].review.rerouteCount, 2);
  check('两次改法的轨迹都留在替换件上（不是只有最后一次）', rrTwice.quests.byId[rrTwiceId].origin.rerouteHistory.length, 2);
  const rrBlank = rerouteQuestDraft(rr, rrStep.id, '   ', NET_NOW);
  const rrBlankId = rrBlank.quests.chains[rrChain.id].questIds[rrStepIdx];
  check(
    '空诉求 → 用默认措辞，而不是留一条空白记录',
    rrBlank.quests.byId[rrBlankId].origin.rerouteHistory[0].request.length > 0,
    true,
  );

  // -------------------------------------------------------------------------
  console.log('\n【㉓ 存档：导出 → 导入的无损往返】');
  // -------------------------------------------------------------------------
  // 往返用的底稿要"什么都有"：一条里程碑记录、一章通关、一个玩家起的代号、
  // 一次跨天结算 —— 只有内容够杂，无损这两个字才有分量。
  let exState = recordRealityMilestone(createMockState(), { definitionId: 'rm_preprint_public', occurredOn: '2026-10-01', note: '', snapshots: [] }, P3_NOW);
  exState = nameChapter(syncChapters(exState, P3_NOW), 'CH1', '潮汐线', 'custom', P3_NOW);

  const file = buildSaveFile(exState, P3_NOW);
  check('文件名带日期（玩家一眼认出这是哪一天的档）', saveFileName(P3_NOW), 'EarthOnline_Save_20261007.json');
  check('文件带格式标记，导入端据此拒绝别的 json', file.format, SAVE_FORMAT);
  check('API Key 不在导出文件里（它压根不在 state 里，在另一个存储槽）', JSON.stringify(file).includes('sk-'), false);
  truthy('导出文件里附了一段人读的成功日记（JSON 是给机器读的）', typeof file.journalPlainText === 'string' && file.journalPlainText.length > 0);
  check('纯文本页眉带上了玩家给这一章起的代号（铭刻的第三个落点）', journalToPlainText(exState).includes('潮汐线'), true);

  const back = parseSaveFile(JSON.stringify(file), P3_NOW);
  check('导入成功', back.ok, true);
  check('无损：整份 state 逐字段相同（最狠也最诚实的那一条）', JSON.stringify(back.state), JSON.stringify(exState));
  check('无损：没有迁移备注混进来（同版本不该动任何东西）', back.notes, []);
  check('无损：篇章块（含通关进度与命名）原样', JSON.stringify(back.state.chapters), JSON.stringify(exState.chapters));
  check('无损：里程碑记录与月度账目原样', JSON.stringify(back.state.milestones), JSON.stringify(exState.milestones));
  check('无损：修订号与更新时间戳原样（导入不会被当成一次写入）', [back.state.meta.revision, back.state.meta.updatedAt], [exState.meta.revision, exState.meta.updatedAt]);

  // 拒绝路径：每一条都要说得出"接下来该做什么"。
  // "导入失败"四个字对玩家毫无用处 —— 他需要知道是选错文件了还是文件坏了。
  check('不是 JSON → 提示大概选错文件了', parseSaveFile('{这一行不是 json', P3_NOW).reason.includes('选错文件'), true);
  check('是 JSON 但不是我们的格式 → 指出来', parseSaveFile(JSON.stringify({ hello: 1 }), P3_NOW).reason.includes(SAVE_FORMAT), true);
  check('不是对象（数组 / 字符串）→ 拒绝', parseSaveFile('[1,2,3]', P3_NOW).ok, false);
  const partialFile = parseSaveFile(JSON.stringify({ format: SAVE_FORMAT, state: { meta: { schemaVersion: 3 } } }), P3_NOW);
  check('结构不完整 → 指名道姓说是哪几块缺了', [partialFile.ok, partialFile.reason.includes('player'), partialFile.reason.includes('vault')], [false, true, true]);
  const foreign = parseSaveFile(JSON.stringify({ format: SAVE_FORMAT, state: { ...exState, meta: { ...exState.meta, schemaVersion: 99 } } }), P3_NOW);
  check('来自更新版本 → 拒绝，不硬读（强行读入会丢新版本才有的数据）', [foreign.ok, foreign.reason.includes('升级')], [false, true]);
  const noVersion = parseSaveFile(JSON.stringify({ format: SAVE_FORMAT, state: { ...exState, meta: { updatedAt: null } } }), P3_NOW);
  check('查不到版本号 → 拒绝（不知道该按哪一版读它）', noVersion.ok, false);

  // 老档导入：与开机走**同一条**升级路径，绝不比"打开浏览器"少升一版
  const oldFile = JSON.parse(JSON.stringify(file));
  oldFile.state.meta.schemaVersion = 2;
  oldFile.state.meta.migrationHistory = [];
  delete oldFile.state.chapters.pendingCeremony;
  for (const q of Object.values(oldFile.state.quests.byId)) {
    delete q.origin.reroutedFrom;
    delete q.origin.rerouteHistory;
  }
  for (const c of Object.values(oldFile.state.quests.chains)) delete c.review.rerouteCount;
  const oldBack = parseSaveFile(JSON.stringify(oldFile), P3_NOW);
  check('v2 老档导入 → 升级成功而不是被分流', oldBack.ok, true);
  check('升级备注会告诉玩家"升级了、数据保留"', [oldBack.notes.length, oldBack.notes[0].includes('升级')], [1, true]);
  check('版本已升到当前', oldBack.state.meta.schemaVersion, CURRENT_SCHEMA_VERSION);
  check('补上了 v3 才有的字段', oldBack.state.chapters.pendingCeremony, null);
  check('补的是一条**空的**字段，没有编造历史', Object.values(oldBack.state.quests.byId).every((q) => q.origin.rerouteHistory.length === 0), true);
  check('不搬动已有数据：那条里程碑记录原样', JSON.stringify(oldBack.state.milestones.records), JSON.stringify(exState.milestones.records));

  check('选择文件时先看扩展名：.json 收', looksLikeSaveFile('EarthOnline_Save_20261007.json'), true);
  check('选择文件时先看扩展名：.eosave 也收', looksLikeSaveFile('backup.EOSAVE'), true);
  check('选择文件时先看扩展名：.png 当场劝退', looksLikeSaveFile('屏幕截图.png'), false);

  // -------------------------------------------------------------------------
  console.log('\n【㉔ 导航角标：一块面板，一个数字】');
  // -------------------------------------------------------------------------
  // PO 裁定：Dock 上「日常」那一格的数字 = 今日未打钩的日常 + 本周未打钩的周常。
  //
  // 这一格真正要钉的不是算术，而是**只减不增**：每打一个钩，数字必须跟着掉一格。
  // 分开算的旧写法在状态层看不出任何毛病 —— 它只是让手机端少显示一个数字，
  // 而那一个数字恰好住在"周一早上、周常结算前一刻"这个最要紧的时点上。
  const badgeState = createMockState();
  const badge = navBadges(badgeState, P3_NOW);
  const pendingD = pendingDailies(badgeState, P3_NOW).length;
  const pendingW = pendingWeeklies(badgeState, P3_NOW).length;

  truthy('两半都非空（否则这条断言会退化成"0 + 0 = 0"，什么都验不到）', pendingD > 0 && pendingW > 0);
  check('「日常」= 今日未打钩 + 本周未打钩', badge.dailies, pendingD + pendingW);
  check('它比单独任何一半都大（证明确实合并了，不是只取了其中一边）', badge.dailies > Math.max(pendingD, pendingW), true);

  // 打一个日常的钩 → 数字掉 1
  const afterDaily = checkDaily(badgeState, pendingDailies(badgeState, P3_NOW)[0].id, P3_NOW);
  check('打掉一条日常 → 角标 −1', navBadges(afterDaily, P3_NOW).dailies, badge.dailies - 1);

  // 打一个周常的钩 → 数字**同样**掉 1。这是这条裁定全部的意义所在：
  // 周常的钩必须落在「日常」这一格上，否则它根本没地方显示出来。
  const afterWeekly = checkWeekly(badgeState, pendingWeeklies(badgeState, P3_NOW)[0].id, P3_NOW);
  check('打掉一条周常 → 角标也 −1（周常的钩落在同一格上）', navBadges(afterWeekly, P3_NOW).dailies, badge.dailies - 1);

  // 两个都打完 → 恰好掉 2，互不顶替
  const afterBoth = checkDaily(afterWeekly, pendingDailies(afterWeekly, P3_NOW)[0].id, P3_NOW);
  check('日常与周常各打一条 → 各掉 1，互不顶替', navBadges(afterBoth, P3_NOW).dailies, badge.dailies - 2);

  // 全清 → 归零。0 是"不显示角标"的那个值，所以它必须真的到得了 0
  let cleared = badgeState;
  for (const d of pendingDailies(badgeState, P3_NOW)) cleared = checkDaily(cleared, d.id, P3_NOW);
  for (const w of pendingWeeklies(badgeState, P3_NOW)) cleared = checkWeekly(cleared, w.id, P3_NOW);
  check('全部打完 → 归零（0 就是"不显示"，所以它必须真的到得了 0）', navBadges(cleared, P3_NOW).dailies, 0);

  // 另外两格的口径与"任务"分开 —— 它们是同一个数字形状，但是三件不同的事
  //
  // 「关系」这一格现在恒为 0（PO 裁定：撤下「该联系了」）。钉住它，是因为
  // 一个"只剩形状"的格子最容易被后来的人重新填上 —— 而它一旦有数，
  // 就意味着"系统又在替你惦记你的关系"这件事回来了。
  check('「关系」这一格恒为 0（该联系了已撤下，系统不替玩家惦记关系）', navBadges(badgeState, P3_NOW).network, 0);
  check('「属性」报的是待分配点数', navBadges(badgeState, P3_NOW).attributes, badgeState.player.freeAttributePoints);
  check('「悬赏」= 可接 + 待议草稿 + 待结算', navBadges(badgeState, P3_NOW).bounty,
    claimableQuests(badgeState).length + draftQuests(badgeState).length + questsByStatus(badgeState, 'turn_in_pending').length);

  // 无事发生 → 同一个对象形状、同样的值（纯读，绝不写盘）
  check('连读两次结果一致（selector 不读 Date.now()、不产生副作用）', JSON.stringify(navBadges(cleared, P3_NOW)), JSON.stringify(navBadges(cleared, P3_NOW)));

  // -------------------------------------------------------------------------
  console.log('\n【㉕ 异步外壳：Mock 与 Live 两条轨道走同一条管线】');
  // -------------------------------------------------------------------------
  // 这一节验的不是一个纯函数，而是**一条管线**：
  //
  //   点亮加载态 → 四道闸门 → 网络（重试/超时）→ JSON Schema 硬校验
  //   → 语义适配 → 纯函数落库 → 决定要不要跟玩家说一声
  //
  // 它有一条很容易走歪的路：把 Mock 轨道做成一条**绕开校验**的快速通道。
  // 那样"两条轨道同构"就只是一句口号 —— 而一个只在配了密钥的机器上才执行的
  // 防线，等于没有防线。所以下面几乎每条断言都会在两个模式下各问一遍。
  //
  // 能这么测，是因为 `createThunks(deps)` 的依赖全是注入的：一个可变的状态格子、
  // 一个假 fetch、一个假时钟。不需要 React、不需要 LocalStorage、不需要真密钥。
  // -------------------------------------------------------------------------
  const { createThunks } = await server.ssrLoadModule('/src/ai/thunks.ts');
  const { applyAgentEffect: applyEffectReal } = await server.ssrLoadModule('/src/store/agentEffect.ts');
  const { applyMockMode } = await server.ssrLoadModule('/src/store/agentRuntime.ts');
  const { mockReroute, DEFAULT_REROUTE_REQUEST: DEFAULT_RR, REDIFFICULTY_REWARD_RATIO: RR_RATIO } =
    await server.ssrLoadModule('/src/lib/mockReroute.ts');
  const { normalizeRerouteOutcome } = await server.ssrLoadModule('/src/ai/adapters.ts');

  const T_NOW = new Date('2026-10-07T13:00:00.000Z');
  /**
   * 派生存档要一个**不同的**时钟 —— 两次点击间隔的分钟数是这节测试的实体。
   *
   * ⚠️ 链 id 是 `ch_${now.getTime().toString(36)}`：时钟不走，"从上一轮的状态再来一次"
   *    就会算出同一个 id，把上一轮那条链**覆盖**掉 —— 于是 thunk 里那句
   *    "有没有新 id 出现"判定为没有，一次成功的铸造被报成"链条没有落进存档"。
   *    这是假失败，且假得很有说服力（它会让人去查落库逻辑，而那里没有问题）。
   *    真实世界里玩家的两次点击本来就隔着时间，所以这里补上的正是真实的那一段。
   *
   * 时钟同时管着熔断冷却（5 分钟）：T_TRIP 与 T_LOCKED 必须落在
   * `T_TRIP + 5min` 之内，否则 `afterTrip` 那一轮会**半开**，测的就不是"熔断期间"了。
   */
  const T_TRIP = new Date('2026-10-07T13:01:00.000Z'); // 第二次点击：把失败数推过阈值
  /**
   * 裁定 ① 那一节用的时钟：**密钥刚改好之后的那一次点击**。
   *
   * 90 秒这个数字是判据本身的一半 —— 它必须**小于**那 5 分钟冷却，
   * 否则"没被冷却锁住"这句话就退化成"冷却刚好过期了"，什么也没证明。
   */
  const T_KEYFIX = new Date('2026-10-07T13:01:30.000Z');
  const T_LOCKED = new Date('2026-10-07T13:02:00.000Z'); // 第三次点击：熔断已打开、冷却未满
  const T_HALF = new Date('2026-10-07T13:30:00.000Z'); // 冷却期满之后
  const T_MONTH = '2026-10';
  const T_KEY = 'sk-verify-ops-not-a-real-key';

  /**
   * 演示存档的**基线**。
   *
   * ⚠️ 它不是空的：里面躺着一条 9 月 28 日的调用日志（那个世界的过去），
   *    花名册上也有各自的履历。所以本节所有"记了几笔"的断言一律问**增量**，
   *    不问总数 —— 写绝对值的版本会随着 mockState 加点内容而静默失效。
   *    （第一版就是这么写的：把"两次调用 → 两条日志"钉在 2 上。）
   */
  const BASELINE = createMockState();
  const logCount = (h) => h.state.agents.invocations.length - BASELINE.agents.invocations.length;
  const statOf = (s, id) => s.agents.records.find((r) => r.id === id)?.stats ?? null;
  /** 那个人在这次操作里长出来的履历 —— 与花名册自己的历史无关 */
  const grew = (s, id, field = 'invocations') => (statOf(s, id)?.[field] ?? 0) - (statOf(BASELINE, id)?.[field] ?? 0);
  /** 本月用量同样问增量（基线存档里也可能带着上个月的账） */
  const used = (s, field) => s.ai.usage[field] - BASELINE.ai.usage[field];

  /**
   * 一份"接上真身"的存档。
   *
   * 两个字段必须同时翻 —— 只改 `mockModeEnabled` 会留下
   * "界面显示已接上、每次调用仍被闸门 ① 拦下"的组合。这正是 `applyMockMode`
   * 存在的理由（控制室开关与提示条按钮共用它），所以这里也走它，不手写。
   */
  const toLive = (base) => applyMockMode(base, false);

  /**
   * 一个会记账的假 fetch。
   *   对象 → 200 + OpenAI 形状的响应（content 是它的 JSON 序列化）
   *   数字 → 那个 HTTP 状态码
   *   Error → 直接抛（模拟断网）
   * 最后一步会被重复取用 —— 重试打的是同一个端点，不该走几步就写几个 step。
   */
  const makeFetch = (...steps) => {
    const sends = [];
    const impl = async (url, init) => {
      sends.push({ url, auth: init.headers.Authorization, body: init.body });
      const step = steps[Math.min(sends.length - 1, steps.length - 1)];
      if (step instanceof Error) throw step;
      if (typeof step === 'number') {
        return { ok: false, status: step, text: async () => JSON.stringify({ error: { message: '服务端拒绝了' } }) };
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(step) } }],
            usage: { prompt_tokens: 120, completion_tokens: 240 },
          }),
      };
    };
    impl.sends = sends;
    return impl;
  };

  /**
   * 一个最小的 store 替身：可变的状态格子 + 三本账的记账口。
   * `applyAgentEffect` 用的是**真身那一份模块导出** —— 测的和跑的是同一段代码。
   *
   * `mutate` 复刻了生产环境那条短路：返回原引用就不写盘。于是 `writes` 这个计数
   * 本身也成了断言材料（"调用的发生"与"结果的采纳"是两笔）。
   */
  const harness = (state, opts = {}) => {
    const fetchImpl = opts.fetchImpl ?? null;
    const h = { state, notices: [], activity: [], writes: 0, apiKey: opts.apiKey ?? null };
    h.thunks = createThunks({
      getState: () => h.state,
      mutate: (pure) => {
        const next = pure(h.state);
        if (next === h.state) return;
        h.state = next;
        h.writes += 1;
      },
      beginAgentCall: (a) => {
        // ⚠️ id 必须**跟着事件一起进数组**。第一版只把它当返回值用，
        //    于是 `lampTrace` 看到的每个 begin 都缺 id，配对检查恒定报"不配对"——
        //    一个永远为假的断言比没有断言更糟：它会让人去改生产代码。
        const id = `act_${h.activity.length + 1}`;
        h.activity.push({ kind: 'begin', id, name: a.name, label: a.label, sent: fetchImpl ? fetchImpl.sends.length : 0 });
        return id;
      },
      // `sent` 同样要在这里取一次：`lampTrace` 的第二条纪律靠"熄灯时已经发了几个请求"
      // 才能证明请求是**在灯亮着的时候**发出去的（见它的注释）。
      endAgentCall: (id) => h.activity.push({ kind: 'end', id, sent: fetchImpl ? fetchImpl.sends.length : 0 }),
      notify: (n) => h.notices.push(n),
      applyAgentEffect: (effect, month) => {
        const next = applyEffectReal(h.state, effect, month);
        if (next === h.state) return;
        h.state = next;
        h.writes += 1;
      },
      readApiKey: () => h.apiKey,
      ...(fetchImpl ? { fetchImpl } : {}),
      now: () => opts.now ?? T_NOW,
    });
    return h;
  };

  /**
   * 加载态的三条纪律，一次验完。
   *
   * 返回每一对「亮灯 → 熄灯」的 `[亮灯时的已发请求数, 熄灯时的已发请求数]`。
   * 于是一对数就把三件事同时说清了：
   *   · 配对 —— 每盏灯都有对应的熄灯（"忘了熄灯"就是把玩家永久留在加载态里）；
   *   · `begin.sent` 等于这次调用**之前**发过的请求数 —— 灯是在发请求前点亮的，
   *     而不是请求回来之后补的（那样遮罩就是一个骗人的动画）；
   *   · `end.sent` 比它大 1 —— 请求是在灯亮着的时候发出去的。
   */
  const lampTrace = (h) => {
    const stack = [];
    const pairs = [];
    for (const ev of h.activity) {
      if (ev.kind === 'begin') {
        stack.push(ev);
        continue;
      }
      const opened = stack.pop();
      if (!opened) return '多了一次熄灯';
      if (opened.id !== ev.id) return '不配对';
      pairs.push([opened.sent, ev.sent]);
    }
    return stack.length === 0 ? pairs : '有 Agent 没熄灯';
  };

  // —— Live 轨道要吐的几份契约形状 ——
  const liveDraft = (n, over = {}) => ({
    tempId: `api_${n}`,
    title: `真身给的第 ${n} 步`,
    subtitle: '来自模型',
    narrative: '这一段是模型写的，替身写不出这句话。',
    objective: '把它做出来，做到第三个人能判断真假。',
    type: 'side',
    difficulty: 2,
    effortEstimate: { unit: 'hour', value: 8 },
    reward: { exp: 220 },
    outcomeHints: ['一个可以拿给别人看的东西'],
    linkedGoalIds: ['A9_ASSETS'],
    linkedAttributes: ['int'],
    prerequisiteTempIds: [],
    dueHintDays: 7,
    proof: { criterion: '一份文件', kind: 'text' },
    tags: ['from_api'],
    ...over,
  });

  const liveClassOut = (quests, over = {}) => ({
    mode: 'chain',
    chain: {
      title: '真身铸的链',
      rationale: '这一串从最小的一步开始，每一步都指向下一步。',
      estimatedTotalEffort: { unit: 'hour', value: 6 },
      deliverables: ['一份可以拿出手的东西'],
    },
    quests,
    closingNote: '先做第一步。',
    uncertainties: [],
    ...over,
  });

  const liveDispatch = (primaryClass, over = {}) => ({
    intentSummary: '把投资纪律变成一条能执行的规则',
    language: 'zh',
    routing: { primaryClass, primaryConfidence: 0.9, secondaryClassIds: [], rationale: '关键词命中' },
    proposedClass: null,
    questShape: { kind: 'chain', suggestedChainLength: 3, suggestedType: 'side' },
    linkedGoalIds: ['A9_ASSETS'],
    clarification: null,
    recommendDeepDeduction: false,
    recommendReason: '',
    ...over,
  });

  const liveArbiter = (over = {}) => ({
    quality: 'sharp',
    bonusPct: 19,
    comment: '你把犹豫的那一刻写下来了。',
    insights: [{ text: '你在信息不全时习惯先动手。', kind: 'pattern' }],
    milestoneTags: ['reproducibility'],
    milestoneConfidence: [{ tag: 'reproducibility', confidence: 0.8 }],
    emotions: ['clear'],
    detectedFluff: false,
    suggestedFollowUps: [],
    ...over,
  });

  const liveAdvice = (over = {}) => ({
    situationRead: '这件事你其实不缺方法，缺的是一个开口的时机。',
    humanRead: '他上次是主动找你的，这次轮到你。',
    suggestedAction: { timing: '本周内', channel: '微信', openingLine: '上次你提的那个问题，我想接着问一句。', intent: '把话接回上次' },
    avoid: ['一上来就提需求'],
    principle: '先还上上次的人情。',
    longTermView: '这条关系的价值在十年后。',
    energyNote: '不需要准备太多。',
    suggestLogging: true,
    confidence: 0.7,
    recommendedContacts: null,
    ...over,
  });

  const LIVE_IDEA = '把投资纪律变成一条能执行的规则';

  // ===== A · 两条轨道铸出同一种东西 =====
  // Mock：没有密钥 —— 闸门 ② 拦下，替身顶上
  const mockForgeH = harness(createMockState());
  const mockForgeRes = await mockForgeH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('Mock 轨道：没有密钥也能铸出链（离线可用不是一句口号）', mockForgeRes.ok, true);
  check('Mock 轨道：来源如实标成 mock', mockForgeRes.source, 'mock');
  const mockChain = mockForgeH.state.quests.chains[mockForgeRes.data.chainId];
  check('Mock 轨道：三步全落在 draft（铸造 ≠ 生效，这条没因为接上真身而松动）',
    mockChain.questIds.every((id) => mockForgeH.state.quests.byId[id].status === 'draft'), true);

  // Live：脚本化的真身
  const liveFetch = makeFetch(liveDispatch('investor'), liveClassOut([liveDraft(1), liveDraft(2), liveDraft(3)]));
  const liveForgeH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: liveFetch });
  const liveForgeRes = await liveForgeH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('Live 轨道：走通了，来源标成 api', [liveForgeRes.ok, liveForgeRes.source], [true, 'api']);
  const liveChain = liveForgeH.state.quests.chains[liveForgeRes.data.chainId];
  check('Live 轨道：链标题逐字来自模型（证明确实用了真身的产出，不是悄悄换成替身）', liveChain.title, '真身铸的链');
  check('Live 轨道：三条任务的标题也是模型的', liveChain.questIds.map((id) => liveForgeH.state.quests.byId[id].title), ['真身给的第 1 步', '真身给的第 2 步', '真身给的第 3 步']);
  check('两条轨道落了同一个职业线（调度员与关键词路由不该分岔）', [mockChain.classId, liveChain.classId], ['investor', 'investor']);
  // 铸出来的任务要记着**花名册上真实存在**的那个 Agent。
  // 这里曾经是拼出来的 `agent_class_investor` —— 投资者线上恰好蒙对，另外三条线全错
  // （`computational_biology` 拼出来是 `agent_class_computational_biology`，
  // 而花名册上是 `agent_class_compbio`）。同一个事件两份记录对不上，
  // 今天没人读所以不报错 —— 这类"安静的谎"只能被断言钉住。
  const rosterHas = (s, id) => s.agents.records.some((r) => r.id === id);
  const originOf = (h, chain) => h.state.quests.byId[chain.questIds[0]].origin.agentId;
  check('两条轨道铸出的任务都记着花名册里真实的那位 Agent',
    [rosterHas(mockForgeH.state, originOf(mockForgeH, mockChain)),
      rosterHas(liveForgeH.state, originOf(liveForgeH, liveChain))], [true, true]);
  check('而且就是这条职业线的那个人（不是随便一个 class 类 Agent）',
    [originOf(mockForgeH, mockChain), originOf(liveForgeH, liveChain)], ['agent_class_investor', 'agent_class_investor']);
  check('密钥只出现在请求头里，不进存档', JSON.stringify(liveForgeH.state).includes(T_KEY), false);

  // ===== B · 加载态 =====
  // Live：调度那一盏在 0 个请求时点亮、在 1 个请求后熄灭；生成那盏 1 → 2。
  check('Live：两盏灯，每盏都是"先亮灯 → 发请求 → 熄灯"', lampTrace(liveForgeH), [[0, 1], [1, 2]]);
  check('Mock：离线也有加载态（本地生成同样要花一点时间）', lampTrace(mockForgeH), [[0, 0], [0, 0]]);
  check('Mock：灯上没有 Agent 名字为空（遮罩要显示"谁在工作"）',
    mockForgeH.activity.filter((e) => e.kind === 'begin').every((e) => e.name && e.label), true);

  // ===== C · 硬校验：不合法的 JSON 不许落库 =====
  // 一份 quests 只有 1 条的产出 —— 结构上能过 JSON.parse，但它不成链
  const badFetch = makeFetch(liveDispatch('investor'), liveClassOut([liveDraft(1)]));
  const badH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: badFetch });
  const badRes = await badH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('模型只给 1 步 → 这一稿不成链，但玩家这一次点击仍然有东西出来', badRes.ok, true);
  check('那一下降级被记进 corrections（它是证据，不是日志）',
    badRes.corrections.some((c) => c.includes('1 步')), true);
  check('模型的产出被替身顶掉后，来源如实标成 mock（不能谎报 api）', badRes.source, 'mock');
  check('顶上来的是替身的三步，不是"模型那一步"',
    badH.state.quests.chains[badRes.data.chainId].questIds.map((id) => badH.state.quests.byId[id].title).includes('真身给的第 1 步'), false);

  // schema 层面的硬拦：quests 里少了必填字段
  const brokenDraft = liveDraft(1);
  delete brokenDraft.proof;
  const brokenFetch = makeFetch(liveDispatch('investor'), liveClassOut([brokenDraft, liveDraft(2)]));
  const brokenH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: brokenFetch });
  const brokenRes = await brokenH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('缺字段 → schema_violation → 同样优雅降级（不是白屏、不是崩）', brokenRes.ok, true);
  check('这一次的钱**照记**（请求成功、内容不能用 —— 账本不该少一笔）',
    brokenH.state.ai.usage.costUsdCents > 0, true);
  check('校验失败的那条调用日志标着 parsedOk=false',
    brokenH.state.agents.invocations.some((l) => l.parsedOk === false && l.errorMessage !== null), true);

  // 语义层的拦：目录里没有这条职业线
  const ghostFetch = makeFetch(liveDispatch('quantum_chef'), liveClassOut([liveDraft(1), liveDraft(2)]));
  const ghostH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: ghostFetch });
  const ghostRes = await ghostH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('模型编了一条不存在的职业线 → 退回关键词路由，而不是铸出一批点不开的任务',
    ghostRes.ok && ghostRes.data.classId, 'investor');
  check('退回这件事留下痕迹', ghostRes.corrections.some((c) => c.includes('quantum_chef')), true);

  // 语义层的拦：三条草稿共用一个 tempId
  const dupFetch = makeFetch(
    liveDispatch('investor'),
    liveClassOut([liveDraft(1), liveDraft(1, { title: '真身给的第 1 步（撞名）' }), liveDraft(2)]),
  );
  const dupH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: dupFetch });
  const dupRes = await dupH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  const dupIds = dupH.state.quests.chains[dupRes.data.chainId].questIds;
  check('tempId 撞名 → 后来者改名，三条任务是三个 id',
    [dupIds.length, new Set(dupIds).size], [3, 3]);

  // 语义层的拦：模型给了 4 步
  const fourFetch = makeFetch(
    liveDispatch('investor'),
    liveClassOut([liveDraft(1), liveDraft(2), liveDraft(3), liveDraft(4)]),
  );
  const fourH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: fourFetch });
  const fourRes = await fourH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('模型给了 4 步 → 截到 3 步（一条链不该长到让人望而生畏）', fourRes.data.stepCount, 3);
  check('截断这件事也留下痕迹', fourRes.corrections.some((c) => c.includes('截到')), true);

  // ===== D · 闸门与提示：什么该打扰玩家，什么不该 =====
  //
  // ⚠️ 这里有一个非常容易写错的前提：`createMockState()` 出来的存档
  //    **本来就开着离线开关**（provider='mock'）。所以"没配密钥"这一条
  //    必须先 `toLive()` —— 否则测的是"玩家自己选了离线"，而不是缺密钥。
  //    （第一版就是这么写的，两条判据撞成了同一个状态。）
  const missingKeyH = harness(toLive(createMockState()), {});
  const missingKeyRes = await missingKeyH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('没配密钥：照样出东西（闸门 ② 只是降级，不是失败）', missingKeyRes.ok, true);
  check('没配密钥：要提示 —— 玩家已经关掉了离线开关，他在等真身', missingKeyH.notices.length, 1);
  check('提示带一键切换（PO 点名的那条路：优雅捕获 + 一键切回本地轨道）',
    missingKeyH.notices[0].action.kind, 'enable_local_track');
  check('提示说清了原因', missingKeyH.notices[0].body.includes('API Key'), true);
  check('提示不道歉、不拟人化（对面坐着几个人，不是一个会内疚的服务）',
    /抱歉|对不起|不好意思/.test(missingKeyH.notices[0].body), false);

  // 玩家自己按下的开关 —— 那是他的选择，不是意外。每点一次弹一次是纯粹的骚扰
  const selfMockH = harness(applyMockMode(createMockState(), true), { apiKey: T_KEY, fetchImpl: makeFetch(liveDispatch('investor')) });
  const selfMockRes = await selfMockH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('玩家自己开着离线开关：不弹（否则每点一次都要被念一遍）', selfMockH.notices.length, 0);
  check('而且真的没发请求（开关是硬闸门，不是提示语）',
    [selfMockRes.source, selfMockH.activity.length > 0], ['mock', true]);

  // 预算用尽 —— 设计内的静默降级（预算是玩家自己设的，用尽自动降级是它承诺过的行为）
  const budgetState = toLive(createMockState());
  const budgetH = harness({
    ...budgetState,
    ai: { ...budgetState.ai, usage: { ...budgetState.ai.usage, costUsdCents: budgetState.ai.usage.budgetUsdCents } },
  }, { apiKey: T_KEY, fetchImpl: makeFetch(liveDispatch('investor')) });
  const budgetRes = await budgetH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('本月预算用尽：静默降级，不打断（这是它承诺过的行为）',
    [budgetRes.ok, budgetH.notices.length], [true, 0]);

  // 熔断已打开 —— "后台连着坏了几次"，这件事玩家该知道
  const openState = toLive(createMockState());
  const openH = harness({
    ...openState,
    ai: { ...openState.ai, circuitBreaker: { open: true, consecutiveFailures: 3, openedAt: '2026-10-07T12:59:00.000Z' } },
  }, { apiKey: T_KEY, fetchImpl: makeFetch(liveDispatch('investor')) });
  const openRes = await openH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('熔断已打开：要提示（它意味着后台已经连着坏了几次）',
    [openRes.ok, openH.notices.length], [true, 1]);

  // 401：密钥无效 —— 这一次**发出去了**，所以是意外，必须说
  const fetch401 = makeFetch(401);
  const h401 = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: fetch401 });
  const r401 = await h401.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('401：这一下没真的发生，但玩家这一次点击仍然有东西出来', r401.ok, true);
  check('401：不重试（两次调用共发 2 次请求 —— 401 重试一百次也是 401，每重试一次都在把无效密钥再递一遍）',
    [fetch401.sends.length, logCount(h401)], [2, 2]);
  check('401：一次操作只弹一条提示（两个 Agent 都撞上同一个原因，不该堆两条一模一样的话）',
    h401.notices.length, 1);

  // ── 裁定 ①：401 与熔断解绑 ────────────────────────────────────────────────
  //
  // 401 是"我这边的密钥不对"，不是"对面病了"。把两者混在一起有两个坏处：
  //   ① 密钥填错两次之后，提示条会改口说"AI 服务暂时熔断"—— 真正的原因被盖住，
  //      玩家会去查网络、查服务状态，而不是去查那一格该改的输入框；
  //   ② 熔断要锁 5 分钟，而**密钥是可以当场改好的** —— 锁住的恰恰是最该立刻恢复的时刻。
  // 所以：只有"对面病了"（5xx 与超时）才推进熔断计数（bus.ts 的 TRIPS_CIRCUIT）。
  check('401：这一句直接说密钥（PO 裁定原文："API Key 无效，请在控制室核对密钥"）',
    [h401.notices[0].title, h401.notices[0].body.includes('请在控制室核对密钥')], ['API Key 无效', true]);
  check('401：熔断计数一个都不涨（两次调用 → 0 笔）', h401.state.ai.circuitBreaker.consecutiveFailures, 0);
  check('401：熔断保持关着', h401.state.ai.circuitBreaker.open, false);
  check('401：提示里不提熔断 / 冷却 —— "冷却结束后会自动恢复"在这里是假话：密钥不改，它不会恢复',
    /熔断|冷却/.test(h401.notices[0].title + h401.notices[0].body), false);
  // 解绑的实际好处，也是它唯一值得改的理由：密钥改好之后，下一次点击立刻走真身。
  const fixedFetch = makeFetch(liveDispatch('investor'), liveClassOut([liveDraft(1), liveDraft(2)]));
  const fixedH = harness(h401.state, { apiKey: T_KEY, fetchImpl: fixedFetch, now: T_KEYFIX });
  const fixedRes = await fixedH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('401 之后把密钥改好：下一次点击立刻走真身（没有被那 5 分钟冷却锁在门外 —— 时钟只走了 90 秒）',
    [fixedRes.source, fixedFetch.sends.length], ['api', 2]);

  // 5xx：对面病了 —— 这才是熔断要拦的那一类
  const fetch500 = makeFetch(500);
  const h500 = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: fetch500 });
  const r500 = await h500.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('5xx：照旧重试（可重试 → 每次调用打满 3 次请求）',
    [r500.ok, fetch500.sends.length], [true, 6]);
  check('5xx：仍然推开熔断（两次调用 → 2 笔）', h500.state.ai.circuitBreaker.consecutiveFailures, 2);
  check('5xx：不算密钥的错（提示是"这次没接上"，不是"API Key 无效"）',
    [h500.notices[0].title, /API Key/.test(h500.notices[0].title + h500.notices[0].body)], ['这次没接上', false]);

  // 超时：也算"对面病了"（另一条推进熔断的路，PO 裁定里与 5xx 并列的那半条）
  const abortErr = new Error('请求超过 15000ms 未返回');
  abortErr.name = 'AbortError';
  const timeoutFetch = makeFetch(abortErr);
  const timeoutH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: timeoutFetch });
  const timeoutRes = await timeoutH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('超时：可重试 → 打满次数才降级',
    [timeoutRes.ok, timeoutFetch.sends.length], [true, 6]);
  check('超时：推开熔断（两次调用 → 2 笔）', timeoutH.state.ai.circuitBreaker.consecutiveFailures, 2);

  // 断网：可重试 → 打满重试次数才降级
  const netFetch = makeFetch(new Error('socket hang up'));
  const netH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: netFetch });
  const netRes = await netH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('断网：重试到次数上限之后才降级（默认 2 次重试 → 每次调用发 3 次请求）',
    [netRes.ok, netFetch.sends.length, logCount(netH)], [true, 6, 2]);
  check('断网：玩家被告知了，而且这一次仍然有东西出来', netH.notices.length > 0, true);
  check('断网：没有虚报 token（传输层就没通的调用不该有可结算的用量）',
    used(netH.state, 'tokensIn'), 0);

  // 熔断：连着坏到阈值就停下来
  // ⚠️ 这一条要跨**两次**用户操作才数得到三 —— 这正是它值得被钉住的地方：
  //    同一个操作里的第二次失败，必须接着前一次的数（而不是把开局那个计数 +1 再写一遍）。
  check('两次调用都失败 → 熔断计数是 2，不是 1（同一次操作内部的失败要累加）',
    netH.state.ai.circuitBreaker.consecutiveFailures, 2);
  const tripFetch = makeFetch(new Error('still down'));
  const tripH = harness(netH.state, { apiKey: T_KEY, fetchImpl: tripFetch, now: T_TRIP });
  const tripRes = await tripH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('再坏一次 → 到达阈值，熔断打开', tripH.state.ai.circuitBreaker.open, true);
  check('熔断打开之后那一次：**停下来的那一半没再发请求**（这是"停下来"与"降级"的分界）',
    tripFetch.sends.length, 3);
  check('照旧有东西出来（停的是花钱的那条路，不是整个应用）', tripRes.ok, true);

  // 熔断已经打开 → 一次请求都不发
  const openFetch = makeFetch(liveDispatch('investor'), liveClassOut([liveDraft(1), liveDraft(2)]));
  const afterTrip = harness(tripH.state, { apiKey: T_KEY, fetchImpl: openFetch, now: T_LOCKED });
  const tripped = await afterTrip.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('熔断期间：一次请求都没发出去', openFetch.sends.length, 0);
  check('熔断期间：照旧有东西出来', tripped.ok, true);
  check('熔断期间：提示说清了"冷却结束后会自动恢复"', afterTrip.notices[0].body.includes('冷却'), true);
  check('熔断期间：一次操作只弹一条提示（两个 Agent 被拦下，不该堆两条一模一样的话）',
    afterTrip.notices.length, 1);

  // 冷却期满 → 半开，放一次试探
  const coldState = {
    ...netH.state,
    ai: { ...netH.state.ai, circuitBreaker: { open: true, consecutiveFailures: 3, openedAt: '2026-10-07T12:00:00.000Z' } },
  };
  const halfOpenFetch = makeFetch(liveDispatch('investor'), liveClassOut([liveDraft(1), liveDraft(2)]));
  const halfOpenH = harness(coldState, { apiKey: T_KEY, fetchImpl: halfOpenFetch, now: T_HALF });
  const halfRes = await halfOpenH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: false });
  check('冷却期满（5 分钟）→ 放行一次试探，而不是一直关着', [halfRes.source, halfOpenFetch.sends.length], ['api', 2]);
  check('试探成功后熔断复位', halfOpenH.state.ai.circuitBreaker, { open: false, consecutiveFailures: 0, openedAt: null });

  // ===== E · 三本账 =====
  check('第一本账：本月用量累加（Live 两次调用 → 两次 120 进来）', used(liveForgeH.state, 'tokensIn'), 240);
  check('第一本账：Mock 轨道不计费', used(mockForgeH.state, 'tokensIn'), 0);
  check('第一本账：月份落在当月的账上', liveForgeH.state.ai.usage.month, T_MONTH);
  check('第二本账：每次调用一条日志（Live 两次调用 → 两条）', logCount(liveForgeH), 2);
  check('第三本账：履历长在**那个人**身上（花名册上有人被叫过，不是"所有人都没被调用过"）',
    liveForgeH.state.agents.records.some((r) => grew(liveForgeH.state, r.id) > 0), true);
  check('第三本账：调度员自己那条履历记到了这次调用', grew(liveForgeH.state, 'agent_dispatcher'), 1);
  check('第三本账：token 也记在那个人头上', grew(liveForgeH.state, 'agent_dispatcher', 'tokensIn'), 120);
  check('调用日志里没有密钥（rawOutput / errorMessage 都过了 redact）',
    JSON.stringify(liveForgeH.state.agents.invocations).includes(T_KEY), false);
  check('日志里没有超长原文（rawOutput 截到 4000 字以内）',
    liveForgeH.state.agents.invocations.every((l) => l.rawOutput === null || l.rawOutput.length <= 4000), true);

  // ===== F · 场景 B：复盘判官 =====
  //
  // ⚠️ 演示存档里**没有**已经点了"完成"的任务（它停在 active）。
  //    判官只在 turn_in_pending 上工作（这是状态机守卫），所以这里先用手上的
  //    纯函数把一条推进到待结算 —— 而不是去改 mockState 迁就测试。
  //    顺带把守卫本身也测到了：同一条任务不会判两次（见本节末尾）。
  const pendingTurnIn = (base = createMockState()) =>
    openTurnIn(base, questsByStatus(base, 'active')[0].id, T_NOW);
  const turnInId = questsByStatus(pendingTurnIn(), 'turn_in_pending')[0].id;

  // 空复盘：**不叫醒判官**
  const quietH = harness(pendingTurnIn());
  const quietRes = await quietH.thunks.judgeTurnIn({ questId: turnInId, reflection: '   ' });
  check('空复盘：判官这一次调用**根本没发生**（不是"发生了但没结果"）',
    [quietH.activity.length, logCount(quietH), quietRes.data.judged], [0, 0, false]);
  check('空复盘：基础奖励照发，加成 0',
    [quietH.state.quests.byId[turnInId].grant.bonusPct, quietH.state.quests.byId[turnInId].status], [0, 'completed']);
  check('空复盘：不产生日记条目（它换不来日记）', quietH.state.quests.byId[turnInId].journalEntryId, null);

  // 有复盘 + Live
  const judgeBase = pendingTurnIn();
  const judgeQuest = judgeBase.quests.byId[turnInId];
  const judgeH = harness(toLive(judgeBase), { apiKey: T_KEY, fetchImpl: makeFetch(liveArbiter()) });
  const judgeRes = await judgeH.thunks.judgeTurnIn({ questId: turnInId, reflection: '我发现自己是在信息不全时先动手，这次先列了三个假设。' });
  const judged = judgeH.state.quests.byId[turnInId];
  check('有复盘：判官上岗，结果落库', [judgeRes.source, judged.status], ['api', 'completed']);
  check('加成是**系统认过的账**，不是模型说的 19%（AI 的数值幻觉破坏不了经济系统）',
    judged.grant.bonusPct < 19 && judged.grant.bonusPct > 0, true);
  check('结算后有日记条目，且带上判官的点评', judged.journalEntryId !== null && judged.grant.bonusReason !== null, true);
  check('经验按加成后的值入账',
    judged.grant.final.exp, Math.round(judgeQuest.reward.exp * (1 + judged.grant.bonusPct / 100)));
  check('判官也留了履历', grew(judgeH.state, 'agent_arbiter') > 0, true);

  // 封闭词表：模型自创的标签必须被拦下（44 条词表外的东西在界面上完全不可见）
  const tagH = harness(toLive(pendingTurnIn()), {
    apiKey: T_KEY,
    fetchImpl: makeFetch(liveArbiter({
      milestoneTags: ['reproducibility', 'excellent'],
      milestoneConfidence: [{ tag: 'reproducibility', confidence: 0.8 }, { tag: 'excellent', confidence: 0.9 }],
    })),
  });
  const tagRes = await tagH.thunks.judgeTurnIn({ questId: turnInId, reflection: '这次我先写了预案再动手，结果与预期一致。' });
  check('词表外的标签被丢（"excellent" 是模型自创的）', JSON.stringify(tagH.state.evolution).includes('excellent'), false);
  check('合法的那个标签照常投喂进化树', JSON.stringify(tagH.state.evolution).includes('reproducibility'), true);
  check('丢掉这件事留下痕迹', tagRes.corrections.some((c) => c.includes('excellent')), true);

  // 状态机守卫：已经结算过的任务不再判一次
  const againRes = await judgeH.thunks.judgeTurnIn({ questId: turnInId, reflection: '再写一次试试。' });
  check('已经结算过的任务 → 直接拒绝，不再发一次请求（重复结算是最贵的 bug）',
    [againRes.ok, logCount(judgeH)], [false, 1]);

  // ===== G · 场景 C：社交智囊 =====
  const contacts = createMockState().network.contacts;
  check('前提：通讯录里有足够的人（否则下面两条断言会退化成"0 == 0"）', contacts.length >= 2, true);
  const mentee = contacts[0];
  const other = contacts[1];

  const adviceH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: makeFetch(liveAdvice()) });
  const adviceRes = await adviceH.thunks.askAdvisor({ contactId: mentee.id, situation: '想问问实习的事，但半年没联系了。' });
  const chenAfter = adviceH.state.network.contacts.find((c) => c.id === mentee.id);
  check('智囊的话进了这位联系人的建议历史（不是全局池子里）',
    [adviceRes.ok, chenAfter.adviceHistory.length - mentee.adviceHistory.length], [true, 1]);
  check('建议正文把"局面"与"人性"两段连起来了（prompt 分开写、落库连读）',
    chenAfter.adviceHistory.at(-1).advice.includes('时机') && chenAfter.adviceHistory.at(-1).advice.includes('\n\n'), true);
  check('找不到的联系人 → 就地拒绝，不发请求', (await adviceH.thunks.askAdvisor({ contactId: 'c_nobody', situation: 'x' })).ok, false);

  const solverH = harness(toLive(createMockState()), {
    apiKey: T_KEY,
    fetchImpl: makeFetch(liveAdvice({
      recommendedContacts: [
        { contactId: 'c_made_up', reason: '编的', approach: '编的' },
        { contactId: other.id, reason: '他做过这件事', approach: '问一个具体的问题' },
      ],
    })),
  });
  const solverRes = await solverH.thunks.solveNetwork({ question: '有件事需要找一个做过落地页的人。' });
  const logged = solverH.state.network.solverLog.at(-1);
  check('编造的联系人被拦下（玩家点过去会看到一张空卡片）', logged.recommendations.map((r) => r.contactId), [other.id]);
  check('拦住这件事留下痕迹（"这个 Agent 最近老是在编 id"要能被看见）',
    solverRes.corrections.some((c) => c.includes('c_made_up')), true);
  const adviceTotal = (s) => s.network.contacts.reduce((n, c) => n + c.adviceHistory.length, 0);
  check('智囊的检索进的是 solverLog，不是某个联系人的 adviceHistory（全局检索没有"跟谁说"的对象）',
    [solverH.state.network.solverLog.length - BASELINE.network.solverLog.length,
      adviceTotal(solverH.state) - adviceTotal(BASELINE)], [1, 0]);

  // ===== H · 场景 D：换个做法（两条红线） =====
  //
  // 靶子是自己铸的：改法只适用于 `draft` 上的链成员（rerouteQuestDraft 的第一道守卫），
  // 而演示存档自带的那两条链早就审过了。铸一条新的，靶子的形状才是我说了算的
  // —— 三步、中间那步带后继，正好压到"必须把后继的 objective 原文带上"这条红线上。
  const RR_HOME_IDEA = '把这套做法的第二步换成一个我现在做得动的版本';
  const rrBase = generateQuestChain(
    createMockState(),
    { idea: RR_HOME_IDEA, deepDeliberation: false, classId: null },
    T_NOW,
  );
  const rrHome = chainFromIdea(rrBase, RR_HOME_IDEA);
  const rrQuestId = rrHome.questIds[1] ?? rrHome.questIds[0];
  const rrQuest = rrBase.quests.byId[rrQuestId];
  const rrSuccessor = successorOf(rrBase, rrHome.id, rrQuest.chain.index);

  // 红线①的交叉断言：同一份输入，两条路算出来的 EXP 必须相等
  const rrMockOutcome = mockReroute({ quest: rrQuest, successor: rrSuccessor, request: DEFAULT_RR });
  const rrInflated = liveDraft(9, {
    tempId: `${rrQuest.id}_rr`,
    title: '模型给的一版',
    difficulty: Math.max(1, rrQuest.difficulty - 1),
    reward: { exp: 999 },
  });
  const rrNormalized = normalizeRerouteOutcome(rrQuest, rrInflated);
  check('模型想拿原价（999）→ 被按降档比例压回来',
    rrNormalized.value.draft.reward.exp < 999, true);
  check('两条路算出的 EXP 逐字相等（常量只有一份，两条路都读它）',
    rrNormalized.value.draft.reward.exp, rrMockOutcome.draft.reward.exp);
  check('压回来这件事留下痕迹', rrNormalized.corrections.some((c) => c.includes('上限')), true);

  // 模型反过来想加码
  const rrHarder = normalizeRerouteOutcome(rrQuest, liveDraft(9, {
    tempId: `${rrQuest.id}_rr`,
    title: '模型给的一版',
    difficulty: Math.min(5, rrQuest.difficulty + 1),
    reward: { exp: 999 },
  }));
  check('模型把这一步改得更难 → 难度不动、奖励也不动（改法不是加码的入口）',
    [rrHarder.value.draft.difficulty, rrHarder.value.draft.reward.exp],
    [rrQuest.difficulty, Math.min(999, Math.max(20, rrQuest.reward.exp))]);
  check('"想加码"这件事被记了一笔', rrHarder.corrections.some((c) => c.includes('更难')), true);

  // 走一遍完整的 Live reroute（靶子当然是上面那条自己铸的链 —— 换一份存档的话，
  // `rrQuestId` 在那个世界里压根不存在，测的就成了"找不到这一步"）
  const liveRrH = harness(toLive(rrBase), {
    apiKey: T_KEY,
    fetchImpl: makeFetch(liveDraft(9, {
      tempId: 'x_rr',
      title: '把这一步做成一版小的',
      difficulty: 1,
      reward: { exp: 999 },
    })),
  });
  const liveRrRes = await liveRrH.thunks.reroute({ questId: rrQuestId, request: '这一步我做不动，换个更可行的做法。' });
  const replaced = Object.values(liveRrH.state.quests.byId).find((q) => q.origin.reroutedFrom === rrQuestId);
  check('Live 改法落库：旧的那一步留档为 rerouted，新的顶上来',
    [liveRrRes.ok, liveRrH.state.quests.byId[rrQuestId].status, replaced?.status], [true, 'rerouted', 'draft']);
  check('替换件带着改法的历史（它知道自己是从哪儿来的）', replaced.origin.rerouteHistory.at(-1).before.exp, rrQuest.reward.exp);
  check('换完之后额度真的用掉了（读回状态校验，不猜是哪道闸门退的）',
    liveRrH.state.quests.chains[rrQuest.chain.chainId].review.rerouteCount >= 1, true);
  check('Live 改法也走加载态：亮灯 → 发请求 → 熄灯', lampTrace(liveRrH), [[0, 1]]);

  // 单条任务不适用改法
  const soloH = harness(createMockState());
  check('单条任务 → 不发请求，就地说明"换个做法对它不适用"',
    (await soloH.thunks.reroute({ questId: 'q_nope', request: 'x' })).ok, false);

  // ===== I · 编排：深推演是可选的一段，不是必经之路 =====
  const deepFetch = makeFetch(
    liveDispatch('investor'),
    liveClassOut([liveDraft(1), liveDraft(2)]),
    {
      approved: true,
      reviewerNote: '第一步不需要任何前置条件，放在开头是对的。',
      revisedQuests: [liveDraft(2, { title: '审核官把顺序换了一下' }), liveDraft(1)],
      revisionInstructions: [],
      difficultyCurve: { isAscending: true, comment: '递进合理' },
      spoilerCheck: { passed: true, leakingTempIds: [], comment: '无剧透' },
      continuityCheck: { passed: true, brokenJoints: [] },
      finalOrder: ['api_2', 'api_1'],
    },
  );
  const deepH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: deepFetch });
  const deepRes = await deepH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: true });
  const deepChain = deepH.state.quests.chains[deepRes.data.chainId];
  check('勾了深推演 → 审核官被叫醒（三次调用）', logCount(deepH), 3);
  check('审核官的排序被采纳（finalOrder 说了算）',
    deepChain.questIds.map((id) => deepH.state.quests.byId[id].title), ['审核官把顺序换了一下', '真身给的第 1 步']);
  // ⚠️ 批注落在 `origin.reviewerNote` 上（不是 `quest.reviewerNote`）。
  //    写错路径时这两条会以一种很有欺骗性的方式通过：`undefined !== null` 恒真，
  //    于是"有批注"那条永远绿，而"没有批注"那条永远红 —— 看起来像生产代码的毛病。
  check('审核官的批注落在了这几步上',
    deepChain.questIds.every((id) => deepH.state.quests.byId[id].origin.reviewerNote !== null), true);
  check('未勾深推演 → 没有批注（不能显示一条玩家没要求过的意见）',
    liveChain.questIds.every((id) => liveForgeH.state.quests.byId[id].origin.reviewerNote === null), true);

  // 审核官没接上**不该**毁掉整次铸造
  const reviewFailFetch = makeFetch(
    liveDispatch('investor'),
    liveClassOut([liveDraft(1), liveDraft(2)]),
    500,
  );
  const reviewFailH = harness(toLive(createMockState()), { apiKey: T_KEY, fetchImpl: reviewFailFetch });
  const reviewFailRes = await reviewFailH.thunks.forgeChain({ idea: LIVE_IDEA, classId: null, deepDeliberation: true });
  check('审核官没接上 → 链照常落库，而且落的是**生成稿**（因为审核官请假就不让生成是不合理的）',
    [reviewFailRes.ok, reviewFailRes.data.stepCount,
      reviewFailH.state.quests.chains[reviewFailRes.data.chainId].questIds
        .map((id) => reviewFailH.state.quests.byId[id].title)],
    [true, 2, ['真身给的第 1 步', '真身给的第 2 步']]);
  // 审核官那一趟 500 → gateway 重试到底 → 降级。这条路径**不是** `reviewRun === null`
  // （那次调用有替身，所以它照常返回一份"审过的"结果），所以这里验的是真正发生的事：
  // 失败被记进第二本账、且提示条会告诉玩家这次是本地顶上的。
  const revFailLog = reviewFailH.state.agents.invocations.at(-1);
  check('审核官那一趟挂了这件事没被吞掉（日志里那条标着 parsedOk=false）',
    [revFailLog.agentId, revFailLog.parsedOk], ['agent_chain_reviewer', false]);
  check('玩家被告知了这次是本地轨道顶上（断网/超时那一类意外总是要说的）',
    reviewFailH.notices.some((n) => n.title === '这次没接上'), true);
  // -------------------------------------------------------------------------
  console.log('\n【㉖ 通讯录：手动添加一个人】');
  // -------------------------------------------------------------------------
  /**
   * 这一节钉的不是"能不能加人"，而是**加进来的人身上没有什么是编的**。
   *
   * 手动添加是全项目唯一由玩家亲手造出一个 Contact 的入口，
   * 于是它也是唯一能把"我们替他编了一件事"塞进档案的地方。
   * 那种错不会崩，也不会报错：它只是让卡片上多出一个字母、多出一条等级 ——
   * 而玩家会以为那是自己记过的。所以下面有一半断言在问"这个字段还是空的吗"。
   */
  const { createContact, setContactStage } = await server.ssrLoadModule('/src/store/operations.ts');
  const { isUnrecorded } = await server.ssrLoadModule('/src/lib/selectors.ts');
  const { mockSocialSolver: solverOf } = await server.ssrLoadModule('/src/lib/mockAdvisor.ts');

  const AD_NOW = new Date('2026-10-07T15:00:00.000Z');
  const roster0 = createMockState();
  const roster1 = createContact(
    roster0,
    { name: '  周砚  ', relationType: 'collaborator', note: '  实验室隔壁组，做冷冻电镜，话不多  ' },
    AD_NOW,
  );
  const added = roster1.network.contacts.at(-1);
  check('名单 +1', roster1.network.contacts.length, roster0.network.contacts.length + 1);
  check('新人落在名单尾部（名单是按"加进来的顺序"长的）', roster1.network.contacts.at(-2), roster0.network.contacts.at(-1));
  check('名字两端空白去掉', added.name, '周砚');
  check('描述两端空白去掉（它是要印在卡片上的）', added.note, '实验室隔壁组，做冷冻电镜，话不多');
  check('关系类型原样落库（分类是玩家给的，不是我们猜的）', added.relationType, 'collaborator');
  truthy('id 带 c_ 前缀（玩家回看存档时认得出它是什么）', added.id.startsWith('c_'));
  check('id 与已有的人不撞', roster0.network.contacts.some((c) => c.id === added.id), false);
  check('id 与 mock 里那三个的命名风格一致（都是 c_ 开头）', added.id.slice(0, 2), 'c_');

  // —— 观测值必须缺席：这一组是本节的核心 ——
  check('阶段不替玩家填（null = 还没定过）', added.stage, null);
  check('评级不替玩家填（null = 还没有过观测）', added.currentGrade, null);
  check('评级历史是空的（没有观测就没有快照）', added.gradeHistory, []);
  check('四维全 0（一条互动都还没有，凭什么是 50）', added.dimensions, { warmth: 0, trust: 0, influence: 0, reciprocity: 0 });
  check('互动/承诺/备忘/建议史一律空', [
    added.interactions, added.openCommitments, added.whyItMatters, added.boundaries,
    added.preferences, added.tags, added.adviceHistory, added.openCommitments.length,
    added.interactionCount, added.lastContactAt, added.nextTouchAt,
  ], [[], [], [], [], [], [], [], 0, 0, null, null]);
  check('profile 只记事实，一格不填', added.profile, {
    org: null, role: null, field: null, metContext: null, metAt: null, location: null, commonGround: [],
  });
  check('createdAt 用注入的时钟（纯函数不读 Date.now）', added.createdAt, AD_NOW.toISOString());

  // —— 聚合视图里的他：算进"人数"，但不进任何一档等级 ——
  const rosterSummary = networkSummary(roster1, AD_NOW);
  check('不进「单向消耗」（0 − 0 = 0，离 25 很远）', rosterSummary.lopsidedContactIds.includes(added.id), false);
  check('但他算进了总数与 byType（他确实在名单上）', [rosterSummary.totalContacts, rosterSummary.byType.collaborator], [roster0.network.contacts.length + 1, 2]);
  check(
    '等级没定 → 分布里哪一档都不算他（"还没说"不是第九档）',
    rosterSummary.byLevel.stranger + rosterSummary.byLevel.known + rosterSummary.byLevel.connected +
      rosterSummary.byLevel.trusted + rosterSummary.byLevel.close + rosterSummary.byLevel.deep +
      rosterSummary.byLevel.strained + rosterSummary.byLevel.dormant,
    3, // 老三位各自定过一档，他这一位还没定
  );
  check('卡片判据：他是"还没有记录"的那一种', isUnrecorded(added), true);
  check('卡片判据：老联系人不是', roster0.network.contacts.map(isUnrecorded), [false, false, false]);

  // —— 拒绝路径与幂等 ——
  check('名字为空 → 原对象返回', createContact(roster0, { name: '', relationType: 'other', note: 'x' }, AD_NOW) === roster0, true);
  check('名字全是空白 → 原对象返回（空白不是名字）', createContact(roster0, { name: '   ', relationType: 'other', note: 'x' }, AD_NOW) === roster0, true);
  check('描述留空 → 落成 null，不是空字符串（「没写」不是一种内容）',
    createContact(roster0, { name: '甲', relationType: 'other', note: '   ' }, AD_NOW).network.contacts.at(-1).note, null);
  check('不给描述也照样能加人（它是可选的，不是"必填但可以空"）',
    createContact(roster0, { name: '甲', relationType: 'other', note: '' }, AD_NOW).network.contacts.length, roster0.network.contacts.length + 1);
  const twice = createContact(createContact(roster0, { name: '同名', relationType: 'friend', note: '' }, AD_NOW),
    { name: '同名', relationType: 'friend', note: '' }, AD_NOW);
  check('非幂等：同名同类型连加两次就是两个人（重名是现实，不是错误）', twice.network.contacts.length, roster0.network.contacts.length + 2);
  check('同一毫秒连加两个，id 也不撞', new Set(twice.network.contacts.map((c) => c.id)).size, twice.network.contacts.length);
  check('入参未被就地修改（老名单一条没多）', roster0.network.contacts.length, 3);
  check('老联系人一个字段都没被碰', JSON.stringify(roster1.network.contacts.slice(0, 3)), JSON.stringify(roster0.network.contacts));

  // —— 加进来的人立刻有用 ——
  // ① 能被检索到：他名字之外的那段话必须真的进了检索语料。
  //    只剩一个名字的人在「该找谁」里等同于不存在 —— 那这个功能就白加了。
  const found = solverOf({ contacts: roster1.network.contacts, question: '想找一个做冷冻电镜的人聊聊', now: AD_NOW });
  truthy('新人能被全局检索找到（描述真的进了语料）', found.recommendations.some((r) => r.contactId === added.id));
  const nameOnly = createContact(roster0, { name: '没写描述的人', relationType: 'other', note: '' }, AD_NOW);
  const found2 = solverOf({ contacts: nameOnly.network.contacts, question: '想找一个做冷冻电镜的人聊聊', now: AD_NOW });
  check('只有名字、没有描述的人检索不到（不是"找不到人"坏了，是这篇语料确实空）',
    found2.recommendations.some((r) => r.contactId === nameOnly.network.contacts.at(-1).id), false);
  // ② 立刻能派生任务：这不是"加进来先晾着"的名单
  const adQuest = createContactQuest(roster1, added.id, { title: '把冷冻电镜的问题整理成一页发过去' }, AD_NOW);
  const adQuestId = adQuest.quests.order.at(-1);
  check('新人立刻能派生一条行动任务', adQuest.quests.byId[adQuestId].linkedContactIds, [added.id]);
  // ③ 智囊也读得到他：一段记录都没有的人走的是"第一次开口"那条读法，
  //    不是"你们处在一个稳定的位置"（那句话对刚认识的人是假话）
  const adviceForFresh = ask(added, '');
  truthy('对一段记录都没有的人，智囊说的是"还没有记录"，不是"位置很稳"',
    adviceForFresh.advice.includes('什么都没有') && !adviceForFresh.advice.includes('稳定的位置'));

  // —— 关系等级：名单上唯一由玩家亲手定的一栏 ——
  // 它换掉的是系统替他排的两样（「该联系了」在催他、「核心圈」在替他分主次）。
  // 下面钉的是：这个操作**只动那一格**，而且"定等级"和"观测"是两回事。
  const leveled = setContactStage(roster1, added.id, 'connected');
  const leveledContact = leveled.network.contacts.at(-1);
  check('定等级：写进去了', leveledContact.stage, 'connected');
  check(
    '定等级只动那一格（名字 / 描述 / 关系类型 / 四维 / 评级一个都没碰）',
    [leveledContact.name, leveledContact.note, leveledContact.relationType, JSON.stringify(leveledContact.dimensions), leveledContact.currentGrade],
    [added.name, added.note, added.relationType, JSON.stringify(added.dimensions), null],
  );
  check('名单上别人的字段一个都没动', JSON.stringify(leveled.network.contacts.slice(0, 3)), JSON.stringify(roster1.network.contacts.slice(0, 3)));
  check('定等级**不重算评级**（判断不污染观测：gradeHistory 仍然是空的）', leveledContact.gradeHistory, []);
  check('定等级也改变不了"还没有记录"这个事实（等级是判断，记录才是观测）', isUnrecorded(leveledContact), true);
  check('定成原来那条 → 原对象返回（无事发生就绝不产生新引用）', setContactStage(leveled, added.id, 'connected') === leveled, true);
  check('人不在名单上 → 原对象返回', setContactStage(roster1, 'c_nobody', 'close') === roster1, true);
  check('改主意：再定一次就换过去了（不留痕，也不拦）',
    setContactStage(leveled, added.id, 'close').network.contacts.at(-1).stage, 'close');
  const leveledSummary = networkSummary(leveled, AD_NOW);
  // 问增量而不是问绝对值：林昭本来就在「有来往」那一档（见上面 ⑫ 的分布断言）
  check(
    '定过之后他进了自己那一档（那一档 +1，隔壁那档一动不动）',
    [
      leveledSummary.byLevel.connected - rosterSummary.byLevel.connected,
      leveledSummary.byLevel.close - rosterSummary.byLevel.close,
    ],
    [1, 0],
  );
  check(
    '分布之和 = 定过等级的人数（他这一位从"还没说"变成了"有来往"）',
    Object.values(leveledSummary.byLevel).reduce((a, b) => a + b, 0),
    4,
  );
  check('定等级不进"单向消耗"（它不是一个由四维算出来的告警）',
    leveledSummary.lopsidedContactIds.includes(added.id), false);

  // —— 存档形状 ——
  check('新联系人是纯 JSON（没有 undefined / Date / Map 混进去）', scan(roster1), null);
  check('序列化后原样读回', JSON.stringify(JSON.parse(encodeSave(roster1))), JSON.stringify(roster1));
  const adLoad = decodeSave(encodeSave(roster1), CURRENT_SCHEMA_VERSION, MIGRATIONS, AD_NOW);
  check('新联系人能水合回来，并且还能被推进',
    [adLoad.save.network.contacts.at(-1).name, createContact(adLoad.save, { name: '乙', relationType: 'other', note: '' }, AD_NOW) !== adLoad.save],
    ['周砚', true]);

  // -------------------------------------------------------------------------
  console.log('\n【㉗ 现实里程碑：自己写一件事】');
  // -------------------------------------------------------------------------
  /**
   * 这一节钉的是**目录之外的那条通路**（PO 裁定：记录一件事要留出自由度）。
   *
   * 在此之前，"记一件事"的每一步都由定义驱动 —— EXP 阶梯、点灯名单、冷却、计数器，
   * 全都是 `REALITY_MILESTONES` 里那一行数据的产物。现在多了一种**没有定义**的记录，
   * 于是所有"按 counters 遍历""按 grantsGoalMilestoneIds 点灯"的代码都会遇见它。
   * 这类错不会崩：它只会安静地把 `undefined` 当成一条正常的定义，
   * 然后少发一点、多发一点、或者替玩家编出一个标题。
   */
  const { recordCustomMilestone } = await server.ssrLoadModule('/src/store/operations.ts');
  const { FREE_MILESTONE_EXP, MILESTONE_PHOTO_MAX } = await server.ssrLoadModule('/src/data/catalog/milestones.ts');

  const M_NOW = new Date(2026, 9, 7, 20, 0); // 10-07 20:00 —— 归属月 2026-10
  const wmBase = createMockState();
  const mCap = wmBase.settings.rewardPolicy.realityMilestoneMonthlyExpCap;
  const drafted = recordCustomMilestone(
    wmBase,
    {
      title: '  第一次自己开完一场会  ',
      category: 'life',
      occurredOn: '2026-10-06',
      note: '  没有人替我把话说完  ',
      snapshots: [],
      creditedClassId: null,
    },
    M_NOW,
  );
  const mine = drafted.milestones.records.at(-1);

  check('名单 +1', drafted.milestones.records.length, wmBase.milestones.records.length + 1);
  check('标题两端空白去掉（它是要印在墙上的）', mine.customTitle, '第一次自己开完一场会');
  check('描述两端空白去掉', mine.note, '没有人替我把话说完');
  check('definitionId 是 null —— 这是"自己写的"唯一凭据', mine.definitionId, null);
  check('分类原样落库（哪一类是玩家选的，不是我们猜的）', mine.customCategory, 'life');
  check('日期与记录时间：前者原样，后者用注入的时钟', [mine.occurredOn, mine.recordedAt], ['2026-10-06', M_NOW.toISOString()]);
  truthy('id 认得出是里程碑记录（玩家翻存档时知道它是什么）', mine.id.startsWith('rmr_'));
  check('id 不与已有记录相撞', wmBase.milestones.records.some((r) => r.id === mine.id), false);

  // —— 不点灯、不记账、不发现成的定义：这一组是本节的核心 ——
  check('不点灯：自己写的事不推任何终极目标（点灯规则长在定义上，而它没有定义）', mine.goalMilestoneIds, []);
  check('不点灯到连 endgame 那个对象都不新建（引用相等）', drafted.endgame === wmBase.endgame, true);
  check('不碰金库、不碰任务（这条通路只写里程碑与自己那点经验）',
    [drafted.vault === wmBase.vault, drafted.quests === wmBase.quests], [true, true]);
  // 这条最容易被写成顺手 `counters[?] = ...`。写进去的后果不在今天：
  // 它会在三天后变成一条"幽灵定义"，被某段按 counters 遍历的代码当成目录条目用
  check('不发现成的定义：counters 一个字都不动',
    JSON.stringify(drafted.milestones.counters), JSON.stringify(wmBase.milestones.counters));
  check('不发属性点（属性点只从定义里来）', drafted.player.freeAttributePoints, wmBase.player.freeAttributePoints);

  // —— 与目录条目共用同一本月度账 ——
  check('实发 = 目录阶梯的底价（不是"自己编一条最划算"）', [mine.expGranted, FREE_MILESTONE_EXP], [100, 100]);
  check('进的是同一本月度账',
    drafted.milestones.monthlyExpGranted['2026-10'],
    (wmBase.milestones.monthlyExpGranted['2026-10'] ?? 0) + 100);

  // 额度只剩 40：实发 40。算错一次这里就会多发出 60 —— 而且没人会知道
  const mPartial = structuredClone(wmBase);
  mPartial.milestones.monthlyExpGranted = { ...mPartial.milestones.monthlyExpGranted, '2026-10': mCap - 40 };
  const partialWrote = recordCustomMilestone(
    mPartial,
    { title: '额度只剩四十时记的一件事', category: 'life', occurredOn: null, note: '', snapshots: [], creditedClassId: null },
    M_NOW,
  );
  check('额度只剩 40 → 实发 40，不是 100（与目录条目同一条封顶口径）',
    partialWrote.milestones.records.at(-1).expGranted, 40);

  // 额度用尽：**照样能记**，只是不发经验。这是 PO 定下的措辞，也是这条通路的价值所在
  const mFull = structuredClone(wmBase);
  mFull.milestones.monthlyExpGranted = { ...mFull.milestones.monthlyExpGranted, '2026-10': mCap };
  const fullWrote = recordCustomMilestone(
    mFull,
    { title: '额度用完之后记的一件事', category: 'life', occurredOn: null, note: '', snapshots: [], creditedClassId: null },
    M_NOW,
  );
  const fullLast = fullWrote.milestones.records.at(-1);
  check('额度满了照样记下来（记录本身是目的），实发 0',
    [fullWrote.milestones.records.length - mFull.milestones.records.length, fullLast.expGranted], [1, 0]);
  check('实发 0 → 月度账上加的也是 0，不是 100', fullWrote.milestones.monthlyExpGranted['2026-10'], mCap);
  check('实发 0 → 一笔经验都没记进任何职业线（creditedClassId: null）', fullLast.creditedClassId, null);
  check('实发 0 → 连职业线对象都不新建（引用相等）', fullWrote.careers === mFull.careers, true);
  check('额度满了也不拦：拒绝路径只有"没写标题"这一条', fullWrote !== mFull, true);

  // —— 写不出标题 = 还没想清楚要不要记。这一条是**唯一的**拒绝理由 ——
  check('空标题 → 原对象返回（无事发生就绝不产生新引用）',
    recordCustomMilestone(wmBase, { title: '   ', category: 'life', occurredOn: null, note: '写了半天', snapshots: [], creditedClassId: null }, M_NOW) === wmBase, true);

  // —— 这笔经验记进哪条线 ——
  const bioBefore = wmBase.careers.tracks.find((t) => t.classId === 'computational_biology');
  const mToBio = recordCustomMilestone(
    wmBase,
    { title: '顺手记的一件事', category: 'life', occurredOn: null, note: '', snapshots: [], creditedClassId: 'computational_biology' },
    M_NOW,
  );
  const bioAfter = mToBio.careers.tracks.find((t) => t.classId === 'computational_biology');
  check('经验记进玩家指定的那条线', mToBio.milestones.records.at(-1).creditedClassId, 'computational_biology');
  check('那条线的累计 EXP 也跟着 +100（与另外三条通路同一条口径）',
    bioAfter.stats.expEarnedTotal - bioBefore.stats.expEarnedTotal, 100);
  // 没指定时**不是随机挑**的：兜底是"你在哪条线上走得最远"
  const highest = [...wmBase.careers.tracks].sort((a, b) => b.level - a.level)[0];
  const mAuto = recordCustomMilestone(
    wmBase,
    { title: '没说算进哪条线的一件事', category: 'life', occurredOn: null, note: '', snapshots: [], creditedClassId: null },
    M_NOW,
  );
  check('没指定 → 记进等级最高的那条线（"你在哪儿走得最远"）',
    mAuto.milestones.records.at(-1).creditedClassId, highest.classId);

  // —— 快照上限：UI 允许的图 + 一条链接，永远不该被静默截断 ——
  const many = Array.from({ length: 9 }, (_, i) => ({
    kind: 'photo', url: `data:image/jpeg;base64,AAAA${i}`, caption: null, addedAt: M_NOW.toISOString(),
  }));
  const mSnaps = recordCustomMilestone(
    wmBase,
    { title: '带了一堆图的一件事', category: 'life', occurredOn: null, note: '', snapshots: many, creditedClassId: null },
    M_NOW,
  );
  const kept = mSnaps.milestones.records.at(-1).snapshots;
  check('快照有硬上限（手改存档塞进来的多余图会被削掉）', kept.length < many.length, true);
  check('削掉的是**后面**那些：第一张永远留着（它最接近"当时"）', kept[0].url, many[0].url);
  check('UI 允许的图 + 一条链接，加起来仍在硬上限之内（正常使用永远不会被静默削掉）',
    MILESTONE_PHOTO_MAX + 1 <= kept.length, true);

  // —— 事后补一张（`attachMilestoneSnapshot`）——
  // 这条路是"照片可以过几天补"那句承诺的落点。它之前**没有任何调用方**，
  // 所以下面这几条既是新功能，也是对一句空话的追认：补图**只**动 snapshots 那一格。
  const { attachMilestoneSnapshot } = await server.ssrLoadModule('/src/store/operations.ts');
  const snap = (i) => ({ kind: 'photo', url: `data:image/jpeg;base64,BBB${i}`, caption: null, addedAt: M_NOW.toISOString() });
  const withOne = attachMilestoneSnapshot(drafted, mine.id, snap(1), M_NOW);
  const patched = withOne.milestones.records.find((r) => r.id === mine.id);
  check('补图落在那一条记录上', patched.snapshots.map((s) => s.url), [snap(1).url]);
  check('补图不动别的记录（只改一条）',
    JSON.stringify(withOne.milestones.records.filter((r) => r.id !== mine.id)),
    JSON.stringify(drafted.milestones.records.filter((r) => r.id !== mine.id)));
  check('补图不重发经验、不动月度账、不动计数器（它只是把图钉上去）',
    [patched.expGranted, withOne.milestones.monthlyExpGranted['2026-10'],
      JSON.stringify(withOne.milestones.counters), withOne.careers === drafted.careers],
    [mine.expGranted, drafted.milestones.monthlyExpGranted['2026-10'],
      JSON.stringify(drafted.milestones.counters), true]);
  check('记录不存在 → 原对象返回（补图补不到空气里去）',
    attachMilestoneSnapshot(drafted, 'rmr_nobody', snap(9), M_NOW) === drafted, true);
  // 从 1 张补到超出上限：丢的必须是**最早**那张 —— 与记录时的口径相反，
  // 而这次是对的：事后补图时，"最新的一张"才是玩家此刻想说的话
  let stacked = withOne;
  for (let i = 2; i <= 8; i++) stacked = attachMilestoneSnapshot(stacked, mine.id, snap(i), M_NOW);
  const stackedSnaps = stacked.milestones.records.find((r) => r.id === mine.id).snapshots;
  check('补到超过上限 → 削到上限为止', stackedSnaps.length, kept.length);
  check('削掉的是**最早**那张（补图时最新的一张最接近"此刻想说的话"）',
    [stackedSnaps[0].url, stackedSnaps.at(-1).url], [snap(3).url, snap(8).url]);

  // —— 里程碑墙：两种来源长在同一面墙上 ——
  const mWall = milestoneWall(drafted);
  const mineEntry = mWall.find((e) => e.record.id === mine.id);
  check('墙上认得出它：标题来自记录自己（不是"（没有标题的记录）"）', mineEntry.title, '第一次自己开完一场会');
  check('分类也来自记录自己', mineEntry.category, 'life');
  check('标成"自己写的"', mineEntry.custom, true);
  check('没有副标题（定义里那行小字长在定义上，它没有定义）', mineEntry.subtitle, '');
  check('没有"第 N 次"：自己写的事没有计数，也没有冷却',
    [mineEntry.repeatable, mineEntry.timesRecorded], [false, 1]);
  check('目录那条仍然是目录那条（同一面墙上，来源不同、地位相同）',
    mWall.find((e) => e.record.definitionId === 'rm_first_income').custom, false);
  check('没填发生日期 → 墙上显示**记下来的那天**，而不是一片空白',
    milestoneWall(fullWrote).find((e) => e.record.id === fullLast.id).displayDate,
    M_NOW.toISOString().slice(0, 10));

  // ⚠️ 这一条是 `custom` 判据的**反证**：一条指向已删目录条目的老记录，
  //    不该被标成"自己写的"。判据必须是 `definitionId === null`，
  //    而不是"我们查不到定义" —— 后者会把老玩家的记录改了来源。
  const orphan = structuredClone(wmBase);
  orphan.milestones.records[0].definitionId = 'rm_gone_forever';
  const orphanEntry = milestoneWall(orphan)[0];
  check('指向已删目录条目的老记录不算"自己写的"', orphanEntry.custom, false);
  check('它也拿不回一个标题 —— 我们不会替它编一个', orphanEntry.title, '（没有标题的记录）');
  check('分类退回 life，而不是崩', orphanEntry.category, 'life');
  check('它的发生日期照旧显示（丢了定义不等于丢了记录）', orphanEntry.displayDate, '2026-09-25');

  // —— 自己写的事推不动章节 ——
  // 离开条件只认目录里被承认的凭据。把 Ch.2 摆到"已解锁"（前置 Ch.1 已完成），
  // 再记一条标题与条件逐字相同的自写记录 —— 它的那格进度必须一动不动。
  const cmBase = structuredClone(wmBase);
  cmBase.chapters.chapters = cmBase.chapters.chapters.map((c) =>
    c.id === 'CH1' ? { ...c, completed: true, completedAt: '2026-09-01T00:00:00.000Z' } : c,
  );
  const cmBefore = syncChapters(cmBase, M_NOW).chapters.chapters.find((c) => c.id === 'CH2');
  const cmMine = recordCustomMilestone(
    cmBase,
    { title: '成果公开', category: 'academic', occurredOn: '2026-10-01', note: '预印本挂出去了', snapshots: [], creditedClassId: null },
    M_NOW,
  );
  const cmAfter = syncChapters(cmMine, M_NOW).chapters.chapters.find((c) => c.id === 'CH2');
  check('Ch.2 开着的离章条件在记之前确实能被算出来（不是"没解锁所以恒 0"）',
    cmBefore.conditionProgress.map((r) => [r.target, r.met]), [[1, false]]);
  check('自己写的一条「成果公开」推不动章节（标题再像也不算凭据）',
    cmAfter.conditionProgress.map((r) => r.current), [0]);

  // —— 存档形状 ——
  check('自写记录是纯 JSON（没有 undefined / Date / Map 混进去）', scan(drafted), null);
  check('序列化后原样读回', JSON.stringify(JSON.parse(encodeSave(drafted))), JSON.stringify(drafted));
  const mLoad = decodeSave(encodeSave(drafted), CURRENT_SCHEMA_VERSION, MIGRATIONS, M_NOW);
  check('自写记录能水合回来，且水合后还能再记一条',
    [mLoad.save.milestones.records.at(-1).customTitle,
      recordCustomMilestone(mLoad.save, { title: '第二天又想起来的', category: 'life', occurredOn: null, note: '', snapshots: [], creditedClassId: null }, M_NOW) !== mLoad.save],
    ['第一次自己开完一场会', true]);


  // -------------------------------------------------------------------------
  console.log('\n【㉘ 成就引擎：把已经发生的事命名一次】');
  // -------------------------------------------------------------------------
  // 这一节钉的是**成就判定**这一类缺陷。它与前面几节同一个家族：
  // 算错了不会崩，只会安静地显示一枚不该亮的徽记（或者更糟 ——
  // 在最该看见它的那天，它没有亮）。
  //
  // 四类断言，各钉一条"错了不会报错"的约定：
  //   ① **判据** —— 边界（08:00 算不算早八）、两种口径（净资产 vs 现金）、
  //      去重（几种标签 vs 几条记录）、单位（分 vs 美元 vs 月）。这些数字错了
  //      只是数字不对；
  //   ② **只增不减** —— 条件退回去之后，徽记不许跟着退。这条一旦破掉，
  //      症状是"我的徽记怎么少了一枚"，而且无从复现；
  //   ③ **补发** —— 老档第一次加载要能把已经做到的事补齐。少补了不会有提示；
  //   ④ **雾** —— 维度 F 的三条在进化树显形之前一枚都不许亮，
  //      而且陈列馆给的 slot 里**连名字都不能有**。漏一行判断，
  //      整个至高隐藏目标就在陈列馆第一屏剧透完了。
  const {
    syncAchievements, evaluateCondition, evaluateAchievement, dismissAchievementOvation, hallOfFameView, unitOf,
  } = await server.ssrLoadModule('/src/lib/achievementEngine.ts');
  const { ACHIEVEMENTS: AC_LIST, getAchievement: acGet } = await server.ssrLoadModule('/src/data/catalog/achievements.ts');
  const { isEarnedBySelf } = await server.ssrLoadModule('/src/lib/chapterEngine.ts');

  const A_NOW = new Date(2026, 9, 7, 20, 0); // 10-07 20:00

  // 造一份"只留一条打卡"的档：钩在哪一天、哪个钟点，由参数说了算。
  // 其余日志一律清掉 —— 否则 mock 里那四钩会替被测的那一刻说话。
  const a28LogAt = (base, hour, minute = 0) => {
    const s = structuredClone(base);
    const day = '2026-10-07';
    s.dailies.logs = {
      [day]: {
        localDate: day,
        checkedIds: ['d_probe'],
        checkedAt: { d_probe: new Date(2026, 9, 7, hour, minute).toISOString() },
        expEarned: 0, vaultEarned: 0, expPenalized: 0, missedIds: [],
        streakBonusPct: 0, energyAtEndOfDay: null, settled: true,
      },
    };
    return s;
  };

  // —— ① 判据 ——
  const a28Rich = createMockState(); // 建角档：4 次打卡 / 1 条完成任务 / 1 条里程碑 / 1 个点亮节点
  check('累计打钩数：mock 的 2 天 4 钩，直接读 logs 而不读任何缓存计数',
    evaluateAchievement(acGet('ac_fudan_shuttle'), a28Rich), { met: false, current: 4, target: 21 });

  // 边界："八点之前"不含八点那一刻。它是这条判据全部的分量所在 ——
  // 定成 <= 的话，"早八的逆行者"会在早八本人身上点亮。
  const a28Dawn = (h, m) => evaluateAchievement(acGet('ac_fudan_dawn'), a28LogAt(a28Rich, h, m)).met;
  check('早八的边界：07:59 算，08:00 不算（"八点之前"不含八点）', [a28Dawn(7, 59), a28Dawn(8, 0)], [true, false]);

  const a28Closing = (h, m) => evaluateAchievement(acGet('ac_fudan_closing'), a28LogAt(a28Rich, h, m)).met;
  check('闭馆的边界：23:00 起算，22:59 不算', [a28Closing(23, 0), a28Closing(22, 59)], [true, false]);
  // 闭馆有两条路（打卡**或**一条任务），`any_of` 就是为这句话存在的
  const a28NightQuest = a28LogAt(a28Rich, 12, 0); // 白天打的钩
  Object.values(a28NightQuest.quests.byId).find((q) => q.status === 'completed').completedAt =
    new Date(2026, 9, 7, 23, 30).toISOString();
  check('闭馆的另一条路：夜里 23:30 交的卷也算（两条路都通，不逼玩家走系统偏爱的那条）',
    evaluateAchievement(acGet('ac_fudan_closing'), a28NightQuest).met, true);

  // 两种"能撑多久"是不一样的两把尺子：净资产覆盖率（全部身家）vs 现金跑道（手头现金）
  const a28Fort = evaluateAchievement(acGet('ac_gravity_fortress'), a28Rich);
  const a28CashRunway = Math.round((a28Rich.vault.cash / a28Rich.vault.monthlyBurn) * 10) / 10;
  check('防御工事量的是**全部身家**：1,250,000 ÷ 98,000 = 12.8 个月',
    a28Fort, { met: true, current: 12.8, target: 3 });
  check('它不是现金跑道（418,000 ÷ 98,000 = 4.3 个月）—— 两个数不一样，名字也就不许共用',
    [a28Fort.current, a28CashRunway], [12.8, 4.3]);

  const a28NoBurn = structuredClone(a28Rich);
  a28NoBurn.vault.monthlyBurn = 0;
  check('一个还没记过账的人（月支出为 0）永远不该白得一座防御工事',
    evaluateAchievement(acGet('ac_gravity_fortress'), a28NoBurn), { met: false, current: 0, target: 3 });

  const a28Underwater = structuredClone(a28Rich);
  a28Underwater.vault.liabilities = 5_000_000; // 净资产被债务打到负数
  check('净资产为负 → 记 0 而不是负数（"能覆盖 -38 个月"不在这把尺子上），且不成立',
    evaluateAchievement(acGet('ac_gravity_fortress'), a28Underwater), { met: false, current: 0, target: 3 });

  // "自己赚来的"只许有一处实现：成就与 Ch.1 的进度条读的是同一个判断
  const a28Family = structuredClone(a28Rich);
  a28Family.milestones.records = []; // 封掉 any_of 的另一条路，只留金库这一条
  a28Family.vault.transactions = [{
    id: 'tx_probe', ts: A_NOW.toISOString(), localDate: '2026-10-07', type: 'income',
    amount: 900_000, assetClass: 'cash', category: '家庭', note: '爸妈给的',
  }];
  check('家里给的那笔不算"自己赚来的"',
    [isEarnedBySelf(a28Family.vault.transactions[0]),
      evaluateAchievement(acGet('ac_gravity_coin'), a28Family).met], [false, false]);
  // ⚠️ 备注也要一起换：那条启发式读的是 `category + note` 两栏
  //    （只改类别、留下"爸妈给的"四个字的话，它照样被拦住 —— 上面那条断言
  //    能成立，有一半正是因为在读备注。这一点写在这里免得下次误判）。
  check('换成自己接单挣的，两条路里金库那条就通了',
    evaluateAchievement(acGet('ac_gravity_coin'),
      { ...a28Family, vault: { ...a28Family.vault, transactions: [{ ...a28Family.vault.transactions[0], category: '接单尾款', note: '第一单' }] } }).met,
    true);

  // "几种标签"不是"几条记录"：同一个 tag 被抽中三次只证明了一件事发生了三次
  const a28Tags = structuredClone(a28Rich);
  a28Tags.evolution.techMilestones = ['protein', 'protein', 'protein'].map((tag, i) => ({
    id: `tm_p${i}`, ts: A_NOW.toISOString(), localDate: '2026-10-07', tag,
    questId: 'q_cb_repro_figure', confidence: 0.9, consumedByNodeId: null,
  }));
  check('同一种标签记三次，只算碰到过一种（去重计数，`count` 说的是"几种"）',
    evaluateAchievement(acGet('ac_carbon_protein'), a28Tags).met, true);
  const a28Cited = {
    ...a28Tags,
    evolution: {
      ...a28Tags.evolution,
      techMilestones: [
        ...a28Tags.evolution.techMilestones,
        { ...a28Tags.evolution.techMilestones[0], id: 'tm_c', tag: 'citation' },
      ],
    },
  };
  // 「引用**或**采用」是两枚标签里碰到一枚就成立（count: 1），不是两枚都要
  check('把名字写进引文：citation / adoption 碰到一种就算（两条路都通）',
    [evaluateAchievement(acGet('ac_carbon_citation'), a28Cited),
      evaluateAchievement(acGet('ac_carbon_citation'), a28Tags)],
    [{ met: true, current: 1, target: 1 }, { met: false, current: 0, target: 1 }]);
  // 门槛必须按**每一条记录**判：只压低其中一条、留下两条高可信的，
  // "蛋白质"依然算碰到过 —— 这才叫"低可信度的那条不算数"
  const a28LowConf = structuredClone(a28Tags);
  for (const r of a28LowConf.evolution.techMilestones) r.confidence = 0.2;
  check('全部低于 0.5 → 一条都不算数（门槛与节点点亮共用同一处实现）',
    evaluateAchievement(acGet('ac_carbon_protein'), a28LowConf).met, false);

  // met 必须能从 current / target 推出来。若有人写了一条自成一套的进度分支，
  // 陈列馆就会一边显示 3/3 一边锁着它 —— 没有任何地方会报错。
  const a28Inconsistent = AC_LIST
    .map((a) => [a.id, evaluateAchievement(a, a28Rich)])
    .filter(([, p]) => p.met !== (p.current >= p.target))
    .map(([id]) => id);
  check('23 条的"达成"与"进度"不许各说各话', a28Inconsistent, []);

  // —— ② 只增不减 ——
  const a28First = syncAchievements(a28Rich, A_NOW);
  check('建角档第一次跑，长出来的正是这些（顺序 = 目录顺序 = 陈列顺序）',
    a28First.unlockables.achievementIds,
    ['ac_fudan_gravity', 'ac_carbon_pipette', 'ac_gravity_coin', 'ac_gravity_fortress', 'ac_echo_glance', 'ac_echo_mentor']);
  check('解锁时刻盖的是注入进来的那个 now（不是墙上时钟）',
    [...new Set(Object.values(a28First.unlockables.achievementUnlockedAt))], [A_NOW.toISOString()]);
  check('第二次跑返回同一对象（挂得住"每次点击都跑一遍"这件事）',
    syncAchievements(a28First, A_NOW) === a28First, true);

  // 把条件一个个推回去：删掉里程碑、清空金库、把关系等级降回"认识"
  const a28Regressed = structuredClone(a28First);
  a28Regressed.milestones.records = [];
  a28Regressed.vault.cash = 0;
  a28Regressed.vault.holdings = [];
  a28Regressed.vault.monthlyBurn = 0;
  a28Regressed.network.contacts = a28Regressed.network.contacts.map((c) => ({ ...c, stage: null }));
  a28Regressed.quests.byId = {};
  a28Regressed.dailies.logs = {};
  const a28After = syncAchievements(a28Regressed, A_NOW);
  check('条件全部退回去之后：既没有补新，也没有收回旧的（"你到过那里"是历史）',
    [a28After === a28Regressed, a28After.unlockables.achievementIds], [true, a28First.unlockables.achievementIds]);

  // —— ③ 补发 ——
  // 老档的形状：`unlockables` 只有 v1 就有的那三格，而这个人其实早就做到了不少事。
  const a28Legacy = structuredClone(a28Rich);
  delete a28Legacy.unlockables.achievementUnlockedAt;
  delete a28Legacy.unlockables.pendingAchievementIds;
  const a28Backfilled = syncAchievements(a28Legacy, A_NOW);
  check('老档第一次加载：已经做到的事一次补齐（补发是"重算"，不是"回溯"）',
    a28Backfilled.unlockables.achievementIds, a28First.unlockables.achievementIds);
  check('补发的徽记同样进待看队列 —— 刷新一次页面不该让它们悄无声息地过去',
    a28Backfilled.unlockables.pendingAchievementIds, a28First.unlockables.achievementIds);
  check('补完之后的档是纯 JSON（那一格也没有混进 Date / Map）', scan(a28Backfilled.unlockables), null);

  const a28Dismissed = dismissAchievementOvation(a28Backfilled, A_NOW);
  check('看完金色光晕：只清队列，名单与日期一个字不动',
    [a28Dismissed.unlockables.pendingAchievementIds, a28Dismissed.unlockables.achievementIds,
      a28Dismissed.unlockables.achievementUnlockedAt],
    [[], a28Backfilled.unlockables.achievementIds, a28Backfilled.unlockables.achievementUnlockedAt]);
  check('队列本来就空 → 原对象返回（收起浮层不产写入）',
    dismissAchievementOvation(a28Dismissed, A_NOW) === a28Dismissed, true);

  // —— ④ 雾：维度 F 的三条在树显形之前一枚都不许亮 ——
  const a28Fog = structuredClone(a28Rich);
  const a28MedNode = a28Fog.evolution.nodes.find((n) => n.branch === 'MEDICINE' && n.tier === 1);
  a28MedNode.lit = true;
  a28MedNode.litAt = A_NOW.toISOString();
  check('mock 的进化树确实还没显形（下面几条断言的前提）', a28Fog.evolution.revealed, false);

  const a28FogIds = syncAchievements(a28Fog, A_NOW).unlockables.achievementIds.filter((id) => id.startsWith('ac_abyss_'));
  check('雾里：哪怕节点已经点亮，至高隐藏那三条一枚都不许解锁', a28FogIds, []);

  const a28FogView = hallOfFameView(syncAchievements(a28Fog, A_NOW));
  const a28Abyss = a28FogView.dimensions.find((d) => d.id === 'ABYSS');
  check('雾里：三条都只剩剪影 —— 名字 / 副名 / 题记 / 条件 / 进度一概不给',
    a28Abyss.slots.map((s) => [s.title, s.epithet, s.epigraph, s.criterion, s.progress]),
    [[null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null]]);
  check('雾里：线索照给（它必须不点破，但得指一个方向）',
    a28Abyss.slots.map((s) => typeof s.clue === 'string' && s.clue.length > 0), [true, true, true]);

  const a28Lit = structuredClone(a28Fog);
  a28Lit.evolution.revealed = true;
  a28Lit.evolution.revealedAt = A_NOW.toISOString();
  check('雾散之后：让树显形的那一枚 + 那条支线上已经点亮的那一枚，一起到账',
    syncAchievements(a28Lit, A_NOW).unlockables.achievementIds.filter((id) => id.startsWith('ac_abyss_')),
    ['ac_abyss_mars', 'ac_abyss_slowtime']);
  // 层级真的在过滤：只亮着 tier-1 的时候，"点亮层级"那一条不算数。
  // 忘了这个过滤的话，cb_1（tier 1）会把"成为光源本身"顶亮。
  check('tier 过滤：只亮着 tier-1 时，"你的答案成为别人的起点"不算数',
    evaluateAchievement(acGet('ac_abyss_lightbearer'), a28Lit).met, false);
  const a28Tier5 = structuredClone(a28Lit);
  a28Tier5.evolution.nodes.find((n) => n.tier === 5).lit = true;
  check('点亮一个 tier-5 节点 → 光源本身到场',
    evaluateAchievement(acGet('ac_abyss_lightbearer'), a28Tier5).met, true);

  // —— 陈列馆那面墙本身 ——
  const a28Wall = hallOfFameView(a28First);
  check('目录里 23 条，墙上也必须有 23 条（写错一个维度键，它就从墙上悄悄消失了）',
    [a28Wall.totalCount, a28Wall.dimensions.reduce((n, d) => n + d.slots.length, 0)],
    [AC_LIST.length, AC_LIST.length]);
  check('六个维度都有条目，一栏都不许空着', a28Wall.dimensions.map((d) => d.slots.length > 0),
    [true, true, true, true, true, true]);
  const a28Gravity = a28Wall.dimensions.find((d) => d.id === 'GRAVITY');
  const a28Coin = a28Gravity.slots.find((s) => s.id === 'ac_gravity_coin');
  check('解锁的那枚：题记出现了，线索收了起来（"拿到之后才读得到"）',
    [typeof a28Coin.epigraph === 'string', a28Coin.clue, a28Coin.title], [true, null, '第一枚硬币的落地声']);
  const a28Locked = a28Gravity.slots.find((s) => s.id === 'ac_gravity_seven');
  check('没解锁的那枚：给名字、给条件、给进度条，但不给题记',
    [a28Locked.title, typeof a28Locked.criterion === 'string', a28Locked.progress.met, a28Locked.epigraph],
    ['七位数的门槛', true, false, null]);
  check('墙上的解锁数与名单长度一致（两处各数一遍，结果必须一样）',
    [a28Wall.unlockedCount, a28First.unlockables.achievementIds.length], [6, 6]);
  check('待看队列在墙上也能读到（金色光晕与陈列馆读的是同一份）',
    hallOfFameView(a28Backfilled).pending.map((s) => s.id), a28Backfilled.unlockables.pendingAchievementIds);

  // —— 进度条上那两个数怎么念 ——
  // 判据只算数，不认单位：净资产那一格数的是**分**，直接把 1250000 印在
  // 「七位数的门槛」下面，玩家读到的是一串乱码。单位跟着条件走，
  // 由引擎随进度一起给出去（`unitOf`），UI 不回头读条件。
  const a28UnitOf = (id) => a28Wall.dimensions.flatMap((d) => d.slots).find((s) => s.id === id).unit;
  check('单位跟着条件走：净资产按美元念、覆盖率按月份念、其余的按次数念',
    [a28UnitOf('ac_gravity_seven'), a28UnitOf('ac_gravity_fortress'), a28UnitOf('ac_fudan_shuttle'),
      a28UnitOf('ac_abyss_lightbearer')],
    ['usd', 'months', 'count', 'count']);
  check('23 枚的单位只有这三种，没有第四个值溜进来',
    [...new Set(a28Wall.dimensions.flatMap((d) => d.slots).map((s) => s.unit))].sort(),
    ['count', 'months', 'usd']);

  // 二选一的单位必须跟着**进度条报的那条路**走，否则会印出「3 / 1,000,000」
  // 这种把两把尺子缝在一起的数字。目录里目前没有混单位的二选一 ——
  // 这条规则没有真实数据能走到，所以拿一份手写的条件直接钉它。
  const a28Mixed = (count, amount) => ({
    kind: 'any_of',
    of: [{ kind: 'reality_milestones', definitionIds: ['rm_first_income'], count },
      { kind: 'net_worth_usd_cents', amount }],
  });
  check('混单位的二选一：谁更接近就按谁的单位念（1/10 条 | 1.25/1e8 → 里程碑那条更近）',
    [unitOf(a28Mixed(10, 100_000_000), a28Rich),
      // 反证：把里程碑那条推远、把美元那条拉近，单位必须跟着换过去
      unitOf(a28Mixed(900, 1_000_000), a28Rich),
      // 而且它挑的那条路与 evaluateCondition 挑的是同一条（同一条路才有同一个单位）
      evaluateCondition(a28Mixed(10, 100_000_000), a28Rich)],
    ['count', 'usd', { met: false, current: 1, target: 10 }]);

  // -------------------------------------------------------------------------
  console.log('\n【㉙ 进化树引擎：点亮、回填、掀雾、统计】');
  // -------------------------------------------------------------------------
  // 这一节钉的是**静默运转**这一类缺陷 —— 与 ⑯ 的迷雾是同一件事的两端：
  // ⑯ 管的是"雾没散时一个字都不许漏"，这一节管的是**雾后面那台机器算得对不对**。
  //
  // 它的错全都不会崩，只会安静地错：
  //   ① **点亮** —— 少亮一个节点，玩家看到的是"我明明做到了"，但那颗星是空的；
  //      多亮一个，整棵树的含义就废了（进化树说的是"你确实做到了"，不是"你碰到了"）；
  //   ② **回填** —— `consumedByNodeId` 是"这条记录最后去了哪儿"的痕迹。
  //      填错了不会有人发现，直到某天有人拿它做统计；
  //   ③ **掀雾** —— 单向性一旦破掉，症状是"我的雾怎么回来了"，
  //      而那是一次再也补不回来的体验；
  //   ④ **统计** —— 分支进度、最近点亮时刻，全是屏幕上的数字。
  //      算错了只是数字不对，而数字不对没有任何东西会拦它。
  const {
    syncEvolution, evaluateRevealCondition, tagsShortOf, qualifyingMilestones, markRevealMomentShown,
  } = await server.ssrLoadModule('/src/lib/evolutionEngine.ts');
  const {
    EVOLUTION_NODES: EV_NODES, EVOLUTION_REVEAL_CONDITIONS: EV_CONDS, MILESTONE_CONFIDENCE_FLOOR: EV_FLOOR,
  } = await server.ssrLoadModule('/src/data/catalog/endgame.ts');

  const EV_NOW = new Date(2026, 9, 7, 21, 0); // 10-07 21:00

  /** 六条分支各 0。夹具要的是"一棵干净的树"，所以统计也一起清零 */
  const EV_ZERO = {
    COMPUTE_BIOLOGY: 0, INTELLIGENCE: 0, MEDICINE: 0, ENERGY: 0, MATERIALS: 0, SPACE: 0,
  };

  let evSeq = 0;
  /** 造一条里程碑记录。默认过门槛 —— 要测门槛就显式传 confidence */
  const evRec = (tag, confidence = 0.8) => ({
    id: `tm_t${String(evSeq++).padStart(3, '0')}`,
    ts: EV_NOW.toISOString(),
    localDate: '2026-10-07',
    tag,
    questId: null,
    confidence,
    consumedByNodeId: null,
  });

  /** 一棵没有亮过任何节点的树 + 指定的记录集 */
  const evState = (records, patch = {}) => {
    const s = createMockState();
    s.evolution = {
      ...s.evolution,
      revealed: false,
      revealedAt: null,
      revealMomentShown: false,
      nodes: JSON.parse(JSON.stringify(EV_NODES)),
      techMilestones: records,
      revealConditions: JSON.parse(JSON.stringify(EV_CONDS)),
      stats: {
        litNodeCount: 0,
        totalNodeCount: EV_NODES.length,
        branchProgress: { ...EV_ZERO },
        lastLitAt: null,
      },
      ...patch,
    };
    return s;
  };
  /** 雾已经散了的树（用来验"当着玩家的面亮起来"与单向性） */
  const evOpen = (records) => evState(records, { revealed: true, revealedAt: EV_NOW.toISOString() });

  const evLitIds = (s) => s.evolution.nodes.filter((n) => n.lit).map((n) => n.id);
  const evNode = (s, id) => s.evolution.nodes.find((n) => n.id === id);
  const evCond = (kind) => EV_CONDS.find((c) => c.kind === kind);

  // —— ① 点亮：判据是"几种标签"，不是"几条记录" ——
  const evMock = createMockState();
  check('建角档跑一次 = 无事发生（cb_1 早已亮着、两条记录早已回填、统计也对得上）',
    syncEvolution(evMock, EV_NOW) === evMock, true);

  check('两种不同标签 → cb_1 亮',
    evLitIds(syncEvolution(evState([evRec('literature'), evRec('reproducibility')]), EV_NOW)), ['cb_1']);
  check('同一种标签记两次 → 一条都不亮（`count` 说的是"几种"）',
    evLitIds(syncEvolution(evState([evRec('literature'), evRec('literature', 0.9)]), EV_NOW)), []);
  check('门槛就是 0.5，且是"不低于"', EV_FLOOR, 0.5);
  check('刚好压线（0.5）算数',
    evLitIds(syncEvolution(evState([evRec('literature', 0.5), evRec('reproducibility', 0.5)]), EV_NOW)), ['cb_1']);
  check('低于门槛的一律不算（两条 0.4 的不同标签 → 不亮）',
    evLitIds(syncEvolution(evState([evRec('literature', 0.4), evRec('reproducibility', 0.4)]), EV_NOW)), []);
  check('够格记录的口径只有一处实现（引擎与视图共用它）',
    qualifyingMilestones([evRec('a', 0.49), evRec('b', 0.5), evRec('c', 0.9)]).map((r) => r.tag), ['b', 'c']);

  // 级联：节点的前置恒在同分支的低层级，而 nodes 按"分支分组、层级升序"存 ——
  // 所以一趟走下来，刚亮的 cb_1 能在同一趟里把 cb_2 的前置判过
  const evLadder = syncEvolution(evState([
    evRec('literature'), evRec('reproducibility'),        // cb_1（要 2 种）
    evRec('pipeline'), evRec('engineering'),              // cb_2（要 2 种）
    evRec('protein'), evRec('modeling'), evRec('validation'), // cb_3（要 3 种）
  ]), EV_NOW);
  check('一趟扫描就级联到底：cb_1 → cb_2 → cb_3 同时亮（不需要循环到不动点）',
    evLitIds(evLadder), ['cb_1', 'cb_2', 'cb_3']);
  check('标签凑齐但前置没亮 → 一颗都不亮（cb_3 那三种标签都够了）',
    evLitIds(syncEvolution(evState([evRec('protein'), evRec('modeling'), evRec('validation')]), EV_NOW)), []);

  check('点亮时刻盖的是**传进来的那个 now**，不是墙上时钟',
    evNode(syncEvolution(evState([evRec('literature'), evRec('reproducibility')]), EV_NOW), 'cb_1').litAt,
    EV_NOW.toISOString());
  check('雾里亮的：litWhileRevealed 记 false（他还不知道有这棵树）',
    evNode(evLadder, 'cb_1').litWhileRevealed, false);
  check('雾散之后才亮的：记 true（那一次他能亲眼看着它亮）',
    evNode(syncEvolution(evOpen([evRec('literature'), evRec('reproducibility')]), EV_NOW), 'cb_1').litWhileRevealed,
    true);
  check('点亮只动这三格，名字 / 判据 / 前置 / 标签过滤一个字不碰', (() => {
    const before = evNode(evOpen([]), 'cb_1');
    const after = evNode(syncEvolution(evOpen([evRec('literature'), evRec('reproducibility')]), EV_NOW), 'cb_1');
    return Object.keys(after)
      .filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]))
      .sort();
  })(), ['lit', 'litAt', 'litWhileRevealed']);
  check('点亮后仍是纯 JSON（时刻存字符串，不是 Date）',
    evLadder.evolution.nodes.filter((n) => n.lit).every((n) => typeof n.litAt === 'string'), true);

  // —— 只亮不灭 ——
  const evLadderAgain = syncEvolution(evLadder, EV_NOW);
  check('再跑一次返回同一对象（挂得住"每次点击都跑一遍"）', evLadderAgain === evLadder, true);
  check('里程碑记录被环形缓冲挤空之后：已经亮的照样亮（点亮问的是历史，不是"现在还剩几条"）',
    evLitIds(syncEvolution({ ...evLadder, evolution: { ...evLadder.evolution, techMilestones: [] } }, EV_NOW)),
    ['cb_1', 'cb_2', 'cb_3']);

  // —— ② 回填 ——
  const evBack = syncEvolution(evState([evRec('literature'), evRec('reproducibility')]), EV_NOW);
  check('喂它的两条记录都记下了"最后去了哪儿"',
    evBack.evolution.techMilestones.map((r) => r.consumedByNodeId), ['cb_1', 'cb_1']);
  check('没有新点亮时记录数组引用不变（回填不白跑一趟）',
    syncEvolution(evBack, EV_NOW).evolution.techMilestones === evBack.evolution.techMilestones, true);
  check('已经记过名的不被覆盖（那一格是痕迹，不是一份完整的账）',
    syncEvolution(evState([{ ...evRec('literature'), consumedByNodeId: 'md_1' }, evRec('reproducibility')]), EV_NOW)
      .evolution.techMilestones.map((r) => r.consumedByNodeId),
    ['md_1', 'cb_1']);
  check('低于门槛的记录不回填（它本来就没参与判定）',
    syncEvolution(evState([evRec('literature'), evRec('reproducibility'), evRec('literature', 0.3)]), EV_NOW)
      .evolution.techMilestones.map((r) => r.consumedByNodeId),
    ['cb_1', 'cb_1', null]);

  // 一个标签喂多个节点（literature 同时是 cb_1 与 md_1 的判据）：
  // 那一格只能装一个 id，规则是"先吃到的记名"
  const evShared = syncEvolution(evState([evRec('literature'), evRec('reproducibility'), evRec('aging_pathway')]), EV_NOW);
  check('literature 同时喂 cb_1 与 md_1 → 只记先吃到的那个',
    evShared.evolution.techMilestones.map((r) => [r.tag, r.consumedByNodeId]),
    [['literature', 'cb_1'], ['reproducibility', 'cb_1'], ['aging_pathway', 'md_1']]);
  check('但两个节点都亮了（去重按标签算，不按记录的归属算）', evLitIds(evShared), ['cb_1', 'md_1']);

  // —— ③ 四条揭示条件 ——
  const evFifteen = Array.from({ length: 15 }, () => evRec('literature'));
  check('累计里程碑：15 条同标签也算 15 条（门槛数的是条数，去重是节点的判据）',
    evaluateRevealCondition(evCond('total_milestones'), evState(evFifteen)), true);
  check('14 条不算',
    evaluateRevealCondition(evCond('total_milestones'), evState(evFifteen.slice(0, 14))), false);
  check('低于门槛的记录不进这 15 条',
    evaluateRevealCondition(evCond('total_milestones'),
      evState(Array.from({ length: 20 }, () => evRec('literature', 0.2)))), false);

  const evLitCount = (ids) => {
    const s = evState([]);
    for (const id of ids) evNode(s, id).lit = true;
    return s;
  };
  check('已点亮节点 ≥ 3 → 成立（读的是存档里那面镜子，不是"够不够格"）',
    evaluateRevealCondition(evCond('lit_nodes'), evLitCount(['cb_1', 'cb_2', 'cb_3'])), true);
  check('只有 2 个 → 不成立', evaluateRevealCondition(evCond('lit_nodes'), evLitCount(['cb_1', 'cb_2'])), false);

  // 触及的分支**不走词表**：`literature` 在词表里挂在 GENERAL 名下（通用本事），
  // 但它的 tagFilter 出现在 cb_1（生命的计算）与 md_1（衰老的边界）里。
  // 若按词表算，会出现"图上亮着一个点，旁边写着已触及的分支 0"这种自相矛盾。
  check('GENERAL 的标签按"喂到了哪些节点"算分支：literature → cb_1 与 md_1 → 触及 2 条',
    evaluateRevealCondition({ ...evCond('branches_touched'), threshold: 2 }, evState([evRec('literature')])), true);
  check('…但高一条就不成立（它不是万能的通行证，门槛就是 3）',
    evaluateRevealCondition(evCond('branches_touched'), evState([evRec('literature')])), false);
  check('三条分支各一条记录 → 成立',
    evaluateRevealCondition(evCond('branches_touched'),
      evState([evRec('omics'), evRec('ml_foundation'), evRec('aging_pathway')])), true);

  check('抵达篇章：建角档只解锁到 Ch.1 → 不成立',
    evaluateRevealCondition(evCond('chapter_reached'), evState([])), false);
  const evChapters = (ids) => {
    const s = evState([]);
    s.chapters = {
      ...s.chapters,
      chapters: s.chapters.chapters.map((c) => (ids.includes(c.id) ? { ...c, unlocked: true } : c)),
    };
    return s;
  };
  check('"抵达"= 已解锁，不是已完成：解锁到 Ch.7（一章都没完成）→ 成立',
    evaluateRevealCondition(evCond('chapter_reached'), evChapters(['CH1', 'CH7'])), true);
  check('数的是**最大的那一章**，不是解锁了几章：解锁 Ch.1~Ch.6 → 不成立',
    evaluateRevealCondition(evCond('chapter_reached'), evChapters(['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6'])), false);

  // 契约里有第五个 kind，目录暂时没用它 —— 但实现不许留一个空分支等它将来撞上
  const evQuestCond = { kind: 'total_quests_completed', label: '完成的任务', threshold: 1, met: false };
  check('第五个 kind（数 completed 的任务）不是空分支：建角档有 1 条已结算',
    [evaluateRevealCondition(evQuestCond, evState([])), evaluateRevealCondition({ ...evQuestCond, threshold: 2 }, evState([]))],
    [true, false]);

  // —— 掀雾是单向的 ——
  const evOpened = syncEvolution(evState(evFifteen), EV_NOW);
  check('15 条里程碑 → 雾散', evOpened.evolution.revealed, true);
  check('revealedAt 盖的是注入的 now', evOpened.evolution.revealedAt, EV_NOW.toISOString());
  check('四条条件此刻的读数落进了存档（total_milestones 成立，其余三条不成立）',
    evOpened.evolution.revealConditions.map((c) => c.met), [true, false, false, false]);
  check('条件没变时那段数组不重造（每次点击都会比一遍，所以它必须稳）',
    syncEvolution(evOpened, EV_NOW).evolution.revealConditions === evOpened.evolution.revealConditions, true);
  check('记录退回去之后，雾不回来（里程碑只留最近 300 条，可以退；看见过这件事不可以）',
    syncEvolution({ ...evOpened, evolution: { ...evOpened.evolution, techMilestones: [] } }, EV_NOW)
      .evolution.revealed, true);
  check('已经散过的：revealedAt 不被改写',
    syncEvolution(evOpened, EV_NOW).evolution.revealedAt, EV_NOW.toISOString());

  check('「第一次看见」那张卡还没放过', evOpened.evolution.revealMomentShown, false);
  const evSeen = markRevealMomentShown(evOpened);
  check('看过之后只翻一个开关', evSeen.evolution.revealMomentShown, true);
  check('它不动别的（点亮数、记录、真身一个不碰）',
    [evSeen.evolution.stats, evSeen.evolution.techMilestones, evSeen.evolution.nodes],
    [evOpened.evolution.stats, evOpened.evolution.techMilestones, evOpened.evolution.nodes]);
  check('本来就是 true → 原对象返回（收起浮层不产写入）', markRevealMomentShown(evSeen) === evSeen, true);

  // —— ④ 统计 ——
  const evStat = syncEvolution(evState([evRec('literature'), evRec('reproducibility'), evRec('aging_pathway')]), EV_NOW);
  check('点亮数 / 总数对得上',
    [evStat.evolution.stats.litNodeCount, evStat.evolution.stats.totalNodeCount],
    [evLitIds(evStat).length, EV_NODES.length]);
  check('六条分支都有进度，一栏不许缺',
    Object.keys(evStat.evolution.stats.branchProgress).sort(),
    ['COMPUTE_BIOLOGY', 'ENERGY', 'INTELLIGENCE', 'MATERIALS', 'MEDICINE', 'SPACE']);
  check('分支进度 = 该分支点亮的 / 该分支的总数',
    [evStat.evolution.stats.branchProgress.COMPUTE_BIOLOGY, evStat.evolution.stats.branchProgress.MEDICINE,
      evStat.evolution.stats.branchProgress.SPACE],
    [1 / 5, 1 / 4, 0]);
  check('lastLitAt = 最近一次点亮（不是最后一次运行）',
    evStat.evolution.stats.lastLitAt, EV_NOW.toISOString());
  check('统计没变时那一格不重造', syncEvolution(evStat, EV_NOW).evolution.stats === evStat.evolution.stats, true);

  // —— ⑤ 窥视开关：同一道闸门的第二条路 ——
  const evPeek = evolutionView(evMock, { fogOverride: true });
  check('窥视：拿到的是真身', evPeek.revealed, true);
  check('窥视：带着"隔着玻璃看"这条说明', evPeek.peeking, true);
  truthy('窥视：真的能看到星星（cb_1 已亮）', evLitIds(evMock).includes('cb_1'));
  check('窥视不写存档', [evMock.evolution.revealed, evMock.evolution.revealedAt], [false, null]);
  check('不传开关 → 还是那片雾', evolutionView(evMock).revealed, false);
  check('雾分支的四个键没多没少（窥视不是"多读几个字段"，是走另一条路）',
    Object.keys(evolutionView(evMock)).sort(), ['branchCount', 'line', 'maxTier', 'revealed']);
  check('已经显形的树：窥视开关开着也不再说自己在窥视（它本来就亮着）',
    evolutionView({ ...evMock, evolution: { ...evMock.evolution, revealed: true } }, { fogOverride: true }).peeking,
    false);

  const evCb2 = evPeek.branches.find((b) => b.id === 'COMPUTE_BIOLOGY').nodes.find((n) => n.id === 'cb_2');
  const evCb3 = evPeek.branches.find((b) => b.id === 'COMPUTE_BIOLOGY').nodes.find((n) => n.id === 'cb_3');
  check('节点带前置（星图的连线要靠它）', evCb2.prerequisites, ['cb_1']);
  check('cb_1 已亮 → 它的下一格没有被谁挡住（那是图上"呼吸着"的那一颗）', evCb2.blockedBy, []);
  check('cb_2 没亮 → cb_3 点名它（详情卡要说"卡在哪儿"）', evCb3.blockedBy, ['cb_2']);
  check('已亮的节点：blockedBy 是空的',
    evPeek.branches.find((b) => b.id === 'COMPUTE_BIOLOGY').nodes.find((n) => n.id === 'cb_1').blockedBy, []);
  check('还差几种标签跟着引擎走（同一把尺子）：cb_2 一种都没攒到 → 差 2',
    [evCb2.tagsShort, tagsShortOf(EV_NODES.find((n) => n.id === 'cb_2'), qualifyingMilestones(evMock.evolution.techMilestones))],
    [2, 2]);
  check('literature 已经攒到了 → md_1 只差 1 种',
    evPeek.branches.find((b) => b.id === 'MEDICINE').nodes.find((n) => n.id === 'md_1').tagsShort, 1);
  check('窥视里也带四条条件与那张一次性卡的状态',
    [evPeek.revealConditions.length, evPeek.revealMomentShown], [4, false]);

  // —— ⑥ 四道工序的次序（写在源码里的那四元组）——
  // 次序错了不会崩，只会让"雾散"与"两枚至高徽记上墙"分成两次点击 ——
  // 而玩家只会觉得那两件事之间隔了一下，不会觉得那是 bug。所以钉在源码上。
  // 终局排最前有实打实的理由：篇章引擎的 Ch.7 判据读的是「私人 Lab 目标下
  // 已点亮几格」，那是终局目标的产出 —— 终局后移，Ch.7 就永远慢一拍。
  const evStoreSrc = readFileSync(join(root, 'src/store/useEarthOnlineStore.ts'), 'utf8');
  check('漏斗里的次序：终局 → 篇章 → 进化树 → 成就（后一道读前一道的产出）',
    ['syncEndgame(', 'syncChapters(', 'syncEvolution(', 'syncAchievements(']
      .map((call) => evStoreSrc.indexOf(call))
      .every((at, i, all) => at > -1 && (i === 0 || at > all[i - 1])),
    true);

  // 端到端：一口气点亮 cb_1~cb_5（13 条记录），三道工序按生产次序走一遍。
  // 结果是**雾散 + 两枚至高隐藏徽记在同一刻上墙** —— 这正是次序要求的那个效果。
  // `syncChapters` 在 ⑳ 就绑好了，这里直接用（同一个模块，ssrLoadModule 也是缓存的）
  const evLadder13 = evState([
    evRec('literature'), evRec('reproducibility'),
    evRec('pipeline'), evRec('engineering'),
    evRec('protein'), evRec('modeling'), evRec('validation'),
    evRec('research_question'), evRec('novelty'),
    evRec('paradigm'), evRec('adoption'), evRec('citation'),
    evRec('omics'),
  ]);
  const evChained = syncAchievements(syncEvolution(syncChapters(evLadder13, EV_NOW), EV_NOW), EV_NOW);
  check('十三条记录 → 一趟亮到 cb_5（五个前置串成一条链）',
    evLitIds(evChained), ['cb_1', 'cb_2', 'cb_3', 'cb_4', 'cb_5']);
  check('亮到第 5 层 → 触点够 3 个 → 雾散', evChained.evolution.revealed, true);
  check('雾散与两枚至高徽记在**同一次**推进里到账（次序一旦反过来，它们要等下一次点击）',
    evChained.unlockables.achievementIds.filter((id) => id.startsWith('ac_abyss_')),
    ['ac_abyss_mars', 'ac_abyss_lightbearer']);

  // -------------------------------------------------------------------------
  console.log('\n【㉚ 终局目标引擎：点亮、重算、圣殿视图】');
  // -------------------------------------------------------------------------
  // 模块三新长出来的这台机器，坏起来全是"安静的谎"：
  //   ① **点亮** —— 判据表与目录各写各的数（amount 是 1_000_000、文案却写成
  //      $1,000），错了不崩，只是永远差一档；A9 阶梯是**状态谓词**，一步跨
  //      三档必须三格齐亮，少亮一格 = 玩家对着 $1M 的金库看见"六位数"还空着；
  //   ② **重算** —— achieved 只该在一格凑齐的那一刻落下，时刻取"最后一格"
  //      而不是"这次扫描"：补判老档时把今天印上去，那句话就成了谎言；
  //   ③ **圣殿视图** —— 藏着的格在视图层就不该有名字（与陈列馆同一道闸门）；
  //      综合进度的两个分母（8 章 / 23 徽记）错一个，UR 就永远到不了 100。
  // 引擎还欠着三条与成就 / 进化树同源的自律，逐条钉住：无事返回同一对象、
  // 只亮不灭、只写事实（`progress` 不在这条链上 —— 进度数学只有 selectors 一处）。
  const { syncEndgame } = await server.ssrLoadModule('/src/lib/endgameEngine.ts');
  const { endgameView, goalProgress: egGoalProgress } = await server.ssrLoadModule('/src/lib/selectors.ts');
  const {
    GOAL_MILESTONE_CONDITIONS: EG_CONDS, ENDGAME_GOALS: EG_ALL,
  } = await server.ssrLoadModule('/src/data/catalog/endgame.ts');
  const { REALITY_MILESTONES: EG_RM } = await server.ssrLoadModule('/src/data/catalog/milestones.ts');

  const EG_NOW = new Date(2026, 9, 7, 21, 30); // 10-07 21:30

  /** 某个目标下某一格 */
  const egCell = (s, goalId, milestoneId) =>
    s.endgame.goals.find((g) => g.id === goalId).milestones.find((m) => m.id === milestoneId);
  /** 某个目标已亮的格数 */
  const egLit = (s, goalId) =>
    s.endgame.goals.find((g) => g.id === goalId).milestones.filter((m) => m.achievedAt !== null).length;
  /** 把金库换成"只有这么多现金" —— 只是造数，不模拟真实账本 */
  const egWorth = (s, cents) => {
    const next = structuredClone(s);
    next.vault = { ...next.vault, cash: cents, holdings: [], liabilities: 0 };
    return next;
  };
  /** 同上，并把 A9 那八格擦干净 —— 建角档预亮过"第一万美金"，阶梯要从零开始测 */
  const egCleanA9 = (s, cents) => {
    const next = egWorth(s, cents);
    const goal = next.endgame.goals.find((g) => g.id === 'A9_ASSETS');
    goal.milestones = goal.milestones.map((m) => ({ ...m, achievedAt: null }));
    return next;
  };

  // —— ① 判据表与目录对账（两种写法必须是同一本账）——
  const egAllMilestones = EG_ALL.flatMap((g) => g.milestones);
  const egAllIds = new Set(egAllMilestones.map((m) => m.id));
  check('判据表的每一个键都指向一条真实里程碑（不许有孤儿键）',
    Object.keys(EG_CONDS).filter((id) => !egAllIds.has(id)), []);
  const egA9CellOf = (id) => EG_ALL.find((g) => g.id === 'A9_ASSETS').milestones.find((m) => m.id === id);
  const egA9Ladder = [
    ['a9_first_10k', 1_000_000],
    ['a9_first_100k', 10_000_000],
    ['a9_first_1m', 100_000_000],
    ['a9_first_10m', 1_000_000_000],
    ['a9_first_100m', 10_000_000_000],
  ];
  check('A9 五档金额严格递增（$10k → $100M）',
    egA9Ladder.map(([id]) => EG_CONDS[id].amount),
    [1_000_000, 10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000]);
  check('A9 五档：criterion 文案里的美元数 = 判据里的 amount（不许各说各话）',
    egA9Ladder.map(([id, amt]) => egA9CellOf(id).criterion === `净资产 ≥ $${(amt / 100).toLocaleString('en-US')}`),
    egA9Ladder.map(() => true));

  // —— ② 覆盖率：两张网（授予 / 判据）之外还有多少格 ——
  // 这不是"未完成"的借口，是一份**照实记账**：圣殿照实显示它们空着。
  // 数字钉在这里，下一期补上一格就得回来改一次 —— 改的那一下就是复核。
  const egGranted = new Set(EG_RM.flatMap((d) => d.grantsGoalMilestoneIds ?? []));
  const egOrphans = egAllMilestones.filter((m) => !egGranted.has(m.id) && !(m.id in EG_CONDS));
  check('34 格里程碑：授予（12）与判据（6）两张网之外，还有 16 格没有机器通路',
    [egAllMilestones.length, egOrphans.length], [34, 16]);
  check('三格藏话全在孤儿名单里（此刻只能等下一期的人工通路 —— 圣殿对它们照实显示）',
    egOrphans.filter((m) => m.hidden).map((m) => m.id).sort(),
    ['a9_runway_forever', 'pl_collaborators', 'sm_tested']);

  // —— ③ 建角档：引擎跑一遍必须"无事发生" ——
  const egMock = createMockState();
  check('建角档里那条 $10k 是预亮的（$12,500 建角即过线 —— 不预亮，引擎会把"今天"印在那格上）',
    egCell(egMock, 'A9_ASSETS', 'a9_first_10k').achievedAt !== null, true);
  check('跑一遍引擎 = 原对象返回（它挂在每一次点击的漏斗上，靠引用相等短路）',
    syncEndgame(egMock, EG_NOW) === egMock, true);

  // —— ④ A9 阶梯：状态谓词，一步跨几档就同时亮几格 ——
  check('$5,000：一档都够不着 → 一格不亮',
    egLit(syncEndgame(egCleanA9(createMockState(), 500_000), EG_NOW), 'A9_ASSETS'), 0);
  check('$10,000 压线：判据是 ≥，压线算数',
    egLit(syncEndgame(egCleanA9(createMockState(), 1_000_000), EG_NOW), 'A9_ASSETS'), 1);
  const eg3 = syncEndgame(egCleanA9(createMockState(), 100_000_000), EG_NOW); // 一步到 $1M
  check('一步跨到 $1M → 三档同时亮：一件事实的三个刻度，不是三件达成',
    egLit(eg3, 'A9_ASSETS'), 3);
  check('点亮时刻盖的是传进来的 now（同一趟扫描，同一个时刻）',
    egCell(eg3, 'A9_ASSETS', 'a9_first_1m').achievedAt, EG_NOW.toISOString());
  const egDrop = egWorth(eg3, 500_000);
  const egDropSync = syncEndgame(egDrop, new Date(2026, 10, 1, 9, 0));
  check('只亮不灭：净值跌回 $5,000，三格照旧亮着（引擎没有"取消点亮"这条路径）',
    egLit(egDropSync, 'A9_ASSETS'), 3);
  check('且那一趟无事发生 → 返回同一个对象', egDropSync === egDrop, true);

  // —— ⑤ 第二段海外经历：由**计数**判，不由"又一次记录"判 ——
  check('海外经历的定义只授"第一段"这一格（grants 里没有第二段）',
    EG_RM.find((d) => d.id === 'rm_overseas_experience').grantsGoalMilestoneIds, ['gm_first_experience']);
  const egFirst = recordRealityMilestone(
    createMockState(),
    { definitionId: 'rm_overseas_experience', occurredOn: '2026-08-01', note: '', snapshots: [] },
    EG_NOW,
  );
  check('记下第一段 → 只亮一格，第二格纹丝不动',
    [egLit(egFirst, 'GLOBAL_MOBILITY'), egCell(egFirst, 'GLOBAL_MOBILITY', 'gm_second_experience').achievedAt],
    [1, null]);
  check('跑一趟引擎：计数=1 < 2 → 第二格还是不动',
    egCell(syncEndgame(egFirst, EG_NOW), 'GLOBAL_MOBILITY', 'gm_second_experience').achievedAt, null);
  const EG_LATER = new Date(2027, 3, 10, 20, 0); // 2027-04-10：180 天冷却已过
  const egSecond = recordRealityMilestone(
    egFirst,
    { definitionId: 'rm_overseas_experience', occurredOn: '2027-02-01', note: '', snapshots: [] },
    EG_LATER,
  );
  check('第二段记下 → counters 到 2', egSecond.milestones.counters.rm_overseas_experience.count, 2);
  check('记录那一刻第二格还没亮（它不归 grants 管 —— 那是"第 N 次"的语义，只有计数说得清）',
    egCell(egSecond, 'GLOBAL_MOBILITY', 'gm_second_experience').achievedAt, null);
  check('引擎一看计数=2 → 点亮，时刻是这趟扫描的 now',
    egCell(syncEndgame(egSecond, EG_LATER), 'GLOBAL_MOBILITY', 'gm_second_experience').achievedAt,
    EG_LATER.toISOString());

  // —— ⑥ 达成重算：最后一格凑齐那一刻，才是整条目标走完那一刻 ——
  // ⚠️ 先克隆再改：`createMockState()` 的 endgame 目标是模块级模板的引用
  //    （与 AGENTS / evolutionNodes 同一习惯），直接改会把夹具本身改脏 ——
  //    本节第一版就在这里翻过车（后面那张抬头表当场多出 6 格）。
  const EG_T0 = '2026-01-01T00:00:00.000Z';
  const egGmBase = (() => {
    const s = structuredClone(createMockState());
    const goal = s.endgame.goals.find((g) => g.id === 'GLOBAL_MOBILITY');
    goal.milestones = goal.milestones.map((m) => (m.id === 'gm_second_experience' ? m : { ...m, achievedAt: EG_T0 }));
    s.milestones.counters.rm_overseas_experience = { count: 2, lastRecordedAt: EG_T0 };
    return s;
  })();
  const egGmDone = syncEndgame(egGmBase, EG_NOW);
  const egGmGoal = egGmDone.endgame.goals.find((g) => g.id === 'GLOBAL_MOBILITY');
  check('最后一格凑齐 → 整条目标判达成（七格全亮）',
    [egGmGoal.achieved, egLit(egGmDone, 'GLOBAL_MOBILITY')], [true, 7]);
  check('达成时刻 = 最后一格落下的那一刻',
    egGmGoal.achievedAt, EG_NOW.toISOString());
  const egGmStale = structuredClone(egGmDone);
  const egStaleGoal = egGmStale.endgame.goals.find((g) => g.id === 'GLOBAL_MOBILITY');
  egStaleGoal.achieved = false;
  egStaleGoal.achievedAt = null;
  const egGmRepaired = syncEndgame(egGmStale, new Date(2027, 5, 1, 9, 0))
    .endgame.goals.find((g) => g.id === 'GLOBAL_MOBILITY');
  check('脏档补判：格都亮着却没有达成态 → 补记，且时刻取最后一格而不是这次扫描',
    [egGmRepaired.achieved, egGmRepaired.achievedAt], [true, EG_NOW.toISOString()]);

  // —— ⑦ 只写事实：progress 不在这条链上 ——
  const egProgressBefore = egCleanA9(createMockState(), 100_000_000);
  const egProgressAfter = syncEndgame(egProgressBefore, EG_NOW);
  check('（这一趟确实点亮了三格 —— 否则下面那句"没动"是废话）',
    egLit(egProgressAfter, 'A9_ASSETS'), 3);
  check('引擎只写事实：progress 一个字都不动（进度数学只有 selectors 一处）',
    egProgressAfter.endgame.goals.map((g) => g.progress),
    egProgressBefore.endgame.goals.map((g) => g.progress));

  // —— ⑧ 圣殿视图：五张卡、藏话闸门、现算进度 ——
  const egViewSave = createMockState();
  const egView = endgameView(egViewSave);
  check('五张卡，一个不少一个不多（顺序即目录顺序）',
    egView.goals.map((g) => g.id),
    ['A9_ASSETS', 'GLOBAL_MOBILITY', 'PRIVATE_LAB', 'GEO_INDEPENDENT_WORK', 'SOULMATE']);
  check('卡片抬头：n / m 从格子上现数',
    egView.goals.map((g) => `${g.litCount}/${g.totalCount}`),
    ['2/8', '0/7', '0/7', '1/7', '0/5']);
  check('A9 的进度是现算的曲线（与金库页同一个数），不是存档里那份半旧缓存',
    egView.goals.find((g) => g.id === 'A9_ASSETS').progress,
    wealthProgressRatio(netWorthUsdCents(egViewSave.vault)));
  check('milestone_weights 口径：权重和就是进度（GI 亮了一格 0.1 → 0.1）',
    egView.goals.find((g) => g.id === 'GEO_INDEPENDENT_WORK').progress, 0.1);
  check('同一份数学：视图的 progress === 对存档目标现调的 goalProgress（一处数学，两个读者）',
    egView.goals.map((g) => g.progress),
    egViewSave.endgame.goals.map((g) => egGoalProgress(egViewSave, g)));
  const egBogus = structuredClone(egViewSave);
  egBogus.endgame.goals.find((g) => g.id === 'A9_ASSETS').progress = 0.99;
  check('把存档里的 progress 改成一个谎 → 视图不读它（读的是格子 + 曲线）',
    endgameView(egBogus).goals.find((g) => g.id === 'A9_ASSETS').progress,
    egView.goals.find((g) => g.id === 'A9_ASSETS').progress);
  const egHiddenCells = [
    ['A9_ASSETS', 'a9_runway_forever'],
    ['PRIVATE_LAB', 'pl_collaborators'],
    ['SOULMATE', 'sm_tested'],
  ].map(([gid, mid]) => {
    const m = egView.goals.find((g) => g.id === gid).milestones.find((x) => x.id === mid);
    return [m.title, m.criterion];
  });
  check('三格藏话在视图层就打成 null —— 组件忘了判也拿不到那个名字',
    egHiddenCells, [[null, null], [null, null], [null, null]]);
  check('整份视图的 JSON 里搜不到那三个名字',
    ['永远的跑道', '有人愿意来', '经过考验'].some((t) => JSON.stringify(egView).includes(t)), false);
  const egHiddenLit = structuredClone(egViewSave);
  egHiddenLit.endgame.goals.find((g) => g.id === 'A9_ASSETS').milestones.find((m) => m.id === 'a9_runway_forever').achievedAt = EG_NOW.toISOString();
  check('藏着的格一旦点亮 → 名字当场揭晓（"原来这一步也算"）',
    endgameView(egHiddenLit).goals.find((g) => g.id === 'A9_ASSETS').milestones.find((m) => m.id === 'a9_runway_forever').title,
    '永远的跑道');

  // —— ⑨ 综合进度：三份等权 ——
  const egClear = egView.clear;
  check('三份等权，次序固定：终极目标 / 篇章 / 成就',
    egClear.components.map((c) => c.key), ['goals', 'chapters', 'achievements']);
  check('目标那一份：0 / 5（建角档一个终极目标都没走完）',
    egClear.components.find((c) => c.key === 'goals').line, '0 / 5 已达成');
  check('篇章分母是 8 —— CH9 不设终点，永远不算数（算进去 100% 就不可达）',
    egClear.components.find((c) => c.key === 'chapters').line,
    `${egViewSave.chapters.chapters.filter((c) => c.completed && c.id !== 'CH9').length} / 8 章完成`);
  check('成就分母是目录全量',
    egClear.components.find((c) => c.key === 'achievements').line,
    `${egViewSave.unlockables.achievementIds.length} / 23 枚徽记`);
  check('综合 = 三份的等权平均（谁也不比谁更重）',
    egClear.progress,
    egClear.components.reduce((s, c) => s + c.ratio, 0) / 3);
  check('建角档当然还没通关', egClear.complete, false);

  // —— ⑩ UR 通关：按事实判，不按浮点判 ——
  const egFull = egWorth(createMockState(), WEALTH_CURVE.targetUsdCents); // 金库压到 $100M：曲线到顶
  egFull.endgame.goals = egFull.endgame.goals.map((g) => ({
    ...g,
    achieved: true,
    milestones: g.milestones.map((m) => ({ ...m, achievedAt: '2027-01-01T00:00:00.000Z' })),
  }));
  egFull.chapters.chapters = egFull.chapters.chapters.map((c) => ({ ...c, completed: true }));
  egFull.unlockables = { ...egFull.unlockables, achievementIds: AC_LIST.map((a) => a.id) };
  const egFullClear = endgameView(egFull).clear;
  check('三份全满 → UR 判 complete，且三行读数全满',
    [egFullClear.complete, egFullClear.components.map((c) => c.line)],
    [true, ['5 / 5 已达成', '8 / 8 章完成', '23 / 23 枚徽记']]);
  check('综合真正到 100%（A9 的曲线也压到顶 —— 金库没到 $100M 时它会诚实地停在 99 附近）',
    Math.round(egFullClear.progress * 100), 100);
  const egShortOne = structuredClone(egFull);
  egShortOne.unlockables.achievementIds = egShortOne.unlockables.achievementIds.slice(1);
  check('缺一枚徽记 → UR 不亮（complete 宁缺毋滥）',
    endgameView(egShortOne).clear.complete, false);
  const egFactOnly = endgameView(egWorth(egFull, 1_000_000)); // 事实还在，金库退回 $10k
  check('complete 读事实不读浮点：金库退回去，UR 也不会灭（进度条会退，那是另一回事）',
    [egFactOnly.clear.complete, egFactOnly.clear.progress < 1], [true, true]);

  // -------------------------------------------------------------------------
  console.log('\n【㉛ 出厂封装：PWA 清单 / iOS meta / 容器与反代】');
  // -------------------------------------------------------------------------
  const readText = (rel) => readFileSync(join(root, rel), 'utf8');
  const readBin = (rel) => readFileSync(join(root, rel));

  // —— ① manifest：这是"装到主屏幕"那份图标与名字的合同 ——
  const manifest = JSON.parse(readText('public/manifest.webmanifest'));
  check('清单名带全名（主屏安装弹窗上认得出这是哪个应用）',
    manifest.name, '地球OL · Earth Online');
  check('short_name 是中文短名（图标下面那行字）', manifest.short_name, '地球OL');
  check('standalone：装上去就没有浏览器外壳', manifest.display, 'standalone');
  check('portrait：这本应用是竖着拿的', manifest.orientation, 'portrait');
  check('theme_color 是 PO 裁定的那格黑', manifest.theme_color, '#0a0a0c');
  check('background_color 与 theme 各司其职（开屏底 / 外壳）',
    manifest.background_color, '#050507');
  check('start_url 与 scope 都钉在根上（深链不许跑出应用）',
    [manifest.start_url, manifest.scope], ['/', '/']);

  // —— ② 图标：清单里点到的每一个文件都必须真实存在、尺寸自洽 ——
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngSize = (rel) => {
    let b;
    try {
      b = readBin(rel);
    } catch {
      return { ok: false, w: 0, h: 0, bytes: 0 };
    }
    return { ok: b.subarray(0, 8).equals(PNG_SIG), w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
  };
  const declaredPngs = manifest.icons.filter((i) => i.type === 'image/png');
  check('清单里有 192 与 512 两档（Chrome 判定可安装的最低配）',
    [declaredPngs.some((i) => i.sizes === '192x192'), declaredPngs.some((i) => i.sizes === '512x512')],
    [true, true]);
  check('512 另有一枚 maskable（安卓自适应图标；没有它圆角裁切会啃到金点）',
    manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'), true);
  for (const icon of declaredPngs) {
    const size = Number(icon.sizes.split('x')[0]);
    const p = pngSize(`public${icon.src}`);
    check(`图标 ${icon.src}：PNG 签名 + 文件真实像素 = 声明尺寸`,
      [p.ok, p.w, p.h], [true, size, size]);
  }
  const appleIcon = pngSize('public/apple-touch-icon.png');
  check('iOS 主屏图标 180×180（苹果不读 manifest，只认这个 link）',
    [appleIcon.ok, appleIcon.w, appleIcon.h], [true, 180, 180]);
  truthy('矢量版图标在场（favicon 与「任意尺寸」那一档都用它）',
    readText('public/icon.svg').startsWith('<svg'));

  // —— ③ 外壳 HTML：iOS 的独立窗口全靠这几行 ——
  const shell = readText('index.html');
  for (const [label, needle] of [
    ['清单已接线（<link rel="manifest">）', 'rel="manifest"'],
    ['apple-touch-icon 已接线', 'rel="apple-touch-icon"'],
    ['standalone：无此一项 iOS 仍在 Safari 里开，地址栏藏不掉', 'name="apple-mobile-web-app-capable"'],
    ['black-translucent：状态栏透明、内容铺到灵动岛', 'content="black-translucent"'],
    ['主屏名（图标下面那行字）', 'name="apple-mobile-web-app-title"'],
    ['viewport-fit=cover：没有它 env(safe-area-inset-*) 全为零', 'viewport-fit=cover'],
  ]) {
    truthy(label, shell.includes(needle));
  }
  const metaTheme = shell.match(/name="theme-color" content="([^"]+)"/)?.[1];
  check('theme-color meta 与 manifest 同一个数（两处漂了，地址栏与安装外壳会是两种黑）',
    metaTheme, manifest.theme_color);

  // —— ④ Service Worker：注册了，而且只在生产注册 ——
  const sw = readText('public/sw.js');
  truthy('sw.js 注册了 fetch 监听（Android 判定"可安装"的另一半条件）',
    sw.includes("addEventListener('fetch'"));
  // ⚠️ 先剥掉注释行再看正文 —— 本节第一版就被这里坑过一次：
  //    sw.js 与 nginx.conf 的注释里**正面提到**这些关键词（"不调用 respondWith"、
  //    "故意没有 Permissions-Policy"），对整份文本 includes 会把注释本身当成违规。
  const swCode = sw.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  truthy('sw.js 不做任何缓存（正文里没有 respondWith —— 拦截一出现，就得跟着写失效逻辑）',
    !swCode.includes('respondWith'));
  const mainSrc = readText('src/main.tsx');
  truthy('main.tsx 注册 SW', mainSrc.includes("serviceWorker.register('/sw.js')"));
  truthy('且只在生产注册（dev 里注册会把 HMR 绕进 SW）',
    mainSrc.includes('import.meta.env.PROD'));

  // —— ⑤ Dockerfile：两个阶段，运行层只驮一包静态文件 ——
  const dockerfile = readText('Dockerfile');
  check('多阶段：恰好两个 FROM（构建 + 运行）',
    (dockerfile.match(/^FROM /gm) ?? []).length, 2);
  truthy('构建阶段是 node:22-alpine（与开发机同大版本）',
    /FROM node:22-alpine AS build/.test(dockerfile));
  truthy('依赖用 npm ci（与 lockfile 严格对齐，不用 install）',
    dockerfile.includes('npm ci'));
  truthy('运行层是 nginx:alpine（没有 Node / 没有源码进镜像）',
    dockerfile.includes('FROM nginx:alpine'));
  truthy('只有 dist 进运行层',
    dockerfile.includes('COPY --from=build /app/dist /usr/share/nginx/html'));
  truthy('带健康检查（compose ps 里 healthy 才是真的问过它）',
    dockerfile.includes('HEALTHCHECK'));

  // —— ⑥ nginx：SPA 回退 / 压缩 / 安全头 / 三档缓存 ——
  const nginx = readText('nginx.conf');
  truthy('SPA 回退（深链在服务器上不存在，交还 index.html）',
    nginx.includes('try_files $uri $uri/ /index.html;'));
  truthy('gzip 开着', /gzip on;/.test(nginx));
  for (const [label, needle] of [
    ['JS', 'application/javascript'],
    ['CSS', 'text/css'],
    ['SVG', 'image/svg+xml'],
    ['manifest', 'application/manifest+json'],
  ]) {
    truthy(`gzip 覆盖 ${label}`, nginx.includes(needle));
  }
  truthy('禁外部 iframe 嵌入（X-Frame-Options: DENY）',
    nginx.includes('X-Frame-Options "DENY"'));
  truthy('禁 MIME 嗅探', nginx.includes('X-Content-Type-Options "nosniff"'));
  const nginxCode = nginx.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  truthy('**故意没有** Permissions-Policy（注释里提过它不算数，看的是正文）',
    !nginxCode.includes('Permissions-Policy:'));
  truthy('外壳不缓存（发版即生效）', nginx.includes('location = /index.html'));
  truthy('sw.js 不缓存（浏览器要能随时拿到最新那一行）',
    nginx.includes('location = /sw.js'));
  truthy('指纹资源长缓存（/assets/ 一年）',
    /location \/assets\/[\s\S]{0,80}expires 1y;/.test(nginx));

  // —— ⑦ compose 与构建上下文 ——
  const compose = readText('docker-compose.yml');
  truthy('端口 8080 → 80', compose.includes('"8080:80"'));
  truthy('restart: unless-stopped（服务器重启后自己回来）',
    compose.includes('restart: unless-stopped'));
  truthy('node_modules 不进构建上下文（宿主机依赖盖掉 npm ci = 经典翻车）',
    readText('.dockerignore').split('\n').map((l) => l.trim()).includes('node_modules'));

  // —— ⑧ 一页式说明在场，且说了三件必须说的事 ——
  const deploy = readText('docs/DEPLOY.md');
  truthy('部署文档：一条命令起步', deploy.includes('docker compose up -d --build'));
  truthy('部署文档：手机安装步骤（添加到主屏幕）', deploy.includes('添加到主屏幕'));
  truthy('部署文档：HTTPS 是硬前提（PWA 装不上，九成先查这一条）',
    deploy.includes('HTTPS'));

  // —— ⑨ README 与「没有 Docker」的裸机路径（PO 的服务器没有 Docker） ——
  const readme = readText('README.md');
  truthy('README：说了这是什么', readme.includes('地球OL'));
  truthy('README：给了本机上手（dev / build 都在）',
    readme.includes('npm run dev') && readme.includes('npm run build'));
  truthy('README：指向部署文档与裸机配置',
    readme.includes('docs/DEPLOY.md') && readme.includes('deploy/nginx-bare.conf'));
  const bare = readText('deploy/nginx-bare.conf');
  truthy('裸机配置：SPA 回退在场', bare.includes('try_files $uri $uri/ /index.html;'));
  for (const [label, needle] of [
    ['禁嵌入（X-Frame-Options: DENY）', 'X-Frame-Options "DENY"'],
    ['禁 MIME 嗅探', 'X-Content-Type-Options "nosniff"'],
    ['Referrer-Policy', 'Referrer-Policy "strict-origin-when-cross-origin"'],
    ['外壳不缓存', 'location = /index.html'],
    ['sw.js 不缓存', 'location = /sw.js'],
    ['指纹资源长缓存', 'expires 1y;'],
  ]) {
    truthy(`防漂移：裸机配置与容器版同款 —— ${label}`, bare.includes(needle) && nginx.includes(needle));
  }
  const bareCode = bare.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  truthy('裸机配置也**故意没有** Permissions-Policy（正文里没有；注释里提过不算）',
    !bareCode.includes('Permissions-Policy:'));
  truthy('部署文档：无 Docker 路径在场（裸机配置 + certbot）',
    deploy.includes('deploy/nginx-bare.conf') && deploy.includes('certbot'));

  // -------------------------------------------------------------------------
  console.log('\n【㉜ 出厂清场：空档（生产初始档）】');
  // -------------------------------------------------------------------------
  // PO 裁定：开发期为验收造的那批测试内容（每日任务、初始金钱、社交关系……）
  // 全部清空。清的姿势是**分家**：mockState 继续当那近千条断言与两份冒烟的
  // 夹具，玩家的初始档换成 `newGameState.ts` 的空档。这一节钉住四件事：
  //   ① 结构完整 ——「空白」是"每层容器都在场、只是没有数"，不是"缺胳膊少腿"；
  //   ② 引用隔离 —— 目录模板必须深拷贝（mock 早期踩过：共享引用，一次全脏）；
  //   ③ 全空清单 —— 逐项点名 PO 列举的那几样（每日 / 金钱 / 社交）确实归零；
  //   ④ 漏斗空转 —— 四道引擎在空档上跑两遍：第一遍只许派生 Ch.1 的条件行，
  //      第二遍必须原引用返回。**系统不许在一个空档上凭空长出一条事实。**
  const { createNewGameState } = await server.ssrLoadModule('/src/store/newGameState.ts');
  const { CHAPTERS: CH_ALL } = await server.ssrLoadModule('/src/data/catalog/chapters.ts');
  const { weekStartKey } = await server.ssrLoadModule('/src/lib/format.ts');
  const CLEAN_NOW = new Date('2026-10-07T04:00:00.000Z');
  const cleanState = createNewGameState(CLEAN_NOW);
  const cleanNowIso = CLEAN_NOW.toISOString();

  // —— ① 结构完整 ——
  check('四条职业线全在场，全部停在 Lv.1 / 0 EXP / 0 完成 / 无链',
    cleanState.careers.tracks.map((t) => [t.level, t.exp, t.stats.questsCompleted, t.chainIds.length]),
    CLASSES.map(() => [1, 0, 0, 0]));
  check('空档没有"正在走的线"（activeClassId 为 null，交给选择器回退）',
    cleanState.careers.activeClassId, null);
  check('九章全在场，只有 Ch.1 解锁',
    [cleanState.chapters.chapters.length,
     cleanState.chapters.chapters.filter((c) => c.unlocked).map((c) => c.id)],
    [CH_ALL.length, ['CH1']]);
  check('Ch.1 从建角那一刻开始，进章净资产 = 0（如实记录，不是 null）',
    [cleanState.chapters.chapters[0].startedAt, cleanState.chapters.chapters[0].entryNetWorthUsdCents],
    [cleanNowIso, 0]);
  check('五大终极目标全在场、一格未亮、进度全零',
    [cleanState.endgame.goals.length,
     cleanState.endgame.goals.flatMap((g) => g.milestones).filter((m) => m.achievedAt).length,
     cleanState.endgame.goals.every((g) => g.progress === 0)],
    [EG_ALL.length, 0, true]);
  check('进化树全在场、一颗星未亮、统计归零',
    [cleanState.evolution.nodes.length,
     cleanState.evolution.nodes.filter((n) => n.lit).length,
     cleanState.evolution.stats.litNodeCount,
     Object.values(cleanState.evolution.stats.branchProgress).every((v) => v === 0)],
    [EV_NODES.length, 0, 0, true]);
  check('出厂花名册九位都在（调度 / 四职业 / 蓝图 / 智囊 / 判官 / 审核官）',
    cleanState.agents.records.map((a) => a.id),
    ['agent_dispatcher', 'agent_class_compbio', 'agent_class_investor', 'agent_class_influencer',
     'agent_class_entrepreneur', 'agent_blueprints', 'agent_network_advisor', 'agent_arbiter',
     'agent_chain_reviewer']);
  check('但每一位的账都是零（mock 里那条"被调用过 6 次"只属于 mock）',
    [cleanState.agents.records.every((a) => a.stats.invocations === 0 && a.stats.costUsdCents === 0
      && a.stats.lastInvokedAt === null),
     cleanState.agents.invocations.length],
    [true, 0]);

  // —— ② 引用隔离：目录模板深拷贝，两次建档互不共享 ——
  check('目标树是深拷贝（goals / 单条 / 里程碑数组三层都不是目录的引用）',
    [cleanState.endgame.goals === EG_ALL, cleanState.endgame.goals[0] === EG_ALL[0],
     cleanState.endgame.goals[0].milestones === EG_ALL[0].milestones],
    [false, false, false]);
  check('进化树节点与揭示条件同样是深拷贝',
    [cleanState.evolution.nodes[0] === EV_NODES[0],
     cleanState.evolution.revealConditions === EV_CONDS],
    [false, false]);
  check('空档建完目录仍然干净（cb_1 未亮、目录目标零点亮）',
    [EV_NODES.find((n) => n.id === 'cb_1')?.lit,
     EG_ALL.flatMap((g) => g.milestones).filter((m) => m.achievedAt).length],
    [false, 0]);
  const cleanAgain = createNewGameState(CLEAN_NOW);
  check('两次建档互不共享（花名册与目标树都是新对象）',
    [cleanAgain.agents.records[0] === cleanState.agents.records[0],
     cleanAgain.endgame.goals[0] === cleanState.endgame.goals[0]],
    [false, false]);

  // —— ③ 全空清单（PO 点名的那几样在最前） ——
  check('每日任务：定义 / 推荐 / 日志全是空的（一条测试用的 daily 都没留下）',
    [cleanState.dailies.definitions.length, cleanState.dailies.recommendations.length,
     Object.keys(cleanState.dailies.logs).length],
    [0, 0, 0]);
  check('周常同理',
    [cleanState.weeklies.definitions.length, Object.keys(cleanState.weeklies.logs).length],
    [0, 0]);
  check('结算基准 = 建角当天（新档没有需要补结的历史）',
    [cleanState.dailies.lastSettledLocalDate, cleanState.weeklies.lastSettledWeekStart],
    [activeDayKey(CLEAN_NOW, cleanState.settings.dayRolloverHour),
     weekStartKey(activeDayKey(CLEAN_NOW, cleanState.settings.dayRolloverHour))]);
  check('初始金钱归零：现金 / 持仓 / 流水 / 净值历史全空，净资产读出来是 0',
    [cleanState.vault.cash, cleanState.vault.holdings.length, cleanState.vault.transactions.length,
     cleanState.vault.netWorthHistory.length, netWorthUsdCents(cleanState.vault)],
    [0, 0, 0, 0, 0]);
  check('社交关系归零：一个人都没有', cleanState.network.contacts.length, 0);
  check('属性全 0 且没有待分配点（不再有开局送的 2 点）',
    [cleanState.player.attributes, cleanState.player.freeAttributePoints],
    [{ vit: 0, int: 0, foc: 0, cha: 0, wil: 0, cap: 0 }, 0]);
  check('口号是空的（旧 mock 里那句话是给截图看的）', cleanState.player.motto, '');
  check('体力满格开场（80/80）',
    [cleanState.player.energy.current, cleanState.player.energy.max], [80, 80]);
  check('其余的"有记录"容器全部为空',
    [cleanState.quests.order.length, Object.keys(cleanState.quests.byId).length,
     Object.keys(cleanState.quests.chains).length, cleanState.journal.entries.length,
     cleanState.milestones.records.length, Object.keys(cleanState.milestones.counters).length,
     cleanState.events.length, cleanState.evolution.techMilestones.length],
    [0, 0, 0, 0, 0, 0, 0, 0]);
  check('徽记与待看队列从空开始（成就引擎在第一次写入时现算）',
    [cleanState.unlockables.achievementIds.length, cleanState.unlockables.pendingAchievementIds.length,
     cleanState.unlockables.easterEggIds.length],
    [0, 0, 0]);
  check('AI 未配置、本月账为零（mock 轨道开着，等玩家自己接密钥）',
    [cleanState.ai.configured, cleanState.ai.usage.costUsdCents, cleanState.ai.usage.tokensIn,
     cleanState.ai.usage.budgetUsdCents],
    [false, 0, 0, 2_000]);
  check('meta 从修订 0 开始，建角时刻盖在 createdAt / updatedAt 上',
    [cleanState.meta.revision, cleanState.meta.createdAt, cleanState.meta.updatedAt],
    [0, cleanNowIso, cleanNowIso]);

  // —— ④ 漏斗空转两遍：空档上不许长出一条事实 ——
  // 与 store.mutate 里的次序逐字一致：终局 → 篇章 → 进化树 → 成就。
  const cleanFunnel = (s) =>
    syncAchievements(syncEvolution(syncChapters(syncEndgame(s, CLEAN_NOW), CLEAN_NOW), CLEAN_NOW), CLEAN_NOW);
  const cleanPass1 = cleanFunnel(cleanState);
  check('第一遍只动了 chapters 一个顶层分节（其余分节连引用都不换）',
    Object.keys(cleanState).filter((k) => cleanPass1[k] !== cleanState[k]),
    ['chapters']);
  check('第一遍 Ch.1 的条件行由引擎按事实派生：全部未达成（0/30、1/5、0/1）',
    cleanPass1.chapters.chapters[0].conditionProgress.map((r) => [r.current, r.target, r.met]),
    [[0, 30, false], [1, 5, false], [0, 1, false]]);
  check('Ch.1 的其余字段一个没动，Ch.2+ 连引用都没换，没有待看仪式',
    [['unlocked', 'completed', 'expEarnedInChapter', 'questsCompletedInChapter', 'startedAt',
      'completedAt', 'entryNetWorthUsdCents'].some(
        (f) => cleanPass1.chapters.chapters[0][f] !== cleanState.chapters.chapters[0][f]),
     cleanPass1.chapters.chapters.slice(1).every((c, i) => c === cleanState.chapters.chapters[i + 1]),
     cleanPass1.chapters.pendingCeremony],
    [false, true, null]);
  check('漏斗跑完，空档还是那个空档（没有里程碑 / 节点 / 徽记 / 科技条目被点亮）',
    [cleanPass1.endgame.goals.flatMap((g) => g.milestones).filter((m) => m.achievedAt).length,
     cleanPass1.evolution.nodes.filter((n) => n.lit).length,
     cleanPass1.evolution.techMilestones.length,
     cleanPass1.unlockables.achievementIds.length,
     cleanPass1.events.length],
    [0, 0, 0, 0, 0]);
  check('第二遍完全收敛：四道引擎一致原引用返回', cleanFunnel(cleanPass1) === cleanPass1, true);

  // —— ⑤ store 接线：出厂路径与两个危险按钮都指向空档 ——
  const { useEarthOnlineStore: store32 } = await server.ssrLoadModule('/src/store/useEarthOnlineStore.ts');
  check('store 刚载入时手里就是空档（第一次打开看到的那份）',
    [store32.getState().save.vault.cash, store32.getState().save.network.contacts.length],
    [0, 0]);
  check('旧的 resetToMock 已不存在（防止只改一半）',
    typeof store32.getState().resetToMock, 'undefined');
  store32.setState({ save: createMockState() });
  store32.getState().resetToNewGame();
  check('「重新开始」回到空档', store32.getState().save.vault.cash, 0);
  store32.getState().wipe();
  check('「彻底删除」留下的还是空档（等于从来没有过这份存档）',
    [store32.getState().save.vault.cash, store32.getState().fromDisk], [0, false]);
  const cleanSrc = readText('src/store/newGameState.ts').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  truthy('生产初始档不引用 mockState（玩家的档不许夹带夹具）',
    !cleanSrc.includes("from './mockState'"));
  const storeSrc = readText('src/store/useEarthOnlineStore.ts').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  truthy('store 的建档 / 重置路径全部指向 newGameState',
    storeSrc.includes("from './newGameState'") && !storeSrc.includes('createMockState')
      && !storeSrc.includes('resetToMock'));

} catch (err) {
  failed += 1;
  console.error('\n💥 校验脚本自身异常：\n', err);
} finally {
  await server.close();
}

console.log(failed === 0 ? '\n✅ 全部通过' : `\n❌ ${failed} 项未通过`);
process.exit(failed === 0 ? 0 : 1);
