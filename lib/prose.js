// YouTube の概要欄やコラム本文（プレーンテキスト）を、見出し・表・箇条書きのある HTML に組み立てる

import { esc } from './core.js';

const URL_RE = /(https?:\/\/[^\s<>"'）」】、。]+)/g;

// エスケープ済みの文字列に対して使う
const linkify = (s) => s.replace(URL_RE, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>');
const inline = (s) => linkify(esc(s));

export function toSeconds(t) {
  return String(t).split(':').reduce((a, n) => a * 60 + Number(n), 0);
}

function classify(line) {
  const t = line.trim();
  if (!t) return { k: 'blank' };
  let m;
  if ((m = t.match(/^[【\[]([^】\]]{1,30})[】\]]$/))) return { k: 'h', text: m[1] };
  if (t.length <= 32 && (m = t.match(/^[■◆●▼▶◎★☆][\s　]*(\S.*)$/))) return { k: 'h', text: m[1] };
  if ((m = t.match(/^((?:\d{1,2}:)?\d{1,2}:\d{2})[\s　]+(.+)$/))) return { k: 'ch', time: m[1], text: m[2] };
  if (/^[※＊]/.test(t)) return { k: 'note', text: t };
  if ((m = t.match(/^[・･✅✔☑][\s　]*(\S.*)$/))) return { k: 'li', text: m[1] };
  // 「所在地：沖縄県…」のような行。URL や「9:00〜18:00」のような時刻は拾わない
  if (!/^https?:/i.test(t)
      && (m = t.match(/^([^：:]{1,14})[：:][\s　]*(\S.*)$/))
      && !/https?$/i.test(m[1]) && !/\d$/.test(m[1])) {
    return { k: 'spec', key: m[1].trim(), val: m[2], text: t };
  }
  return { k: 'p', text: t };
}

// 戻り値: { html, chapters: [{ time, seconds, text }] }
export function renderProse(text, opts) {
  const o = opts || {};
  const H = o.heading || 'h2';
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(classify);
  const out = [];
  const chapters = [];

  for (let i = 0; i < lines.length;) {
    const k = lines[i].k;
    if (k === 'blank') { i++; continue; }
    let j = i;
    while (j < lines.length && lines[j].k === k) j++;
    const run = lines.slice(i, j);
    i = j;

    if (k === 'h') {
      for (const r of run) out.push(`<${H}>${esc(r.text)}</${H}>`);
    } else if (k === 'ch') {
      for (const r of run) chapters.push({ time: r.time, seconds: toSeconds(r.time), text: r.text });
    } else if (k === 'note') {
      out.push(`<p class="note">${run.map(r => inline(r.text)).join('<br>')}</p>`);
    } else if (k === 'li') {
      out.push(`<ul>${run.map(r => `<li>${inline(r.text)}</li>`).join('')}</ul>`);
    } else if (k === 'spec' && run.length >= 2) {
      out.push(`<dl class="spec">${run.map(r => `<div><dt>${esc(r.key)}</dt><dd>${inline(r.val)}</dd></div>`).join('')}</dl>`);
    } else if (k === 'spec') {
      out.push(`<p>${inline(run[0].text)}</p>`);
    } else {
      // 概要欄は空行なしで何十行も続くことがある。文の終わりで、ある程度の長さごとに段落を切る
      let buf = [];
      let len = 0;
      const flush = () => { if (buf.length) out.push(`<p>${buf.map(inline).join('<br>')}</p>`); buf = []; len = 0; };
      for (const r of run) {
        buf.push(r.text);
        len += r.text.length;
        if (len >= 90 && /[。！？!?]$/.test(r.text)) flush();
      }
      flush();
    }
  }
  return { html: out.join('\n'), chapters };
}
