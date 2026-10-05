// functions/ から import する共通モジュール（データ取得・正規化・共通HTML）
//
// データの流れ
//   動画  : YouTube → GAS が Sheets「videos」へ取り込み → ?videos=1（一覧）/ ?video=ID（1本）
//           GAS が応答しない・未対応のときは YouTube の公開RSS（最新15本）を直接読む
//   コラム: Make → Sheets「blog」→ ?blog_index=1（一覧）/ ?post=SLUG（1記事）
// GAS は1回 2〜4 秒かかるので、結果は Cache API に置き、古くなったら裏で取り直す。

export const GAS_URL = 'https://script.google.com/macros/s/AKfycbxiMWI1-y7MkJqd6v1A0G97YQlgO2cL77CcVZNKQVTijQnTuBQjsDE9q6caCmrZmKWmjA/exec';
export const SITE_URL = 'https://fudousan-irai-urasoe.search-mania.net';
export const SITE_NAME = '株式会社不動産の依頼所 浦添本店';
export const SITE_SHORT = '不動産の依頼所 浦添本店';
export const SITE_TAGLINE = '住まいと不動産のコラム';
export const OFFICIAL_URL = 'https://www.fudousannoirai.com/';
export const TEL = '098-917-1490';
export const AUTHOR_NAME = '福本 隼人';
export const AUTHOR_JOB = '株式会社不動産の依頼所 代表';
export const YT_CHANNEL_ID = 'UCdkby1N348kVEZBVQAQ3aUA';
export const YT_CHANNEL_URL = 'https://www.youtube.com/channel/' + YT_CHANNEL_ID;
export const YT_CHANNEL_NAME = '福ちゃんの沖縄暮らし';
export const ASSET_V = '20261005c';

const DATA_V = 'v1';
const FRESH_INDEX_MS = 10 * 60 * 1000;
const FRESH_ITEM_MS = 60 * 60 * 1000;
const GAS_TIMEOUT_MS = 20000;

export const VIDEO_CATS = [
  { slug: 'property', key: '物件紹介',       lead: '未公開物件やマンション・戸建・土地を、現地の映像で紹介する動画です。' },
  { slug: 'sell',     key: '査定・売却',     lead: '査定額の考え方、売却の進め方、相続した不動産の扱いを解説する動画です。' },
  { slug: 'move',     key: '沖縄移住',       lead: '沖縄へ移住して家を探すときの予算感やエリア選びを取り上げた動画です。' },
  { slug: 'howto',    key: '買い方・見極め方', lead: '買ってはいけない物件の見分け方や、借りる・買うの判断を扱う動画です。' },
  { slug: 'story',    key: '福ちゃんの想い', lead: '会社のこと、仕事への考え、YouTube を続ける理由を語った動画です。' },
  { slug: 'talk',     key: '沖縄不動産の話', lead: '沖縄の不動産と暮らしにまつわる、そのほかの動画です。' },
];

// 上から順に判定する。物件の動画は査定・移住の語も含みやすいので、物件固有の語を先に見る
const VIDEO_RULES = [
  { key: '物件紹介',       words: ['未公開物件', '売地', '販売中', '先行販売', 'LDK', '角部屋', 'オーシャンビュー'] },
  { key: '福ちゃんの想い', words: ['YouTube', 'ユーチューブ', '登録者', '求人', '親父', '振り返'] },
  { key: '査定・売却',     words: ['査定', '売却', '買取', '相続', '空き家'] },
  { key: '沖縄移住',       words: ['移住'] },
  { key: '買い方・見極め方', words: ['買わない', '見抜', '選び方', '失敗', '注意', 'ローン', '予算', '借りたら', '買ったら', '家探し'] },
  { key: '物件紹介',       words: ['マンション', '戸建', '土地', '物件', '新築'] },
];

