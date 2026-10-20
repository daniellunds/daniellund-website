// ONE FRAME CLOSER – server-authoritative demonstration frame service.
// Generated SVGs are placeholders, NOT GTA VI trailer footage.
const RELEASE = Date.parse('2026-11-18T23:00:00.000Z');
const TOTAL_FRAMES = 48240; // Assumed 26:48 @ 30fps; replace after inspecting source.
const STEP_MS = 60_000;
const START = RELEASE - TOTAL_FRAMES * STEP_MS;

function getState(now) {
  const completed = now >= RELEASE;
  const before = now < START;
  const index = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.floor((now - START) / STEP_MS)));
  const nextFrameAt = completed ? RELEASE : before ? START : Math.min(RELEASE, START + (index + 1) * STEP_MS);
  return {
    serverNow: now, launchAt: RELEASE, startAt: START,
    frameIndex: index, frameNumber: index + 1, totalFrames: TOTAL_FRAMES,
    nextFrameAt, released: completed, demo: true, frameIntervalMs: STEP_MS
  };
}

function cityFrame(state) {
  const n = state.frameIndex;
  const phase = (n % 1440) / 1440;
  const sunX = Math.round(1160 + 280 * Math.sin(phase * Math.PI * 2));
  const sunY = Math.round(360 + 125 * Math.cos(phase * Math.PI * 2));
  const shift = Math.round(14 * Math.sin(n / 1100));
  const hue = Math.round(9 * Math.sin(n / 5200));
  const windows = [];
  const buildings = [
    [80, 535, 114, 230], [192, 585, 89, 175], [304, 492, 120, 250],
    [445, 556, 102, 200], [560, 465, 87, 295], [658, 505, 108, 265],
    [785, 556, 105, 205], [918, 452, 138, 315], [1071, 527, 87, 240],
    [1180, 578, 120, 170], [1315, 505, 108, 260], [1461, 550, 106, 208],
    [1590, 500, 120, 266], [1722, 568, 135, 215]
  ];
  for (let b = 0; b < buildings.length; b++) {
    const [x, y, w, h] = buildings[b];
    for (let yy = y + 28; yy < y + h - 15; yy += 28) {
      for (let xx = x + 15; xx < x + w - 10; xx += 20) {
        if (((xx * 13 + yy * 7 + b * 41 + Math.floor(n / 700)) % 11) < 5)
          windows.push('<rect x="' + xx + '" y="' + yy + '" width="8" height="10" fill="#ffd8aa" opacity=".66"/>');
      }
    }
  }
  const houses = buildings.map(([x, y, w, h]) =>
    '<rect x="' + (x + shift) + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#172139"/>' +
    '<rect x="' + (x + shift - 3) + '" y="' + (y - 9) + '" width="' + (w + 6) + '" height="10" fill="#1c263d"/>'
  ).join('');
  const num = String(state.frameNumber).padStart(5, '0');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" role="img" aria-label="Illustreret testbillede for frame ${num}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="hsl(${255+hue} 50% 27%)"/><stop offset=".40" stop-color="hsl(${326+hue} 65% 45%)"/><stop offset=".77" stop-color="#f59c79"/><stop offset="1" stop-color="#f6c4a1"/></linearGradient>
<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#50355f"/><stop offset="1" stop-color="#101526"/></linearGradient>
<linearGradient id="film" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#17142c" stop-opacity="0"/><stop offset="1" stop-color="#080b19" stop-opacity=".8"/></linearGradient>
<filter id="glow"><feGaussianBlur stdDeviation="34"/></filter>
</defs>
<rect width="1920" height="1080" fill="url(#sky)"/>
<ellipse cx="${sunX}" cy="${sunY}" rx="182" ry="140" fill="#ffdfad" opacity=".24" filter="url(#glow)"/>
<circle cx="${sunX}" cy="${sunY}" r="80" fill="#ffdfb0"/>
<path d="M0 330 C260 285 460 345 620 310 S1120 292 1400 325 S1760 345 1920 298" stroke="#f9bcc0" stroke-width="34" fill="none" opacity=".16"/>
<path d="M0 475 Q360 405 610 470 T1250 450 T1920 440" stroke="#ffe2cc" stroke-width="18" fill="none" opacity=".14"/>
<path d="M0 728 C420 698 680 718 950 709 S1450 682 1920 720 L1920 1080 H0Z" fill="url(#water)"/>
<g opacity=".4" stroke="#f8ad9e" stroke-width="3">
<path d="M${sunX-70} 747h140 M${sunX-140} 757h280 M${sunX-190} 780h380 M${sunX-110} 808h220"/>
</g>
<g transform="translate(${shift},0)">${houses}</g>
<g opacity=".94">${windows.join('')}</g>
<path d="M0 773 Q460 742 820 778 Q1240 730 1920 781 L1920 1080 H0Z" fill="#0d1727" opacity=".9"/>
<g fill="none" stroke="#101c28" stroke-linecap="round">
<path d="M158 1080 Q200 860 244 630" stroke-width="38"/>
<path d="M244 665 Q150 537 26 565 M244 673 Q251 516 355 498 M245 669 Q330 578 465 608 M243 663 Q178 519 155 445 M243 680 Q360 655 503 710" stroke-width="33"/>
<path d="M1777 1080 Q1754 877 1691 625" stroke-width="43"/>
<path d="M1692 643 Q1597 533 1450 561 M1692 640 Q1682 502 1731 442 M1691 639 Q1786 542 1920 557 M1692 650 Q1818 664 1920 705 M1694 637 Q1609 572 1577 478" stroke-width="37"/>
</g>
<rect width="1920" height="1080" fill="url(#film)"/>
<g fill="#fff" font-family="system-ui, sans-serif">
<text x="90" y="108" opacity=".66" font-size="24" letter-spacing="7">ONE FRAME CLOSER / TEST VISUAL</text>
<text x="90" y="975" font-size="72" font-weight="700" letter-spacing="-2">VICE CITY, IN SLOW MOTION.</text>
<text x="95" y="1020" font-size="24" opacity=".64" letter-spacing="4">SIMULATED FRAME ${num} / ${TOTAL_FRAMES}</text>
</g>
</svg>`;
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  // Only the server clock can determine the active frame.
  // Ignore all query parameters except output format.
  const state = getState(Date.now());
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.query.format === 'state') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(state);
  }
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  return res.status(200).send(cityFrame(state));
}
