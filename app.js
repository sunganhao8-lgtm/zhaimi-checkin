/* 宅咪打卡 — MVP (纯前端, localStorage)
 * 核心循环: 每日打卡 → 连续天数(streak) → 周报卡(社交裂变)
 */
'use strict';

/* ---------- 配置 ---------- */
const DAILY_META = {
  feed:  { icon: '🍚', label: '喂食' },
  water: { icon: '💧', label: '加水' },
  poop:  { icon: '🧹', label: '铲屎' },
  walk:  { icon: '🦮', label: '遛狗' },
  play:  { icon: '🎾', label: '陪玩' },
};
const PERIODIC_META = {
  deworm:  { icon: '💊', label: '驱虫', days: 30 },
  bath:    { icon: '🛁', label: '洗澡', days: 14 },
  vaccine: { icon: '💉', label: '疫苗', days: 365 },
  weigh:   { icon: '⚖️', label: '记体重', days: 7 },
};
const TYPE_TASKS = {
  cat:  ['feed', 'water', 'poop', 'play'],
  dog:  ['feed', 'water', 'poop', 'walk', 'play'],
  other:['feed', 'water', 'poop'],
};
const TYPE_NAME = { cat: '猫猫', dog: '狗狗', other: '毛孩子' };
const EMOJIS = ['🐱', '🐶', '🐰', '🐹', '🐦', '🐢', '🦎', '🐠'];

const GUILT_LINES = [
  '{name}不会说话，但它记得每顿饭 🥣',
  '碗空了很久了，{name}在假装睡觉 🐾',
  '{name}今天还没等到你，别让它白等一天',
  '加班再晚，也记得给{name}添口粮',
];
const GOOD_LINES = [
  '今天满分，{name}睡得很安心 🧡',
  '连续宠爱中，{name}是全楼最幸福的崽',
  '{name}表示：今天也很爱这个家 💕',
];

/* ---------- 存储 ---------- */
const KEY = 'zhaimi_checkin_v1';
let state = load();

