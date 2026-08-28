const GAS_URL = 'https://script.google.com/macros/s/AKfycbxiMWI1-y7MkJqd6v1A0G97YQlgO2cL77CcVZNKQVTijQnTuBQjsDE9q6caCmrZmKWmjA/exec';

export async function onRequest(context) {
  try {
    const upstream = await fetch(GAS_URL + '?sitemap=1', {
      redirect: 'follow',
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
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
