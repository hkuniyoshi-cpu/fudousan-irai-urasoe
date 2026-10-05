// GET /sitemap.xml — 動画とコラムの一覧から動的生成。載せるのは「200・index可・正規URL」だけ
// 動画ページには動画サイトマップ用のタグも付ける

import { SITE_URL, VIDEO_CATS, getVideos, getPosts, ytThumb } from '../lib/core.js';

const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function onRequest(context) {
  let videos, posts;
  try {
    [videos, posts] = await Promise.all([getVideos(context), getPosts(context)]);
  } catch (e) {
    // 中身を落とした不完全なサイトマップを 200 で返すと Google が URL を見失うので 503 にする
    return new Response('sitemap temporarily unavailable', {
      status: 503,
      headers: { 'retry-after': '600', 'cache-control': 'no-store' },
    });
  }

  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">',
  ];
  const add = (loc, lastmod, extra) => {
    out.push('  <url>', `    <loc>${x(SITE_URL + loc)}</loc>`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(lastmod || '')) out.push(`    <lastmod>${lastmod}</lastmod>`);
    if (extra) out.push(extra);
    out.push('  </url>');
  };

  const latestVideo = videos[0] && videos[0].date;
  const latestPost = posts[0] && posts[0].date;
  const latest = [latestVideo, latestPost].filter(Boolean).sort().pop();

  add('/', latest);
  add('/blog/', latestPost);
  for (const p of posts) add(`/blog/${encodeURIComponent(p.slug)}/`, p.date);

  add('/video/', latestVideo);
  for (const c of VIDEO_CATS) {
    const first = videos.find(v => v.category === c.key);
    if (first) add(`/video/?cat=${c.slug}`, first.date);
  }
  for (const v of videos) {
    add(`/video/${v.id}/`, v.date, [
      '    <video:video>',
      `      <video:thumbnail_loc>${x(ytThumb(v.id, 'hqdefault'))}</video:thumbnail_loc>`,
      `      <video:title>${x(v.title.slice(0, 100))}</video:title>`,
      `      <video:description>${x(v.desc)}</video:description>`,
      `      <video:player_loc>${x('https://www.youtube.com/embed/' + v.id)}</video:player_loc>`,
      v.iso ? `      <video:publication_date>${x(v.iso)}</video:publication_date>` : '',
      '    </video:video>',
    ].filter(Boolean).join('\n'));
  }

  out.push('</urlset>');
  return new Response(out.join('\n'), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=1800',
      'x-robots-tag': 'noindex',
    },
  });
}
