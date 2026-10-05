// GET /video/{動画ID}/ — 動画1本ぶんのページを SSR
// 再生プレーヤー・概要欄の全文・VideoObject 構造化データ・前後/関連動画を初期HTMLに出す

import {
  SITE_URL, SITE_NAME, SITE_SHORT, AUTHOR_NAME, YT_CHANNEL_URL, YT_CHANNEL_NAME, VIDEO_CATS,
  getVideos, getVideo, html, page, redirect, notFound, unavailable,
  videoCard, ctaBox, authorBox, esc, fmtDate, ld, ytThumb, ytWatch,
} from '../../lib/core.js';
import { renderProse } from '../../lib/prose.js';

// サムネイルをクリックしたときだけ YouTube のプレーヤーを読み込む（初期表示を軽くする）。
// 高解像度のサムネイルが在る動画だけ差し替える（無い動画は 120px の灰色画像が返るので幅で見分ける）
const PLAYER_JS = `<script>
(function(){
  var a=document.querySelector('.player__link');if(!a)return;
  var id=a.getAttribute('data-yt'),img=a.querySelector('img');
  var hi=new Image();hi.onload=function(){if(hi.naturalWidth>320)img.src=hi.src;};
  hi.src='https://i.ytimg.com/vi/'+id+'/maxresdefault.jpg';
  a.addEventListener('click',function(e){
    e.preventDefault();
    var f=document.createElement('iframe');
    f.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0';
    f.title=img.alt;f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.allowFullscreen=true;f.referrerPolicy='strict-origin-when-cross-origin';
    a.parentNode.replaceChild(f,a);
  });
})();
</script>`;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  let id;
  try {
    id = decodeURIComponent(String(context.params.id || '')).trim();
  } catch (e) {
    id = '';
  }
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return notFound('動画', '/video/', '動画一覧');
  if (!url.pathname.endsWith('/')) return redirect(`/video/${id}/`);

  let video, list;
  try {
    [video, list] = await Promise.all([getVideo(context, id), getVideos(context).catch(() => [])]);
  } catch (e) {
    // 取得できないときは「一時的な障害」と伝える（404 にすると検索結果から外れてしまう）
    return unavailable();
  }
  if (!video) return notFound('動画', '/video/', '動画一覧');
  return html(render(video, list || []));
}

