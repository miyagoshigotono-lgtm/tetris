// 効果音と BGM はすべて Web Audio で合成する（音声ファイルなし）

function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function save(key, v) {
  try { localStorage.setItem(key, v); } catch { /* 保存できない環境 */ }
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = load('muted') === '1';
    this.music = new Music(this);
    // iPhone（iOS 17〜）でマナーモード中も音を出す
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* 未対応 */ }
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
    save('muted', m ? '1' : '0');
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

// ---------- BGM ----------
// マイクラ風のゆったりしたピアノ。曲はこのコードで決まるオリジナル（毎回同じ曲になる）

const BPM = 70;
const BEAT = 60 / BPM;
const CHORDS = {
  C: { bass: [48, 55], tones: [60, 64, 67, 72, 76, 79] },
  Am: { bass: [45, 52], tones: [57, 60, 64, 69, 72, 76] },
  F: { bass: [41, 48], tones: [57, 60, 65, 69, 72, 77] },
  G: { bass: [43, 50], tones: [59, 62, 67, 71, 74, 79] },
  Em: { bass: [40, 47], tones: [59, 64, 67, 71, 76, 79] },
  Dm: { bass: [38, 45], tones: [57, 62, 65, 69, 74, 77] },
};
const PROGRESSION = [
  'C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G',
  'Am', 'F', 'C', 'G', 'F', 'Dm', 'G', 'C',
];
const REST_BARS = 4;   // 1 周ごとに静かな間をあける

function compose() {
  let seed = 20261018;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const notes = [];
  let prev = 2;
  PROGRESSION.forEach((name, bar) => {
    const ch = CHORDS[name], t0 = bar * 4;
    notes.push({ beat: t0, midi: ch.bass[0], vel: 0.22, dur: 3.2 });
    notes.push({ beat: t0 + 2, midi: ch.bass[1], vel: 0.14, dur: 2.4 });
    const busy = bar % 4 === 3 ? 0.18 : 0.38;
    for (let e = 0; e < 8; e++) {
      if (e === 0 && bar % 2 === 1) continue;
      if (rand() > (e % 2 === 0 ? busy + 0.12 : busy)) continue;
      const step = Math.round((rand() - 0.5) * 3);
      prev = Math.max(0, Math.min(ch.tones.length - 1, prev + step));
      notes.push({ beat: t0 + e / 2, midi: ch.tones[prev], vel: 0.16 + rand() * 0.08, dur: 2.6 });
    }
  });
  return { notes, beats: (PROGRESSION.length + REST_BARS) * 4 };
}

const SONG = compose();
const LOOKAHEAD = 0.6;

class Music {
  constructor(sound) {
    this.sound = sound;
    this.on = load('music') !== '0';
    this.playing = false;
    this.timer = null;
  }

  setOn(on) {
    this.on = on;
    save('music', on ? '1' : '0');
    if (!on) this.stop();
  }

  // 残響（ディレイ）つきの出口を 1 回だけ作る
  output() {
    const c = this.sound.ctx;
    if (!this.out) {
      this.out = c.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(this.sound.out);
      const delay = c.createDelay(1);
      delay.delayTime.value = BEAT * 0.75;
      const fb = c.createGain();
      fb.gain.value = 0.32;
      const tone = c.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 1800;
      const wet = c.createGain();
      wet.gain.value = 0.35;
      this.out.connect(delay);
      delay.connect(tone).connect(fb).connect(delay);
      tone.connect(wet).connect(this.sound.out);
    }
    return this.out;
  }

  start() {
    const c = this.sound.ctx;
    if (!this.on || this.playing || !c) return;
    this.playing = true;
    this.bus = c.createGain();
    this.bus.gain.setValueAtTime(0, c.currentTime);
    this.bus.gain.linearRampToValueAtTime(1, c.currentTime + 1.5);
    this.bus.connect(this.output());
    this.loopStart = c.currentTime + 0.2;
    this.idx = 0;
    this.timer = setInterval(() => this.tick(), 150);
    this.tick();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const c = this.sound.ctx, bus = this.bus;
    bus.gain.cancelScheduledValues(c.currentTime);
    bus.gain.setValueAtTime(bus.gain.value, c.currentTime);
    bus.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
    setTimeout(() => bus.disconnect(), 3500);
  }

  tick() {
    const c = this.sound.ctx;
    if (c.state !== 'running') return;
    // 止まっていた間に遅れた分は飛ばす
    if (this.loopStart + SONG.beats * BEAT < c.currentTime) {
      this.loopStart = c.currentTime + 0.1;
      this.idx = 0;
    }
    for (;;) {
      if (this.idx >= SONG.notes.length) {
        this.idx = 0;
        this.loopStart += SONG.beats * BEAT;
      }
      const n = SONG.notes[this.idx];
      const t = this.loopStart + n.beat * BEAT;
      if (t > c.currentTime + LOOKAHEAD) break;
      if (t >= c.currentTime - 0.05) this.piano(n.midi, t, n.vel, n.dur);
      this.idx++;
    }
  }

  piano(midi, t, vel, dur) {
    const c = this.sound.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vel * 0.3, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    g.connect(this.bus);
    for (const [mult, amp] of [[1, 1], [2, 0.32], [3, 0.1], [4, 0.04]]) {
      const o = c.createOscillator(), a = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      a.gain.value = amp;
      o.connect(a).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}
