/* Andala estúdio.AI · Diretor (Vercel)
   Recebe um pedido ("vídeo sobre Maquiavel, 45s") e devolve um prompt ANDALA-PROMPT v1
   completo (roteiro, cenários, figurino, avatar) que o motor do estúdio já entende.
   Variáveis: GEMINI_API_KEY, ACCESS_CODE (opcional), GEMINI_TEXT_MODEL (opcional, padrão gemini-2.5-flash) */
const crypto = require('crypto');
const MANUAL = require('./_manual.js');
const { chamar, chaves, textoErro } = require('./_gemini.js');

function erro(res, status, msg) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ erro: msg }));
}
function igual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido.');
  const CODE = process.env.ACCESS_CODE;
  if (!chaves().length) return erro(res, 500, 'O servidor ainda não tem chave do Gemini: crie GEMINI_API_KEY na Vercel e faça Redeploy.');
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') return erro(res, 400, 'Pedido inválido.');
  if (CODE && !igual(b.code || '', CODE)) return erro(res, 401, 'Código de acesso incorreto.'); // ACCESS_CODE é opcional

  const pedido = String(b.pedido == null ? '' : b.pedido).trim();
  if (pedido.length < 3) return erro(res, 400, 'Escreva o que você quer no vídeo.');
  if (pedido.length > 3000) return erro(res, 413, 'O pedido está muito longo (máx. 3000 letras).');
  const avatar = /^[\p{L} ]{1,20}$/u.test(b.avatar || '') ? String(b.avatar) : '';

  const pm = (process.env.GEMINI_TEXT_MODEL || '').trim();
  const modelo = /^gemini-[0-9.]+-(flash|pro)(-lite)?$/.test(pm) ? pm : 'gemini-2.5-flash';
  const user = 'PEDIDO DO USUÁRIO:\n' + pedido + (avatar ? '\n\nAvatar escolhido pelo usuário: ' + avatar + ' (use no campo avatar).' : '');
  const payload = {
    systemInstruction: { parts: [{ text: MANUAL }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 6000 }
  };

  const temTexto = x => { const c = (((x || {}).candidates || [])[0] || {}).content; return !!(c && (c.parts || []).some(q => q && q.text)); };
  const out = await chamar(modelo, payload, temTexto);
  if (!out.ok) return erro(res, out.tipo === 'cota' ? 429 : out.tipo === 'tempo' ? 504 : 502, textoErro(out));
  res.setHeader('X-Andala-Chave', out.chave + '/' + out.total);
  const cand = ((out.json || {}).candidates || [])[0] || {};
  let t = ((cand.content && cand.content.parts) || []).map(p => (p && p.text) || '').join('').trim();
  const f = /```[a-z]*\n([\s\S]*?)```/i.exec(t);
  if (f) t = f[1].trim();
  const i = t.search(/^#ANDALA v1/im);
  if (i < 0) return erro(res, 502, 'A IA não devolveu um prompt válido. Tente de novo.');
  t = t.slice(i).trim();
  if (!/^\[roteiro\]\s*$/im.test(t) || t.length > 14000) return erro(res, 502, 'A IA devolveu um prompt incompleto. Tente de novo.');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ prompt: t }));
};

/* duração máxima da função (a IA pode levar até 1 minuto) */
module.exports.config = { maxDuration: 60 };
