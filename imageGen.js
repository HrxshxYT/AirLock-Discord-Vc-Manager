// imageGen.js — the cute pixel-sky banner with chunky "bitmap" bold text.
//
// Same trick as the Python version: render text small, then upscale it with
// image smoothing OFF so the edges stay blocky (true pixel-art look) instead of
// being anti-aliased.

const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const BASE_DIR = __dirname;
const BASE_PIC = path.join(BASE_DIR, 'base pic.jpg');

const INK = 'rgb(120,78,110)';       // muted plum text body
const OUTLINE = 'rgb(255,255,255)';  // white pixel outline
const SHADOW = 'rgba(214,150,190,0.55)'; // pink drop shadow
const PIXEL_SCALE = 5;               // chunkier = bigger

// Register a monospace-ish font (nicer for the blocky look). Falls back to the
// bundled sans-serif if none of these exist — the pixelation comes from the
// upscale either way.
let FONT_FAMILY = 'sans-serif';
for (const f of [
  path.join(BASE_DIR, 'font.ttf'),
  '/System/Library/Fonts/Supplemental/Courier New Bold.ttf',
  '/System/Library/Fonts/Menlo.ttc',
]) {
  if (fs.existsSync(f)) {
    try {
      GlobalFonts.registerFromPath(f, 'PixelFont');
      FONT_FAMILY = 'PixelFont';
      break;
    } catch { /* keep looking */ }
  }
}

function sanitize(text) {
  let out = '';
  for (const ch of String(text || '')) {
    const code = ch.codePointAt(0);
    if (code >= 0x20 && code <= 0x7e) out += ch;      // printable ASCII
    else if ('✦✧★☆♡♥'.includes(ch)) out += '*';       // decorations -> star
    // everything else (emoji etc.) dropped
  }
  return out.trim();
}

// render text tiny, blow it up with smoothing off => crunchy bitmap pixels
function renderPixelText(text, smallPx) {
  const tmp = createCanvas(10, 10).getContext('2d');
  tmp.font = `bold ${smallPx}px ${FONT_FAMILY}`;
  const w = Math.max(1, Math.ceil(tmp.measureText(text).width)) + 4;
  const h = Math.ceil(smallPx * 1.5) + 4;

  const small = createCanvas(w, h);
  const s = small.getContext('2d');
  s.font = `bold ${smallPx}px ${FONT_FAMILY}`;
  s.textBaseline = 'middle';
  s.lineJoin = 'round';
  s.strokeStyle = OUTLINE;
  s.lineWidth = 2;
  s.strokeText(text, 2, h / 2);
  s.fillStyle = INK;
  s.fillText(text, 2, h / 2);

  const big = createCanvas(w * PIXEL_SCALE, h * PIXEL_SCALE);
  const b = big.getContext('2d');
  b.imageSmoothingEnabled = false;
  b.drawImage(small, 0, 0, big.width, big.height);
  return big;
}

// Returns a PNG Buffer of the banner (title + optional subtitle).
async function makeBanner(title, subtitle = null) {
  const base = await loadImage(BASE_PIC);
  const W = base.width;
  const H = base.height;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  const t = (sanitize(title) || 'voice').slice(0, 22).toUpperCase();
  let titleImg = renderPixelText(t, 14);

  // scale the title down if it would overflow
  let tw = titleImg.width;
  let th = titleImg.height;
  const maxW = Math.floor(W * 0.86);
  if (tw > maxW) {
    const ratio = maxW / tw;
    tw = maxW;
    th = Math.max(1, Math.floor(th * ratio));
  }

  const tx = Math.floor((W - tw) / 2);
  const ty = subtitle ? Math.floor(H * 0.30) : Math.floor(H * 0.36);

  // hard pink drop shadow, then the title
  ctx.save();
  ctx.shadowColor = SHADOW;
  ctx.shadowOffsetX = PIXEL_SCALE;
  ctx.shadowOffsetY = PIXEL_SCALE;
  ctx.shadowBlur = 0;
  ctx.drawImage(titleImg, tx, ty, tw, th);
  ctx.restore();

  const sub = subtitle ? sanitize(subtitle) : null;
  if (sub) {
    let subImg = renderPixelText(sub.slice(0, 34), 8);
    let sw = subImg.width;
    let sh = subImg.height;
    const maxSW = Math.floor(W * 0.7);
    if (sw > maxSW) {
      const ratio = maxSW / sw;
      sw = maxSW;
      sh = Math.max(1, Math.floor(sh * ratio));
    }
    const sx = Math.floor((W - sw) / 2);
    const sy = ty + th + PIXEL_SCALE * 2;
    ctx.drawImage(subImg, sx, sy, sw, sh);
  }

  return canvas.encode('png');
}

module.exports = { makeBanner };

// quick local preview:  node imageGen.js
if (require.main === module) {
  makeBanner('moon lounge', '* a cozy little vc *').then((buf) => {
    fs.writeFileSync(path.join(BASE_DIR, '_preview.png'), buf);
    console.log('wrote _preview.png');
  });
}
