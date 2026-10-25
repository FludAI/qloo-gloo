
const L0 = {
  word: { title: 'Cholecystokinin (CCK)', say: 'koh-lih-sis-tuh-KY-nin', summary: 'The word already contains its meaning: chole (bile) + cyst (sac) + kin (movement) — the hormone that makes the bile sac move.' },
  pieces: [
    { part: 'chole', sounds: 'cola', meaning: 'bile', question: 'Say your favorite cola.', opts: ['Coca-Cola', 'Pepsi-Cola', 'RC Cola', 'Inca Kola'] },
    { part: 'cysto', sounds: 'sister', meaning: 'bladder or sac', question: 'Say your favorite Sister.', opts: ['Sister Act', 'Twisted Sister', 'Sister Sledge', 'Sisters (2015)'] },
    { part: 'kin', sounds: '', meaning: 'movement', question: 'Say the one you picture moving.', opts: ['Formula 1', 'Fast & Furious', 'Tour de France', 'Tesla'] },
    { part: '-in', sounds: '-in', meaning: 'the substance ending', question: 'Say the one that ends in “-in”.', opts: ['Aspirin', 'Aladdin', 'Tintin', 'Penguin'] },
  ],
  practice: [
    { question: 'What does the word part chole mean?', hint: 'Cola ≈ chole.', answer: 'Bile.' },
    { question: 'Which word part means bladder or sac?', hint: 'Sister ≈ ?', answer: 'Cyst or cysto.' },
    { question: 'In cholecystokinin, what does kin mean?', hint: 'Kinetic.', answer: 'Movement.' },
    { question: 'What does CCK do?', hint: 'Bile sac + movement.', answer: 'It squeezes the gallbladder.' },
    { question: 'Cystitis: “-itis” means inflammation. What is inflamed?', hint: 'You already know cyst.', answer: 'The bladder.' },
    { question: 'Cholecystectomy: “-ectomy” means surgical removal. What is removed?', hint: 'Chole + cyst together.', answer: 'The gallbladder.' },
  ],
};
const TASTE0 = [
  { k: 'gaming', w: 0.82, src: 'Xbox' }, { k: 'animation', w: 0.74, src: 'Pixar' }, { k: 'motorsport', w: 0.7, src: 'F1' },
  { k: 'short', w: 0.6, src: 'edits' }, { k: 'sound', w: 0.55, src: 'edits' }, { k: 'anime', w: 0.55, src: 'Ghibli' },
  { k: '90s', w: 0.5, src: 'Nirvana' }, { k: 'film', w: 0.45, src: 'A24' }, { k: 'plain', w: 0.45, src: 'edits' },
  { k: 'music', w: 0.4, src: 'Daft Punk' }, { k: 'soda', w: 0.3, src: 'Coke' }, { k: '80s', w: 0.25, src: 'Top Gun' }, { k: 'food', w: 0.2, src: 'tacos' },
];
const PROPS0 = {
  '3:sounds': [{ t: 'Kinect', src: 'Xbox', tags: ['gaming'] }, { t: 'kinetic', src: 'plain', tags: ['plain', 'short'] }, { t: 'Kingdom Hearts', src: 'Square Enix', tags: ['gaming', 'anime'] }],
  '1:opt3': [{ t: 'Jolt Cola', src: '90s gaming', tags: ['gaming', '90s'] }, { t: 'Cherry Coke', src: 'Coke', tags: ['soda'] }, { t: 'Mexican Coke', src: 'tacos', tags: ['food'] }],
  '0:summary': [{ t: 'Bile. Sac. Move.', src: 'shorter', tags: ['short'] }, { t: 'Cola, sister, kinetic.', src: 'sound first', tags: ['sound', 'short'] }, { t: 'It moves the bile sac.', src: 'plain', tags: ['plain'] }],
  '3:opt1': [{ t: 'Cars', src: 'Pixar', tags: ['animation'] }, { t: 'Mario Kart', src: 'Nintendo', tags: ['gaming'] }, { t: 'Speed Racer', src: 'anime', tags: ['anime', '90s'] }],
  '6:hint': [{ t: 'Sister Act', src: 'film', tags: ['film', 'short'] }, { t: 'Sister ≈ cyst', src: 'sound first', tags: ['sound'] }, { t: 'Sac.', src: 'shorter', tags: ['short'] }],
  '2:question': [{ t: 'Name a sister.', src: 'shorter', tags: ['short'] }, { t: 'Sister?', src: 'shorter', tags: ['short', 'sound'] }, { t: 'Which Sister song?', src: 'Twisted Sister', tags: ['music', '80s'] }],
};
const QUEUE = ['3:sounds', '1:opt3', '0:summary', '3:opt1', '6:hint', '2:question'];
const LABEL = { title: 'title', say: 'say', summary: 'summary', part: 'part', sounds: 'sounds like', meaning: 'means', question: 'ask', hint: 'hint', answer: 'answer' };
const COLW = 420, PAPER = '#f6f1e7', HOT = '#d9822b', PINKT = '#FFB8EC';
const PH = { w: 402, h: 560, cx: 201, cy: 210 }, GL = { w: 440, h: 440, cx: 220, cy: 180 };
const GRID = { cols: 3, rowH: 500 }; const MAPW = GRID.cols * COLW - 60, MAPH = 4 * GRID.rowH - 40;
const gridOrigin = (col, map) => (map ? { x: (col % GRID.cols) * COLW, y: Math.floor(col / GRID.cols) * GRID.rowH } : { x: col * COLW, y: 0 });

