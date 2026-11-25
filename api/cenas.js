/* Andala estúdio.AI · Vídeo ilustrado (Vercel)
   Dois modos, no mesmo endereço (usa as mesmas chaves e o mesmo failover do tts/direct):
     { modo:'roteiro', tema, n, idioma, sons }                          -> { titulo, linhas[], paleta, personagem }
     { modo:'cena', linha, indice, total, estilo, paleta, personagem,
       tema, anterior, refPersonagem }                                  -> { svg }
   O desenho é feito em SVG (código): não usa modelo de imagens, por isso não tem custo extra.
   Variáveis: GEMINI_API_KEY(_2,_3), ACCESS_CODE (opcional), GEMINI_TEXT_MODEL (opcional). */
const crypto = require('crypto');
const { chamar, chaves, textoErro, modeloTexto } = require('./_gemini.js');

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
const cut = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').slice(0, n);

const ESTILOS = {
  c: 'STYLE = FLAT CARTOON: solid colors, rounded shapes, no heavy black outlines, at most 2 subtle gradients per scene, soft shadows as darker translucent shapes, friendly proportions.',
  p: 'STYLE = PIXEL ART: simulate a 90x160 grid where each pixel is an 8x8 rect (merge equal neighbours into wider rects), shape-rendering="crispEdges", fixed palette of at most 12 colors, no gradients except one glow, no curves, dithering allowed with checker rects, 1 pixel outlines. (Exception to the element limit: up to 140 elements.)',
  a: 'STYLE = SIMPLE ANIME: large expressive eyes with a white highlight, hair made of 2 to 4 layered shapes with strands, cell-shading with ONE shadow tone per area, soft gradient sky, fake depth of field with translucent circles, vibrant harmonious colors.'
};
const PLANOS = [
  'wide establishing shot (character small, environment big)',
  'medium shot (waist up, centered)',
  'close-up on the face or on the key object',
  'high angle looking down at the subject',
  'low angle looking up at the subject',
  'medium shot with the subject on the left third and a key object on the right third',
  'close-up on a key object with the character partly visible',
  'wide shot with strong depth (foreground, middle, far background)'
];

const SISTEMA_CENA = `ROLE: You are "Andala Imagem", a senior 2D illustrator and motion-graphics art director who draws ONE finished scene directly as SVG code for a vertical short video. The SVG must look intentional, clean and professional, like a flat-design editorial illustration, never like a random pile of shapes.

OUTPUT FORMAT (strict): answer with ONE <svg ...>...</svg> block and nothing else. No explanation, no markdown fences.

TECHNICAL RULES (must obey):
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280">. Never use width/height attributes on the svg.
- Allowed elements ONLY: svg, defs, g, rect, circle, ellipse, line, polyline, polygon, path, linearGradient, radialGradient, stop, clipPath. Forbidden: text, tspan, use, mask, pattern, filter, image, foreignObject, script, style, animate*, any external reference. Never draw letters or numbers.
- Allowed attributes: id, d, points, x, y, width, height, rx, ry, cx, cy, r, x1, y1, x2, y2, fill, fill-rule, fill-opacity, stroke, stroke-width, stroke-linecap, stroke-linejoin, opacity, offset, stop-color, stop-opacity, gradientUnits, clip-path, shape-rendering, transform (translate, rotate, scale only). No style attribute, no class.
- The scene has exactly these four top-level groups, in this order, with these ids:
  <g id="fundo">      sky, wall, floor, far shapes, big soft light gradients
  <g id="meio">       furniture, buildings, props, mid-ground
  <g id="personagem"> the main character or main subject (empty group if the scene has none)
  <g id="frente">     foreground objects, soft vignette, light particles (circles with low opacity)
- The studio moves these groups at different speeds (parallax) and zooms slowly. So "fundo" and "meio" MUST bleed 80px beyond the canvas on every side (x from -80 to 800, y from -80 to 1360). Never leave an edge visible.
- Each group must be self-contained: nothing in "personagem" may depend on a shape of another group to look complete.
- Between 40 and 90 elements. Merge shapes into paths when possible. No tiny noise.
- Numbers with at most 1 decimal. Close every tag. Valid XML.
- Define every gradient inside <defs> with ids prefixed by the scene number (g{N}_sky...). Ids must be unique.

COMPOSITION RULES:
- Safe zones: main subject between y=300 and y=1000, horizontally within x 120 to 600. The top (0 to 250) and bottom (1050 to 1280) stay calm (large simple shapes, low contrast) because captions and interface sit there.
- One clear focal point, with the highest contrast and the warmest color.
- Three depth layers (background, middle, foreground). Rule of thirds. Strong, readable silhouettes.
- One light direction: warm key light, cool fill. Soft glow with a radialGradient fading to opacity 0, never with filters.

EMOTION AND STORY RULE: illustrate the MEANING of the line, not only its words. For abstract ideas use a visual metaphor (locked door = block, rising staircase = progress, clock = urgency) and show the character reacting. No decoration that does not help understanding. One character and one key object per scene; avoid crowds and fast action.

QUALITY CHECK (silently, before answering): valid XML, only allowed elements and attributes; four groups with the right ids, in order; fundo and meio bleed 80px past the canvas; subject inside the safe zone; palette and character identical to the bible; the requested camera shot; obvious focal point; no text, letters or numbers drawn anywhere. If a check fails, fix it before answering.

SAFETY: no real people, celebrities, existing cartoon or anime characters, logos, brands or copyrighted scenes. Invent original characters only.`;

