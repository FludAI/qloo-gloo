/* Gloo motion studies — SVG/DOM + Web Animations, 600×600 design size, light on black.
   <gloo-stage moment="scan|stick|pick|together|practice|progress" target="phone|glasses" variant="…" size="480">
   <gloo-part kind="rail|meter" state="empty|filling|filled-hot|filled-cool|resting">
   window.GlooMotion: { cut, sound, replayAll(), play(sid), setCut(bool), setSound(bool), sfx(name) } */
(() => {
  if (window.customElements.get('gloo-stage')) return;
  const C = { paper: '#f6f1e7', ink: '#1d1a16', gloo: '#d9822b', sea: '#2f6f73', seaLit: '#7cc3c5', white: '#ffffff' };
  const EASE = 'cubic-bezier(.16,1,.3,1)', SNAP = 'cubic-bezier(.3,1.5,.5,1)', DROP = 'cubic-bezier(.55,0,.85,.35)';
  const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const MONO = 'ui-monospace,Menlo,Consolas,monospace';
  const G = (window.GlooMotion = window.GlooMotion || {});
  G.cut = G.cut ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  G.sound = G.sound ?? false;
  G.stages = new Set();
  G.replayAll = () => G.stages.forEach((s) => s.play());
  G.play = (id) => G.stages.forEach((s) => { if (s.get('sid') === id) s.play(); });
  G.setCut = (v) => { G.cut = !!v; G.replayAll(); };
  G.setSound = (v) => { G.sound = !!v; if (v) ctx(); else if (window.speechSynthesis) speechSynthesis.cancel(); };

  /* ---------- sound kit: mono, each < 400 ms ---------- */
  let ac;
  function ctx() { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; }
  function tone(f0, f1, dur, type = 'sine', gain = 0.18, t0 = 0) {
    const a = ctx(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  const SFX = {
    tick: () => tone(2400, 1900, 0.035, 'square', 0.05),
    lock: () => { tone(150, 55, 0.1, 'sine', 0.4); tone(660, 990, 0.13, 'triangle', 0.13, 0.025); },
    chime: () => { tone(880, 0, 0.38, 'sine', 0.16); tone(1320, 0, 0.34, 'sine', 0.09, 0.05); },
    miss: () => { tone(210, 150, 0.12, 'triangle', 0.22); tone(210, 150, 0.12, 'triangle', 0.22, 0.15); },
    lift: () => tone(420, 1260, 0.34, 'sine', 0.14),
  };
  G.SFX_NAMES = Object.keys(SFX);
  G.sfx = (n, force) => { if (!(G.sound || force)) return; try { SFX[n](); } catch (e) {} };
  G.say = (t) => {
    if (!G.sound || !window.speechSynthesis) return;
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = 1.02; speechSynthesis.speak(u);
  };

  /* ---------- helpers ---------- */
  const el = (p, css, txt, tag) => { const e = document.createElement(tag || 'div'); e.style.cssText = 'position:absolute;box-sizing:border-box;' + (css || ''); if (txt != null) e.textContent = txt; p.appendChild(e); return e; };
  const flow = (p, css, txt) => { const e = document.createElement('span'); e.style.cssText = css || ''; if (txt != null) e.textContent = txt; p.appendChild(e); return e; };
  function bg(st, k) {
    if (k.gl) return;
    el(st, 'inset:0;background:radial-gradient(120% 90% at 50% 40%,#26231f 0%,#0b0a09 70%)');
  }
  // Word as a centered row of piece spans; returns centers measured from layout.
  function word(st, pieces, { y, size = 56, color = C.paper, font = SANS, weight = 600 }) {
    const box = el(st, `left:0;width:600px;top:${y}px;display:flex;justify-content:center;font:${weight} ${size}px/1 ${font};color:${color};letter-spacing:-0.01em;white-space:nowrap`);
    const spans = pieces.map((p) => flow(box, 'display:inline-block', p));
    const cs = spans.map((s) => s.offsetLeft + s.offsetWidth / 2);
    const ls = spans.map((s) => s.offsetLeft);
    const rs = spans.map((s) => s.offsetLeft + s.offsetWidth);
    return { box, spans, cs, ls, rs, h: box.offsetHeight };
  }
  function meter(p, { x, y, n = 0, w = 24, h = 60, gap = 14, hot = true, outline = 'rgba(246,241,231,.55)' }) {
    const ticks = [];
    for (let i = 0; i < 5; i++) {
      const left = x - (5 * w + 4 * gap) / 2 + i * (w + gap);
      const o = el(p, `left:${left}px;top:${y}px;width:${w}px;height:${h}px;border:2px solid ${outline};border-radius:${Math.round(w / 3.5)}px`);
      const f = el(o, `inset:2px;border-radius:${Math.round(w / 5)}px;background:${hot ? C.gloo : C.seaLit};transform-origin:50% 100%;opacity:${i < n ? 1 : 0}`);
      ticks.push({ o, f });
    }
    return ticks;
  }
  const BRK = (p, x, y, w, h, color, th = 3, len = 26) => {
    const wrap = el(p, `left:${x}px;top:${y}px;width:${w}px;height:${h}px`);
    const c = (css) => el(wrap, `width:${len}px;height:${len}px;border:${th}px solid ${color};` + css);
    c('top:-2px;left:-2px;border-right:0;border-bottom:0;border-top-left-radius:14px');
    c('top:-2px;right:-2px;border-left:0;border-bottom:0;border-top-right-radius:14px');
    c('bottom:-2px;left:-2px;border-right:0;border-top:0;border-bottom-left-radius:14px');
    c('bottom:-2px;right:-2px;border-left:0;border-top:0;border-bottom-right-radius:14px');
    return wrap;
  };
  function listen(st, k, x, y, until) {
    const dot = el(st, `left:${x - 9}px;top:${y - 9}px;width:18px;height:18px;border-radius:50%;background:${C.gloo}`);
    const ring = el(st, `left:${x - 9}px;top:${y - 9}px;width:18px;height:18px;border-radius:50%;border:2px solid ${C.gloo};opacity:0`);
    const its = Math.max(1, Math.floor(until / 1000));
    k.A(ring, [{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(3.2)', opacity: 0 }], 1000, 0, 'ease-out', { it: its });
    k.A(dot, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.4)' }], 160, until);
  }

  const LESSON = [
    { p: 'chole', s: 'cola', m: 'bile', pick: 'Coca-Cola' },
    { p: 'cysto', s: 'sister', m: 'sac', pick: 'Sister Act' },
    { p: 'kin', s: 'kinetic', m: 'movement', pick: 'Kinect' },
    { p: 'in', s: 'in', m: 'substance', pick: 'Inception' },
  ];
  const PIECES = LESSON.map((l) => l.p);

  /* ---------- the moments ---------- */
  const M = {};

  // 1. Scan. Phone = A (sweep with ticks). Glasses = C (pulse count).
  M.scan = (st, k) => {
    bg(st, k);
    if (!k.gl) {
      el(st, 'left:56px;top:178px;width:488px;height:212px;background:#e8e0cf;border-radius:6px;transform:rotate(-1.2deg)');
      const w = word(st, PIECES, { y: 244, size: 50, color: C.ink, font: 'Georgia,"Times New Roman",serif', weight: 400 });
      const rx = 78, rw = 444;
      const ret = BRK(st, rx, 200, rw, 156, C.paper);
      const line = el(st, `left:${rx}px;top:196px;width:3px;height:164px;background:${C.gloo};box-shadow:0 0 14px 2px ${C.gloo};opacity:0`);
      const t0 = 160, sweep = 620;
      k.A(line, [{ opacity: 0, transform: 'translateX(0)' }, { opacity: 1, transform: 'translateX(8px)', offset: 0.06 }, { opacity: 1, transform: `translateX(${rw - 8}px)`, offset: 0.94 }, { opacity: 0, transform: `translateX(${rw}px)` }], sweep, t0, 'cubic-bezier(.45,.05,.55,.95)');
      w.cs.forEach((cx, i) => {
        const t = t0 + sweep * ((cx - rx) / rw);
        const tick = el(st, `left:${cx - 2}px;top:310px;width:4px;height:20px;border-radius:2px;background:${C.gloo};opacity:0`);
        k.A(tick, [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'translateY(0)' }], 180, t, SNAP);
        k.S('tick', t);
      });
      const rl = el(st, `left:${w.ls[0]}px;top:330px;width:${w.rs[3] - w.ls[0]}px;height:2px;background:${C.gloo};transform-origin:0 50%;transform:scaleX(0)`);
      k.A(rl, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 260, t0 + sweep + 40, EASE);
      k.A(ret, [{ transform: 'scale(1)' }, { transform: 'scale(.975)' }], 160, t0 + sweep + 40, SNAP);
      k.S('lock', t0 + sweep + 40, true);
    } else {
      const w = word(st, ['cholecystokinin'], { y: 232, size: 50, weight: 500 });
      const ret = BRK(st, 70, 200, 460, 120, C.paper);
      const xs = [240, 280, 320, 360];
      const ticks = xs.map((x) => el(st, `left:${x - 3}px;top:384px;width:6px;height:26px;border-radius:3px;border:2px solid rgba(246,241,231,.4)`));
      const rail = el(st, `left:${xs[0] - 30}px;top:418px;width:${xs[3] - xs[0] + 60}px;height:2px;background:${C.gloo};transform:scaleX(0)`);
      xs.forEach((_, i) => {
        const t = 200 + i * 240;
        k.A(ret, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.035)', opacity: 0.55 }, { transform: 'scale(1)', opacity: 1 }], 200, t, 'ease-out');
        k.A(ticks[i], [{ background: 'transparent', borderColor: 'rgba(246,241,231,.4)' }, { background: C.gloo, borderColor: C.gloo }], 90, t + 40);
        k.S('tick', t);
      });
      k.A(rail, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 240, 1180, EASE);
      k.S('lock', 1180, true);
    }
  };

  // 2. Stickiness. variant hot (1–3, slippery) | cool (4–5, sticks)
  M.stick = (st, k) => {
    bg(st, k);
    const cool = k.variant === 'cool';
    const pieces = cool ? ['thermo', 'stat'] : PIECES;
    const n = cool ? 5 : 2;
    const w = word(st, pieces, { y: 150, size: cool ? 64 : 54, weight: 500 });
    const railY = 150 + w.h + 22;
    const ticks = w.cs.map((cx) => el(st, `left:${cx - 2}px;top:${railY - 18}px;width:4px;height:16px;border-radius:2px;background:${C.gloo}`));
    const rail = el(st, `left:${w.ls[0]}px;top:${railY}px;width:${w.rs[w.rs.length - 1] - w.ls[0]}px;height:2px;background:${C.gloo}`);
    const m = meter(st, { x: 300, y: 320, n: 0 });
    m.forEach((t, i) => { t.o.style.opacity = 0; k.A(t.o, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 200, 120 + i * 30, EASE); });
    m.forEach((t, i) => {
      if (i >= n) return;
      const at = 360 + i * 120;
      k.A(t.f, [{ opacity: 0, transform: 'scaleY(.15)' }, { opacity: 1, transform: 'scaleY(1)' }], 110, at, SNAP);
      k.S('tick', at);
    });
    const tEnd = 360 + n * 120 + 120;
    if (cool) {
      m.forEach((t, i) => {
        k.A(t.f, [{ background: C.gloo }, { background: C.seaLit }], 260, tEnd);
        k.A(t.o, [{ borderColor: 'rgba(246,241,231,.55)' }, { borderColor: C.seaLit }], 260, tEnd);
      });
      [...ticks, rail].forEach((e) => k.A(e, [{ background: C.gloo }, { background: C.seaLit }], 260, tEnd));
      const lift = [{ transform: 'translateY(0)', opacity: 1, filter: 'blur(0px)', letterSpacing: '-0.01em' }, { transform: 'translateY(-130px)', opacity: 0, filter: 'blur(8px)', letterSpacing: '0.14em' }];
      k.A(w.box, lift, 1000, tEnd + 220, 'cubic-bezier(.5,0,.2,1)');
      [...ticks, rail].forEach((e) => k.A(e, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-60px)' }], 800, tEnd + 320, 'cubic-bezier(.5,0,.2,1)'));
      k.S('lift', tEnd + 220, true);
      k.say('This one sticks on its own.', tEnd + 220);
    } else {
      const card = el(st, `left:200px;top:450px;width:200px;height:96px;border:2px solid ${C.paper};border-radius:18px;opacity:0;display:flex;align-items:center;justify-content:center;font:600 30px/1 ${SANS};color:${C.paper}`);
      const lbl = el(card, `position:relative;opacity:0`, 'chole', 'span');
      const slot = el(card, `left:60px;top:-2px;width:80px;height:4px;background:#000`);
      k.A(card, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], 260, tEnd, EASE);
      const dy = 498 - (150 + w.h / 2);
      k.A(w.box, [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: `translateY(${dy - 40}px) scale(.3)`, opacity: 1, offset: 0.82 }, { transform: `translateY(${dy - 48}px) scale(.12)`, opacity: 0 }], 520, tEnd + 260, DROP);
      k.A(card, [{ borderColor: C.paper, boxShadow: '0 0 0 0 rgba(217,130,43,0)' }, { borderColor: C.white, boxShadow: '0 0 34px 6px rgba(217,130,43,.95)', offset: 0.25 }, { borderColor: C.gloo, boxShadow: '0 0 12px 0 rgba(217,130,43,.45)' }], 420, tEnd + 760, 'ease-out');
      k.A(lbl, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 240, tEnd + 820, EASE);
      k.S('lock', tEnd + 760, true);
      k.say("Slippery. Let's gloo it.", tEnd + 260);
    }
  };

  // 3. Pick. variant listed | offlist
  M.pick = (st, k) => {
    bg(st, k);
    const off = k.variant === 'offlist';
    const xs = [150, 250, 350, 450], railY = 548;
    el(st, `left:${xs[0] - 50}px;top:${railY}px;width:${xs[3] - xs[0] + 100}px;height:2px;background:${C.gloo}`);
    xs.forEach((x) => el(st, `left:${x - 2}px;top:${railY - 16}px;width:4px;height:14px;border-radius:2px;background:${C.gloo}`));
    const SW = 92, SH = 50, SY = railY - 26 - SH;
    const slot = el(st, `left:${xs[0] - SW / 2}px;top:${SY}px;width:${SW}px;height:${SH}px;border:2px dashed rgba(246,241,231,.6);border-radius:12px`);
    const names = ['Coca-Cola', 'Pepsi-Cola', 'RC Cola', 'Jolt Cola'];
    const TW = 232, TH = 120, pos = [[58, 110], [310, 110], [58, 252], [310, 252]];
    const tiles = names.map((nm, i) => {
      const t = el(st, `left:${pos[i][0]}px;top:${pos[i][1]}px;width:${TW}px;height:${TH}px;border:2px solid rgba(246,241,231,.7);border-radius:20px;display:flex;align-items:center;justify-content:center;font:600 28px/1.1 ${SANS};color:${C.paper};opacity:0`, nm);
      k.A(t, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], 240, 60 + i * 50, EASE);
      return t;
    });
    el(st, `left:0;width:600px;top:46px;text-align:center;font:500 15px/1 ${MONO};letter-spacing:.18em;text-transform:uppercase;color:${C.paper}`, 'say your favorite cola');
    k.say('Say your favorite cola.', 60);
    const tH = 1100;
    listen(st, k, 300, 82, tH);
    let chosen, cx, cy;
    if (off) {
      chosen = el(st, `left:${300 - TW / 2}px;top:${181}px;width:${TW}px;height:${TH}px;border:2px solid ${C.paper};border-radius:20px;opacity:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px`);
      const wave = el(chosen, 'position:relative;display:flex;gap:5px;align-items:center;height:44px');
      for (let i = 0; i < 13; i++) {
        const b = el(wave, `position:relative;width:5px;height:40px;border-radius:3px;background:${C.paper};transform:scaleY(.2)`);
        const hs = [0.25, 0.9, 0.45, 1, 0.3].map((v) => Math.max(0.15, Math.min(1, v * (0.5 + ((i * 7) % 5) / 8))));
        k.A(b, hs.map((h) => ({ transform: `scaleY(${h})` })), 520, tH - 340 + (i % 4) * 30, 'linear');
      }
      el(chosen, `position:relative;font:500 15px/1 ${MONO};color:${C.paper}`, '"Mexican Coke"', 'span');
      k.A(chosen, [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'scale(1)' }], 200, tH - 360, EASE);
      cx = 300; cy = 181 + TH / 2;
    } else {
      chosen = tiles[0]; cx = pos[0][0] + TW / 2; cy = pos[0][1] + TH / 2;
    }
    const others = off ? tiles : tiles.slice(1);
    others.forEach((t) => {
      if (k.gl) k.A(t, [{ transform: 'scale(1)' }, { transform: 'scale(.42)' }], 300, off ? tH - 360 : tH + 40, EASE);
      else k.A(t, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(16px) scale(.92)', opacity: 0.28 }], 320, off ? tH - 360 : tH + 40, EASE);
      k.A(t, [{ opacity: k.gl ? 1 : 0.28 }, { opacity: 0 }], 260, tH + 640);
    });
    const ring = el(st, `left:${cx - TW / 2}px;top:${cy - TH / 2}px;width:${TW}px;height:${TH}px;border:3px solid ${C.gloo};border-radius:22px;opacity:0`);
    k.A(chosen, [{ borderColor: C.paper, background: 'rgba(246,241,231,0)' }, { borderColor: C.white, background: 'rgba(246,241,231,.38)', offset: 0.3 }, { borderColor: C.gloo, background: 'rgba(246,241,231,0)' }], 280, tH, 'ease-out');
    k.A(ring, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.55)' }], 440, tH, 'cubic-bezier(.2,.7,.3,1)');
    k.S('lock', tH, true);
    const sx = xs[0], sy = SY + SH / 2, sc = SW / TW;
    k.A(chosen, [{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${sx - cx}px,${sy - cy}px) scale(${sc})` }], 380, tH + 300, SNAP);
    k.A(slot, [{ opacity: 1 }, { opacity: 0 }], 120, tH + 600);
    const big = el(st, `left:0;width:600px;top:200px;text-align:center;font:600 76px/1 ${SANS};color:${C.paper};letter-spacing:-0.02em;opacity:0`, 'chole');
    k.A(big, [{ opacity: 0, transform: `translate(${sx - 300}px,${sy - 238}px) scale(.25)` }, { opacity: 1, transform: 'none' }], 520, tH + 700, EASE);
    const snd = el(st, `left:0;width:600px;top:306px;text-align:center;font:600 44px/1 ${SANS};color:${C.gloo};opacity:0`, '≈ cola');
    k.A(snd, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 220, tH + 1180, EASE);
    k.say('Chole. Like cola.', tH + 1180);
    [0, 1, 2].forEach((i) => k.A(snd, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.35 }, { transform: 'scale(1)' }], 260, tH + 1420 + i * 300, 'ease-out'));
    const mean = el(st, `left:0;width:600px;top:392px;text-align:center;font:500 24px/1 ${SANS};color:${C.paper};opacity:0`, 'bile');
    k.A(mean, [{ opacity: 0 }, { opacity: 1 }], 420, tH + 2400, 'ease-out');
    k.say('Bile.', tH + 2400);
  };

  // 4. All together: pieces slide into word order, the word lights once, meaning appears.
  M.together = (st, k) => {
    bg(st, k);
    const railY = 548, xs = [135, 245, 355, 465];
    el(st, `left:80px;top:${railY}px;width:440px;height:2px;background:${C.gloo}`);
    const start = [2, 0, 3, 1];
    const groups = LESSON.map((l, i) => {
      const at = start.indexOf(i);
      const g = el(st, `left:${xs[at] - 50}px;top:${railY - 118}px;width:100px;height:104px`);
      const lb = el(g, `left:0;width:100px;top:0;text-align:center;font:600 24px/1 ${SANS};color:${C.paper}`, l.p);
      el(g, `left:4px;top:40px;width:92px;height:50px;border:2px solid ${C.gloo};border-radius:12px;display:flex;align-items:center;justify-content:center;font:600 14px/1.1 ${SANS};color:${C.paper};text-align:center`, l.pick);
      el(g, `left:48px;top:96px;width:4px;height:14px;border-radius:2px;background:${C.gloo}`);
      return { g, lb, from: xs[at], to: xs[i] };
    });
    groups.forEach((o, i) => {
      const d = o.to - o.from, lift = i % 2 ? 26 : -26;
      k.A(o.g, [{ transform: 'translate(0,0)' }, { transform: `translate(${d / 2}px,${lift}px)`, offset: 0.5 }, { transform: `translate(${d}px,0)` }], 620, 200 + i * 40, 'cubic-bezier(.65,0,.35,1)');
    });
    k.S('tick', 860);
    groups.forEach((o, i) => {
      const t = 1060 + i * 280;
      k.A(o.lb, [{ color: C.paper, textShadow: '0 0 0 rgba(217,130,43,0)' }, { color: C.white, textShadow: `0 0 18px ${C.gloo}`, offset: 0.3 }, { color: C.gloo, textShadow: '0 0 0 rgba(217,130,43,0)' }], 320, t, 'ease-out');
      k.S('tick', t);
    });
    k.say('Chole. Cysto. Kin. In.', 1060);
    const w = word(st, PIECES, { y: 170, size: 62, weight: 600 });
    w.spans.forEach((s, i) => {
      s.style.opacity = 0;
      const fromX = groups[i].to - (w.cs[i] + 0), fromY = railY - 118 - 170;
      k.A(s, [{ opacity: 0, transform: `translate(${fromX}px,${fromY}px) scale(.4)` }, { opacity: 1, transform: 'none' }], 560, 2280 + i * 50, EASE);
    });
    const tL = 2960;
    k.A(w.box, [{ transform: 'scale(1)', textShadow: '0 0 0 rgba(255,244,228,0)' }, { transform: 'scale(1.06)', textShadow: '0 0 26px rgba(255,244,228,.95)', offset: 0.35 }, { transform: 'scale(1)', textShadow: '0 0 0 rgba(255,244,228,0)' }], 560, tL, 'ease-out');
    k.S('chime', tL, true);
    k.say('Cholecystokinin.', tL);
    const mean = el(st, `left:60px;width:480px;top:270px;text-align:center;font:500 26px/1.3 ${SANS};color:${C.paper};opacity:0`, 'The hormone that squeezes the gallbladder.');
    k.A(mean, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 420, tL + 520, EASE);
  };

  // 5. Practice. variant hit | miss | unsure
  M.practice = (st, k) => {
    bg(st, k);
    const v = k.variant || 'hit';
    const grp = el(st, 'left:0;top:0;width:600px;height:600px');
    el(grp, `left:0;width:600px;top:126px;text-align:center;font:500 15px/1 ${MONO};letter-spacing:.18em;text-transform:uppercase;color:${C.paper}`, 'what does it mean?');
    el(grp, `left:0;width:600px;top:186px;text-align:center;font:600 84px/1 ${SANS};color:${C.paper};letter-spacing:-0.02em`, 'chole');
    const heard = { hit: '"bile"', miss: '"bowl"', unsure: '"something digestive"' }[v];
    const tr = el(grp, `left:0;width:600px;top:318px;text-align:center;font:500 26px/1 ${SANS};color:${C.paper};opacity:0`, heard);
    const tH = 1000;
    listen(st, k, 300, 470, tH);
    k.A(tr, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 120, tH, 'ease-out');
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 600 600'); svg.style.cssText = 'position:absolute;inset:0;width:600px;height:600px;overflow:visible';
    const R = 178, L = 2 * Math.PI * R;
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', 300); c.setAttribute('cy', 250); c.setAttribute('r', R); c.setAttribute('fill', 'none');
    c.setAttribute('transform', 'rotate(-90 300 250)');
    c.style.cssText = `stroke:${v === 'hit' ? C.paper : 'rgba(246,241,231,.5)'};stroke-width:${v === 'hit' ? 5 : 3};stroke-linecap:round;stroke-dasharray:${L};stroke-dashoffset:${L}`;
    svg.appendChild(c); st.appendChild(svg);
    if (v === 'hit') {
      k.A(c, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], 420, tH + 60, EASE);
      k.A(c, [{ strokeWidth: 5, stroke: C.paper }, { strokeWidth: 10, stroke: C.white, offset: 0.3 }, { strokeWidth: 5, stroke: C.paper }], 360, tH + 460, 'ease-out');
      k.S('chime', tH + 420, true);
    } else if (v === 'miss') {
      k.A(grp, [0, -16, 14, -10, 6, -2, 0].map((x) => ({ transform: `translateX(${x}px)` })), 380, tH + 60, 'linear');
      k.S('miss', tH + 60, true);
      const ans = el(st, `left:0;width:600px;top:392px;text-align:center;font:600 34px/1 ${SANS};color:${C.gloo};opacity:0`, 'chole = bile');
      k.A(ans, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 300, tH + 480, EASE);
      k.say('Chole means bile.', tH + 480);
    } else {
      k.A(c, [{ strokeDashoffset: L }, { strokeDashoffset: L * 0.3 }], 700, tH + 60, EASE);
      k.A(c, [{ opacity: 1 }, { opacity: 0.55 }], 500, tH + 760, 'ease-in-out');
      k.S('tick', tH + 60, true);
    }
  };

  // 6. Progress: per-skill review ticks, resting stickiness meter, picks owned.
  M.progress = (st, k) => {
    bg(st, k);
    el(st, `left:56px;top:52px;font:600 30px/1 ${SANS};color:${C.paper}`, 'cholecystokinin');
    meter(st, { x: 486, y: 52, n: 2, w: 12, h: 30, gap: 7, outline: 'rgba(246,241,231,.4)' });
    const stages = ['now', '30m', '4h', '1d', '3d', '7d'];
    const X0 = 232, DX = 54, TW = 34, TH = 50;
    stages.forEach((s, j) => el(st, `left:${X0 + j * DX - 10}px;width:${TW + 20}px;top:132px;text-align:center;font:500 14px/1 ${MONO};color:${C.paper}`, s));
    const rows = [['Meaning', 2, true], ['Transfer', 1, false], ['Sound', 0, false]];
    let lvl;
    rows.forEach(([name, lit, up], r) => {
      const y = 166 + r * 92;
      const row = el(st, `left:0;top:${y}px;width:600px;height:${TH}px;opacity:0`);
      el(row, `left:56px;top:${TH / 2 - 8}px;font:600 16px/1 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:${C.paper}`, name);
      k.A(row, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 260, 80 + r * 70, EASE);
      stages.forEach((_, j) => {
        const o = el(row, `left:${X0 + j * DX}px;top:0;width:${TW}px;height:${TH}px;border:2px solid rgba(246,241,231,${name === 'Sound' ? 0.3 : 0.55});border-radius:10px`);
        const f = el(o, `inset:2px;border-radius:7px;background:${C.gloo};transform-origin:50% 100%;opacity:0`);
        if (j < lit) k.A(f, [{ opacity: 0, transform: 'scaleY(.2)' }, { opacity: 1, transform: 'scaleY(1)' }], 160, 300 + r * 70 + j * 60, SNAP);
        if (up && j === lit) lvl = { o, f, x: X0 + j * DX, y };
      });
      if (name === 'Sound') el(row, `left:${X0}px;top:${TH + 10}px;font:500 13px/1 ${MONO};color:${C.paper};opacity:.8`, 'not assessed yet');
    });
    const tU = 1050;
    const burst = el(st, `left:${lvl.x}px;top:${lvl.y}px;width:${TW}px;height:${TH}px;border:3px solid ${C.gloo};border-radius:12px;opacity:0`);
    k.A(lvl.f, [{ opacity: 0, transform: 'scaleY(.2)' }, { opacity: 1, transform: 'scaleY(1)' }], 200, tU, SNAP);
    k.A(burst, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.1)' }], 480, tU + 60, 'cubic-bezier(.2,.7,.3,1)');
    k.A(lvl.o, [{ borderColor: 'rgba(246,241,231,.55)' }, { borderColor: C.gloo }], 200, tU);
    k.S('chime', tU, true);
    const chips = el(st, `left:56px;top:470px;width:488px;display:flex;flex-wrap:wrap;gap:10px;opacity:0`);
    LESSON.forEach((l) => {
      const c = flow(chips, `display:inline-flex;gap:8px;align-items:baseline;padding:10px 14px;border:2px solid rgba(246,241,231,.55);border-radius:999px;font:600 16px/1 ${SANS};color:${C.paper}`);
      flow(c, `color:${C.gloo};font:500 13px/1 ${MONO}`, l.p);
      flow(c, '', l.pick);
    });
    k.A(chips, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 300, 520, EASE);
  };

  /* ---------- reusable parts ---------- */
  const P = {};
  P.meter = (st, k) => {
    const s = k.state;
    if (s === 'resting') { meter(st, { x: 140, y: 40, n: 3, w: 12, h: 30, gap: 7, outline: 'rgba(246,241,231,.4)' }); return; }
    const hot = s !== 'filled-cool';
    const n = s === 'empty' ? 0 : s === 'filled-cool' ? 5 : 3;
    const m = meter(st, { x: 140, y: 25, n: s === 'filling' ? 0 : n, hot });
    if (s === 'filled-cool') m.forEach((t) => (t.o.style.borderColor = C.seaLit));
    if (s === 'filling') m.slice(0, 3).forEach((t, i) => { k.A(t.f, [{ opacity: 0, transform: 'scaleY(.15)' }, { opacity: 1, transform: 'scaleY(1)' }], 110, 200 + i * 120, SNAP); k.S('tick', 200 + i * 120, i === 2); });
  };
  P.rail = (st, k) => {
    const s = k.state, xs = [60, 115, 170, 220];
    const col = s === 'filled-cool' ? C.seaLit : s === 'resting' ? 'rgba(246,241,231,.45)' : s === 'empty' ? 'rgba(246,241,231,.4)' : C.gloo;
    el(st, `left:30px;top:70px;width:220px;height:2px;background:${col}`);
    if (s === 'empty') return;
    xs.forEach((x, i) => {
      const t = el(st, `left:${x - 2}px;top:50px;width:4px;height:18px;border-radius:2px;background:${col}`);
      if (s === 'filling') { t.style.opacity = 0; k.A(t, [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'none' }], 180, 200 + i * 150, SNAP); k.S('tick', 200 + i * 150, i === 3); }
    });
  };

  /* ---------- elements ---------- */
  class Base extends HTMLElement {
    static get observedAttributes() { return ['moment', 'target', 'variant', 'size', 'sid', 'kind', 'state']; }
    connectedCallback() {
      if (!this.shadowRoot) { this.attachShadow({ mode: 'open' }); this.addEventListener('click', () => this.play()); }
      G.stages.add(this); this._q();
    }
    disconnectedCallback() { G.stages.delete(this); this.stop(); }
    attributeChangedCallback() { this._q(); }
    _q() { if (this._p) return; this._p = true; queueMicrotask(() => { this._p = false; if (this.isConnected) this.play(); }); }
    get(k) { return this['_' + k] ?? this.getAttribute(k); }
    stop() { (this._a || []).forEach((a) => a.cancel()); (this._t || []).forEach(clearTimeout); this._a = []; this._t = []; }
    kit() {
      const cut = G.cut;
      return {
        cut, gl: this.get('target') === 'glasses', variant: this.get('variant'), state: this.get('state'),
        A: (e, kf, d, dl = 0, ease = EASE, o = {}) => { const a = e.animate(kf, { duration: cut ? 0 : d, delay: cut ? 0 : dl, easing: ease, fill: 'forwards', iterations: cut ? 1 : o.it || 1 }); this._a.push(a); return a; },
        S: (n, dl = 0, key) => { if (cut && !key) return; this._t.push(setTimeout(() => G.sfx(n), cut ? 0 : dl)); },
        say: (t, dl = 0) => { if (cut) return; this._t.push(setTimeout(() => G.say(t), dl)); },
      };
    }
  }
  ['moment', 'target', 'variant', 'size', 'sid', 'kind', 'state'].forEach((k) =>
    Object.defineProperty(Base.prototype, k, { get() { return this.get(k); }, set(v) { this['_' + k] = v; this._q(); }, configurable: true }));

  class Stage extends Base {
    play() {
      this.stop();
      const size = +(this.get('size') || 480), sc = size / 600;
      this.style.cssText = `display:block;position:relative;width:${size}px;height:${size}px;overflow:hidden;background:#000;cursor:pointer;flex:none`;
      const sr = this.shadowRoot; sr.innerHTML = '';
      const st = document.createElement('div');
      st.style.cssText = `position:absolute;left:0;top:0;width:600px;height:600px;overflow:hidden;transform-origin:0 0;transform:scale(${sc});font-family:${SANS};color:${C.paper};-webkit-font-smoothing:antialiased`;
      sr.appendChild(st);
      const fn = M[this.get('moment')]; if (fn) fn(st, this.kit());
    }
  }
  class Part extends Base {
    play() {
      this.stop();
      this.style.cssText = 'display:block;position:relative;width:280px;height:120px;overflow:hidden;background:#000;cursor:pointer;flex:none;border-radius:4px';
      const sr = this.shadowRoot; sr.innerHTML = '';
      const st = document.createElement('div');
      st.style.cssText = `position:absolute;inset:0;font-family:${SANS};color:${C.paper}`;
      sr.appendChild(st);
      const fn = P[this.get('kind')]; if (fn) fn(st, this.kit());
    }
  }
  customElements.define('gloo-stage', Stage);
  customElements.define('gloo-part', Part);
})();