class Component extends DCLogic {
  state = { L: JSON.parse(JSON.stringify(L0)), props: JSON.parse(JSON.stringify(PROPS0)), taste: TASTE0.map((t) => ({ ...t })), q: 0, focus: null, pi: 0, map: true, cam: null, camDur: '0ms', camEase: 'linear', listening: false, heard: '', typing: false, draft: '', toast: '', undo: [], loading: false, done: {} };
  inputRef = React.createRef();

  componentDidMount() {
    this.layout = this.buildLayout();
    this.setState({ cam: { mode: 'map' } });
    this.t0 = setTimeout(() => this.flyTo(QUEUE[0], true), 1300);
  }
  componentWillUnmount() { clearTimeout(this.t0); clearTimeout(this.t1); clearTimeout(this.tt); }

  get(key, L = this.state.L) {
    const [c, f] = key.split(':'), i = +c;
    const o = i === 0 ? L.word : i <= 4 ? L.pieces[i - 1] : L.practice[i - 5];
    return f.startsWith('opt') ? o.opts[+f.slice(3)] : o[f] ?? '';
  }
  setVal(key, v) {
    const L = JSON.parse(JSON.stringify(this.state.L)); const [c, f] = key.split(':'), i = +c;
    const o = i === 0 ? L.word : i <= 4 ? L.pieces[i - 1] : L.practice[i - 5];
    if (f.startsWith('opt')) o.opts[+f.slice(3)] = v; else o[f] = v;
    return L;
  }
  buildLayout() {
    const N = [];
    const add = (key, x, y, w, fs, o = {}) => N.push({ key, x, y, w, fs, h: o.h || 0, tile: !!o.tile, hot: !!o.hot, mono: !!o.mono, cy: o.cy ?? fs * 0.7, pre: o.pre || '' });
    add('0:title', 0, 0, 360, 34); add('0:say', 0, 74, 360, 20, { hot: true }); add('0:summary', 0, 138, 360, 20, { cy: 40 });
    for (let p = 1; p <= 4; p++) {
      const x = p * COLW;
      add(`${p}:part`, x, -4, 360, 54); add(`${p}:sounds`, x, 106, 360, 28, { hot: true, pre: '≈ ' }); add(`${p}:meaning`, x, 170, 360, 20);
      add(`${p}:question`, x, 228, 360, 17);
      for (let k = 0; k < 4; k++) add(`${p}:opt${k}`, x + (k % 2) * 186, 280 + Math.floor(k / 2) * 92, 174, 16, { tile: true, h: 80, cy: 40 });
    }
    for (let q = 5; q <= 10; q++) {
      const x = q * COLW;
      add(`${q}:question`, x, 0, 360, 22, { cy: 26 }); add(`${q}:hint`, x, 112, 360, 19, { hot: true }); add(`${q}:answer`, x, 184, 360, 19);
    }
    return N;
  }
  nodeOf(key) { return (this.layout || []).find((n) => n.key === key); }
  camFor(vp, cam) {
    if (!cam) return 'translate(0px,0px) scale(1)';
    if (cam.mode === 'map') { const s = Math.min((vp.w - 28) / MAPW, (vp.h - 24) / MAPH); return `translate(${(vp.w - MAPW * s) / 2}px,${(vp.h - MAPH * s) / 2}px) scale(${s})`; }
    const s = cam.s * (vp === GL ? 1.04 : 1);
    return `translate(${vp.cx - cam.fx * s}px,${vp.cy - cam.fy * s}px) scale(${s})`;
  }
  ptOf(key) { const n = this.nodeOf(key); return n ? { fx: n.x + n.w / 2, fy: n.y + n.cy } : { fx: 0, fy: 0 }; }
  flyTo(key, fromMap) {
    clearTimeout(this.t1);
    const to = this.ptOf(key), from = this.state.cam && this.state.cam.mode === 'pt' ? this.state.cam : null;
    this.setState({ focus: key, pi: 0, map: false, typing: false });
    if (fromMap || !from) { this.setState({ cam: { mode: 'pt', ...to, s: 1 }, camDur: '1300ms', camEase: 'cubic-bezier(.65,0,.35,1)' }); return; }
    const far = Math.abs(from.fx - to.fx) > COLW * 0.6;
    if (!far) { this.setState({ cam: { mode: 'pt', ...to, s: 1 }, camDur: '650ms', camEase: 'cubic-bezier(.16,1,.3,1)' }); return; }
    this.setState({ cam: { mode: 'pt', fx: (from.fx + to.fx) / 2, fy: (from.fy + to.fy) / 2 + 40, s: 0.38 }, camDur: '520ms', camEase: 'cubic-bezier(.5,0,.75,0)' });
    this.t1 = setTimeout(() => this.setState({ cam: { mode: 'pt', ...to, s: 1 }, camDur: '760ms', camEase: 'cubic-bezier(.16,1,.3,1)' }), 520);
  }
  showMap() { clearTimeout(this.t1); this.setState({ map: true, focus: null, cam: { mode: 'map' }, camDur: '900ms', camEase: 'cubic-bezier(.65,0,.35,1)' }); }

