/* Andala estúdio.AI · chamada ao Gemini com troca automática de chave.
   Lê TODAS as chaves das variáveis da Vercel cujo nome começa com GEMINI_API_KEY ou GEMINI_KEY
   (ex.: GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, GEMINI_API_KEYS="a,b,c").
   Se uma chave falhar (cota, chave inválida, erro do servidor, demora, resposta vazia),
   passa na hora para a próxima. Erro do próprio pedido (400) não troca de chave. */
const FRIO = new Map(); // chave -> até quando evitar (só enquanto a instância estiver ativa)

function chaves() {
  const nomes = Object.keys(process.env).filter(n => /^GEMINI_(API_)?KEYS?(_.*|\d*)$/i.test(n))
    .sort((a, b) => {
      const na = (a.match(/(\d+)\s*$/) || [0, 1])[1], nb = (b.match(/(\d+)\s*$/) || [0, 1])[1];
      return (+na - +nb) || a.localeCompare(b);
    });
  const out = [];
  for (const n of nomes) {
    String(process.env[n] || '').split(/[\s,;]+/).forEach(v => {
      v = v.replace(/^["']|["']$/g, '').trim();
      if (v.length >= 20 && !out.includes(v)) out.push(v);
    });
  }
  return out;
}
const frio = k => (FRIO.get(k) || 0) > Date.now();
const esfria = (k, ms) => FRIO.set(k, Date.now() + ms);

/* aceita(json) -> true se a resposta serve (ex.: tem áudio); senão tenta a próxima chave. */
async function chamar(modelo, payload, aceita) {
  const ks = chaves();
  if (!ks.length) return { ok: false, tipo: 'semchave', total: 0 };
  const fim = Date.now() + 55000;
  const ordem = ks.slice().sort((a, b) => (frio(a) ? 1 : 0) - (frio(b) ? 1 : 0) || ks.indexOf(a) - ks.indexOf(b));
  let ult = { tipo: 'tempo', status: 504, msg: '' };
  for (let n = 0; n < ordem.length; n++) {
    const k = ordem[n], resta = fim - Date.now();
    if (resta < 3000) break;
    const lim = n === ordem.length - 1 ? resta : Math.min(resta, 22000);
    let r, j;
    try {
      r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(lim)
      });
      j = await r.json().catch(() => null);
    } catch (e) { ult = { tipo: 'tempo', status: 504, msg: '' }; esfria(k, 15000); continue; }
    if (r.ok) {
      if (aceita && !aceita(j)) { ult = { tipo: 'vazio', status: 502, msg: '' }; continue; }
      return { ok: true, json: j, chave: ks.indexOf(k) + 1, total: ks.length };
    }
    const msg = String((j && j.error && j.error.message) || '').replace(/\s+/g, ' ').slice(0, 180);
    if (r.status === 401 || r.status === 403 || (r.status === 400 && /api key|api_key|key not valid|key expired/i.test(msg))) {
      ult = { tipo: 'chave', status: r.status, msg }; esfria(k, 600000); continue;
    }
    if (r.status === 429) { ult = { tipo: 'cota', status: 429, msg }; esfria(k, 60000); continue; }
    if (r.status >= 500) { ult = { tipo: 'servidor', status: r.status, msg }; esfria(k, 10000); continue; }
    return { ok: false, tipo: 'pedido', status: r.status, msg, chave: ks.indexOf(k) + 1, total: ks.length };
  }
  return Object.assign({ ok: false, total: ks.length, todas: true }, ult);
}

/* Mensagem em português para quando a chamada falhou. */
function textoErro(o) {
  const t = (o.todas && o.total > 1) ? 'Tentei as ' + o.total + ' chaves. ' : '';
  if (o.tipo === 'semchave') return 'O servidor ainda não tem chave do Gemini: crie GEMINI_API_KEY na Vercel.';
  if (o.tipo === 'cota') return t + 'A cota da IA acabou por agora. Tente de novo daqui a pouco.';
  if (o.tipo === 'chave') return t + 'Nenhuma chave da IA está funcionando. Confira as chaves na Vercel.';
  if (o.tipo === 'tempo') return t + 'A IA demorou demais para responder. Tente de novo.';
  if (o.tipo === 'vazio') return t + 'A IA não devolveu o resultado. Tente de novo.';
  return t + 'A IA recusou o pedido (' + o.status + ').' + (o.msg ? ' ' + o.msg : '');
}
module.exports = { chamar, chaves, textoErro };