export const POST_CATS = [
  { slug: 'inherit', key: '相続・実家',   lead: '相続した実家や空き家を、売る・貸す・残すで迷ったときの考え方です。' },
  { slug: 'price',   key: '査定・相場',   lead: '査定の受け方、相場の調べ方、売却の進め方についてのコラムです。' },
  { slug: 'money',   key: '資金・ローン', lead: '住宅ローンや費用など、お金まわりの不安についてのコラムです。' },
  { slug: 'shop',    key: '店舗のご案内', lead: '営業日や駐車場、キッズスペースなど、ご来店前に知っておきたいことです。' },
  { slug: 'consult', key: '住まいの相談', lead: '住み替えや家探しなど、住まい全般のご相談についてのコラムです。' },
];

const POST_RULES = [
  { key: '相続・実家',   words: ['相続', '実家', '空き家', '名義'] },
  { key: '資金・ローン', words: ['ローン', 'お金', '資金', '税', '費用'] },
  { key: '店舗のご案内', words: ['お休み', '定休', '駐車', 'お車', 'キッズ', 'お子さま', 'キングス', '来店', 'ドリンク'] },
  { key: '査定・相場',   words: ['査定', '相場', '目安', '売る', '売却', '買取'] },
];

function byRules(rules, cats, title, manual, fallback) {
  const m = String(manual || '').trim();
  if (m && cats.some(c => c.key === m)) return m;
  for (const r of rules) if (r.words.some(w => title.includes(w))) return r.key;
  return fallback;
}

// ---------- 文字列ヘルパー ----------

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : String(s || '');
}

export function ld(o) {
  return `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
}

function clip(s, n) {
  const flat = String(s || '').replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n - 1) + '…' : flat;
}

export function driveImg(url, size) {
  if (!url) return '';
  const sz = size || 1200;
  const s = String(url).trim();
  const m1 = s.match(/drive\.google\.com\/(?:file\/d\/|thumbnail\?id=|open\?id=)([a-zA-Z0-9_-]+)/);
  if (m1) return `https://drive.google.com/thumbnail?id=${m1[1]}&sz=w${sz}`;
  const m2 = s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}=w${sz}`;
  return /^https?:\/\//.test(s) ? s : '';
}

export const ytThumb = (id, name) => `https://i.ytimg.com/vi/${id}/${name || 'mqdefault'}.jpg`;
export const ytWatch = (id) => `https://www.youtube.com/watch?v=${id}`;

// ---------- 動画の正規化 ----------

