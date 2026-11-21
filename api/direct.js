/* Andala estúdio.AI · Diretor (Vercel)
   Recebe um pedido ("vídeo sobre Maquiavel, 45s") e devolve um prompt ANDALA-PROMPT v1
   completo (roteiro, cenários, figurino, avatar) que o motor do estúdio já entende.
   Variáveis: GEMINI_API_KEY, ACCESS_CODE (opcional), GEMINI_TEXT_MODEL (opcional, padrão gemini-3.8-flash) */
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
   
