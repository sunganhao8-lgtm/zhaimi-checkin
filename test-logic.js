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

/* 周统计 */
console.log('[3] 周统计');
m.toggleDaily(PET, tk, 'water');
const stats = m.calcWeekStats(PET, m.state.pets[0]);
// dog: feed,water,poop,walk,play = 5任务 × 7天 = 35; 今天 feed+water=2, 其余4天各1 → 6
T('完成数=6', stats.done === 6);
T('完成率=17%', stats.pct === 17);
T('7天数组有序', stats.days[6].key === tk && stats.days[6].done === 2);

/* 周期任务 */
console.log('[4] 周期任务');
m.markPeriodic(PET, 'deworm'); // 今天
T('驱虫今天做→还剩30天', m.periodicStatus(PET, 'deworm').text === '还剩 30 天');
m.state.logs[PET].periodic.vaccine = m.addDays(tk, -400); // 400天前
T('疫苗超期35天', m.periodicStatus(PET, 'vaccine').state === 'overdue' && m.periodicStatus(PET, 'vaccine').text === '已超期 35 天');
T('从未记录→none', m.periodicStatus(PET, 'bath').state === 'none');

/* 体重 */
console.log('[5] 体重');
m.state.logs[PET].weights = [{ d: m.addDays(tk, -8), kg: 4.2 }];
m.addWeight(PET, 4.5);
const w = m.weightTrend(PET);
T('最新4.5', w.latest === 4.5);
T('趋势+0.3', w.delta === 0.3);

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