const SISTEMA_ROTEIRO = `You write narration scripts for vertical short videos (TikTok, Reels, Shorts) with very high retention.
Rules: the first line is a strong hook (max 12 words) that creates curiosity or a clear promise; every line is ONE spoken sentence of at most 18 words, easy to say aloud, no hashtags, no emojis, no stage directions; build tension, then a reveal, then a practical takeaway; the last line is a short call to action. Never invent statistics or scientific claims; if unsure, speak in general terms. One line = one illustrated scene, so each line must be easy to picture.
You also propose ONE original main character (a visual bible: age, face shape, hair, clothes with exact colors, in one short English paragraph) and a palette of 6 to 7 hex colors with names (in English, one line) that fit the topic and the mood.
Answer ONLY with JSON, no markdown: {"titulo":"...","linhas":["..."],"paleta":"#hex name, #hex name, ...","personagem":"..."}`;

const CODIGOS = `Also add silent audio cue codes at the start of the lines where they help retention, using ONLY: [sfx:hit] [sfx:whoosh] [sfx:pop] [sfx:riser] [sfx:ding] [sfx:error] [sfx:success] [sfx:tick] [sfx:heartbeat] [sfx:swipe] [sfx:camera] [sfx:sparkle] [pause:0.4] [music:calm|tense|uplift|epic|warm|none] [voice:slow|fast|whisper|excited|serious]. Rules: a strong cue ([sfx:hit] or [sfx:riser]) on line 1; at most one sound effect every 4 to 6 seconds; a reveal follows the pattern [sfx:riser] [pause:0.4] then the line; [sfx:error] for myths and mistakes, [sfx:success] or [sfx:ding] for solutions; set [music:...] on line 1 and change it only when the topic changes; end with [sfx:sparkle]. The codes are never spoken.`;

const temTexto = x => { const c = (((x || {}).candidates || [])[0] || {}).content; return !!(c && (c.parts || []).some(q => q && q.text)); };
function textoDe(json) {
  const cand = ((json || {}).candidates || [])[0] || {};
  return ((cand.content && cand.content.parts) || []).map(p => (p && p.text) || '').join('').trim();
}

async function roteiro(b, res) {
  const tema = cut(b.tema, 400).trim();
  if (tema.length < 3) return erro(res, 400, 'Escreva o tema do vídeo.');
  const n = Math.max(4, Math.min(16, parseInt(b.n, 10) || 10));
  const idioma = cut(b.idioma || 'português', 30).replace(/[^\p{L} -]/gu, '') || 'português';
  const user = 'Topic: ' + tema + '\nNarration language: ' + idioma + '\nNumber of lines (scenes): ' + n + (b.sons ? '\n' + CODIGOS : '');
  const payload = {
    systemInstruction: { parts: [{ text: SISTEMA_ROTEIRO }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 3000 }
  };
  const out = await chamar(modeloTexto(), payload, temTexto, true);
  if (!out.ok) return erro(res, out.tipo === 'cota' ? 429 : out.tipo === 'tempo' ? 504 : 502, textoErro(out));
  let t = textoDe(out.json);
  const f = /```[a-z]*\n([\s\S]*?)```/i.exec(t);
  if (f) t = f[1].trim();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  let o = null;
  try { o = JSON.parse(t.slice(i, j + 1)); } catch (e) { o = null; }
  const linhas = o && Array.isArray(o.linhas) ? o.linhas.map(x => cut(x, 400).trim()).filter(Boolean) : [];
  if (linhas.length < 3) return erro(res, 502, 'A IA não devolveu um roteiro válido. Tente de novo.');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({
    titulo: cut(o.titulo, 120), linhas: linhas.slice(0, 16),
    paleta: cut(o.paleta, 400), personagem: cut(o.personagem, 900)
  }));
}