  weight(k) { const t = this.state.taste.find((x) => x.k === k); return t ? t.w : 0.2; }
  sorted(key) {
    return (this.state.props[key] || []).map((p, n) => ({ ...p, n, sc: (p.mine ? 5 : 0) + p.tags.reduce((a, t) => a + this.weight(t), 0) / Math.max(1, p.tags.length) })).sort((a, b) => b.sc - a.sc || a.n - b.n);
  }
  current() { const k = this.state.focus; if (!k) return null; const s = this.sorted(k); return s.length ? s[this.state.pi % s.length] : null; }
  learn(tags, d) {
    this.setState((s) => {
      const taste = s.taste.map((t) => ({ ...t }));
      tags.forEach((k) => { let t = taste.find((x) => x.k === k); if (!t) { t = { k, w: 0.3, src: 'you' }; taste.push(t); } t.w = Math.max(0.05, Math.min(1, t.w + d)); });
      return { taste };
    });
  }
  flash(m, undo) { clearTimeout(this.tt); this.setState({ toast: m, toastUndo: !!undo }); this.tt = setTimeout(() => this.setState({ toast: '' }), 2800); }
  pulse(sel) {
    setTimeout(() => document.querySelectorAll(sel).forEach((el) => el.animate([{ transform: 'translateY(10px)', filter: 'blur(6px)', opacity: 0.2 }, { transform: 'none', filter: 'blur(0)', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' })), 20);
  }

  apply(key, v, tags) {
    const prev = this.get(key);
    this.setState((s) => ({ L: this.setVal(key, v), undo: [...s.undo, { key, prev }], done: { ...s.done, [key]: true }, heard: '' }));
    this.pulse(`[data-node="${key}"] > div:last-child`);
    if (tags && tags.length) { this.learn(tags, 0.12); this.flash('+ ' + tags.join(' + '), true); tags.forEach((t) => this.pulse(`[data-taste="${t}"]`)); }
    else this.flash('kept', true);
    this.t1 = setTimeout(() => this.advance(), 700);
  }
  keep() { const k = this.state.focus, c = this.current(); if (!k) return; if (c) this.apply(k, c.t, c.tags); else this.advance(); }
  next() {
    const c = this.current();
    if (c) { this.learn(c.tags, -0.04); this.setState((s) => ({ pi: s.pi + 1 })); this.pulse(`[data-node="${this.state.focus}"] > div:last-child`); }
    else this.advance();
  }
  advance() {
    const qi = QUEUE.findIndex((k, i) => i >= 0 && !this.state.done[k] && k !== this.state.focus);
    if (qi < 0) { this.showMap(); this.flash('all set'); return; }
    this.setState({ q: qi }); this.flyTo(QUEUE[qi]);
  }
  prevStep() { const qi = Math.max(0, QUEUE.indexOf(this.state.focus) - 1); this.flyTo(QUEUE[qi]); }
  undo() {
    const u = this.state.undo[this.state.undo.length - 1]; if (!u) return;
    clearTimeout(this.t1);
    this.setState((s) => { const d = { ...s.done }; delete d[u.key]; return { L: this.setVal(u.key, u.prev), undo: s.undo.slice(0, -1), done: d }; });
    this.flyTo(u.key); this.flash('undone');
  }

  async ask(key, instr) {
    if (!key || !window.claude || !window.claude.complete) { this.flash('no assistant here'); return; }
    this.setState({ loading: true });
    const top = [...this.state.taste].sort((a, b) => b.w - a.w).slice(0, 6).map((t) => `${t.k} (${t.src})`).join(', ');
    const prompt = `Edit one field of a spoken mnemonic lesson for "cholecystokinin" (chole≈cola=bile, cysto≈sister=sac, kin=movement, -in=substance). Field "${key.split(':')[1]}" currently: ${JSON.stringify(this.get(key))}. Editor taste (Qloo profile, strongest first): ${top}. Request: ${instr}. Keep every option as few characters as possible, easy to say aloud. Reply JSON only: {"options":[{"text":"...","tag":"one taste word","src":"1-2 word source"}]} with 3 options.`;
    try {
      const raw = await window.claude.complete(prompt);
      const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      const add = (j.options || []).filter((o) => o && o.text).map((o) => ({ t: String(o.text), src: String(o.src || 'asked'), tags: [String(o.tag || 'asked').toLowerCase()], mine: true }));
      this.setState((s) => ({ loading: false, pi: 0, props: { ...s.props, [key]: [...add, ...(s.props[key] || []).map((p) => ({ ...p, mine: false }))] } }));
      this.pulse(`[data-node="${key}"] > div:last-child`);
    } catch (e) { this.setState({ loading: false }); this.flash('try again'); }
  }
  command(raw) {
    const t = (raw || '').trim(); this.setState({ typing: false, draft: '', heard: '' }); if (!t) return;
    const low = t.toLowerCase().replace(/[.!?]+$/, '');
    if (/^(keep|yes|yep|good|that one)$/.test(low)) return this.keep();
    if (/^(next|another|no|nope|skip)$/.test(low)) return this.next();
    if (/^(back|previous)$/.test(low)) return this.prevStep();
    if (/^undo$/.test(low)) return this.undo();
    if (/^(map|zoom out|overview)$/.test(low)) return this.showMap();
    const k = this.state.focus || QUEUE[this.state.q];
    const instr = /^(make|try|use|swap|change|replace|give|write|something|more|less|shorter|longer|plainer|simpler|add|remove|lead|again)\b/.test(low) || t.split(/\s+/).length > 5;
    if (instr) { if (!this.state.focus) this.flyTo(k); return this.ask(k, t); }
    if (!this.state.focus) this.flyTo(k);
    this.apply(k, t, ['own words']);
  }
  micDown() {
    if (this.state.listening) return;
    this.setState({ listening: true, heard: '', typing: false });
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; this.rec = null;
    if (SR) try { const r = new SR(); r.lang = 'en-US'; r.interimResults = true; r.continuous = true; r.onresult = (e) => { let s = ''; for (const x of e.results) s += x[0].transcript; this.setState({ heard: s }); }; r.onerror = () => {}; r.start(); this.rec = r; } catch (e) { this.rec = null; }
  }
  micUp() {
    if (!this.state.listening) return;
    const r = this.rec; this.rec = null; if (r) try { r.stop(); } catch (e) {}
    setTimeout(() => { const t = (this.state.heard || '').trim(); this.setState({ listening: false }); if (t) this.command(t); else { this.setState({ typing: true }); setTimeout(() => this.inputRef.current && this.inputRef.current.focus(), 30); } }, r ? 450 : 0);
  }

  renderVals() {
    const S = this.state, lay = this.layout || this.buildLayout(); this.layout = lay;
    const fk = S.focus, fcol = fk ? +fk.split(':')[0] : -1, cur = this.current();
    const mk = (glass) => lay.map((n) => {
      const col = +n.key.split(':')[0], f = n.key === fk, f2 = n.key.split(':')[1];
      let text = this.get(n.key), color = n.hot ? HOT : PAPER;
      if (f && S.listening && S.heard) { text = S.heard; color = '#ffffff'; }
      else if (f && cur) { text = cur.t; color = PINKT; }
      const empty = !text;
      const op = S.map ? (QUEUE.includes(n.key) && !S.done[n.key] ? 1 : 0.55) : f ? 1 : col === fcol ? (glass ? 0.14 : 0.3) : (glass ? 0.05 : 0.12);
      const og = gridOrigin(col, S.map);
      return {
        key: n.key, x: og.x + n.x - col * COLW, y: og.y + n.y, w: n.w, h: n.h, fs: n.fs, text: (n.pre || '') + (empty ? '?' : text),
        font: n.fs >= 22 ? 'var(--font-display)' : 'var(--font-sans)', color: empty ? HOT : color,
        pad: n.tile ? '0 10px' : '4px 0', border: n.tile ? `2px solid ${f ? '#FF4FCB' : 'rgba(246,241,231,.55)'}` : 'none',
        align: 'center', justify: n.tile ? 'center' : 'flex-start', talign: n.tile ? 'center' : 'left', op, blur: !S.map && !f && col !== fcol ? 'blur(1.5px)' : 'none',
        label: LABEL[f2] || (f2.startsWith('opt') ? 'pick ' + (+f2.slice(3) + 1) : f2), labelOp: f && !S.map ? 1 : 0, labelX: n.tile ? '10px' : '0', labelY: n.tile ? '8px' : '-22px', labelFs: n.tile ? 9 : 11,
        tap: () => { if (this.swiped) return; S.map || !f ? this.flyTo(n.key, S.map) : this.keep(); },
      };
    });
    const ribbon = [...S.taste].sort((a, b) => b.w - a.w).slice(0, 5).map((t) => ({ k: t.k, label: t.k, op: (0.35 + t.w * 0.65).toFixed(2) }));
    const qDone = QUEUE.filter((k) => S.done[k]).length;
    const wave = React.createElement('div', { style: { display: 'flex', gap: 3, alignItems: 'center', height: 28 } }, [0, 1, 2, 3, 4].map((n) => React.createElement('span', { key: n, style: { width: 4, height: 28, borderRadius: 2, background: '#fff', animation: `glooWave ${0.6 + n * 0.09}s ease-in-out ${n * 0.07}s infinite` } })));
    const mic = React.createElement('svg', { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('rect', { x: 9, y: 2, width: 6, height: 12, rx: 3 }), React.createElement('path', { d: 'M5 10a7 7 0 0 0 14 0M12 17v4' }));
    const prevText = fk ? this.get(fk) : '';
    return {
      ribbon,
      tasteBars: [...S.taste].sort((a, b) => b.w - a.w).slice(0, 9).map((t) => ({ label: t.k, src: t.src, pct: Math.round(t.w * 100) + '%', color: ['short', 'sound', 'plain', 'own words'].includes(t.k) ? '#FF8FDC' : '#d9822b' })),
      nodes: mk(false), nodesG: mk(true),
      camPhone: this.camFor(PH, S.cam), camGlass: this.camFor(GL, S.cam), camDur: S.camDur, camEase: S.camEase,
      railOp: S.map ? 0 : 0.35,
      whisper: S.loading ? 'writing…' : S.listening ? 'listening' : S.map ? (qDone === QUEUE.length ? 'all set · tap anything' : `${QUEUE.length - qDone} to look at`) : cur ? (prevText ? `was ${prevText}` : 'was empty') : 'say it',
      srcChip: !S.map && cur && !S.listening && !S.loading ? cur.src : '',
      dots: QUEUE.map((k) => ({ w: k === fk ? 22 : 6, bg: S.done[k] ? '#d9822b' : k === fk ? '#f6f1e7' : 'rgba(246,241,231,.3)' })),
      toggleMap: () => (S.map ? this.advance() : this.showMap()),
      skip: () => this.next(), skipLabel: 'next',
      keep: () => this.keep(), keepBg: cur ? PAPER : 'rgba(246,241,231,.12)', keepColor: cur ? '#000' : PAPER,
      micDown: () => this.micDown(), micUp: () => this.micUp(),
      micBg: S.listening ? '#FF4FCB' : 'linear-gradient(135deg,#FF4FCB,#9B4DF0 55%,#6C3BFF)', micGlyph: S.listening ? wave : mic,
      typing: S.typing, draft: S.draft, inputRef: this.inputRef,
      onDraft: (e) => this.setState({ draft: e.target.value }),
      onDraftKey: (e) => { e.stopPropagation(); if (e.key === 'Enter') this.command(S.draft); if (e.key === 'Escape') this.setState({ typing: false }); },
      closeTyping: () => this.setState({ typing: false, draft: '' }),
      toast: S.toast, canUndo: S.toastUndo && S.undo.length > 0, undo: () => this.undo(),
      glHints: S.listening ? [S.heard || 'listening…'] : S.map ? ['look', 'say map', ''] : ['nod keep', 'swipe next', 'say it'],
      swipeStart: (e) => { this.sx = e.clientX; this.sy = e.clientY; },
      swipeEnd: (e) => { const dx = e.clientX - (this.sx ?? e.clientX), dy = e.clientY - (this.sy ?? e.clientY); if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) { this.swiped = true; setTimeout(() => (this.swiped = false), 0); dx < 0 ? this.next() : this.prevStep(); } else if (dy > 70 && Math.abs(dy) > Math.abs(dx)) { this.swiped = true; setTimeout(() => (this.swiped = false), 0); this.showMap(); } },
      onKey: (e) => {
        if (S.typing) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); this.prevStep(); }
        else if (e.key === 'Enter') this.keep();
        else if (e.key === 'Escape' || e.key === 'm') this.showMap();
        else if (e.key.length === 1 && /[a-z]/i.test(e.key)) { this.setState({ typing: true, draft: e.key }); setTimeout(() => this.inputRef.current && this.inputRef.current.focus(), 20); e.preventDefault(); }
      },
    };
  }
}
