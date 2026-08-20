// POST /api/shorten  { url: "https://...", slug: "opcional" }
// -> { short: "https://seu-dominio/abc12", slug: "abc12" }

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// Palavras reservadas: nao podem virar slug (colidem com arquivos do site)
const RESERVED = ['api', 'index', 'favicon', 'admin', 'assets', 'static'];

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

function randomSlug(len = 5) {
  // sem 0/O/1/l para evitar confusao ao digitar
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }
  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Banco nao configurado' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const url = (body.url || '').trim();
    let slug = (body.slug || '').trim().toLowerCase();

    // valida a URL de destino
    if (!/^https?:\/\/.+/i.test(url)) {
      return res.status(400).json({ error: 'URL invalida' });
    }

    if (slug) {
      // slug escolhido pelo usuario
      if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
        return res.status(400).json({
          error: 'Apelido invalido: use 3 a 50 letras, numeros ou hifen'
        });
      }
      if (RESERVED.includes(slug)) {
        return res.status(409).json({ error: 'Esse apelido e reservado' });
      }
      const existing = await kv(['GET', 'l:' + slug]);
      if (existing) {
        return res.status(409).json({ error: 'Esse apelido ja esta em uso' });
      }
    } else {
      // slug aleatorio: tenta ate achar um livre
      for (let i = 0; i < 8; i++) {
        const candidate = randomSlug(i < 5 ? 5 : 6);
        const existing = await kv(['GET', 'l:' + candidate]);
        if (!existing) { slug = candidate; break; }
      }
      if (!slug) {
        return res.status(500).json({ error: 'Nao consegui gerar um codigo livre' });
      }
    }

    await kv(['SET', 'l:' + slug, url]);

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return res.status(200).json({
      slug,
      short: `${proto}://${host}/${slug}`
    });
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao criar o link' });
  }
}
