// みんなのランキング（GAS ウェブアプリと通信）。端末にはニックネーム・端末番号・未送信の記録だけを置く

import { RANKING_URL } from './config.js';

export const NAME_MAX = 8;
const TIMEOUT_MS = 8000;

function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function save(key, v) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch { /* 保存できない環境 */ }
}

export function enabled() {
  return Boolean(RANKING_URL);
}

// 端末ごとの番号。名前がかぶっても別人として扱うため
export function playerId() {
  let id = load('playerId');
  if (!id || !/^[0-9a-f]{16,64}$/.test(id)) {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    id = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    save('playerId', id);
  }
  return id;
}

export function cleanName(s) {
  return Array.from(String(s).replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, NAME_MAX).join('').trim();
}

export function getName() {
  return load('nickname') || '';
}

export function setName(n) {
  save('nickname', cleanName(n) || null);
}

class Rejected extends Error {}

async function request(query, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // 本文は文字列のまま送る（text/plain になり、GAS が答えられない事前確認を起こさない）
    const res = await fetch(RANKING_URL + query, { ...opts, redirect: 'follow', signal: ctrl.signal });
    const data = await res.json();
    if (!data.ok) throw new Rejected(data.error || 'rejected');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchRanking() {
  return request('?id=' + playerId());
}

function readPending() {
  try { return JSON.parse(load('pendingScore')); } catch { return null; }
}

// 送れなかった記録は一番よいものを端末に残し、次につながった時に送る
export async function submitScore({ score, lines, level, seconds }) {
  const rec = { id: playerId(), name: getName(), score, lines, level, seconds };
  const prev = readPending();
  if (!prev || rec.score >= prev.score) save('pendingScore', JSON.stringify(rec));
  return flushPending();
}

export async function flushPending() {
  const p = readPending();
  if (!p) return null;
  p.name = getName() || p.name;
  try {
    const data = await request('', { method: 'POST', body: JSON.stringify(p) });
    save('pendingScore', null);
    return data;
  } catch (err) {
    if (err instanceof Rejected) save('pendingScore', null);   // はじかれた記録は送り直さない
    throw err;
  }
}
