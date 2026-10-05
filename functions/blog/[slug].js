// GET /blog/{slug}/ — コラム1記事を SSR（本文・構造化データ・前後/関連記事・関連動画を初期HTMLに出す）

import {
  SITE_URL, SITE_NAME, SITE_SHORT, POST_CATS,
  getPosts, getPost, getVideos, html, page, redirect, notFound, unavailable,
  postCard, videoCard, ctaBox, esc, fmtDate, ld, driveImg,
} from '../../lib/core.js';
import { renderProse } from '../../lib/prose.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  let slug;
  try {
    slug = decodeURIComponent(String(context.params.slug || '')).trim();
  } catch (e) {
    slug = '';
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug)) return notFound('記事', '/blog/', 'コラム一覧');

  let posts;
  try {
    posts = await getPosts(context);
  } catch (e) {
    // 取得できないときは「一時的な障害」と伝える（404 や別URLへの転送にしない）
    return unavailable();
  }

  const i = posts.findIndex(p => p.slug === slug);
  if (i === -1) {
    // 旧形式（日付だけのURL）はその日の記事へ寄せる
    const byDate = posts.find(p => p.date === slug);
    return byDate ? redirect(`/blog/${byDate.slug}/`) : notFound('記事', '/blog/', 'コラム一覧');
  }
  if (!url.pathname.endsWith('/')) return redirect(`/blog/${slug}/`);

  let post, videos;
  try {
    [post, videos] = await Promise.all([
      getPost(context, slug),
      getVideos(context, { waitMs: 1500 }).catch(() => null),
    ]);
  } catch (e) {
    return unavailable();
  }
  if (!post) return notFound('記事', '/blog/', 'コラム一覧');
  return html(render(posts, i, post, videos || []));
}

function pickRelated(posts, i) {
  const self = posts[i];
  const seen = new Set([self.title]);
  return posts
    .map((p, j) => (j === i || Math.abs(j - i) === 1 ? null : { p, same: p.category === self.category ? 0 : 1, dist: Math.abs(j - i) }))
    .filter(Boolean)
    .sort((a, b) => a.same - b.same || a.dist - b.dist)
    .map(x => x.p)
    // 同じ題名の記事が複数あるので、見た目が重複しないようにする
    .filter(p => (seen.has(p.title) ? false : (seen.add(p.title), true)))
    .slice(0, 3);
}

function render(posts, i, post, videos) {
  const canonical = `${SITE_URL}/blog/${post.slug}/`;
  const img = driveImg(post.image, 1200);
  const cat = POST_CATS.find(c => c.key === post.category);
  const newer = posts[i - 1];
  const older = posts[i + 1];
  const related = pickRelated(posts, i);
  const body = renderProse(post.body, { heading: 'h2' });

  const postLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    'headline': post.title,
    'description': post.desc,
    'image': img || `${SITE_URL}/ogp.png`,
    'author': { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, 'name': SITE_NAME, 'url': `${SITE_URL}/` },
    'publisher': { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, 'name': SITE_NAME },
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonical },
    'inLanguage': 'ja',
    'isPartOf': { '@id': `${SITE_URL}/#website` },
  };
  if (post.iso) { postLd.datePublished = post.iso; postLd.dateModified = post.iso; }
  if (cat) postLd.articleSection = cat.key;
  const crumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'ホーム', 'item': `${SITE_URL}/` },
      { '@type': 'ListItem', 'position': 2, 'name': 'コラム', 'item': `${SITE_URL}/blog/` },
      { '@type': 'ListItem', 'position': 3, 'name': post.title, 'item': canonical },
    ],
  };

  const main = `<article class="article">
<header class="article__head">
<p class="meta">${cat ? `<a class="tag" href="/blog/?cat=${cat.slug}">${esc(cat.key)}</a>` : ''}${post.date ? `<time datetime="${esc(post.iso || post.date)}">${esc(fmtDate(post.date))}</time>` : ''}</p>
<h1>${esc(post.title)}</h1>
</header>
${img ? `<p class="article__img"><img src="${esc(img)}" alt="" width="1200" height="800" fetchpriority="high"></p>` : ''}
<section class="prose">${body.html}</section>
${ctaBox()}
</article>
<nav class="prevnext" aria-label="前後の記事">
${older ? `<a href="/blog/${esc(older.slug)}/"><small>← 前の記事</small>${esc(older.title)}</a>` : '<span></span>'}
${newer ? `<a class="next" href="/blog/${esc(newer.slug)}/"><small>次の記事 →</small>${esc(newer.title)}</a>` : '<span></span>'}
</nav>
${related.length ? `<section class="related"><h2 class="sec-title">あわせて読みたいコラム</h2><div class="grid grid--3">${related.map(p => postCard(p)).join('\n')}</div></section>` : ''}
${videos.length ? `<section class="related"><h2 class="sec-title">動画でもお伝えしています</h2><div class="grid grid--3">${videos.slice(0, 3).map(v => videoCard(v)).join('\n')}</div></section>` : ''}
<p class="back"><a class="btn btn--line" href="/blog/">コラム一覧へ</a></p>`;

  return page({
    title: `${post.title}｜${SITE_SHORT}`,
    ogTitle: post.title,
    desc: post.desc,
    canonical,
    image: img,
    ogType: 'article',
    nav: 'blog',
    narrow: true,
    head: `${post.iso ? `<meta property="article:published_time" content="${esc(post.iso)}">\n` : ''}${ld(postLd)}\n${ld(crumbLd)}`,
    breadcrumb: `<a href="/">ホーム</a><span>›</span><a href="/blog/">コラム</a><span>›</span>${esc(post.title)}`,
    main,
  });
}
