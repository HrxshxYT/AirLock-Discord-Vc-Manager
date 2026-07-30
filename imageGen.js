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

// draw an image to "cover" a box (scale + center-crop, like CSS object-fit:cover)
function drawCover(ctx, img, dx, dy, dw, dh) {
  const scale = Math.max(dw / img.width, dh / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A full aesthetic help "card": pink-sky header with a bitmap title, then a soft
// translucent panel listing the commands in the monospace pixel font.
// sections: [{ name: 'VOICE', lines: ['/setup  ...', ...] }, ...]
async function makeHelpCard({ title = 'AIRLOCK', subtitle = '* help menu *', sections = [] }) {
  const W = 1000;
  const headerH = 300;
  const padX = 52;
  const headH = 40;   // section header line height
  const lineH = 30;   // command line height

  // measure needed height
  let bodyH = 34;
  for (const s of sections) {
    bodyH += headH + s.lines.length * lineH + 30;
  }
  const footerH = 64;
  const H = headerH + bodyH + footerH;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // soft pink -> lavender background gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f9c7e0');
  g.addColorStop(1, '#efd8f3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // sky header
  const base = await loadImage(BASE_PIC);
  drawCover(ctx, base, 0, 0, W, headerH);

  // bitmap title over the header (with pink drop shadow)
  ctx.imageSmoothingEnabled = false;
  const titleImg = renderPixelText((sanitize(title) || 'AIRLOCK').toUpperCase().slice(0, 20), 16);
  let tw = titleImg.width, th = titleImg.height;
  const maxTW = Math.floor(W * 0.8);
  if (tw > maxTW) { const r = maxTW / tw; tw = maxTW; th = Math.floor(th * r); }
  const tx = Math.floor((W - tw) / 2);
  const ty = Math.floor(headerH * 0.30);
  ctx.save();
  ctx.shadowColor = SHADOW; ctx.shadowOffsetX = PIXEL_SCALE; ctx.shadowOffsetY = PIXEL_SCALE; ctx.shadowBlur = 0;
  ctx.drawImage(titleImg, tx, ty, tw, th);
  ctx.restore();

  const sub = sanitize(subtitle);
  if (sub) {
    const subImg = renderPixelText(sub.slice(0, 34), 8);
    let sw = subImg.width, sh = subImg.height;
    const maxSW = Math.floor(W * 0.6);
    if (sw > maxSW) { const r = maxSW / sw; sw = maxSW; sh = Math.floor(sh * r); }
    ctx.drawImage(subImg, Math.floor((W - sw) / 2), ty + th + PIXEL_SCALE * 2, sw, sh);
  }

  // translucent panel for the command list
  const cardX = 30, cardY = headerH - 22, cardW = W - 60, cardH = H - cardY - 18;
  roundRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.74)';
  ctx.fill();

  // command text (monospace, so columns align nicely)
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let y = cardY + 34;
  for (const s of sections) {
    ctx.font = `bold 23px ${FONT_FAMILY}`;
    ctx.fillStyle = '#c05a97';
    ctx.fillText(s.name, cardX + padX, y);
    y += headH;
    ctx.font = `16px ${FONT_FAMILY}`;
    ctx.fillStyle = '#5c4a58';
    for (const line of s.lines) {
      ctx.fillText(line, cardX + padX + 8, y);
      y += lineH;
    }
    y += 30;
  }

  // footer
  ctx.font = `15px ${FONT_FAMILY}`;
  ctx.fillStyle = '#a96b8c';
  ctx.textAlign = 'center';
  ctx.fillText('* AirLock * be kind, stay cozy *', W / 2, H - 40);

  return canvas.encode('png');
}

module.exports = { makeBanner, makeHelpCard };

// quick local preview:  node imageGen.js
if (require.main === module) {
  const demo = [
    { name: 'VOICE', lines: [
      '/setup             build the join-to-create hub  (admin)',
      'join the hub       get your own vc + control panel',
      '/allow @user       let a friend into your vc  (owner)',
      'panel              lock, limit, rename, status, permit,',
      '                   reject, claim, delete',
    ] },
    { name: 'MODERATION', lines: [
      '/kick @user        remove a member       (Kick Members)',
      '/ban  @user        ban a member          (Ban Members)',
      '/quarantine @user  isolate someone       (Manage Roles)',
      '/unquarantine      release them',
      '/block @user       voice-ban  ·  /unblock  lift it',
    ] },
    { name: 'EXTRAS', lines: [
      'bump reminders     pings 2h after each DISBOARD bump',
      '/help              this menu',
    ] },
  ];
  makeHelpCard({ title: 'AIRLOCK', subtitle: '* help menu *', sections: demo }).then((buf) => {
    fs.writeFileSync(path.join(BASE_DIR, '_preview.png'), buf);
    console.log('wrote _preview.png');
  });
}
