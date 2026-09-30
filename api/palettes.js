// Paletas de cor compartilhadas pela agencia
// GET    /api/palettes            -> { palettes: [{ id, name, colors, created }] }
// POST   /api/palettes { name, colors } -> { palette }
// PUT    /api/palettes?id=xxx { name?, colors? } -> { palette }
// DELETE /api/palettes?id=xxx     -> { ok: true }
//
// colors = { dot, bg, bgAlpha, cornerSquare, cornerDot }

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'palettes';
const MAX_PALETTES = 200;
const HEX = /^#[0-9a-f]{6}$/i;

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

function cleanColors(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {
    dot: String(c.dot || ''),
    bg: String(c.bg || ''),
    cornerSquare: String(c.cornerSquare || ''),
    cornerDot: String(c.cornerDot || ''),
    bgAlpha: Math.round(Number(c.bgAlpha))
  };
  if (![out.dot, out.bg, out.cornerSquare, out.cornerDot].every(v => HEX.test(v))) return null;
  if (!Number.isFinite(out.bgAlpha) || out.bgAlpha < 0 || out.bgAlpha > 100) return null;
  out.dot = out.dot.toLowerCase();
  out.bg = out.bg.toLowerCase();
  out.cornerSquare = out.cornerSquare.toLowerCase();
  out.cornerDot = out.cornerDot.toLowerCase();
  return out;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default async function handler(req, res) {
  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Banco nao configurado' });
  }

  try {
    if (req.method === 'GET') {
      // HGETALL devolve [campo1, valor1, campo2, valor2, ...]
      const flat = (await kv(['HGETALL', KEY])) || [];
      const palettes = [];
      for (let i = 0; i < flat.length; i += 2) {
        try {
          const p = JSON.parse(flat[i + 1]);
          palettes.push(p);
        } catch (e) { /* ignora registro corrompido */ }
      }
      palettes.sort((a, b) => (a.created || 0) - (b.created || 0));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ palettes });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const name = String(body.name || '').trim().slice(0, 40);
      const colors = cleanColors(body.colors);
      if (!name) return res.status(400).json({ error: 'Dê um nome pra paleta' });
      if (!colors) return res.status(400).json({ error: 'Cores invalidas' });

      const count = Number(await kv(['HLEN', KEY])) || 0;
      if (count >= MAX_PALETTES) {
        return res.status(409).json({ error: 'Limite de paletas atingido — exclua alguma antes' });
      }

      const palette = { id: newId(), name, colors, created: Date.now() };
      await kv(['HSET', KEY, palette.id, JSON.stringify(palette)]);
      return res.status(200).json({ palette });
    }

    if (req.method === 'PUT') {
      const id = String((req.query && req.query.id) || '').trim();
      if (!/^[a-z0-9]{4,30}$/.test(id)) return res.status(400).json({ error: 'id invalido' });
      const raw = await kv(['HGET', KEY, id]);
      if (!raw) return res.status(404).json({ error: 'Essa paleta nao existe mais' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const palette = JSON.parse(raw);
      if (typeof body.name === 'string') {
        const name = body.name.trim().slice(0, 40);
        if (!name) return res.status(400).json({ error: 'Dê um nome pra paleta' });
        palette.name = name;
      }
      if (body.colors !== undefined) {
        const colors = cleanColors(body.colors);
        if (!colors) return res.status(400).json({ error: 'Cores invalidas' });
        palette.colors = colors;
      }
      palette.updated = Date.now();
      await kv(['HSET', KEY, id, JSON.stringify(palette)]);
      return res.status(200).json({ palette });
    }

    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '').trim();
      if (!/^[a-z0-9]{4,30}$/.test(id)) return res.status(400).json({ error: 'id invalido' });
      await kv(['HDEL', KEY, id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Metodo nao suportado' });
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao acessar as paletas' });
  }
}
