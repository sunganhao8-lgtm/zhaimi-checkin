/* 核心逻辑测试 — node test-logic.js */
'use strict';
let store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
global.confirm = () => true;
const m = require('./app.js');

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
}

const PET = 'p_test';
m.state.pets.push({ id: PET, name: '糯米', type: 'dog', emoji: '🐶', createdAt: '2026-01-01' });
m.state.activePetId = PET;

/* 日期工具 */
console.log('[1] 日期工具');
T('addDays 跨月', m.daysBetween('2026-01-31', m.addDays('2026-01-31', 1)) === 1);
T('addDays 跨年', m.addDays('2026-12-31', 1) === '2027-01-01');
T('daysBetween 顺序无关', m.daysBetween('2026-01-01', '2026-01-10') === 9);
T('daysBetween 跨年', m.daysBetween('2026-12-31', '2027-01-02') === 2);
T('addDays 平年2月末', m.addDays('2026-03-01', -1) === '2026-02-28');

/* 打卡与连续天数 */
console.log('[2] 打卡与 streak');
const today = new Date();
const tk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
let k = tk;
for (let i = 0; i < 5; i++) { m.toggleDaily(PET, k, 'feed'); k = m.addDays(k, -1); } // 今天~4天前 喂食
T('toggleDaily 生效', m.isDailyDone(PET, tk, 'feed') === true);
T('连续5天(含今天)', m.calcStreak(PET) === 5);
m.toggleDaily(PET, tk, 'feed'); // 取消今天
T('取消今天后 streak=4(不断签)', m.calcStreak(PET) === 4);
m.toggleDaily(PET, tk, 'feed');
/* 断签: 只在3天前喂过 */
m.state.logs[PET].daily = {};
m.state.logs[PET].daily[m.addDays(tk, -3)] = { feed: 1 };
T('只喂过3天前→streak=0', m.calcStreak(PET) === 0);
for (let i = 0; i < 5; i++) m.state.logs[PET].daily[m.addDays(tk, -i)] = { feed: 1 }; // 恢复(直接赋值, 不用toggle)

/* 周统计 */
console.log('[3] 周统计');
m.toggleDaily(PET, tk, 'water');
const stats = m.calcWeekStats(PET, m.state.pets[0]);
// dog: feed,water,poop,walk,play = 5任务 × 7天 = 35; 今天 feed+water=2, 其余4天各1 → 6
T('完成数=6', stats.done === 6);
T('完成率=17%', stats.pct === 17);
T('7天数组有序', stats.days[6].key === tk && stats.days[6].done === 2);
T('7天数组起点=6天前', stats.days[0].key === m.addDays(tk, -6));

/* 周期任务 */
console.log('[4] 周期任务');
m.markPeriodic(PET, 'deworm'); // 今天
T('驱虫今天做→还剩30天', m.periodicStatus(PET, 'deworm').text === '还剩 30 天');
m.state.logs[PET].periodic.vaccine = m.addDays(tk, -400); // 400天前
T('疫苗超期35天', m.periodicStatus(PET, 'vaccine').state === 'overdue' && m.periodicStatus(PET, 'vaccine').text === '已超期 35 天');
m.state.logs[PET].periodic.bath = m.addDays(tk, -14); // 恰好一个周期
T('恰好14天前→今天到期', m.periodicStatus(PET, 'bath').state === 'due' && m.periodicStatus(PET, 'bath').text === '今天到期');

/* 体重 */
console.log('[5] 体重');
m.state.logs[PET].weights = [{ d: m.addDays(tk, -8), kg: 4.2 }];
m.addWeight(PET, 4.5);
const w = m.weightTrend(PET);
T('最新4.5', w.latest === 4.5);
T('趋势+0.3', w.delta === 0.3);
m.addWeight(PET, 4.8); // 同一天再记
T('同日再记→覆盖不追加', m.state.logs[PET].weights.length === 2 && m.weightTrend(PET).latest === 4.8);
m.state.logs[PET].weights.push({ d: m.addDays(tk, -1), kg: 4.6 });
m.state.logs[PET].weights.sort((a, b) => (a.d < b.d ? -1 : 1));
T('乱序体重被趋势取最近两条', m.weightTrend(PET).delta === 0.2);

/* 内疚横幅 gap */
console.log('[6] 内疚横幅 feedGapDays');
const pNew = 'p_new_today';
m.state.pets.push({ id: pNew, name: '新崽', type: 'cat', emoji: '🐱', createdAt: tk });
T('今天建档没喂→gap<2(显示"今天还没喂")', m.feedGapDays(pNew) < 2);
const pNew3 = 'p_new_3d';
m.state.pets.push({ id: pNew3, name: '三崽', type: 'cat', emoji: '🐱', createdAt: m.addDays(tk, -3) });
T('3天前建档没喂→gap=3', m.feedGapDays(pNew3) === 3);
const pOld = 'p_old';
m.state.pets.push({ id: pOld, name: '老崽', type: 'cat', emoji: '🐱', createdAt: '2020-01-01' });
T('老宠物30天没喂→gap封顶30', m.feedGapDays(pOld) === 30);
T('今天喂了→gap=0', m.feedGapDays(PET) === 0);

/* 导入/读取数据兜底 */
console.log('[7] normalizeState 数据兜底');
T('null→拒绝', m.normalizeState(null) === null);
T('缺pets数组→拒绝', m.normalizeState({ pets: 'x' }) === null);
T('pets非数组→拒绝', m.normalizeState({ pets: 42 }) === null);
const bad = m.normalizeState({
  pets: [{ id: 'p1', name: '超长名字超过十个字会被截断的哦嘻嘻', type: 'dragon', photo: 42, createdAt: 'bad-date' }],
  activePetId: 'p_missing',
  logs: { p1: { weights: 'nope' }, orphan: null },
});
T('非法type→other', bad.pets[0].type === 'other');
T('名字截断到10字', bad.pets[0].name.length === 10);
T('非法photo→null', bad.pets[0].photo === null);
T('非法建档日→今天', bad.pets[0].createdAt === tk);
T('指向缺失宠物的activePetId→回退第一只', bad.activePetId === 'p1');
T('畸形logs→补齐结构', bad.logs.p1.daily && Array.isArray(bad.logs.p1.weights) && bad.logs.p1.weights.length === 0);
const good = m.normalizeState({ pets: [{ id: 'p2', name: '煤球', type: 'cat', emoji: '🐈', photo: 'data:image/jpeg;base64,xx', createdAt: '2025-06-01' }], activePetId: 'p2', logs: {} });
T('合法数据原样通过(含photo)', good.pets[0].photo === 'data:image/jpeg;base64,xx' && good.pets[0].emoji === '🐈');

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
