// Vercel Function · POST /api/roteiro  → a IA escreve o roteiro (uma frase por linha) a partir de um tema.
// Variáveis: GEMINI_API_KEYS (obrigatória) · GEMINI_TEXT_MODEL (opcional, padrão gemini-2.5-flash)
const { guard, bodyOf, gemini } = require('./_lib');
const MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

const SISTEMA = `És roteirista de vídeos verticais curtos (9:16) que prendem a atenção até ao fim.
Escreve SÓ o texto narrado, no idioma do tema (padrão: português do Brasil), sem títulos, sem numeração, sem emojis, sem markdown.
Regras de formato (obrigatórias):
- Uma frase curta por linha (máx. ~14 palavras), linguagem falada e simples.
- Linha 1 = gancho forte (pergunta, afirmação chocante ou promessa) que faz parar o dedo. Comece essa linha com "!".
- Envolva a palavra-chave de uma frase em *asteriscos* (no máx. uma por linha, em cerca de metade das linhas).
- Desenvolva em 3 a 5 ideias claras, com exemplo concreto ou mini-história, e termine com uma frase de fecho memorável ou pergunta ao público.
- Se o tema indicar duração, respeita-a; senão, cerca de 45 segundos (≈ 110 palavras).
- Se o tema indicar uma pessoa/personagem a explicar algo, escreve como ela falaria, sem inventar citações literais.
- Não incluas nada além das linhas do roteiro.`;

function limpa(t) {
  return String(t || '').replace(/```[a-z]*/gi, '').split('\n')
    .map(l => l.replace(/^\s*(?:[-•]|\d+[.)])\s+/, '').replace(/^\s*#+\s*/, '').trim())
    .filter(Boolean).join('\n');
}

module.exports = async (req, res) => {
  if (guard(req, res, 20)) return;
  const b = bodyOf(req);
  const tema = String(b.tema || '').trim().slice(0, 600);
  const canal = String(b.canal || '').trim().slice(0, 40);
  if (!tema) return res.status(400).json({ error: 'Escreva o tema do vídeo.' });
  try {
    const script = await gemini(MODEL, {
      systemInstruction: { parts: [{ text: SISTEMA }] },
      contents: [{ role: 'user', parts: [{ text: 'Tema: ' + tema + (canal ? '\nCanal: ' + canal : '') }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 1200 }
    }, data => {
      const t = limpa(data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n'));
      if (t.split('\n').length < 3) throw new Error('Roteiro vazio');
      return t;
    });
    return res.status(200).json({ script });
  } catch (e) { return res.status(502).json({ error: e.message }); }
};