// 概要欄の末尾に並ぶ「#沖縄不動産 #福ちゃん」のような行。本文からは外してタグとして使う
const TAG_LINE = /^(?:[#＃][^\s#＃]+[\s　]*)+$/;

function splitTags(description) {
  const tags = [];
  const lines = String(description || '').replace(/\r\n?/g, '\n').split('\n').filter(line => {
    const t = line.trim();
    if (!TAG_LINE.test(t)) return true;
    for (const m of t.matchAll(/[#＃]([^\s#＃]+)/g)) if (!tags.includes(m[1])) tags.push(m[1]);
    return false;
  });
  return { text: lines.join('\n').trim(), tags };
}

function normVideo(v, full) {
  const id = String((v && v.id) || '').trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  const title = String(v.title || '').trim();
  if (!title) return null;
  const pub = new Date(v.published);
  // YouTube の時刻は UTC。日本時間に直してから日付を取る（朝8時までの公開が前日扱いになるのを防ぐ）
  const jst = isNaN(pub) ? null : new Date(pub.getTime() + 9 * 3600 * 1000);
  const out = {
    id, title,
    date: jst ? jst.toISOString().slice(0, 10) : '',
    iso: jst ? jst.toISOString().slice(0, 19) + '+09:00' : '',
    short: !!v.short || /\/shorts\//.test(String(v.url || '')),
    category: byRules(VIDEO_RULES, VIDEO_CATS, title, v.category, '沖縄不動産の話'),
    views: Number(v.views) || 0,
  };
  if (full) {
    const { text, tags } = splitTags(v.description);
    out.description = text;
    out.tags = tags;
    out.article = String(v.article || '').replace(/\r\n?/g, '\n').trim();
    out.desc = clip(text, 120) || title;
  } else {
    out.desc = clip(v.snippet != null ? v.snippet : splitTags(v.description).text, 110) || title;
  }
  return out;
}

// ---------- コラムの正規化 ----------

function extractSlug(url, date) {
  const s = String(url || '').trim();
  if (s) {
    const m = s.match(/\/blog\/([^\/\?#]+)/);
    if (m && m[1]) return m[1];
    const bare = s.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop();
    if (bare && !/^https?:/i.test(bare)) return bare;
  }
  return date ? String(date) : '';
}

function cleanTitle(t) {
  return String(t || '')
    .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1F2FF}\u{FE0F}\u{200D}\s]+/u, '')
    .replace(/^#\s*/, '').replace(/[\s　]+$/, '').trim();
}

// Make が書く本文は Markdown 風に行末へ空白2つを付けてくるので落とす
const tidyBody = (s) => String(s || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t　]+$/, '')).join('\n').trim();

function normPost(b, full) {
  if (!b || !(b.body || b.head || b.title)) return null;
  const date = String(b.date || '').slice(0, 10);
  const slug = extractSlug(b.url, date);
  // URL や属性にそのまま出すので、安全な文字だけのスラッグに限る
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug)) return null;
  let body = tidyBody(b.body != null ? b.body : b.head);
  let title = cleanTitle(b.title);
  if (!title) {
    const firstLine = body.split('\n')[0].trim();
    title = cleanTitle(firstLine);
    // 本文1行目を見出しに使ったら本文からは外す（H1 と重複させない）
    if (body.includes('\n')) body = body.slice(body.indexOf('\n') + 1).trim();
  }
  if (!title) title = `${fmtDate(date)} のお知らせ`;
  const tm = slug.match(/^\d{4}-\d{2}-\d{2}-(\d{2})(\d{2})$/);
  const out = {
    slug, date, title,
    desc: clip(body, 110) || title,
    image: String(b.image || ''),
    category: byRules(POST_RULES, POST_CATS, title, b.category, '住まいの相談'),
    iso: date ? `${date}T${tm ? tm[1] + ':' + tm[2] : '09:00'}:00+09:00` : '',
  };
  if (full) out.body = body;
  return out;
}

function normPosts(raw) {
  const seen = new Set();
  const posts = [];
  for (const b of raw) {
    const p = normPost(b, false);
    if (!p || seen.has(p.slug)) continue;
    seen.add(p.slug);
    posts.push(p);
  }
  posts.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : a.slug < b.slug ? 1 : -1));
  return posts;
}

// ---------- 取得 ----------

async function fetchT(url, init) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), GAS_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({ signal: ctl.signal }, init || {}));
  } finally {
    clearTimeout(timer);
  }
}

// GAS の /exec は別ホストへ 302 する。redirect:'follow' 任せだと Cloudflare 側で
// リダイレクトが循環したことがあるので、302 を1回だけ自分で辿る
async function gas(query) {
  let res = await fetchT(GAS_URL + query, { redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (!loc) throw new Error('GAS redirect without location');
    res = await fetchT(loc, { redirect: 'follow' });
  }
  if (!res.ok) throw new Error('GAS ' + res.status);
  return res.json();
}

const xmlText = (s) => String(s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

// YouTube の公開RSS（APIキー不要・最新15本・概要欄は全文入り）
// このRSSは正常時でも 404/500 を頻繁に返す（実測で4回に3回）ので、間を空けて何度か試す
async function fetchFeed() {
  let xml = '';
  let status = 0;
  for (let attempt = 0; attempt < 8 && !xml; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 350));
    try {
      const res = await fetchT('https://www.youtube.com/feeds/videos.xml?channel_id=' + YT_CHANNEL_ID);
      status = res.status;
      if (res.ok) xml = await res.text();
    } catch (e) {
      status = -1;
    }
  }
  if (!xml) throw new Error('YouTube feed ' + status);
  const pick = (e, re) => { const m = e.match(re); return m ? xmlText(m[1]) : ''; };
  return xml.split('<entry>').slice(1).map(e => ({
    id: pick(e, /<yt:videoId>([^<]+)</),
    published: pick(e, /<published>([^<]+)</),
    title: pick(e, /<title>([^<]*)</),
    description: pick(e, /<media:description>([\s\S]*?)<\/media:description>/),
    url: pick(e, /<link rel="alternate" href="([^"]+)"/),
    views: pick(e, /<media:statistics views="(\d+)"/),
  })).filter(v => v.id);
}

