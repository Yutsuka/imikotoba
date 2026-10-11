/* =========================================================
 * 忌み言葉 デバッグモード（imikotoba.html?debug で開いたときだけ読み込まれる）
 *
 *   imikotoba.html?debug            … 右上の「DBG」から場面を選んで飛ぶ（F2 / @ キーでも開閉）
 *   imikotoba.html?debug&jump=night … その場面からいきなり始める
 *
 * 場面（POINTS）の書き方
 *   id     : URL の jump= に書く名前
 *   group  : メニューの見出し
 *   label  : メニューに出す名前
 *   hint   : 飛んだあとに何をすればよいかのメモ（メニューに出る）
 *   map, at: 場所と [タイルx, タイルy, 向き(0上 1右 2下 3左)]
 *   flags  : 進行の目印（S.flags）    clues: 手がかり    rite: 名納めの手順（yu/mochi/na/kazu）
 *   known  : 意味がわかる山言葉        eaten: 数えられた言葉   possess: 憑かれ   presence: 気配
 *   goal   : 目的の文（config.js の goals のキー）
 *   run    : 飛んだ直後に起こす出来事（imikotoba.html の EV の名前）
 *
 * ルートを変えたときは、ここの flags や clues を直すだけでよい。
 * メニューの「今の状態をコピー」で、遊んでいる途中の状態をこの形式で書き出せる。
 * ========================================================= */
