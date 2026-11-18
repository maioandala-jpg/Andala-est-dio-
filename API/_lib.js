// Utilitários partilhados pelas rotas /api/*. (Ficheiros com "_" não viram rota na Vercel.)
const ENDPOINTS = [
  'https://aiplatform.googleapis.com/v1/publishers/google/models/',
  'https://generativelanguage.googleapis.com/v1beta/models/'
];

function getKeys() {
  const list = [];
  const add = v => String(v || '').split(/[,\n;]/).map(s => s.trim()).filter(Boolean).forEach(k => list.push(k));
  add(process.env.GEMINI_API_KEYS);
  add(process.env.GEMINI_API_KEY);
  for (let i = 1; i <= 10; i++) add(process.env['GEMINI_API_KEY_' + i]);
  return [...new Set(list)];
}

// Limite simples por IP (memória da instância; protege as chaves de abuso casual).
const hits = new Map();
function limited(req, max = 30, windowMs = 60000) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 500) hits.clear();
  return arr.length > max;
}

// Devolve true se o pedido já foi respondido (bloqueado).
function guard(req, res, max) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return true; }
  const allowed = String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length) {
    const o = req.headers.origin || '';
    if (o && !allowed.includes(o)) { res.status(403).json({ error: 'Origem não permitida.' }); return true; }
  }
  if (limited(req, max)) { res.status(429).json({ error: 'Muitos pedidos. Espere um minuto.' }); return true; }
  if (!getKeys().length) { res.status(500).json({ error: 'Nenhuma chave configurada na Vercel (GEMINI_API_KEYS).' }); return true; }
  return false;
}

function bodyOf(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b || {};
}

// Chama o Gemini rodando entre as chaves e os dois endpoints. `parse` extrai o resultado.
async function gemini(model, payload, parse) {
  const keys = getKeys(), erros = [];
  const start = Math.floor(Math.random() * keys.length);
  for (let n = 0; n < keys.length; n++) {
    const i = (start + n) % keys.length;
    for (const base of ENDPOINTS) {
      try {
        const r = await fetch(`${base}${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys[i] },
          body: JSON.stringify(payload)
        });
        const raw = await r.text();
        let data = null; try { data = JSON.parse(raw); } catch (e) {}
        if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + String(data?.error?.message || raw).slice(0, 160));
        return parse(data);
      } catch (e) { erros.push('chave ' + (i + 1) + ': ' + e.message); }
    }
  }
  console.error('Gemini falhou em todas as chaves:', erros.join(' | '));
  throw new Error('Nenhuma chave funcionou. ' + erros.slice(-2).join(' | '));
}

module.exports = { getKeys, guard, bodyOf, gemini };
