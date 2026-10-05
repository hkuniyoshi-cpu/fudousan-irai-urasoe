// GET /blog/ — コラム一覧を SSR
// 旧URL /blog/?post=SLUG は記事の正規URLへ 301

import {
  SITE_URL, SITE_SHORT, POST_CATS,
  getPosts, html, page, redirect, notFound, unavailable, postCard, pager, esc, ld,
} from '../../lib/core.js';

const PER_PAGE = 30;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!url.pathname.endsWith('/')) return redirect(`/blog/${url.search}`);

  let posts;
  try {
    posts = await getPosts(context);
  } catch (e) {
    return unavailable();
  }

  const legacy = url.searchParams.get('post');
  if (legacy) {
    const hit = posts.find(p => p.slug === legacy) || posts.find(p => p.date === legacy);
    return hit ? redirect(`/blog/${hit.slug}/`) : notFound('記事', '/blog/', 'コラム一覧');
  }

  const catParam = url.searchParams.get('cat');
  const cat = POST_CATS.find(c => c.slug === catParam) || null;
  if (catParam && !cat) return notFound('ページ', '/blog/', 'コラム一覧');
  const list = cat ? posts.filter(p => p.category === cat.key) : posts;
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const n = parseInt(url.searchParams.get('page') || '1', 10);
  const cur = Number.isFinite(n) && n >= 1 ? n : 1;
  if (cur > pages || (cat && !list.length)) return notFound('ページ', '/blog/', 'コラム一覧');

  const qs = (pg) => {
    const q = [];
    if (cat) q.push('cat=' + cat.slug);
    if (pg > 1) q.push('page=' + pg);
    return '/blog/' + (q.length ? '?' + q.join('&') : '');
  };
  const heading = cat ? `${cat.key}のコラム` : 'コラム一覧';
  const slice = list.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);

  const tabs = `<div class="chips" role="navigation" aria-label="テーマで絞り込む">
<a href="/blog/"${cat ? '' : ' aria-current="true"'}>すべて<small>${posts.length}</small></a>
${POST_CATS.map(c => {
    const cnt = posts.filter(p => p.category === c.key).length;
    return cnt ? `<a href="/blog/?cat=${c.slug}"${cat === c ? ' aria-current="true"' : ''}>${esc(c.key)}<small>${cnt}</small></a>` : '';
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
      'itemListElement': slice.map((p, i) => ({
        '@type': 'ListItem',
        'position': (cur - 1) * PER_PAGE + i + 1,
        'url': `${SITE_URL}/blog/${p.slug}/`,
        'name': p.title,
      })),
    },
  };

  const main = `<header class="list-head">
<p class="eyebrow">COLUMN</p>
<h1>${esc(heading)}</h1>
<p class="list-head__lead">相続した実家のこと、査定や相場の調べ方、ご来店のご案内など、店舗スタッフからのお知らせとコラムです。</p>
<p class="list-head__count">全 ${list.length} 件（新しい順）${pages > 1 ? `・${cur} / ${pages} ページ` : ''}</p>
</header>
${tabs}
<div class="grid grid--3">${slice.map((p, i) => postCard(p, i < 3)).join('\n')}</div>
${pager(cur, pages, qs)}
<p class="back"><a class="btn btn--line" href="/video/">動画一覧も見る</a></p>`;

  return html(page({
    title: `${heading}${cur > 1 ? `（${cur}ページ目）` : ''}｜${SITE_SHORT}`,
    desc: cat
      ? `${SITE_SHORT}の「${cat.key}」に関するコラム一覧（全${list.length}件）。`
      : `${SITE_SHORT}のコラム一覧（全${list.length}件）。相続した実家、査定や相場の調べ方、ご来店のご案内など、沖縄・浦添の不動産会社からのお知らせです。`,
    canonical: SITE_URL + qs(cur),
    // テーマ絞り込みは全件一覧の部分集合なので検索結果には出さない（リンクは辿らせる）
    noindex: !!cat,
    nav: 'blog',
    head: ld(listLd),
    breadcrumb: `<a href="/">ホーム</a><span>›</span>${cat ? `<a href="/blog/">コラム</a><span>›</span>${esc(cat.key)}` : 'コラム'}`,
    main,
  }));
}