async function loadVideoIndex() {
  let raw = null;
  try {
    const d = await gas('?videos=1');
    if (d && Array.isArray(d.videos) && d.videos.length) raw = d.videos;
  } catch (e) { /* 下の RSS に切り替える */ }
  if (!raw) raw = await fetchFeed();
  const list = raw.map(v => normVideo(v, false)).filter(Boolean);
  if (!list.length) throw new Error('no videos');
  list.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));
  return list;
}

async function loadVideo(id) {
  let raw = null;
  let answered = false;
  try {
    const d = await gas('?video=' + encodeURIComponent(id));
    // 旧版の GAS は ?video= を知らず CMS 全体を返す。video キーがあるときだけ答えとして扱う
    if (d && 'video' in d) { answered = true; raw = d.video; }
  } catch (e) { /* 下の RSS に切り替える */ }
  if (!raw) {
    try {
      raw = (await fetchFeed()).find(v => v.id === id) || null;
    } catch (e) {
      if (!answered) throw e;
    }
  }
  return raw ? normVideo(raw, true) : null;
}

async function loadPostIndex() {
  let raw = null;
  try {
    const d = await gas('?blog_index=1');
    if (d && Array.isArray(d.index)) raw = d.index;
  } catch (e) { /* 下の全件取得に切り替える */ }
  if (!raw) {
    const d = await gas('?blog_all=1');
    raw = Array.isArray(d && d.blog) ? d.blog : [];
  }
  const posts = normPosts(raw);
  if (!posts.length) throw new Error('no posts');
  return posts;
}

async function loadPost(slug) {
  let raw = null;
  const d = await gas('?post=' + encodeURIComponent(slug));
  if (d && 'post' in d) {
    raw = d.post;
  } else {
    const all = await gas('?blog_all=1');
    raw = (Array.isArray(all && all.blog) ? all.blog : []).find(b => {
      const p = normPost(b, false);
      return p && p.slug === slug;
    }) || null;
  }
  return raw ? normPost(raw, true) : null;
}

async function loadReviews() {
  const d = await gas('?reviews=1');
  const list = Array.isArray(d && d.reviews) ? d.reviews : [];
  return {
    gbpUrl: String((d && d.gbpUrl) || (d && d.settings && d.settings.gbpUrl) || ''),
    reviews: list.filter(r => r && String(r.text || '').trim()).map(r => ({
      name: String(r.name || ''), stars: Math.max(1, Math.min(5, Number(r.stars) || 5)),
      text: String(r.text || '').trim(), date: String(r.date || '').slice(0, 10),
    })),
  };
}

// ---------- キャッシュ（古くても返し、裏で取り直す） ----------

const mem = new Map();
const storeUrl = (key) => `${SITE_URL}/__cache/${DATA_V}/${key}`;

async function readStore(key) {
  try {
    const hit = await caches.default.match(storeUrl(key));
    return hit ? await hit.json() : null;
  } catch (e) {
    return null;
  }
}

async function refresh(key, loader) {
  const data = await loader();
  const entry = { t: Date.now(), data };
  mem.set(key, entry);
  try {
    await caches.default.put(storeUrl(key), new Response(JSON.stringify(entry), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=1209600' },
    }));
  } catch (e) {
    console.error('cache put failed', key, e);
  }
  return data;
}

