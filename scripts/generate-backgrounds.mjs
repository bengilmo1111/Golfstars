#!/usr/bin/env node
/**
 * Generate the illustrated background WebP assets from text-only SVG sources.
 * This keeps the repo free of committed binary image files while still producing
 * the exact runtime filenames expected by the game.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const W = 1920;
const H = 1080;

function hillPath(base, amp, layer) {
  const pts = [`M 0 ${H}`];
  for (let x = 0; x <= W; x += 24) {
    const theta = (Math.PI * 2 * x) / W;
    const y = base + Math.sin(theta * (2 + layer) + layer * 0.8) * amp + Math.sin(theta * (5 + layer) + 1.3) * amp * 0.22;
    pts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  pts.push(`L ${W} ${H} Z`);
  return pts.join(' ');
}

function cloud(x, y, s, fill, opacity = 1) {
  const parts = [
    [-1.2, 0.25, 0.9, 0.5],
    [-0.45, 0, 0.75, 0.58],
    [0.35, -0.1, 0.9, 0.65],
    [1.05, 0.22, 0.7, 0.48]
  ];
  return `<g fill="${fill}" opacity="${opacity}">${parts.map(([bx, by, rx, ry]) => `<ellipse cx="${x + bx * s}" cy="${y + by * s}" rx="${rx * s}" ry="${ry * s}"/>`).join('')}</g>`;
}

function hills(colors, bases) {
  return colors.map((color, i) => `<path d="${hillPath(bases[i], [50, 42, 34][i], i)}" fill="${color}"/>`).join('\n');
}

function stars() {
  let seed = 4;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  }
  let out = '';
  for (let i = 0; i < 80; i++) {
    const x = 170 + Math.floor(rand() * (W - 340));
    const y = 55 + Math.floor(rand() * 515);
    const r = [2, 2, 3, 4][Math.floor(rand() * 4)];
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#f5f5d2"/>`;
  }
  return `<g opacity="0.95">${out}</g>`;
}

function bunting() {
  const colors = ['#ffd23f', '#ff5d8f', '#39d3c0', '#ffb36b'];
  let out = '';
  for (const yoff of [145, 210]) {
    const pts = [];
    for (let x = 180; x < W - 160; x += 80) {
      const theta = (Math.PI * 2 * x) / W;
      pts.push([x, yoff + Math.sin(theta * 2) * 28]);
    }
    out += `<polyline points="${pts.map(([x, y]) => `${x},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#ffe6be" stroke-width="5" stroke-linecap="round"/>`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x, y] = pts[i];
      const [nx, ny] = pts[i + 1];
      const mx = (x + nx) / 2;
      const my = (y + ny) / 2 + 4;
      out += `<polygon points="${mx - 16},${my.toFixed(1)} ${mx + 16},${my.toFixed(1)} ${mx},${(my + 42).toFixed(1)}" fill="${colors[i % colors.length]}"/>`;
    }
  }
  return `<g>${out}</g>`;
}

function svg({ id, top, bottom, body }) {
  return `<!doctype svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs><linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky-${id})"/>
  ${body}
</svg>`;
}

const backgrounds = [
  ['bg-sunny-range.webp', svg({ id: 'sunny', top: '#8fd6ff', bottom: '#d7f2ff', body: `${cloud(520, 170, 58, '#fff', 0.72)}${cloud(1120, 245, 48, '#fff', 0.64)}${cloud(1450, 125, 38, '#fff', 0.58)}${hills(['#b7e2b2', '#8fcd8e', '#6bb26f'], [720, 800, 875])}` })],
  ['bg-sunset-hills.webp', svg({ id: 'sunset', top: '#ffb36b', bottom: '#ffe0a3', body: `<circle cx="960" cy="595" r="140" fill="#ffd270" opacity="0.38"/>${cloud(620, 210, 45, '#ffeec9', 0.55)}${cloud(1320, 185, 60, '#ffe7be', 0.50)}${hills(['#bb8063', '#885e5e', '#5f4a5b'], [740, 820, 900])}` })],
  ['bg-chaos-carnival.webp', svg({ id: 'carnival', top: '#b48cff', bottom: '#ffd0f0', body: `${bunting()}<circle cx="960" cy="790" r="180" fill="#ffcb72" opacity="0.28"/>${cloud(500, 270, 44, '#ffe8ff', 0.48)}${cloud(1350, 300, 42, '#ffe6f5', 0.45)}${hills(['#ae87c3', '#8870b1', '#5c5891'], [750, 835, 915])}` })],
  ['bg-moonlight-madness.webp', svg({ id: 'moon', top: '#2b3a6b', bottom: '#5b6bb0', body: `${stars()}<circle cx="1332" cy="212" r="92" fill="#f8f0be" opacity="0.94"/><circle cx="1298" cy="163" r="13" fill="#e1dbb2" opacity="0.35"/>${cloud(500, 250, 42, '#d2dcff', 0.38)}${cloud(900, 180, 35, '#d2dcff', 0.32)}${hills(['#3d4876', '#2d3862', '#222d52'], [760, 845, 920])}` })],
  ['title-bg.webp', svg({ id: 'title', top: '#ffcfdf', bottom: '#bfeeff', body: `${cloud(460, 175, 55, '#fff', 0.56)}${cloud(1420, 195, 50, '#fff', 0.52)}${cloud(950, 325, 45, '#fff', 0.35)}${hills(['#bcdfbd', '#95cda7', '#6cb184'], [760, 840, 920])}` })]
];

await mkdir('assets', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const [filename, markup] of backgrounds) {
    await page.setContent(`<style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}</style>${markup}`);
    const dataUrl = await page.evaluate(async ({ width, height }) => {
      const svg = document.querySelector('svg');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = 'async';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      return canvas.toDataURL('image/webp', 0.8);
    }, { width: W, height: H });
    await writeFile(`assets/${filename}`, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`wrote assets/${filename}`);
  }
} finally {
  await browser.close();
}