/* 导入/读取兜底: 缺字段补默认、脏字段清洗, 防止坏数据把渲染打崩 */
function normalizeState(s) {
  if (!s || !Array.isArray(s.pets)) return null;
  const out = { pets: [], activePetId: null, logs: (s.logs && typeof s.logs === 'object') ? s.logs : {} };
  s.pets.forEach(p => {
    if (!p || !p.id || !p.name) return;
    out.pets.push({
      id: String(p.id),
      name: String(p.name).slice(0, 10),
      type: TYPE_TASKS[p.type] ? p.type : 'other',
      emoji: p.emoji || '🐾',
      photo: typeof p.photo === 'string' ? p.photo : null,
      createdAt: /^\d{4}-\d{2}-\d{2}$/.test(p.createdAt || '') ? p.createdAt : todayKey(),
    });
  });
  out.activePetId = (s.activePetId && out.pets.some(p => p.id === s.activePetId))
    ? s.activePetId : (out.pets[0] ? out.pets[0].id : null);
  Object.keys(out.logs).forEach(pid => {
    const l = out.logs[pid] || {};
    out.logs[pid] = { daily: l.daily || {}, periodic: l.periodic || {}, weights: Array.isArray(l.weights) ? l.weights : [] };
  });
  return out;
}
function load() {
  try {
    const s = normalizeState(JSON.parse(localStorage.getItem(KEY)));
    if (s) return s;
  } catch (e) { /* 损坏则重建 */ }
  return { pets: [], activePetId: null, logs: {} };
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

/* ---------- 日期工具 ---------- */
function fmtKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function keyToDate(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(k, n) { const d = keyToDate(k); d.setDate(d.getDate() + n); return fmtKey(d); }
function todayKey() { return fmtKey(new Date()); }
function daysBetween(a, b) { return Math.round((keyToDate(b) - keyToDate(a)) / 86400000); }

/* ---------- 宠物 ---------- */
function activePet() { return state.pets.find(p => p.id === state.activePetId) || state.pets[0] || null; }
function petLog(id) {
  if (!state.logs[id]) state.logs[id] = { daily: {}, periodic: {}, weights: [] };
  return state.logs[id];
}
function dailyTasksOf(pet) { return TYPE_TASKS[pet.type] || TYPE_TASKS.other; }

/* ---------- 打卡核心 ---------- */
function toggleDaily(petId, key, task) {
  const log = petLog(petId);
  if (!log.daily[key]) log.daily[key] = {};
  if (log.daily[key][task]) delete log.daily[key][task];
  else log.daily[key][task] = 1;
  save();
}
function isDailyDone(petId, key, task) { return !!(petLog(petId).daily[key] && petLog(petId).daily[key][task]); }

/* streak: 以"喂食"为底线, 连续喂食天数; 今天未喂不断签, 但提示 */
function calcStreak(petId) {
  const log = petLog(petId);
  let k = todayKey();
  if (!(log.daily[k] && log.daily[k].feed)) k = addDays(k, -1); // 今天还没喂, 从昨天数
  let n = 0;
  while (log.daily[k] && log.daily[k].feed) { n++; k = addDays(k, -1); if (n > 3650) break; }
  return n;
}

/* 最近7天完成率 (每日任务, 含今天) */
function calcWeekStats(petId, pet) {
  const log = petLog(petId);
  const tasks = dailyTasksOf(pet);
  let done = 0, total = 0;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const k = addDays(todayKey(), -i);
    const rec = log.daily[k] || {};
    let d = 0;
    tasks.forEach(t => { if (rec[t]) d++; });
    done += d; total += tasks.length;
    days.push({ key: k, done: d, total: tasks.length, feed: !!rec.feed });
  }
  return { pct: total ? Math.round((done / total) * 100) : 0, days, done, total };
}

/* 周期任务状态 */
function periodicStatus(petId, item) {
  const log = petLog(petId);
  const last = log.periodic[item];
  if (!last) return { state: 'none', text: '还没记录过' };
  const due = addDays(last, PERIODIC_META[item].days);
  const diff = daysBetween(todayKey(), due); // >0 剩余天数, <0 超期
  if (diff < 0) return { state: 'overdue', text: `已超期 ${-diff} 天`, last, due };
  if (diff === 0) return { state: 'due', text: '今天到期', last, due };
  return { state: 'ok', text: `还剩 ${diff} 天`, last, due };
}
function markPeriodic(petId, item, key) {
  const log = petLog(petId);
  log.periodic[item] = key || todayKey();
  save();
}

/* 体重 */
function addWeight(petId, kg) {
  const log = petLog(petId);
  const tk = todayKey();
  const same = log.weights.find(x => x.d === tk);
  if (same) same.kg = Number(kg); /* 同一天再记 → 覆盖, 趋势不被同日两条污染 */
  else log.weights.push({ d: tk, kg: Number(kg) });
  log.weights.sort((a, b) => (a.d < b.d ? -1 : 1));
  save();
}
function weightTrend(petId) {
  const w = petLog(petId).weights;
  if (!w.length) return null;
  const latest = w[w.length - 1].kg;
  const prev = w.length > 1 ? w[w.length - 2].kg : null;
  return { latest, prev, delta: prev != null ? Number((latest - prev).toFixed(1)) : null };
}

/* 距上次喂食几天: 往回扫最多30天; 从没喂过按建档日算, 别对刚建档的用户说"30天没喂" */
function feedGapDays(petId) {
  const pet = state.pets.find(p => p.id === petId);
  let gap = 0, k = todayKey();
  while (!isDailyDone(petId, k, 'feed') && gap < 30) { gap++; k = addDays(k, -1); }
  if (gap >= 30 && pet && pet.createdAt) {
    gap = Math.min(30, Math.max(1, daysBetween(pet.createdAt, todayKey())));
  }
  return gap;
}

/* ---------- 渲染 ---------- */
function render() {
  const pet = activePet();
  const chips = document.getElementById('petChips');
  chips.innerHTML = '';
  state.pets.forEach(p => {
    const c = document.createElement('button');
    c.className = 'chip' + (p.id === (pet && pet.id) ? ' active' : '');
    c.textContent = `${p.emoji} ${p.name}`;
    c.onclick = () => { state.activePetId = p.id; save(); render(); };
    chips.appendChild(c);
  });

  const banner = document.getElementById('banner');
  const card = document.getElementById('petCard');
  const grid = document.getElementById('dailyTasks');
  const plist = document.getElementById('periodicTasks');
  const wp = document.getElementById('weeklyPreview');
  document.getElementById('todayDate').textContent = todayKey();

  if (!pet) {
    banner.style.display = 'none';
    card.innerHTML = `<div class="empty" style="width:100%">
      <div class="e-icon">🐾</div>
      <h2>养它，就别辜负它</h2>
      <p>喂食 · 遛狗 · 驱虫 · 疫苗，全部打卡记录<br>每周生成一张可以晒的「铲屎官成绩单」</p>
      <button class="btn-primary" onclick="openPetModal()">添加我的毛孩子</button>
    </div>`;
    grid.innerHTML = ''; plist.innerHTML = ''; wp.innerHTML = '';
    return;
  }

  /* 横幅: 内疚 / 安心 */
  banner.style.display = '';
  const tk = todayKey();
  const fed = isDailyDone(pet.id, tk, 'feed');
  const streak = calcStreak(pet.id);
  const nm = esc(pet.name); /* 横幅走 innerHTML, 名字必须转义 */
  if (fed) {
    const line = GOOD_LINES[Math.floor(Math.random() * GOOD_LINES.length)].replace('{name}', nm);
    banner.className = 'banner good';
    banner.innerHTML = `<b>连续 ${streak} 天</b> · ${line}`;
  } else {
    const gap = feedGapDays(pet.id);
    const line = GUILT_LINES[Math.floor(Math.random() * GUILT_LINES.length)].replace('{name}', nm);
    banner.className = 'banner';
    banner.innerHTML = gap >= 2
      ? `已经 <b>${gap} 天</b>没喂了… ${line}`
      : `今天还没喂 · ${line}`;
  }

  /* 宠物卡 */
  card.innerHTML = `
    <div class="avatar">${pet.photo ? `<img src="${pet.photo}" alt="">` : pet.emoji}</div>
    <div class="pet-meta">
      <div class="pet-name">${esc(pet.name)}</div>
      <div class="pet-sub">${TYPE_NAME[pet.type]} · ${fed ? '今日已喂食 ✓' : '今日还没喂 ⚠️'}</div>
    </div>
    <div class="streak-box">
      <div class="streak-num">🔥${streak}</div>
      <div class="streak-label">连续天数</div>
    </div>`;

  /* 每日任务 */
  grid.innerHTML = '';
  dailyTasksOf(pet).forEach(t => {
    const m = DAILY_META[t];
    const done = isDailyDone(pet.id, tk, t);
    const el = document.createElement('div');
    el.className = 'task' + (done ? ' done' : '');
    el.innerHTML = `<div class="t-icon">${m.icon}</div><div class="t-label">${m.label}</div><div class="t-check">${done ? '✓ 已完成' : ''}</div>`;
    el.onclick = () => { toggleDaily(pet.id, tk, t); render(); };
    grid.appendChild(el);
  });

  /* 周期任务 */
  plist.innerHTML = '';
  Object.keys(PERIODIC_META).forEach(item => {
    const m = PERIODIC_META[item];
    const st = periodicStatus(pet.id, item);
    const w = item === 'weigh' ? weightTrend(pet.id) : null;
    let info = st.text;
    if (w && w.latest != null) info = `最新 ${w.latest}kg${w.delta != null ? (w.delta > 0 ? ` (▲${w.delta})` : w.delta < 0 ? ` (▼${-w.delta})` : ' (持平)') : ''}`;
    const el = document.createElement('div');
    el.className = 'p-task';
    el.innerHTML = `
      <div class="p-icon">${m.icon}</div>
      <div class="p-body">
        <div class="p-name">${m.label}<span style="font-size:11px;color:var(--ink-2);font-weight:400"> · 周期${m.days}天</span></div>
        <div class="p-info ${st.state === 'overdue' ? 'overdue' : st.state === 'ok' ? 'ok' : ''}">${info}</div>
      </div>
      <button class="btn-sm">${item === 'weigh' ? '记一下' : '今天做了'}</button>`;
    el.querySelector('button').onclick = () => {
      if (item === 'weigh') openWeightModal(pet.id);
      else { markPeriodic(pet.id, item); render(); }
    };
    plist.appendChild(el);
  });

  /* 周报预览 */
  const stats = calcWeekStats(pet.id, pet);
  const w = weightTrend(pet.id);
  wp.innerHTML = `
    <div class="wp-stat"><div class="wp-num hot">${stats.pct}%</div><div class="wp-label">7天完成率</div></div>
    <div class="wp-div"></div>
    <div class="wp-stat"><div class="wp-num">🔥${streak}</div><div class="wp-label">连续天数</div></div>
    <div class="wp-div"></div>
    <div class="wp-stat"><div class="wp-num">${w && w.latest != null ? w.latest + 'kg' : '—'}</div><div class="wp-label">最新体重</div></div>`;
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------- 弹层 ---------- */
function openModal(html) {
  document.getElementById('modal').innerHTML = html;
  document.getElementById('mask').classList.add('show');
}
function closeModal() { document.getElementById('mask').classList.remove('show'); }

function openPetModal(existing) {
  const p = existing || { name: '', type: 'cat', emoji: '🐱', photo: null };
  openModal(`
    <h3>${existing ? '编辑' : '添加'}毛孩子</h3>
    <div class="field"><label>名字</label><input type="text" id="f_name" value="${esc(p.name)}" maxlength="10" placeholder="比如: 糯米"></div>
    <div class="field"><label>它是</label>
      <div class="seg" id="f_type">
        <button data-v="cat" class="${p.type === 'cat' ? 'active' : ''}">🐱 猫猫</button>
        <button data-v="dog" class="${p.type === 'dog' ? 'active' : ''}">🐶 狗狗</button>
        <button data-v="other" class="${p.type === 'other' ? 'active' : ''}">🐾 其他</button>
      </div>
    </div>
    <div class="field"><label>头像</label>
      <div class="emoji-row" id="f_emoji">${EMOJIS.map(e => `<button data-v="${e}" class="${e === p.emoji ? 'active' : ''}">${e}</button>`).join('')}</div>
    </div>
    <div class="field photo-row">
      <div class="avatar" id="f_photoBtn">${p.photo ? `<img src="${p.photo}">` : p.emoji}</div>
      <span style="font-size:12px;color:var(--ink-2)">点头像可上传照片（会压缩存储）</span>
      <input type="file" accept="image/*" id="f_file" style="display:none">
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn-primary" id="f_save">保存</button>
    </div>
    ${existing ? `<button class="danger" id="f_del">删除这只宠物（含记录）</button>` : ''}
  `);

  let type = p.type, emoji = p.emoji, photo = p.photo;
  document.querySelectorAll('#f_type button').forEach(b => b.onclick = () => {
    type = b.dataset.v;
    document.querySelectorAll('#f_type button').forEach(x => x.classList.toggle('active', x === b));
  });
  document.querySelectorAll('#f_emoji button').forEach(b => b.onclick = () => {
    emoji = b.dataset.v; photo = null;
    document.querySelectorAll('#f_emoji button').forEach(x => x.classList.toggle('active', x === b));
    document.getElementById('f_photoBtn').innerHTML = emoji;
  });
  const fileInput = document.getElementById('f_file');
  document.getElementById('f_photoBtn').onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const f = fileInput.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      const s = 128 / Math.min(img.width, img.height);
      cv.width = 128; cv.height = 128;
      const cx = cv.getContext('2d');
      cx.drawImage(img, (img.width * s - 128) / -2, (img.height * s - 128) / -2, img.width * s, img.height * s);
      photo = cv.toDataURL('image/jpeg', 0.8);
      URL.revokeObjectURL(img.src);
      document.getElementById('f_photoBtn').innerHTML = `<img src="${photo}">`;
    };
    img.src = URL.createObjectURL(f);
  };
  document.getElementById('f_save').onclick = () => {
    const name = document.getElementById('f_name').value.trim();
    if (!name) { document.getElementById('f_name').focus(); return; }
    if (existing) {
      Object.assign(existing, { name, type, emoji, photo });
    } else {
      const id = 'p' + Date.now();
      state.pets.push({ id, name, type, emoji, photo, createdAt: todayKey() });
      state.activePetId = id;
    }
    save(); closeModal(); render();
  };
  const del = document.getElementById('f_del');
  if (del) del.onclick = () => {
    if (!confirm(`确定删除 ${existing.name} 和全部记录？不可恢复`)) return;
    state.pets = state.pets.filter(x => x.id !== existing.id);
    delete state.logs[existing.id];
    state.activePetId = state.pets[0] ? state.pets[0].id : null;
    save(); closeModal(); render();
  };
}

