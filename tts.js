/* Andala estúdio.AI · função segura de voz (Vercel)
   A chave do Gemini fica SÓ aqui, nas variáveis de ambiente da Vercel.
   Variáveis: GEMINI_API_KEY (obrigatória), ACCESS_CODE (obrigatória),
              GEMINI_TTS_MODEL (opcional: gemini-3.8-flash-tts ou gemini-3.8-flash-lite-tts) */
const crypto = require('crypto');

const VOZES = new Set(['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe',
  'Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar',
  'Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat']);
const MAX_CHARS = 4500, MAX_TURNS = 200;

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
function wavDePcm(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
const txt = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido.');
  const KEY = process.env.GEMINI_API_KEY, CODE = process.env.ACCESS_CODE;
  if (!KEY || !CODE) return erro(res, 500, 'O servidor ainda não está configurado: faltam as variáveis GEMINI_API_KEY e ACCESS_CODE na Vercel.');

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') return erro(res, 400, 'Pedido inválido.');
  if (!igual(b.code || '', CODE)) return erro(res, 401, 'Código de acesso incorreto.');

  const style = txt(b.style).slice(0, 120);
  const meta = o => (style ? Object.assign(o, { style }) : o);
  let parts, speechConfig, total = 0;

  if (Array.isArray(b.turns) && Array.isArray(b.speakers)) {
    // Diálogo entre dois avatares
    if (b.speakers.length !== 2 || b.turns.length < 1 || b.turns.length > MAX_TURNS) return erro(res, 400, 'Diálogo inválido.');
    const nomes = b.speakers.map(s => txt(s && s.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 20));
    if (!nomes[0] || !nomes[1] || nomes[0] === nomes[1]) return erro(res, 400, 'Nomes de falantes inválidos.');
    if (!b.speakers.every(s => VOZES.has(s && s.voice))) return erro(res, 400, 'Voz inválida.');
    parts = [];
    for (const t of b.turns) {
      const q = txt(t && t.text), sp = txt(t && t.speaker);
      if (!q || !nomes.includes(sp)) continue;
      total += q.length;
      parts.push({ text: q, speech_metadata: meta({ speaker: sp }) });
    }
    speechConfig = { multiSpeakerVoiceConfig: { speakerVoiceConfigs: b.speakers.map((s, i) => (
      { speaker: nomes[i], voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } } })) } };
  } else {
    // Um só avatar
    const q = String(b.text == null ? '' : b.text).replace(/[ \t]+/g, ' ').trim();
    if (!q) return erro(res, 400, 'Roteiro vazio.');
    if (!VOZES.has(b.voice)) return erro(res, 400, 'Voz inválida.');
    total = q.length;
    parts = [style ? { text: q, speech_metadata: { style } } : { text: q }];
    speechConfig = { voiceConfig: { voice: b.voice } };
  }
  if (!parts.length || total < 1) return erro(res, 400, 'Roteiro vazio.');
  if (total > MAX_CHARS) return erro(res, 413, 'Roteiro muito longo para uma vez (máx. ' + MAX_CHARS + ' letras). Divida em partes.');

  const pedido = (process.env.GEMINI_TTS_MODEL || '').trim();
  const modelo = /^gemini-3\.8-[a-z-]*tts$/.test(pedido) ? pedido : 'gemini-3.8-flash-tts';
  const payload = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['AUDIO'], speechConfig } };

  let r, j;
  try {
    r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55000)
    });
    j = await r.json().catch(() => null);
  } catch (e) {
    return erro(res, 504, 'A IA demorou demais para responder. Tente de novo.');
  }
  if (!r.ok) {
    const m = txt(j && j.error && j.error.message).slice(0, 180);
    if (r.status === 429) return erro(res, 429, 'A cota da IA acabou por agora. Tente de novo daqui a pouco.');
    return erro(res, 502, 'A IA recusou o pedido (' + r.status + ').' + (m ? ' ' + m : ''));
  }
  const ps = (((j || {}).candidates || [])[0] || {}).content;
  const pa = ps && (ps.parts || []).find(p => p.inlineData || p.inline_data);
  const d = pa && (pa.inlineData || pa.inline_data);
  if (!d || !d.data) return erro(res, 502, 'A IA não devolveu áudio. Tente de novo.');

  let audio = Buffer.from(d.data, 'base64');
  if (audio.slice(0, 4).toString('latin1') !== 'RIFF') {
    const m = /rate=(\d+)/.exec(d.mimeType || d.mime_type || '');
    audio = wavDePcm(audio, m ? +m[1] : 24000);
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'no-store');
  res.end(audio);
};
