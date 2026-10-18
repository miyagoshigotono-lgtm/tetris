// 効果音はすべて Web Audio で合成する（音声ファイルなし）

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('muted') === '1'; } catch { /* 保存できない環境 */ }
  }

  // iPhone はタップの中でしか音を出し始められないので、操作のたびに呼ぶ
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.6;
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('muted', m ? '1' : '0'); } catch { /* 保存できない環境 */ }
  }

  get noiseBuf() {
    if (!this._noise) {
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }
    return this._noise;
  }

  tone(freq, dur, { type = 'square', vol = 0.15, to = null, at = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.3, type = 'lowpass', freq = 1000, to = null, q = 0.7, at = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(name) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const seq = (notes, step, opts) => notes.forEach((f, i) => this.tone(f, opts.dur, { ...opts, at: i * step }));
    switch (name) {
      case 'move': this.tone(200, 0.03, { vol: 0.05 }); break;
      case 'rotate': this.tone(420, 0.05, { type: 'triangle', vol: 0.08, to: 560 }); break;
      case 'lock': this.noise(0.08, { vol: 0.3, freq: 500 }); break;
      case 'clear': seq([784, 988, 1175], 0.06, { type: 'sine', vol: 0.2, dur: 0.14 }); break;
      case 'bonus': seq([784, 988, 1175, 1568], 0.07, { type: 'sine', vol: 0.22, dur: 0.16 }); break;
      case 'level': seq([523, 659, 784, 1047], 0.09, { type: 'triangle', vol: 0.16, dur: 0.16 }); break;
      case 'start': seq([523, 784], 0.1, { type: 'triangle', vol: 0.16, dur: 0.14 }); break;
      case 'over': seq([392, 330, 262, 196], 0.18, { type: 'triangle', vol: 0.18, dur: 0.26 }); break;
      case 'flint':
        this.noise(0.09, { vol: 0.35, type: 'highpass', freq: 2500 });
        this.tone(1800, 0.04, { vol: 0.05, to: 900 });
        break;
      case 'fuse': this.noise(0.9, { vol: 0.14, type: 'bandpass', freq: 4500, q: 1.2 }); break;
      case 'boom':
        this.noise(1.3, { vol: 0.9, freq: 1600, to: 60 });
        this.tone(90, 0.7, { type: 'sine', vol: 0.6, to: 30 });
        break;
    }
  }
}
