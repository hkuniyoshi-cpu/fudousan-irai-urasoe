const GAS_URL       = 'https://script.google.com/macros/s/AKfycbxiMWI1-y7MkJqd6v1A0G97YQlgO2cL77CcVZNKQVTijQnTuBQjsDE9q6caCmrZmKWmjA/exec';
const SITE_URL      = 'https://fudousan-irai-urasoe.search-mania.net';
const STORE_NAME    = '株式会社不動産の依頼所 浦添本店';
const STORE_NAME_EN = 'Fudousan no Iraisho Urasoe';

/* Formal Trust palette to match main site */
const BG        = '#fbfaf6';
const INK       = '#1e2530';
const INK_SOFT  = '#4a5568';
const NAVY      = '#1a2f4d';
const NAVY_DARK = '#10203a';
const GOLD      = '#b89452';
const MUTED     = '#8a94a5';
const LINE      = '#e5e2d8';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function fmtDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : String(s);
}
function driveImg(url) {
  if (!url) return '';
  const s = String(url).trim();
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return 'https://drive.google.com/thumbnail?id=' + m1[1] + '&sz=w1200';
  const m2 = s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (m2) return 'https://lh3.googleusercontent.com/d/' + m2[1] + '=w1200';
  if (s.indexOf('drive.google.com/thumbnail') !== -1) {
    return s.replace(/([?&]sz=)[^&]*/, '$1w1200');
  }
  return s;
}
function findPost(posts, slug) {
  if (!Array.isArray(posts) || !slug) return null;
  return posts.find(function(b) {
    if (!b) return false;
    if (b.url) {
      const raw = String(b.url).trim();
      /* Sheets F列は "2026-08-28-0829/" のように相対スラッグだけ入る場合がある */
      const m1 = raw.match(/\/blog\/([^\/\?#]+)/);
      if (m1 && m1[1] === slug) return true;
      /* 相対パスから末尾セグメントを抽出（?/#/末尾スラッシュを剥がす） */
      const cleaned = raw.replace(/[?#].*$/, '').replace(/\/+$/, '');
      const seg = cleaned.split('/').pop();
      if (seg && seg === slug) return true;
    }
    if (b.date) {
      const d = String(b.date).replace(/[\/\.]/g, '-').replace(/[^0-9-]/g, '');
      if (d === slug) return true;
    }
    return false;
  }) || null;
}

function renderNotFound(slug) {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>記事が見つかりません | ${esc(STORE_NAME)}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${BG};color:${INK};font-family:'Noto Sans JP','Hiragino Sans',sans-serif;line-height:1.85;-webkit-font-smoothing:antialiased}
header{background:${NAVY};padding:16px 20px;text-align:center;position:sticky;top:0;z-index:10}
header a{color:${BG};text-decoration:none;font-size:16px;letter-spacing:.28em;font-family:'Noto Serif JP',serif;font-weight:500}
.wrap{max-width:720px;margin:80px auto;padding:0 24px;text-align:center;font-family:'Noto Serif JP',serif}
.wrap h1{font-size:24px;color:${INK};margin-bottom:18px;letter-spacing:.06em}
.wrap p{font-size:14px;color:${MUTED};margin-bottom:36px;line-height:1.9}
.back-btn{display:inline-block;padding:14px 36px;border:1.5px solid ${NAVY};color:${NAVY};text-decoration:none;font-size:13px;letter-spacing:.24em;transition:all .3s}
.back-btn:hover{background:${NAVY};color:${BG}}
</style>
</head>
<body>
<header><a href="${SITE_URL}/">${esc(STORE_NAME)}</a></header>
<div class="wrap">
  <h1>記事が見つかりません</h1>
  <p>指定された記事は削除されたか、URLが正しくない可能性があります。</p>
  <a class="back-btn" href="${SITE_URL}/">← トップへ戻る</a>
</div>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

function renderPost(item, slug) {
  const imgUrl = driveImg(item.image);
  let title = String(item.title || '').trim();
  if (!title && item.body) {
    title = String(item.body).split(/[。\n]/)[0].trim();
  }
  if (!title && item.date) {
    title = fmtDate(item.date) + ' の投稿';
  }
  const desc = String(item.body || title).slice(0, 160).replace(/\s+/g, ' ');
  const canonical = SITE_URL + '/blog/' + encodeURIComponent(slug) + '/';
  const bodyText = String(item.body || '');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    'headline': title,
    'description': desc,
    'datePublished': item.date || '',
    'inLanguage': 'ja',
    'url': canonical,
    'image': imgUrl || '',
    'publisher': {
      '@type': 'RealEstateAgent',
      'name': STORE_NAME,
      'url': SITE_URL,
      'logo': { '@type': 'ImageObject', 'url': SITE_URL + '/favicon.svg' }
    },
    'author': {
      '@type': 'RealEstateAgent',
      'name': STORE_NAME,
      'url': SITE_URL
    },
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonical }
  };

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${NAVY}">
<title>${esc(title)} | ${esc(STORE_NAME)}</title>
<meta name="description" content="${esc(desc)}">
<meta http-equiv="content-language" content="ja">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">

<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(STORE_NAME)}">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
${imgUrl ? `<meta property="og:image" content="${esc(imgUrl)}">` : `<meta property="og:image" content="${SITE_URL}/ogp.svg">`}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${imgUrl ? `<meta name="twitter:image" content="${esc(imgUrl)}">` : ''}

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${BG};color:${INK};font-family:'Noto Sans JP','Hiragino Sans',sans-serif;line-height:1.85;-webkit-font-smoothing:antialiased}
header{background:${NAVY};padding:16px 20px;text-align:center;border-bottom:1px solid rgba(184,148,82,.2);position:sticky;top:0;z-index:10}
header a{color:${BG};text-decoration:none;font-size:16px;letter-spacing:.28em;font-family:'Noto Serif JP',serif;font-weight:500}
.wrap{max-width:720px;margin:60px auto;padding:0 24px 80px}
.card{background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 6px 28px rgba(30,58,95,.1)}
.card img{width:100%;display:block;max-height:480px;object-fit:cover}
.card-body{padding:36px 38px 44px}
.card .date{font-size:11px;color:${MUTED};letter-spacing:.24em;font-family:'Libre Baskerville',serif;display:block}
.card h1{margin:14px 0 28px;font-size:22px;line-height:1.7;font-weight:600;font-family:'Noto Serif JP',serif;color:${INK};letter-spacing:.04em}
.card .text{font-size:15px;line-height:2.05;white-space:pre-wrap;color:${INK_SOFT};word-break:break-word}
.back-wrap{margin-top:52px;text-align:center}
.back-btn{display:inline-block;padding:14px 36px;border:1.5px solid ${NAVY};color:${NAVY};text-decoration:none;border-radius:2px;font-size:13px;letter-spacing:.24em;font-family:'Noto Serif JP',serif;transition:all .35s}
.back-btn:hover{background:${NAVY};color:${BG}}
.produced-by{text-align:center;margin-top:64px;font-size:10px;letter-spacing:.28em;color:rgba(26,35,50,.4);text-transform:uppercase;font-family:'Libre Baskerville',serif}
.produced-by a{color:rgba(26,35,50,.6);text-decoration:none;transition:color .3s}
.produced-by a:hover{color:${GOLD}}
@media(max-width:600px){.wrap{margin:30px auto;padding:0 16px 60px}.card-body{padding:26px 22px 32px}.card h1{font-size:19px;margin:12px 0 22px}.card .text{font-size:14.5px;line-height:1.95}header a{font-size:14px;letter-spacing:.24em}.back-btn{padding:13px 28px;font-size:12px}}
</style>
</head>
<body>
<header><a href="${SITE_URL}/">${esc(STORE_NAME)}</a></header>
<div class="wrap">
<article class="card">
${imgUrl ? `<img src="${esc(imgUrl)}" alt="${esc(title)}" loading="eager">` : ''}
<div class="card-body">
${item.date ? `<span class="date">${esc(fmtDate(item.date))}</span>` : ''}
${item.title && String(item.title).trim() ? `<h1>${esc(item.title)}</h1>` : ''}
<p class="text">${esc(bodyText)}</p>
</div>
</article>
<div class="back-wrap"><a class="back-btn" href="${SITE_URL}/">← トップへ戻る</a></div>
<div class="produced-by">Produced by <a href="https://search-mania.net/" target="_blank" rel="noopener noreferrer">SearchMania Inc.</a></div>
</div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    },
  });
}

export async function onRequest(context) {
  const rawSlug = (context.params && context.params.slug) || '';
  let slug = '';
  try { slug = decodeURIComponent(rawSlug); } catch (e) { slug = rawSlug; }
  if (!slug) return renderNotFound(slug);

  try {
    /* redirect: 'manual' で 302 を捕捉 → 1 回だけ手動フォロー（GAS 無限ループ対策） */
    const first = await fetch(GAS_URL + '?blog_all=1', { redirect: 'manual' });
    let upstream = first;
    if (first.status >= 300 && first.status < 400) {
      const location = first.headers.get('location');
      if (location) upstream = await fetch(location, { redirect: 'follow' });
    }
    if (!upstream.ok) return renderNotFound(slug);
    const data = await upstream.json();
    const posts = (data && data.blog) || [];
    const item = findPost(posts, slug);
    if (!item) return renderNotFound(slug);
    return renderPost(item, slug);
  } catch (err) {
    return renderNotFound(slug);
  }
}