async function cena(b, res) {
  const linha = cut(b.linha, 500).trim();
  if (!linha) return erro(res, 400, 'Falta a frase da cena.');
  const idx = Math.max(0, parseInt(b.indice, 10) || 0), total = Math.max(1, parseInt(b.total, 10) || 1);
  const estilo = ESTILOS[b.estilo] ? b.estilo : 'c';
  const paleta = cut(b.paleta, 500) || '#1b1f4b night blue, #6b3fa0 violet, #ff9f43 warm orange, #ffd27a light yellow, #f5c9a0 skin, #2b2b3a dark ink, #ffffff';
  const sem = !!b.semPersonagem;
  const pers = sem
    ? 'NO human character in this scene. This is an ILLUSTRATIVE INSERT shown between moments of a talking presenter: draw the key object, symbol or visual metaphor of the line BIG in the center, inside the "personagem" group (that group holds the main subject).'
    : (cut(b.personagem, 1000) || 'Original young character, round head, short dark hair, simple friendly face, orange sweater.');
  const ref = sem ? '' : cut(b.refPersonagem, 7000);
  const plano = PLANOS[idx % PLANOS.length];
  const user = [
    'Draw scene ' + (idx + 1) + ' of ' + total + ' (use ids g' + (idx + 1) + '_...).',
    'Topic of the video: ' + cut(b.tema, 300),
    'Narration line of this scene (illustrate its meaning): ' + linha,
    b.anterior ? 'Previous line (for continuity only): ' + cut(b.anterior, 300) : '',
    'CAMERA SHOT for this scene: ' + plano + '.',
    ESTILOS[estilo],
    'PALETTE LOCK (only these colors plus lighter/darker versions): ' + paleta,
    'CHARACTER BIBLE (exact shapes, sizes and colors every time): ' + pers,
    ref ? 'REFERENCE CHARACTER GROUP from scene 1. Reuse its exact shapes, proportions and colors for the character (only change pose, expression, position and scale to fit this shot):\n' + ref : ''
  ].filter(Boolean).join('\n\n');
  const payload = {
    systemInstruction: { parts: [{ text: SISTEMA_CENA }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 9000 }
  };
  const out = await chamar(modeloTexto(), payload, temTexto, true);
  if (!out.ok) return erro(res, out.tipo === 'cota' ? 429 : out.tipo === 'tempo' ? 504 : 502, textoErro(out));
  res.setHeader('X-Andala-Chave', out.chave + '/' + out.total);
  const t = textoDe(out.json);
  const m = /<svg[\s\S]*<\/svg>/i.exec(t);
  if (!m || m[0].length > 120000) return erro(res, 502, 'A IA não devolveu um desenho válido. Tente de novo.');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ svg: m[0] }));
}


async function momentos(b, res) {
  const linhas = Array.isArray(b.linhas) ? b.linhas.slice(0, 60).map(x => cut(x, 300)) : [];
  const n = Math.max(2, Math.min(8, parseInt(b.n, 10) || 4));
  if (linhas.length < 6) return erro(res, 400, 'Roteiro curto demais para escolher momentos.');
  const sistema = 'You edit short vertical videos with a talking presenter. Viewers get bored during long explanations, so you choose which narration lines deserve a full-screen illustrative image for a few seconds before returning to the presenter. Choose lines that are explanations, abstract ideas, examples, lists, comparisons or numbers (things that are easy to picture). NEVER choose index 0 or 1 (the hook), the last two lines (call to action), or two neighbouring lines. Spread the choices evenly across the video. Answer ONLY with JSON, no markdown: {"indices":[...]} with 0-based indices, ascending.';
  const user = 'Choose exactly ' + n + ' lines.\n' + linhas.map((l, i) => i + ': ' + l.replace(/\*/g, '')).join('\n');
  const payload = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 300 }
  };
  const out = await chamar(modeloTexto(), payload, temTexto, true);
  if (!out.ok) return erro(res, out.tipo === 'cota' ? 429 : out.tipo === 'tempo' ? 504 : 502, textoErro(out));
  const t = textoDe(out.json), i = t.indexOf('{'), j = t.lastIndexOf('}');
  let o = null;
  try { o = JSON.parse(t.slice(i, j + 1)); } catch (e) { o = null; }
  let idx = o && Array.isArray(o.indices) ? o.indices.map(x => parseInt(x, 10)).filter(x => x >= 2 && x <= linhas.length - 3) : [];
  idx = Array.from(new Set(idx)).sort((a, b) => a - b).filter((x, k, a) => k === 0 || x - a[k - 1] > 1).slice(0, n);
  if (!idx.length) return erro(res, 502, 'A IA não escolheu momentos válidos.');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ indices: idx }));
}

async function tratar(req, res) {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido.');
  if (!chaves().length) return erro(res, 500, 'O servidor ainda não tem chave do Gemini: crie GEMINI_API_KEY na Vercel e faça Redeploy.');
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') return erro(res, 400, 'Pedido inválido.');
  const CODE = process.env.ACCESS_CODE;
  if (CODE && !igual(b.code || '', CODE)) return erro(res, 401, 'Código de acesso incorreto.');
  if (b.modo === 'roteiro') return roteiro(b, res);
  if (b.modo === 'cena') return cena(b, res);
  if (b.modo === 'momentos') return momentos(b, res);
  return erro(res, 400, 'Modo inválido.');
}

module.exports = async (req, res) => {
  try { await tratar(req, res); }
  catch (e) {
    console.error('cenas.js falhou:', e);
    if (!res.headersSent) erro(res, 500, 'Erro interno no servidor: ' + String((e && e.message) || e).slice(0, 220));
  }
};
module.exports.config = { maxDuration: 60 };
