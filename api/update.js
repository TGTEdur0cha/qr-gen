// POST /api/update  { slug, url?, name? }  — troca destino e/ou nome de um link existente
// Header: x-admin-password
// -> { ok: true, slug, url?, name? }

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
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const slug = (body.slug || '').trim().toLowerCase();
    const hasUrl = typeof body.url === 'string';
    const hasName = typeof body.name === 'string';
    const url = hasUrl ? body.url.trim() : '';
    const name = hasName ? body.name.trim().slice(0, 80) : '';

    if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
      return res.status(400).json({ error: 'Apelido invalido' });
    }
    if (!hasUrl && !hasName) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }
    if (hasUrl && !/^https?:\/\/.+/i.test(url)) {
      return res.status(400).json({ error: 'URL invalida — precisa comecar com http:// ou https://' });
    }

    // so atualiza link que ja existe: evita criar por engano com um erro de digitacao
    const existing = await kv(['GET', 'l:' + slug]);
    if (!existing) {
      return res.status(404).json({ error: 'Esse apelido nao existe' });
    }

    const out = { ok: true, slug };

    if (hasUrl && url !== existing) {
      await kv(['SET', 'l:' + slug, url]);
      // guarda o destino anterior, caso precise voltar atras
      await kv(['SET', 'p:' + slug, existing]);
      out.url = url;
      out.previous = existing;
    }

    if (hasName) {
      if (name) await kv(['SET', 'n:' + slug, name]);
      else await kv(['DEL', 'n:' + slug]);
      out.name = name;
    }

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao atualizar o link' });
  }
}
