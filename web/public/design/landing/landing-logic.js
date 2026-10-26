
class Component extends DCLogic {
  state = { cam: 'off' };
  rootRef = React.createRef();
  videoRef = React.createRef();

  componentDidMount() {
    this.mq = window.matchMedia('(max-width: 767px), (pointer: coarse)');
    this.onMq = () => this.setState({ mobile: this.mq.matches });
    this.onMq(); this.mq.addEventListener && this.mq.addEventListener('change', this.onMq);
    this.anims = []; this.timers = [];
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const copy = this.q('copy');
    copy.forEach((el, i) => this.A(el, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], 700, 900 + i * 160));
    this.loop();
  }
  componentWillUnmount() { this.stopLoop(); const s = this.stream; if (s) s.getTracks().forEach((t) => t.stop()); }
  q(n) { const r = this.rootRef.current; return r ? [...r.querySelectorAll(`[data-a="${n}"]`)] : []; }
  A(el, kf, d, delay = 0, easing = 'cubic-bezier(.16,1,.3,1)') {
    const a = el.animate(kf, { duration: this.reduce ? 0 : d, delay: this.reduce ? 0 : delay, easing, fill: 'forwards' });
    this.anims.push(a); return a;
  }
  stopLoop() { this.timers.forEach(clearTimeout); this.timers = []; }
  loop() {
    const live = this.state.cam === 'on';
    const [paper] = this.q('paper'), [ret] = this.q('ret'), [sweep] = this.q('sweep'), [word] = this.q('word'), [mean] = this.q('mean');
    const pieces = this.q('piece'), ticks = this.q('tick'), sounds = this.q('sound');
    if (!word) return;
    const ink = live ? '#f6f1e7' : '#1d1a16';
    this.A(paper, [{ opacity: 0 }, { opacity: live ? 0 : 1 }], 600, 0);
    this.A(word, [{ opacity: 0, color: ink, filter: 'blur(6px)' }, { opacity: 1, color: ink, filter: 'blur(0)' }], 700, 150);
    this.A(ret, [{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'scale(1)' }], 500, 700);
    this.A(sweep, [{ opacity: 0, left: '0%' }, { opacity: 1, left: '4%', offset: 0.08 }, { opacity: 1, left: '96%', offset: 0.92 }, { opacity: 0, left: '100%' }], 900, 1300, 'cubic-bezier(.45,.05,.55,.95)');
    ticks.forEach((t, i) => this.A(t, [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], 220, 1500 + i * 190, 'cubic-bezier(.3,1.5,.5,1)'));
    pieces.forEach((p, i) => this.A(p, [{ marginLeft: '0px' }, { marginLeft: i ? '14px' : '0px' }], 520, 2500));
    this.A(ret, [{ opacity: 1 }, { opacity: 0.35 }], 500, 2600);
    this.A(paper, [{ opacity: live ? 0 : 1 }, { opacity: 0 }], 600, 2600);
    this.A(word, [{ color: ink }, { color: '#f6f1e7' }], 600, 2600);
    sounds.forEach((s, i) => this.A(s, [{ opacity: 0, transform: 'translateY(-30px)' }, { opacity: 1, transform: 'none' }], 520, 3200 + i * 420));
    pieces.forEach((p, i) => this.A(p, [{ textShadow: '0 0 0 rgba(217,130,43,0)' }, { textShadow: '0 0 22px rgba(217,130,43,.9)', offset: 0.35 }, { textShadow: '0 0 0 rgba(217,130,43,0)' }], 520, 3200 + i * 420, 'ease-out'));
    this.A(mean, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 700, 5200);
    const out = 8200;
    [word, mean, ret, ...sounds, ...ticks].forEach((el) => this.A(el, [{ opacity: 1 }, { opacity: 0 }], 700, out, 'ease-in'));
    pieces.forEach((p) => this.A(p, [{ marginLeft: p === pieces[0] ? '0px' : '14px' }, { marginLeft: '0px' }], 1, out + 720));
    if (!this.reduce) this.timers.push(setTimeout(() => { this.anims.forEach((a) => a.cancel()); this.anims = []; this.q('copy').forEach((el) => (el.style.opacity = 1)); this.loop(); }, out + 1000));
  }
  async start() {
    if (this.state.cam === 'on') return;
    this.setState({ cam: 'asking' });
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
      this.stream = s;
      const v = this.videoRef.current; v.srcObject = s; v.play && v.play().catch(() => {}); v.style.opacity = 0.6;
      this.setState({ cam: 'on' });
    } catch (e) { this.setState({ cam: 'blocked' }); }
  }
  renderVals() {
    const c = this.state.cam;
    return {
      mobile: !!this.state.mobile, desktop: !this.state.mobile, bgOp: c === 'on' ? 0 : 1,
      rootRef: this.rootRef, videoRef: this.videoRef, start: () => this.start(),
      ctaLabel: c === 'on' ? 'Listening for “gloo it”' : c === 'asking' ? 'Waiting for permission…' : 'Turn on camera and mic',
      dot: c === 'on' ? '#d9822b' : '#1d1a16',
      note: c === 'blocked' ? 'Camera or mic is blocked. Allow them in your browser settings.' : c === 'on' ? 'Point at a hard word.' : '',
    };
  }
}