(() => {
  /* ---------- 進行の段階（下の場面で使い回す） ---------- */
  const YAMA = ['火', '灯り', '犬', '帰る', '水', '山'];            // 源造に教わる山言葉
  const ARRIVE = { fumi: true };                                     // 女将に会った
  const EVENING = { ...ARRIVE, learned: true };                      // 源造に話を聞いた（夕方）
  const MORNING = { ...EVENING, morning: true, charm: true };        // 十二日の朝（お守りに名前を書いた）
  const MOUNTAIN = { ...MORNING, mIntro: true };                     // 山に入った
  const BEFORE_CABIN = { ...MOUNTAIN, dogEv: true, waterEv: true, voiceEv: true };
  const OKU = { ...BEFORE_CABIN, cabin: true, okuIntro: true };      // 奥山に入った
  const AFTER_OKU = { ...OKU, forkEv: true, treeEv: true, key: true };
  const NIGHT = { ...AFTER_OKU, night: true };                       // 十二日の夜
  const FINAL = { ...NIGHT, akiyaEntered: true, blank: true };       // 契約を読んだ
  const RITE_ALL = { yu: true, mochi: true, na: true, kazu: true };
  const CLUES_OKU = ['crown', 'grimoire', 'yado', 'mura', 'note', 'bark', 'prints', 'stone', 'grave'];
  const CLUES_FINAL = [...CLUES_OKU, 'contract', 'shidai', 'sold'];

  const POINTS = [
    // ---- 章の始め ----
    { id: 'arrive', group: '章の始め', label: '十一日：猿啼に着いた', map: 'village', at: [25, 14, 0], goal: 'fumi' },
    { id: 'genzo', group: '章の始め', label: '十一日：女将に会ったあと（源造へ）', map: 'village', at: [8, 8, 0], flags: ARRIVE, goal: 'genzo' },
    { id: 'evening', group: '章の始め', label: '十一日 夕：源造に話を聞いたあと', map: 'village', at: [9, 12, 1], flags: EVENING, known: YAMA, goal: 'inn',
      hint: '祠・ユキ・トメと作治・宿帳を調べられる。民宿の女将に話すと夜〜朝へ' },
    { id: 'morning', group: '章の始め', label: '十二日 朝：山へ向かう前', map: 'village', at: [25, 13, 2], flags: MORNING, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声'], clues: ['crown', 'grimoire', 'yado', 'mura'], goal: 'mountain' },
    { id: 'mountain', group: '章の始め', label: '十二日：山道に入った直後', map: 'mountain', at: [12, 37, 0], flags: MOUNTAIN, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声'], clues: ['crown', 'grimoire', 'yado', 'mura'], goal: 'cabin', hint: '北へ進むと犬・沢・先生の声の出来事' },
    { id: 'cabin', group: '章の始め', label: '十二日：先生の山小屋の前', map: 'mountain', at: [10, 8, 0], flags: BEFORE_CABIN, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声'], clues: ['crown', 'grimoire', 'yado', 'mura'], goal: 'cabin', hint: '上へ進むと小屋に入る' },
    { id: 'okuMovie', group: '章の始め', label: '十二日：奥山に入るムービー', map: 'oku', at: [14, 27, 0], flags: { ...OKU, okuIntro: true }, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声'], clues: ['crown', 'grimoire', 'yado', 'mura', 'note'], run: 'okuIntro', hint: '十二様が横切るのを、木の陰でやり過ごす' },
    { id: 'oku', group: '章の始め', label: '十二日：奥山の入口', map: 'oku', at: [14, 27, 0], flags: OKU, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声'], clues: ['crown', 'grimoire', 'yado', 'mura', 'note'], goal: 'altar', hint: '十二様が歩いている。石碑・墓・声のする木' },
    { id: 'night', group: '章の始め', label: '十二日 夜：里に戻った', map: 'village', at: [14, 3, 2], flags: NIGHT, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声'], clues: CLUES_OKU, goal: 'night', hint: '民宿の講・源造の家・ユキ・惣代屋敷（鍵あり）' },
    { id: 'akiya', group: '章の始め', label: '十二日 夜：惣代屋敷の戸の前', map: 'village', at: [21, 7, 0], flags: NIGHT, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声', '雪'], clues: CLUES_OKU, goal: 'night', hint: '上へ進んで屋敷に入り、奥の文書を調べる' },
    { id: 'final', group: '章の始め', label: '十二日 夜：岩座へ（契約を読んだあと）', map: 'oku', at: [14, 12, 0], flags: FINAL, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声', '雪'], clues: CLUES_FINAL, goal: 'final', hint: '注連縄が解かれている。北の岩座へ' },

    // ---- エンディング直前（岩座の選択肢が出た状態で始まる） ----
    { id: 'endT', group: 'エンディング直前', label: 'T 名納め', map: 'oku', at: [14, 4, 0], flags: FINAL, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声', '雪'], clues: CLUES_FINAL, goal: 'final', run: 'altar', hint: '「白紙の名の紙に『猿啼』と書いて…」を選ぶ' },
    { id: 'endA', group: 'エンディング直前', label: 'A 十二様（手順を全部踏んだ）', map: 'oku', at: [14, 4, 0], flags: FINAL, rite: RITE_ALL,
      known: [...YAMA, '名前', '声', '雪'], clues: CLUES_FINAL, goal: 'final', run: 'altar', hint: '「お守りの札を岩座に置く」を選ぶ' },
    { id: 'endC', group: 'エンディング直前', label: 'C 顔替わり', map: 'oku', at: [14, 4, 0], flags: FINAL, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声', '雪'], clues: CLUES_FINAL, goal: 'final', run: 'altar', hint: '「『小夜』と呼ぶ」を選ぶ' },
    { id: 'endB', group: 'エンディング直前', label: 'B 帰還', map: 'oku', at: [14, 4, 0], flags: FINAL, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声', '雪'], clues: CLUES_FINAL, goal: 'final', run: 'altar', hint: '「……れぢる」とつぶやく を選ぶ' },
    { id: 'endE', group: 'エンディング直前', label: 'E 受肉（憑かれ 83）', map: 'oku', at: [14, 4, 0], flags: FINAL, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声', '雪', '血', '死ぬ', '私'], possess: 83, clues: CLUES_FINAL, goal: 'final', run: 'altar', hint: '「……えご」とつぶやく を選ぶ' },
    { id: 'endD', group: 'エンディング直前', label: 'D 数え木（あと一つで数えられる）', map: 'oku', at: [14, 4, 0], flags: FINAL, rite: { yu: true, mochi: true, na: true },
      known: [...YAMA, '名前', '声', '雪'], eaten: ['水', '灯り', '火'], clues: CLUES_FINAL, goal: 'final', run: 'altar', hint: '「『透だ』と名乗る」を選ぶ' },
    { id: 'endL', group: 'エンディング直前', label: 'L 尋ね人（先生の声の手前）', map: 'mountain', at: [15, 22, 0], flags: { ...MOUNTAIN, dogEv: true, waterEv: true },
      known: [...YAMA, '名前', '声'], goal: 'cabin', hint: '一歩北へ。「先生！ どこですか！」を選ぶ' },
    { id: 'endK', group: 'エンディング直前', label: 'K 伐り木（小屋の机の前）', map: 'cabinIn', at: [1, 2, 0], flags: BEFORE_CABIN,
      known: [...YAMA, '名前', '声'], goal: 'cabin', run: 'cabin', hint: '火の選択肢で「黙って、小屋の外の木を切って燃やす」を選ぶ' },
  ];
  window.DEBUG_POINTS = POINTS;

  const g = window.__game;
  if (!g) return;

  /* ---------- メニュー ---------- */
  const css = document.createElement('style');
  css.textContent = `
#dbgBtn{position:fixed;top:6px;right:6px;z-index:50;font:12px/1 monospace;padding:6px 8px;background:#3a1010;color:#fdd;border:1px solid #a3282a;border-radius:4px;cursor:pointer}
#dbg{position:fixed;top:36px;right:6px;z-index:50;width:min(360px,calc(100vw - 12px));max-height:calc(100vh - 48px);overflow:auto;background:rgba(10,12,18,.96);color:#d9dee8;border:1px solid #a3282a;border-radius:6px;padding:8px 10px;font:12px/1.5 system-ui,sans-serif}
#dbg[hidden]{display:none}
#dbg h3{margin:10px 0 4px;font-size:12px;color:#e8b04a}
#dbg h3:first-child{margin-top:0}
#dbg button{display:block;width:100%;text-align:left;margin:2px 0;padding:5px 8px;background:#161a24;color:#d9dee8;border:1px solid #333a4a;border-radius:4px;font:inherit;cursor:pointer}
#dbg button:hover{border-color:#e8b04a}
#dbg button small{color:#8a93a6;margin-left:6px}
#dbg .row{display:flex;gap:4px;flex-wrap:wrap}#dbg .row button{width:auto;flex:1 1 auto}
#dbg .st{font-family:monospace;font-size:11px;color:#8a93a6;white-space:pre-wrap;word-break:break-all}
#dbg .hint{color:#e8b04a;margin:4px 0}
#dbgToast{position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:50;max-width:calc(100vw - 100px);padding:6px 12px;background:rgba(58,16,16,.92);color:#fde;border:1px solid #a3282a;border-radius:4px;font:12px/1.5 system-ui,sans-serif;pointer-events:none;transition:opacity .4s}
#dbg textarea{width:100%;height:120px;font:11px monospace;background:#0b0d12;color:#d9dee8;border:1px solid #333a4a}`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.id = 'dbgBtn'; btn.type = 'button'; btn.textContent = 'DBG';
  const box = document.createElement('div');
  box.id = 'dbg'; box.hidden = true;
  const toast = document.createElement('div');
  toast.id = 'dbgToast'; toast.style.opacity = 0;
  document.body.append(btn, box, toast);
  let toastT = 0;
  const showToast = t => { toast.textContent = t; toast.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { toast.style.opacity = 0; }, 7000); };

  const tile = v => Math.round((v - 8) / 16 * 2) / 2;
  const S = () => g.S;
  let lastHint = '';

  function stateText() {
    const s = S();
    const f = Object.keys(s.flags).filter(k => s.flags[k]).join(' ');
    const c = Object.keys(s.clues).filter(k => s.clues[k]).join(' ');
    const r = Object.keys(s.rite).filter(k => s.rite[k]).join(' ');
    return `場所 ${s.map} (${tile(s.x)}, ${tile(s.y - 4)})\n目印 ${f || '-'}\n手がかり ${c || '-'}\n手順 ${r || '-'}\n数えられた ${s.eaten.join(' ') || '-'}　憑かれ ${s.possess}　気配 ${Math.round(s.presence)}`;
  }
  // 今の状態を、POINTS に貼れる形で書き出す
  function snapshot() {
    const s = S(), on = o => Object.keys(o).filter(k => o[k]);
    const cp = {
      id: 'new', group: '自分で追加', label: '（名前をつける）', map: s.map, at: [tile(s.x), tile(s.y - 4), s.dir],
      flags: Object.fromEntries(on(s.flags).map(k => [k, true])), clues: on(s.clues),
      rite: Object.fromEntries(on(s.rite).map(k => [k, true])), known: Object.keys(s.known).filter(k => s.known[k] === true),
    };
    if (s.eaten.length) cp.eaten = [...s.eaten];
    if (s.possess) cp.possess = s.possess;
    if (s.presence) cp.presence = Math.round(s.presence);
    return JSON.stringify(cp).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ') + ',';
  }

  function render() {
    const groups = [...new Set(POINTS.map(p => p.group))];
    box.innerHTML = '';
    const add = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; box.appendChild(e); return e; };
    if (lastHint) add('div', '▶ ' + lastHint, 'hint');
    for (const gr of groups) {
      add('h3', gr);
      for (const p of POINTS.filter(q => q.group === gr)) {
        const b = add('button');
        b.textContent = p.label;
        const sm = document.createElement('small'); sm.textContent = p.id; b.appendChild(sm);
        b.title = p.hint || '';
        b.addEventListener('click', e => { e.stopPropagation(); go(p); });
      }
    }
    add('h3', 'その場で変える');
    const row = add('div', null, 'row');
    const tool = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', e => { e.stopPropagation(); fn(); g.updateHUD(); render(); }); row.appendChild(b); };
    tool('気配 0', () => { S().presence = 0; S().detect = 0; });
    tool('憑かれ +17', () => { S().possess = Math.min(99, S().possess + 17); });
    tool('憑かれ 0', () => { S().possess = 0; });
    tool('数えられた言葉を消す', () => { S().eaten = []; });
    tool('手がかりを全部', () => { for (const c of CLUES_FINAL) S().clues[c] = true; });
    tool('動けないとき', () => g.unstick());
    add('h3', '今の状態');
    add('div', stateText(), 'st');
    const cp = add('button', '今の状態をコピー（debug.js の POINTS に貼れる形）');
    cp.addEventListener('click', async e => {
      e.stopPropagation();
      const t = snapshot();
      try { await navigator.clipboard.writeText(t); cp.textContent = 'コピーしました'; }
      catch (_) { const ta = add('textarea'); ta.value = t; ta.select(); }
    });
  }

  function go(p) {
    lastHint = p.hint ? `${p.label}：${p.hint}` : '';
    g.jump(p);
    box.hidden = true;
    showToast(lastHint || p.label);
  }

  const toggle = () => { box.hidden = !box.hidden; if (!box.hidden) render(); };
  btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  for (const t of ['pointerdown', 'click']) box.addEventListener(t, e => e.stopPropagation());
  addEventListener('keydown', e => { if (e.code === 'F2' || e.key === '@') { e.preventDefault(); toggle(); } });
  // 開いている間は、状態の表示を更新しつづける
  setInterval(() => { const st = box.querySelector('.st'); if (!box.hidden && st) st.textContent = stateText(); }, 500);

  /* ---------- URL の jump= ---------- */
  const id = new URLSearchParams(location.search).get('jump');
  if (id) {
    const p = POINTS.find(q => q.id === id);
    if (p) go(p); else console.warn('[debug] jump= の場面が見つからない:', id, POINTS.map(q => q.id));
  }
})();
