// Vercel Function · POST /api/tts  → voz com Gemini TTS. As chaves ficam só na Vercel.
// Variáveis: GEMINI_API_KEYS (obrigatória) · GEMINI_TTS_MODEL · ALLOWED_ORIGINS (opcionais)
const { guard, bodyOf, gemini } = require('./_lib');
const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICES = new Set(['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat']);
const MAX_CHARS = 1500;

module.exports = async (req, res) => {
  if (guard(req, res, 60)) return;
  const b = bodyOf(req);
  const text = String(b.text || '').trim();
  const voice = VOICES.has(b.voice) ? b.voice : 'Kore';
  const style = String(b.style || '').trim().slice(0, 160);
  if (!text) return res.status(400).json({ error: 'Texto vazio.' });
  if (text.length > MAX_CHARS) return res.status(400).json({ error: 'Texto muito longo (máx. ' + MAX_CHARS + ' caracteres por pedido).' });
  try {
    const out = await gemini(MODEL, {
      contents: [{ role: 'user', parts: [{ text: (style ? style + ': ' : '') + text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
    }, data => {
      const part = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
      if (!part) throw new Error('Resposta sem áudio');
      const m = /rate=(\d+)/.exec(part.inlineData.mimeType || '');
      return { audio: part.inlineData.data, sampleRate: m ? +m[1] : 24000 };
    });
    return res.status(200).json(out);
  } catch (e) { return res.status(502).json({ error: e.message }); }
};
