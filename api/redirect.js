// GET /:slug  (via rewrite em vercel.json) -> redireciona ao destino

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(['GET', key])
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  const slug = (req.query.slug || '').toLowerCase();

  if (!slug || !KV_URL || !KV_TOKEN) {
    res.setHeader('Location', '/');
    return res.status(302).end();
  }

  const url = await kvGet('l:' + slug);

  if (!url) {
    // nao encontrado: manda pra home em vez de mostrar erro feio
    res.setHeader('Location', '/');
    return res.status(302).end();
  }

  // conta o acesso (nao bloqueia o redirect se falhar)
  fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(['INCR', 'c:' + slug])
  }).catch(function () {});

  // 302 = temporario, permite trocar o destino depois
  res.setHeader('Location', url);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(302).end();
}
