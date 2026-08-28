const GAS_URL = 'https://script.google.com/macros/s/AKfycbxiMWI1-y7MkJqd6v1A0G97YQlgO2cL77CcVZNKQVTijQnTuBQjsDE9q6caCmrZmKWmjA/exec';

/* Cloudflare の redirect: 'follow' は GAS の /exec → /macros/echo のチェーンで
   稀に無限ループする（cf.cache と組合わせると顕在化）。
   redirect: 'manual' で 302 だけ捕捉し 1 回だけ手動フォローする */
async function fetchGas(url) {
  const first = await fetch(url, { redirect: 'manual' });
  if (first.status >= 300 && first.status < 400) {
    const location = first.headers.get('location');
    if (location) {
      return fetch(location, { redirect: 'follow' });
    }
  }
  return first;
}

export async function onRequest(context) {
  try {
    const upstream = await fetchGas(GAS_URL + '?sitemap=1');
    if (!upstream.ok) {
      return new Response('<!-- upstream error: ' + upstream.status + ' -->', {
        status: 502,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }
    const xml = await upstream.text();
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (err) {
    return new Response('<!-- sitemap fetch failed: ' + (err && err.message || err) + ' -->', {
      status: 500,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
}