// opts.waitMs を渡すと、キャッシュが空のときその時間だけ待って、間に合わなければ null を返す
async function swr(context, key, freshMs, loader, opts) {
  const now = Date.now();
  let cur = mem.get(key);
  if (!cur || now - cur.t > freshMs) {
    const stored = await readStore(key);
    if (stored && (!cur || stored.t > cur.t)) { cur = stored; mem.set(key, stored); }
  }
  if (cur) {
    if (now - cur.t > freshMs) context.waitUntil(refresh(key, loader).catch(() => {}));
    return cur.data;
  }
  const p = refresh(key, loader);
  if (opts && opts.waitMs != null) {
    context.waitUntil(p.catch(() => {}));
    return Promise.race([p.catch(() => null), new Promise(r => setTimeout(() => r(null), opts.waitMs))]);
  }
  return p;
}

export const getVideos = (context, opts) => swr(context, 'videos', FRESH_INDEX_MS, loadVideoIndex, opts);
export const getPosts = (context, opts) => swr(context, 'posts', FRESH_INDEX_MS, loadPostIndex, opts);
export const getReviews = (context, opts) => swr(context, 'reviews', 6 * 60 * 60 * 1000, loadReviews, opts);
export const getVideo = (context, id) => swr(context, 'video/' + id, FRESH_ITEM_MS, () => loadVideo(id));
export const getPost = (context, slug) => swr(context, 'post/' + slug, FRESH_ITEM_MS, () => loadPost(slug));

// ---------- 応答 ----------

