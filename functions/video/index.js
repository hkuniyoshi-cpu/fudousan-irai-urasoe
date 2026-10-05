// GET /video/ — 動画一覧を SSR（全動画への通常の <a href> を初期HTMLに出す）

import {
  SITE_URL, SITE_SHORT, YT_CHANNEL_NAME, VIDEO_CATS,
  getVideos, html, page, redirect, notFound, unavailable, videoCard, pager, esc, ld,
} from '../../lib/core.js';

const PER_PAGE = 24;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!url.pathname.endsWith('/')) return redirect(`/video/${url.search}`);

  let videos;
  try {
    videos = await getVideos(context);
  } catch (e) {
    return unavailable();
  }

  const catParam = url.searchParams.get('cat');
  const cat = VIDEO_CATS.find(c => c.slug === catParam) || null;
  if (catParam && !cat) return notFound('ページ', '/video/', '動画一覧');
  const list = cat ? videos.filter(v => v.category === cat.key) : videos;
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const n = parseInt(url.searchParams.get('page') || '1', 10);
  const cur = Number.isFinite(n) && n >= 1 ? n : 1;
  if (cur > pages || (cat && !list.length)) return notFound('ページ', '/video/', '動画一覧');

  const qs = (pg) => {
    const q = [];
    if (cat) q.push('cat=' + cat.slug);
    if (pg > 1) q.push('page=' + pg);
    return '/video/' + (q.length ? '?' + q.join('&') : '');
  };
  const heading = cat ? `${cat.key}の動画` : '動画一覧';
  const lead = cat
    ? cat.lead
    : `コラムとあわせてご覧いただける動画です。不動産の依頼所の公式YouTube「${YT_CHANNEL_NAME}」から、物件紹介・査定の考え方・沖縄移住などを掲載しています。`;
  const slice = list.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);

  // 0本のテーマにはリンクを張らない（空ページへクローラーを誘導しない）
  const tabs = `<div class="chips" role="navigation" aria-label="テーマで絞り込む">
<a href="/video/"${cat ? '' : ' aria-current="true"'}>すべて<small>${videos.length}</small></a>
${VIDEO_CATS.map(c => {
    const cnt = videos.filter(v => v.category === c.key).length;
    return cnt ? `<a href="/video/?cat=${c.slug}"${cat === c ? ' aria-current="true"' : ''}>${esc(c.key)}<small>${cnt}</small></a>` : '';
  }).join('\n')}
</div>`;

  const listLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': heading,
    'url': SITE_URL + qs(cur),
    'inLanguage': 'ja',
    'isPartOf': { '@id': `${SITE_URL}/#website` },
    'mainEntity': {
      '@type': 'ItemList',
      'itemListElement': slice.map((v, i) => ({
        '@type': 'ListItem',
        'position': (cur - 1) * PER_PAGE + i + 1,
        'url': `${SITE_URL}/video/${v.id}/`,
        'name': v.title,
      })),
    },
  };

  const main = `<header class="list-head">
<p class="eyebrow">VIDEO</p>
<h1>${esc(heading)}</h1>
<p class="list-head__lead">${esc(lead)}</p>
<p class="list-head__count">全 ${list.length} 本（新しい順）${pages > 1 ? `・${cur} / ${pages} ページ` : ''}</p>
</header>
${tabs}
<div class="grid grid--3">${slice.map((v, i) => videoCard(v, i < 3)).join('\n')}</div>
${pager(cur, pages, qs)}
<p class="back"><a class="btn btn--line" href="/blog/">コラム一覧へ</a></p>`;

  return html(page({
    title: `${heading}${cur > 1 ? `（${cur}ページ目）` : ''}｜${SITE_SHORT}`,
    desc: cat
      ? `${SITE_SHORT}の「${cat.key}」の動画一覧（全${list.length}本）。${cat.lead}`
      : `${SITE_SHORT}の動画一覧（全${list.length}本）。公式YouTube「${YT_CHANNEL_NAME}」の物件紹介・査定・沖縄移住の動画を、概要欄の内容とあわせて掲載しています。`,
    canonical: SITE_URL + qs(cur),
    nav: 'video',
    head: ld(listLd),
    breadcrumb: `<a href="/">ホーム</a><span>›</span>${cat ? `<a href="/video/">動画</a><span>›</span>${esc(cat.key)}` : '動画'}`,
    main,
  }));
}