function openWeightModal(petId) {
  const w = weightTrend(petId);
  openModal(`
    <h3>记体重</h3>
    <div class="field"><label>今天体重 (kg)</label>
      <input type="number" id="w_kg" step="0.1" placeholder="${w && w.latest != null ? '上次 ' + w.latest + 'kg' : '比如 4.5'}">
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn-primary" id="w_save">保存</button>
    </div>`);
  document.getElementById('w_save').onclick = () => {
    const v = parseFloat(document.getElementById('w_kg').value);
    if (!v || v <= 0 || v > 300) return;
    addWeight(petId, v);
    markPeriodic(petId, 'weigh');
    closeModal(); render();
  };
}

/* ---------- 周报卡 (Canvas) ---------- */
function loadImg(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
/* canvas 文本超宽加省略号 */
function fitText(g, text, maxWidth) {
  if (g.measureText(text).width <= maxWidth) return text;
  while (text.length > 1 && g.measureText(text + '…').width > maxWidth) text = text.slice(0, -1);
  return text + '…';
}
async function drawWeeklyCard() {
  const pet = activePet();
  if (!pet) return null;
  const stats = calcWeekStats(pet.id, pet);
  const streak = calcStreak(pet.id);
  const w = weightTrend(pet.id);
  /* 照片必须等 onload 再画, 否则周报卡头像是一块空白圆 */
  const photoImg = pet.photo ? await loadImg(pet.photo) : null;
  const W = 1080, H = 1440;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');

  /* 奶油底 + 爪印水印 */
  g.fillStyle = '#FBF5EC'; g.fillRect(0, 0, W, H);
  g.save();
  g.globalAlpha = 0.05; g.font = '90px sans-serif';
  for (let i = 0; i < 10; i++) {
    g.save();
    g.translate(90 + (i % 3) * 380, 180 + Math.floor(i / 3) * 380);
    g.rotate((i % 2 ? -0.4 : 0.3));
    g.fillText('🐾', 0, 0);
    g.restore();
  }
  g.restore();

  /* 头部 */
  g.textAlign = 'center';
  g.fillStyle = '#8A7A6B'; g.font = '600 34px sans-serif';
  g.fillText(`${stats.days[0].key.slice(5).replace('-', '.')} — ${stats.days[6].key.slice(5).replace('-', '.')}`, W / 2, 120);
  g.fillStyle = '#3D2E23'; g.font = '800 88px sans-serif';
  g.fillText('宅咪周报', W / 2, 230);
  g.fillStyle = '#E8582A'; g.font = '600 36px sans-serif';
  g.fillText('铲屎官本周成绩单', W / 2, 290);

  /* 头像圆 */
  const cy = 470, r = 130;
  g.save();
  g.beginPath(); g.arc(W / 2, cy, r + 8, 0, Math.PI * 2);
  g.fillStyle = '#F3D9C8'; g.fill();
  g.beginPath(); g.arc(W / 2, cy, r, 0, Math.PI * 2); g.clip();
  if (photoImg) {
    const s = Math.max((r * 2) / photoImg.width, (r * 2) / photoImg.height);
    g.drawImage(photoImg, W / 2 - photoImg.width * s / 2, cy - photoImg.height * s / 2, photoImg.width * s, photoImg.height * s);
  } else {
    g.font = '150px sans-serif'; g.textBaseline = 'middle';
    g.fillText(pet.emoji, W / 2, cy + 10);
    g.textBaseline = 'alphabetic';
  }
  g.restore();

  g.fillStyle = '#3D2E23'; g.font = '800 56px sans-serif';
  g.fillText(fitText(g, pet.name, W - 160), W / 2, cy + r + 80); /* canvas 不吃 HTML 转义, 只防超宽 */
  g.fillStyle = '#8A7A6B'; g.font = '400 32px sans-serif';
  g.fillText(`我是${TYPE_NAME[pet.type]} · 本周被照顾得怎么样？`, W / 2, cy + r + 130);

  /* 数据条 */
  const sy = 800;
  const items = [
    { n: stats.pct + '%', l: '7天完成率', hot: true },
    { n: '🔥' + streak, l: '连续宠爱', hot: false },
    { n: w && w.latest != null ? w.latest + 'kg' : '—', l: '最新体重', hot: false },
  ];
  items.forEach((it, i) => {
    const x = W / 6 + (W / 3) * i;
    g.fillStyle = it.hot ? '#E8582A' : '#3D2E23';
    g.font = '800 76px sans-serif';
    g.fillText(it.n, x, sy);
    g.fillStyle = '#8A7A6B'; g.font = '400 30px sans-serif';
    g.fillText(it.l, x, sy + 52);
    if (i < 2) { g.fillStyle = '#EFE5D6'; g.fillRect(W / 3 * (i + 1), sy - 70, 2, 110); }
  });

  /* 7日格子 */
  const gy = 960, gw = 110, gap = (W - 7 * gw) / 8;
  const weekCN = ['日', '一', '二', '三', '四', '五', '六'];
  stats.days.forEach((d, i) => {
    const x = gap + (gw + gap) * i;
    const dt = keyToDate(d.key);
    const isToday = d.key === todayKey();
    g.fillStyle = isToday ? '#E8582A' : '#3D2E23';
    g.font = `700 30px sans-serif`;
    g.fillText(`周${weekCN[dt.getDay()]}`, x + gw / 2, gy + 34);
    /* 卡片 */
    const boxY = gy + 60, boxH = 240;
    roundRect(g, x, boxY, gw, boxH, 20);
    g.fillStyle = d.feed ? '#F2E4D4' : '#F6EFE7';
    g.fill();
    if (isToday) { roundRect(g, x, boxY, gw, boxH, 20); g.strokeStyle = '#E8582A'; g.lineWidth = 4; g.stroke(); }
    /* 完成点 */
    const dots = Math.min(d.done, 5);
    for (let j = 0; j < Math.max(dots, d.total ? Math.min(d.total, 5) : 0); j++) {
      const dx = x + gw / 2 + (j % 2 === 0 ? -14 : 14);
      const dy = boxY + 50 + Math.floor(j / 2) * 40;
      g.beginPath(); g.arc(dx, dy, 11, 0, Math.PI * 2);
      g.fillStyle = j < dots ? '#E8582A' : '#E7DCCB';
      g.fill();
    }
    if (d.total > 5) {
      g.fillStyle = '#8A7A6B'; g.font = '600 24px sans-serif';
      g.fillText(`${d.done}/${d.total}`, x + gw / 2, boxY + boxH - 18);
    }
  });

  /* 评语 */
  const py = 1330;
  let verdict;
  if (stats.pct >= 90) verdict = `${pet.name}是全世界最幸福的崽 🧡`;
  else if (stats.pct >= 70) verdict = `${pet.name}这周过得不错，继续保持`;
  else if (stats.pct >= 40) verdict = `${pet.name}说：还可以更爱我一点`;
  else verdict = `${pet.name}有点委屈，下周好好补上 🥺`;
  g.fillStyle = '#E8582A'; g.font = '700 44px sans-serif';
  g.fillText(fitText(g, verdict, W - 120), W / 2, py);

  /* 底部品牌 */
  g.fillStyle = '#8A7A6B'; g.font = '600 30px sans-serif';
  g.fillText('宅咪打卡 · 别让毛孩子白等一天', W / 2, 1400);

  return cv.toDataURL('image/jpeg', 0.92);
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

async function showWeekly() {
  const url = await drawWeeklyCard();
  if (!url) return;
  document.getElementById('shareImg').src = url;
  document.getElementById('shareMask').classList.add('show');
}
function saveWeeklyImg() {
  const a = document.createElement('a');
  a.href = document.getElementById('shareImg').src;
  const pet = activePet();
  a.download = `宅咪周报_${pet ? pet.name : ''}_${todayKey()}.jpg`;
  a.click();
}

/* ---------- 导入导出 ---------- */
function openExport() {
  openModal(`
    <h3>导出数据</h3>
    <div class="field"><label>复制以下内容备份（含全部宠物与打卡记录）</label>
      <textarea id="ex_ta" rows="8" readonly>${esc(JSON.stringify(state))}</textarea>
    </div>
    <div class="modal-actions"><button class="btn-primary" id="ex_copy">复制</button><button class="btn-ghost" onclick="closeModal()">关闭</button></div>`);
  document.getElementById('ex_copy').onclick = () => {
    const ta = document.getElementById('ex_ta');
    ta.select();
    if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(() => {});
    document.execCommand('copy');
    document.getElementById('ex_copy').textContent = '已复制 ✓';
  };
}
function openImport() {
  openModal(`
    <h3>导入数据</h3>
    <div class="field"><label>粘贴之前导出的 JSON（会覆盖当前数据）</label>
      <textarea id="im_ta" rows="8" placeholder='{"pets":[...]}'></textarea>
    </div>
    <div class="modal-actions"><button class="btn-primary" id="im_go">导入</button><button class="btn-ghost" onclick="closeModal()">取消</button></div>`);
  document.getElementById('im_go').onclick = () => {
    try {
      const s = normalizeState(JSON.parse(document.getElementById('im_ta').value));
      if (!s) throw new Error('bad');
      state = s; save(); closeModal(); render();
    } catch (e) { alert('格式不对，导入失败'); }
  };
}

/* ---------- 演示模式 (?demo=1) ---------- */
function seedDemo() {
  const id = 'p_demo';
  const pet = { id, name: '糯米', type: 'cat', emoji: '🐱', photo: null, createdAt: addDays(todayKey(), -30) };
  state.pets.push(pet);
  state.activePetId = id;
  const log = petLog(id);
  /* 近7天: 演示数据, 前6天高完成, 昨天3项, 今天只喂了食 → 有内疚感 */
  const pattern = {
    6: ['feed', 'water', 'poop', 'play'],
    5: ['feed', 'water', 'poop'],
    4: ['feed', 'water', 'poop', 'play'],
    3: ['feed', 'water'],
    2: ['feed', 'water', 'poop', 'play'],
    1: ['feed', 'poop'],
    0: ['feed'],
  };
  Object.keys(pattern).forEach(off => {
    const k = addDays(todayKey(), -Number(off));
    log.daily[k] = {};
    pattern[off].forEach(t => { log.daily[k][t] = 1; });
  });
  log.periodic.deworm = addDays(todayKey(), -40);  // 超期10天
  log.periodic.vaccine = addDays(todayKey(), -300); // 还剩65天
  log.periodic.bath = addDays(todayKey(), -20);     // 超期6天
  log.weights = [
    { d: addDays(todayKey(), -21), kg: 4.2 },
    { d: addDays(todayKey(), -7), kg: 4.4 },
  ];
  save();
}

/* ---------- 启动 ---------- */
if (typeof document !== 'undefined') {
  if (typeof location !== 'undefined' && /[?&]demo=1/.test(location.search) && !state.pets.length) seedDemo();
  document.getElementById('btnAddPet').onclick = () => openPetModal();
  document.getElementById('btnEditPet').onclick = () => { const p = activePet(); if (p) openPetModal(p); };
  document.getElementById('btnWeekly').onclick = showWeekly;
  document.getElementById('btnCloseShare').onclick = () => document.getElementById('shareMask').classList.remove('show');
  document.getElementById('btnExport').onclick = openExport;
  document.getElementById('btnImport').onclick = openImport;
  document.getElementById('mask').addEventListener('click', e => { if (e.target.id === 'mask') closeModal(); });
  document.getElementById('btnSaveShare').onclick = saveWeeklyImg;
  render();
  /* PWA: 仅安全上下文可注册 (https / localhost), 局域网 http 打开时静默跳过 */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
/* Node 环境导出纯逻辑供测试 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    addDays, daysBetween, toggleDaily, isDailyDone, calcStreak,
    calcWeekStats, periodicStatus, markPeriodic, addWeight, weightTrend,
    feedGapDays, normalizeState, state,
  };
}