export function html(body, status, maxAge) {
  return new Response(body, {
    status: status || 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${maxAge == null ? 600 : maxAge}`,
    },
  });
}

export function redirect(to, status) {
  return new Response(null, { status: status || 301, headers: { location: to } });
}

// ---------- 共通HTML ----------

export function videoCard(v, eager) {
  return `<a class="vcard" href="/video/${esc(v.id)}/">
<span class="vcard__thumb"><img src="${ytThumb(v.id)}" alt="" width="320" height="180" loading="${eager ? 'eager' : 'lazy'}" decoding="async"><span class="play" aria-hidden="true"></span>${v.short ? '<span class="badge">ショート</span>' : ''}</span>
<span class="vcard__body"><span class="meta"><span class="tag">${esc(v.category)}</span><time datetime="${esc(v.date)}">${esc(fmtDate(v.date))}</time></span>
<h3 class="vcard__title">${esc(v.title)}</h3></span></a>`;
}

export function postCard(p, eager) {
  const img = driveImg(p.image, 600);
  return `<a class="pcard" href="/blog/${esc(p.slug)}/">
<span class="pcard__img">${img ? `<img src="${esc(img)}" alt="" width="600" height="450" loading="${eager ? 'eager' : 'lazy'}" decoding="async">` : ''}</span>
<span class="pcard__body"><span class="meta"><span class="tag">${esc(p.category)}</span><time datetime="${esc(p.date)}">${esc(fmtDate(p.date))}</time></span>
<h3 class="pcard__title">${esc(p.title)}</h3></span></a>`;
}

export function pager(cur, pages, hrefOf) {
  if (pages <= 1) return '';
  const want = new Set([1, pages, cur - 2, cur - 1, cur, cur + 1, cur + 2]);
  const nums = [...want].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push('<i aria-hidden="true">…</i>');
    out.push(n === cur ? `<span aria-current="page">${n}</span>` : `<a href="${esc(hrefOf(n))}">${n}</a>`);
    prev = n;
  }
  return `<nav class="pager" aria-label="ページ送り">${out.join('')}</nav>`;
}

export const ctaBox = () => `<aside class="cta-box">
<p class="cta-box__lead">物件のご相談・査定のご依頼は、<wbr>公式サイトまたはお電話で承ります。</p>
<div class="btns"><a class="btn btn--navy" href="${OFFICIAL_URL}" target="_blank" rel="noopener">公式サイトで相談する</a><a class="btn btn--line" href="tel:${TEL.replace(/-/g, '')}">電話 ${TEL}</a></div>
<p class="cta-box__note">${SITE_NAME}／9:00〜18:00（水曜・祝日定休）</p>
</aside>`;

export const authorBox = () => `<aside class="author">
<p class="author__label">この動画について</p>
<p class="author__name">${SITE_SHORT}</p>
<p class="author__text">不動産の依頼所の公式YouTube「${YT_CHANNEL_NAME}」で、代表の${AUTHOR_NAME}がお話しした内容です。動画で気になった点や、ご自身の場合はどうなるかは、浦添本店でご相談いただけます。</p>
<p class="author__links"><a href="/#store">浦添本店について</a><a href="/blog/">コラムを読む</a></p>
</aside>`;

export function page(o) {
  const image = o.image || `${SITE_URL}/ogp.png`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="content-language" content="ja">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<meta name="robots" content="${o.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large,max-video-preview:-1'}">
<meta name="theme-color" content="#1a2f4d">
<link rel="canonical" href="${esc(o.canonical)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:title" content="${esc(o.ogTitle || o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(o.canonical)}">
<meta property="og:site_name" content="${SITE_SHORT}｜${SITE_TAGLINE}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
${o.head || ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;600&family=Noto+Sans+JP:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css?v=${ASSET_V}">
</head>
<body>
<header class="hdr"><div class="hdr__in">
<a class="brand" href="/"><span class="brand__ja">${SITE_SHORT}</span><span class="brand__sub">${SITE_TAGLINE}</span></a>
<nav class="gnav" aria-label="メインメニュー"><a href="/blog/"${o.nav === 'blog' ? ' aria-current="true"' : ''}>コラム</a><a href="/#store">浦添本店</a><a href="/video/"${o.nav === 'video' ? ' aria-current="true"' : ''}>動画</a><a href="/#company">アクセス</a></nav>
<a class="hdr__cta" href="${OFFICIAL_URL}" target="_blank" rel="noopener">公式サイト</a>
</div></header>
<nav class="crumb" aria-label="パンくずリスト">${o.breadcrumb}</nav>
<main class="wrap${o.narrow ? ' wrap--narrow' : ''}">
${o.main}
</main>
<footer class="ftr"><div class="ftr__in">
<div class="ftr__brand"><p class="ftr__name">${SITE_NAME}</p><p>沖縄県浦添市当山3-3-2 1F<br>TEL ${TEL}／9:00〜18:00（水曜・祝日定休）</p></div>
<nav class="ftr__nav" aria-label="フッターメニュー"><a href="/blog/">コラム一覧</a><a href="/#store">浦添本店について</a><a href="/#company">会社案内・アクセス</a><a href="/video/">動画</a><a href="/privacy-policy.html">プライバシーポリシー</a><a href="/terms.html">ご利用ガイドライン</a><a href="${YT_CHANNEL_URL}" target="_blank" rel="noopener">YouTube</a></nav>
</div>
<p class="ftr__partner">このサイトは${SITE_NAME}の情報発信を目的に SearchMania Inc. が制作したパートナーサイトです。<a href="${OFFICIAL_URL}" target="_blank" rel="noopener">公式サイトはこちら</a></p>
<p class="ftr__copy">© ${SITE_NAME}　Produced by <a href="https://search-mania.net/" target="_blank" rel="noopener">SearchMania Inc.</a></p>
</footer>
${o.foot || ''}
</body>
</html>`;
}

export function notFound(what, backHref, backLabel) {
  return html(page({
    title: `${what}が見つかりませんでした｜${SITE_SHORT}`,
    desc: `お探しの${what}は見つかりませんでした。`,
    canonical: SITE_URL + backHref,
    noindex: true,
    narrow: true,
    breadcrumb: `<a href="/">ホーム</a><span>›</span><a href="${backHref}">${backLabel}</a>`,
    main: `<div class="empty"><h1>${what}が見つかりませんでした</h1><p>URLが変更されたか、公開が終了した可能性があります。</p><a class="btn btn--navy" href="${backHref}">${backLabel}へ</a></div>`,
  }), 404, 0);
}

export function unavailable() {
  return new Response('<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>一時的に表示できません</title></head><body style="font-family:sans-serif;text-align:center;padding:120px 20px"><h1 style="font-size:20px">ただいまページを読み込めません</h1><p>少し時間をおいて、もう一度お試しください。</p><p><a href="/">トップへ戻る</a></p></body></html>', {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '600', 'cache-control': 'no-store' },
  });
}
