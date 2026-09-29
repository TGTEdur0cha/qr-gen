// POST /api/list  — lista todos os links criados
// Header: x-admin-password
// -> { links: [{ slug, url, clicks, created }] }

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function kv(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) throw new Error('KV error ' + res.status);
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }
  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Banco nao configurado' });
  }
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Senha de admin nao configurada no servidor' });
  }

  const sent = req.headers['x-admin-password'] || '';
  if (!safeEqual(sent, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }

  try {
    // varre todas as chaves de link
    const slugs = [];
    let cursor = '0';
    let guard = 0;
    do {
      const out = await kv(['SCAN', cursor, 'MATCH', 'l:*', 'COUNT', 200]);
      cursor = String(out[0]);
      for (const key of out[1] || []) slugs.push(String(key).slice(2));
      guard++;
    } while (cursor !== '0' && guard < 50);

    if (!slugs.length) return res.status(200).json({ links: [] });

    // busca destinos, cliques e datas em 3 chamadas
    const urls = await kv(['MGET', ...slugs.map(s => 'l:' + s)]);
    const clicks = await kv(['MGET', ...slugs.map(s => 'c:' + s)]);
    const created = await kv(['MGET', ...slugs.map(s => 't:' + s)]);

    const links = slugs.map((slug, i) => ({
      slug,
      url: urls[i] || '',
      clicks: Number(clicks[i] || 0),
      created: created[i] ? Number(created[i]) : null
    }));

    // mais recentes primeiro; sem data vai pro fim
    links.sort((a, b) => (b.created || 0) - (a.created || 0));

    return res.status(200).json({ links });
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao listar os links' });
  }
}
