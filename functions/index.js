// GET / — 静的 index.html の各枠に、最新のコラム・クチコミ・動画を初期HTMLとして差し込む
// （JS で後から描画すると、検索エンジンや AI が読む初期HTMLに記事リンクが1本も出ないため）
// 主役は浦添本店のコラム。動画は「動画でもお伝えしています」として3本だけ添える

import {
  POST_CATS, getVideos, getPosts, getReviews,
  videoCard, postCard, esc, fmtDate, driveImg,
} from '../lib/core.js';

// キャッシュが空のときでも、この時間までは待って中身を入れる。超えたら枠の中の案内文のまま返す
const WAIT_MS = 3500;

export async function onRequest(context) {
  const res = await context.next();
  const type = res.headers.get('content-type') || '';
  if (res.status !== 200 || !type.includes('text/html')) return res;

  const [posts, videos, rev] = await Promise.all([
    getPosts(context, { waitMs: WAIT_MS }).catch(() => null),
    getVideos(context, { waitMs: 0 }).catch(() => null),
    getReviews(context, { waitMs: 0 }).catch(() => null),
  ]);

  const rw = new HTMLRewriter();
  const fill = (sel, inner) => rw.on(sel, { element(el) { el.setInnerContent(inner, { html: true }); } });

  if (posts && posts.length) {
    const f = posts[0];
    const img = driveImg(f.image, 1200);
    fill('#featurePost', `<a class="feature" href="/blog/${esc(f.slug)}/">
<span class="feature__thumb feature__thumb--photo">${img ? `<img src="${esc(img)}" alt="" width="1200" height="750" fetchpriority="high">` : ''}</span>
<span class="feature__body"><span class="meta"><span class="tag">最新のコラム</span><span class="tag tag--plain">${esc(f.category)}</span><time datetime="${esc(f.date)}">${esc(fmtDate(f.date))}</time></span>
<h3 class="feature__title">${esc(f.title)}</h3>
<span class="feature__desc">${esc(f.desc)}</span>
<span class="more">このコラムを読む</span></span></a>`);
    fill('#latestPosts', posts.slice(1, 7).map(p => postCard(p)).join('\n'));
    fill('#postCats', POST_CATS.map(c => {
      const cnt = posts.filter(p => p.category === c.key).length;
      return cnt ? `<a class="theme" href="/blog/?cat=${c.slug}"><strong>${esc(c.key)}</strong><small>${cnt}件</small><span>${esc(c.lead)}</span></a>` : '';
    }).join('\n'));
    fill('#postCount', String(posts.length));
  }

  if (videos && videos.length) {
    fill('#latestVideos', videos.slice(0, 3).map(v => videoCard(v)).join('\n'));
  }

  if (rev && rev.reviews.length) {
    const cards = rev.reviews.slice(0, 5).map(r => `<figure class="review">
<p class="review__stars" aria-label="5点中${r.stars}点">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</p>
<blockquote>${esc(r.text)}</blockquote>
<figcaption>${esc(r.name)}${r.date ? `<time datetime="${esc(r.date)}">${esc(fmtDate(r.date))}</time>` : ''}</figcaption>
</figure>`).join('\n');
    rw.on('#reviews', { element(el) { el.removeAttribute('hidden'); } });
    fill('#reviewList', cards);
    if (/^https?:\/\//.test(rev.gbpUrl)) {
      rw.on('#reviewsMore', { element(el) { el.setAttribute('href', rev.gbpUrl); } });
    }
  }

  const out = rw.transform(res);
  const headers = new Headers(out.headers);
  headers.set('cache-control', 'public, max-age=600');
  return new Response(out.body, { status: out.status, headers });
}