function render(v, list) {
  const canonical = `${SITE_URL}/video/${v.id}/`;
  const cat = VIDEO_CATS.find(c => c.key === v.category);
  const i = list.findIndex(x => x.id === v.id);
  const newer = i > 0 ? list[i - 1] : null;
  const older = i >= 0 ? list[i + 1] : null;
  const related = list
    .filter(x => x.id !== v.id && x !== newer && x !== older)
    .map(x => ({ x, same: x.category === v.category ? 0 : 1, dist: Math.abs(list.indexOf(x) - (i < 0 ? 0 : i)) }))
    .sort((a, b) => a.same - b.same || a.dist - b.dist)
    .slice(0, 6).map(r => r.x);

  const article = v.article ? renderProse(v.article, { heading: 'h2' }) : null;
  const body = renderProse(v.description, { heading: article ? 'h3' : 'h2' });
  const chapters = body.chapters;

  const [y, m, d] = v.date.split('-').map(Number);
  const dateJa = v.date ? `${y}年${m}月${d}日` : '';

  const videoLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    '@id': canonical + '#video',
    'name': v.title,
    'description': v.desc,
    'thumbnailUrl': [ytThumb(v.id, 'hqdefault'), ytThumb(v.id, 'mqdefault')],
    'embedUrl': `https://www.youtube.com/embed/${v.id}`,
    'contentUrl': ytWatch(v.id),
    'inLanguage': 'ja',
    'author': { '@type': 'Person', '@id': `${SITE_URL}/#author`, 'name': AUTHOR_NAME },
    'publisher': { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, 'name': SITE_NAME },
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonical },
  };
  if (v.iso) videoLd.uploadDate = v.iso;
  if (v.tags.length) videoLd.keywords = v.tags.join(', ');
  if (chapters.length > 1) {
    videoLd.hasPart = chapters.map((c, k) => {
      const clip = { '@type': 'Clip', 'name': c.text, 'startOffset': c.seconds, 'url': `${ytWatch(v.id)}&t=${c.seconds}s` };
      if (chapters[k + 1]) clip.endOffset = chapters[k + 1].seconds;
      return clip;
    });
  }
  const crumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'ホーム', 'item': `${SITE_URL}/` },
      { '@type': 'ListItem', 'position': 2, 'name': '動画', 'item': `${SITE_URL}/video/` },
      { '@type': 'ListItem', 'position': 3, 'name': v.title, 'item': canonical },
    ],
  };

  const notice = v.category === '物件紹介'
    ? `<p class="notice">この動画は${dateJa}に公開したものです。価格や販売状況は公開時点の内容で、現在は変更・成約済みの場合があります。最新の状況は公式サイトまたはお電話でご確認ください。</p>`
    : '';

  const main = `<article class="article">
<header class="article__head">
<p class="meta">${cat ? `<a class="tag" href="/video/?cat=${cat.slug}">${esc(cat.key)}</a>` : ''}${v.date ? `<time datetime="${esc(v.iso)}">${esc(fmtDate(v.date))} 公開</time>` : ''}</p>
<h1>${esc(v.title)}</h1>
</header>
<div class="player${v.short ? ' player--short' : ''}"><a class="player__link" href="${ytWatch(v.id)}" target="_blank" rel="noopener" data-yt="${esc(v.id)}"><img src="${ytThumb(v.id, 'hqdefault')}" alt="${esc(v.title)}" width="480" height="360" fetchpriority="high"><span class="play play--lg" aria-hidden="true"></span><span class="player__hint">動画を再生する</span></a></div>
${notice}
${article ? `<section class="prose">${article.html}</section>\n<h2 class="sub-head">動画の概要欄より</h2>` : ''}
${chapters.length ? `<section class="chapters"><h2 class="sub-head">この動画の目次</h2><ol>${chapters.map(c => `<li><a href="${ytWatch(v.id)}&t=${c.seconds}s" target="_blank" rel="noopener">${esc(c.time)}</a>${esc(c.text)}</li>`).join('')}</ol></section>` : ''}
<section class="prose">${body.html || `<p>${esc(v.title)}</p>`}</section>
${v.tags.length ? `<ul class="tags" aria-label="この動画のキーワード">${v.tags.slice(0, 14).map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
<p class="yt-links"><a class="btn btn--line" href="${ytWatch(v.id)}" target="_blank" rel="noopener">YouTubeで見る</a><a class="btn btn--line" href="${YT_CHANNEL_URL}?sub_confirmation=1" target="_blank" rel="noopener">「${YT_CHANNEL_NAME}」を登録する</a></p>
${ctaBox()}
${authorBox()}
</article>
<nav class="prevnext" aria-label="前後の動画">
${older ? `<a href="/video/${esc(older.id)}/"><small>← 前の動画</small>${esc(older.title)}</a>` : '<span></span>'}
${newer ? `<a class="next" href="/video/${esc(newer.id)}/"><small>次の動画 →</small>${esc(newer.title)}</a>` : '<span></span>'}
</nav>
${related.length ? `<section class="related"><h2 class="sec-title">あわせて見たい動画</h2><div class="grid grid--3">${related.map(x => videoCard(x)).join('\n')}</div></section>` : ''}
<p class="back"><a class="btn btn--line" href="/video/">動画一覧へ</a></p>`;

  return page({
    title: `${v.title}｜${SITE_SHORT}`,
    ogTitle: v.title,
    desc: v.desc,
    canonical,
    image: ytThumb(v.id, 'hqdefault'),
    ogType: 'video.other',
    nav: 'video',
    narrow: true,
    head: `${v.iso ? `<meta property="article:published_time" content="${esc(v.iso)}">\n` : ''}${ld(videoLd)}\n${ld(crumbLd)}`,
    breadcrumb: `<a href="/">ホーム</a><span>›</span><a href="/video/">動画</a><span>›</span>${esc(v.title)}`,
    main,
    foot: PLAYER_JS,
  });
}
