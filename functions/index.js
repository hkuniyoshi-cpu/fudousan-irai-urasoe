// GET / — 静的 index.html の各枠に、最新の動画・コラム・クチコミを初期HTMLとして差し込む
// （JS で後から描画すると、検索エンジンや AI が読む初期HTMLに記事リンクが1本も出ないため）

import {
  VIDEO_CATS, getVideos, getPosts, getReviews,
  videoCard, postCard, esc, fmtDate, ytThumb,
} from '../lib/core.js';

// キャッシュが空のときでも、この時間までは待って中身を入れる。超えたら枠の中の案内文のまま返す
const WAIT_MS = 3500;

export async function onRequest(context) {
  const res = await context.next();
  const type = res.headers.get('content-type') || '';
  if (res.status !== 200 || !type.includes('text/html')) return res;

  const [videos, posts, rev] = await Promise.all([
    getVideos(context, { waitMs: WAIT_MS }).catch(() => null),
    getPosts(context, { waitMs: WAIT_MS }).catch(() => null),
    getReviews(context, { waitMs: 0 }).catch(() => null),
  ]);

  const rw = new HTMLRewriter();
  const fill = (sel, inner) => rw.on(sel, { element(el) { el.setInnerContent(inner, { html: true }); } });

  if (videos && videos.length) {
    const f = videos[0];
    fill('#featureVideo', `<a class="feature" href="/video/${esc(f.id)}/">
<span class="feature__thumb"><img src="${ytThumb(f.id, 'hqdefault')}" alt="" width="480" height="360" fetchpriority="high"><span class="play play--lg" aria-hidden="true"></span></span>
<span class="feature__body"><span class="meta"><span class="tag">最新の動画</span><span class="tag tag--plain">${esc(f.category)}</span><time datetime="${esc(f.date)}">${esc(fmtDate(f.date))}</time></span>
<h3 class="feature__title">${esc(f.title)}</h3>
<span class="feature__desc">${esc(f.desc)}</span>
<span class="more">この動画のページへ</span></span></a>`);
    fill('#latestVideos', videos.slice(1, 7).map(v => videoCard(v)).join('\n'));
    fill('#videoCats', VIDEO_CATS.map(c => {
      const cnt = videos.filter(v => v.category === c.key).length;
      return cnt ? `<a class="theme" href="/video/?cat=${c.slug}"><strong>${esc(c.key)}</strong><small>${cnt}本</small><span>${esc(c.lead)}</span></a>` : '';
    }).join('\n'));
    fill('#videoCount', String(videos.length));
  }

  if (posts && posts.length) {
    fill('#latestPosts', posts.slice(0, 6).map(p => postCard(p)).join('\n'));
    fill('#postCount', String(posts.length));
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
