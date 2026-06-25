// Array of audio URLs (FIXED: removed trailing spaces)
const audioUrls = [
  "https://jking.cdnstream1.com/b75154_128mp3",
  "https://ais-edge90-dal03.cdnstream.com/b05055_128mp3",
  "https://ais-edge89-dal02.cdnstream.com/b48071_128mp3",
  "http://111.125.87.226:8000/streamfm",
  "http://sg-icecast.eradioportal.com:8000/febc_dzfe",
  "https://bigrradio.cdnstream1.com/5181_128"
];

// Populate the dropdown menu with audio options
const audioSelector = document.getElementById("audioSelector");
audioUrls.forEach((url, index) => {
  const option = document.createElement("option");
  option.value = url;
  option.textContent = `Station ${index + 1}`;
  audioSelector.appendChild(option);
});

let audioContext = null;
let analyser = null;
let sourceNode = null;
let animationId = null;
let mediaElementSourceCreated = false;
let currentRenderMode = "bars";
let captureMuteGain = null;
const canvas = document.getElementById("equalizer");
const ctx = canvas.getContext("2d");
const particles = [];
const peakHoldValues = [];
const gridPeakHoldValues = [];
let waterfallHistory = [];

const clockEl = document.getElementById("clock");
const timeoneliner = document.querySelector(".timeoneliner");
const CLOCK_MIN_FONT = 48;
const CLOCK_MAX_FONT = 400;

function measureClockText() {
  const containerWidth = timeoneliner.clientWidth;
  if (containerWidth <= 0) return;

  const tempFontSize = 100;
  clockEl.style.fontSize = `${tempFontSize}px`;
  const textWidth = clockEl.scrollWidth;

  const scale = containerWidth / textWidth;
  let newSize = tempFontSize * scale;

  newSize = Math.max(CLOCK_MIN_FONT, Math.min(CLOCK_MAX_FONT, newSize));

  clockEl.style.fontSize = `${newSize}px`;

  requestAnimationFrame(() => {
    const clockWidth = clockEl.getBoundingClientRect().width;
    if (clockWidth > 0) {
      canvas.style.width = `${clockWidth}px`;
    }
  });
}

function onResize() {
  measureClockText();
}

window.addEventListener("resize", onResize);

if (window.ResizeObserver && timeoneliner) {
  new ResizeObserver(onResize).observe(timeoneliner);
}

measureClockText();

function setupAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API not supported:", e);
      return;
    }
  }

  if (!analyser) {
    try {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
    } catch (e) {
      console.warn("Could not create analyser:", e);
      analyser = null;
    }
  }
}

function connectAudioSource() {
  const audioPlayer = document.getElementById("audioPlayer");
  
  if (!audioContext || !analyser) return false;

  if (!mediaElementSourceCreated) {
    try {
      sourceNode = audioContext.createMediaElementSource(audioPlayer);
      sourceNode.connect(analyser);
      analyser.connect(audioContext.destination);
      mediaElementSourceCreated = true;
      return true;
    } catch (e) {
      console.warn("Analyser connection failed:", e.message);
      mediaElementSourceCreated = false;
      sourceNode = null;
      return false;
    }
  }

  try {
    analyser.connect(audioContext.destination);
    return true;
  } catch (e) {
    return false;
  }
}

function getCanvasSize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }

  return { dpr, width, height };
}

function setCanvasTransform(dpr, width, height) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
}

function drawEqualizerBars(width, height, dataArray, timeDomainData) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const barCount = Math.max(1, Math.floor(width / 12));
  const gap = 2;
  const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
  const now = performance.now() / 1000;

  for (let i = 0; i < barCount; i++) {
    let value = 0.15 + 0.2 * Math.sin(now * 3 + i * 0.4) + 0.1 * Math.sin(now * 7 + i * 0.8);
    if (dataArray) {
      const dataIndex = Math.floor(i / barCount * usableBins);
      const raw = dataArray[dataIndex] / 255;
      value = Math.max(raw, value);
    }
    value = Math.max(0.05, Math.min(1, value));

    const barHeight = Math.max(3, value * height);
    const x = i * (barWidth + gap);
    const y = height - barHeight;

    const hue = 200 + value * 60;
    const saturation = 70 + value * 30;
    const lightness = 35 + value * 55;
    ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, Math.min(barWidth / 2, 6));
      ctx.fill();
    } else {
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }
}

function drawEqualizerGridBlocks(width, height, dataArray) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const gap = 6;
  const rows = 6;
  const cols = Math.max(6, Math.floor((width + gap) / 18));
  const blockW = (width / 3 - gap * (cols - 1)) / cols;
  const blockH = (height - gap * (rows - 1)) / rows;
  const gridWidth = cols * blockW + (cols - 1) * gap;
  const offsetX = (width - gridWidth) / 2;
  const now = performance.now() / 1000;

  for (let col = 0; col < cols; col++) {
    let value = 0.15 + 0.2 * Math.sin(now * 3 + col * 0.4) + 0.1 * Math.sin(now * 7 + col * 0.8);
    if (dataArray) {
      const dataIndex = Math.floor(col / cols * usableBins);
      const raw = dataArray[dataIndex] / 255;
      value = Math.max(raw, value);
    }
    value = Math.max(0.05, Math.min(1, value));

    const activeRows = Math.max(1, Math.round(value * rows));

    for (let row = 0; row < rows; row++) {
      const x = offsetX + col * (blockW + gap);
      const y = height - (row + 1) * (blockH + gap);
      const isActive = row < activeRows;

      if (isActive) {
        const intensity = (row + 1) / rows;
        const hue = 200 + intensity * 60;
        ctx.fillStyle = `hsl(${hue}, 75%, ${40 + intensity * 35}%)`;
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      }

      ctx.fillRect(x, y, blockW, blockH);
    }
  }
}

function drawEqualizerGridPeakBlocks(width, height, dataArray) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const gap = 6;
  const rows = 6;
  const cols = Math.max(6, Math.floor((width + gap) / 18));
  const blockW = (width / 3 - gap * (cols - 1)) / cols;
  const blockH = (height - gap * (rows - 1)) / rows;
  const gridWidth = cols * blockW + (cols - 1) * gap;
  const offsetX = (width - gridWidth) / 2;
  const now = performance.now() / 1000;

  while (gridPeakHoldValues.length < cols) gridPeakHoldValues.push(0);

  for (let col = 0; col < cols; col++) {
    let value = 0.15 + 0.2 * Math.sin(now * 3 + col * 0.4) + 0.1 * Math.sin(now * 7 + col * 0.8);
    if (dataArray) {
      const dataIndex = Math.floor(col / cols * usableBins);
      const raw = dataArray[dataIndex] / 255;
      value = Math.max(raw, value);
    }
    value = Math.max(0.05, Math.min(1, value));

    const activeRows = Math.max(1, Math.round(value * rows));
    gridPeakHoldValues[col] = Math.max(gridPeakHoldValues[col] - 0.006, activeRows);

    for (let row = 0; row < rows; row++) {
      const x = offsetX + col * (blockW + gap);
      const y = height - (row + 1) * (blockH + gap);
      const isActive = row < activeRows;
      const isPeak = row === Math.min(rows - 1, Math.floor(gridPeakHoldValues[col]));

      if (isPeak && !isActive) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      } else if (isActive) {
        const intensity = (row + 1) / rows;
        const hue = 200 + intensity * 60;
        ctx.fillStyle = `hsl(${hue}, 75%, ${40 + intensity * 35}%)`;
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      }

      ctx.fillRect(x, y, blockW, blockH);
    }
  }
}

function drawEqualizerMirrorBars(width, height, dataArray) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const barCount = Math.max(1, Math.floor(width / 14));
  const gap = 2;
  const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
  const midY = height / 2;
  const now = performance.now() / 1000;

  ctx.save();
  ctx.globalAlpha = 0.85;

  for (let i = 0; i < barCount; i++) {
    let value = 0.12 + 0.18 * Math.sin(now * 2.8 + i * 0.45) + 0.1 * Math.sin(now * 6.3 + i * 0.7);
    if (dataArray) {
      const dataIndex = Math.floor(i / barCount * usableBins);
      const raw = dataArray[dataIndex] / 255;
      value = Math.max(raw, value);
    }
    value = Math.max(0.05, Math.min(1, value));
    const barH = Math.max(2, value * midY * 0.9);
    const x = i * (barWidth + gap);
    const hue = 200 + value * 60;

    ctx.fillStyle = `hsla(${hue}, 75%, 55%, 0.9)`;
    ctx.fillRect(x, midY - barH, barWidth, barH);
    ctx.fillStyle = `hsla(${hue + 20}, 65%, 40%, 0.7)`;
    ctx.fillRect(x, midY, barWidth, barH);
  }

  ctx.restore();
}

function drawEqualizerPeakBars(width, height, dataArray) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const barCount = Math.max(1, Math.floor(width / 14));
  const gap = 2;
  const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
  const now = performance.now() / 1000;

  while (peakHoldValues.length < barCount) peakHoldValues.push(0);

  for (let i = peakHoldValues.length; i < barCount; i++) peakHoldValues[i] = 0;

  for (let i = 0; i < barCount; i++) {
    let value = 0.12 + 0.2 * Math.sin(now * 3.1 + i * 0.42) + 0.1 * Math.sin(now * 6.8 + i * 0.75);
    if (dataArray) {
      const dataIndex = Math.floor(i / barCount * usableBins);
      const raw = dataArray[dataIndex] / 255;
      value = Math.max(raw, value);
    }
    value = Math.max(0.05, Math.min(1, value));
    peakHoldValues[i] = Math.max(peakHoldValues[i] - 0.002, value);

    const barH = Math.max(2, value * height);
    const x = i * (barWidth + gap);
    const hue = 200 + value * 60;
    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
    ctx.fillRect(x, height - barH, barWidth, barH);

    const peakY = height - peakHoldValues[i] * height;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(x, peakY - 2, barWidth, 2);
  }
}

function drawEqualizerDotMatrix(width, height, dataArray) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const cols = Math.max(4, Math.floor(width / 18));
  const rows = 5;
  const cellW = width / cols;
  const cellH = height / rows;
  const now = performance.now() / 1000;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let value = 0.08 + 0.12 * Math.sin(now * 2.3 + col * 0.5 + row * 0.4);
      if (dataArray) {
        const dataIndex = Math.floor(col / cols * usableBins);
        const raw = dataArray[dataIndex] / 255;
        value = Math.max(value, raw * (1 - row / rows * 0.5));
      }
      value = Math.max(0, Math.min(1, value));

      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      const radius = Math.max(1, Math.min(cellW, cellH) * 0.35 * value);
      const hue = 200 + value * 60;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.3 + value * 0.7})`;
      ctx.fill();
    }
  }
}

function drawEqualizerArea(width, height, dataArray) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const points = Math.max(8, Math.floor(width / 10));
  const now = performance.now() / 1000;

  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let i = 0; i < points; i++) {
    let t = i / (points - 1);
    let v = 0.15 + 0.35 * Math.abs(Math.sin(now * 1.8 + t * Math.PI * 3));
    if (dataArray) {
      const dataIndex = Math.floor(t * usableBins);
      v = Math.max(v, dataArray[dataIndex] / 255);
    }
    ctx.lineTo(t * width, height - v * height * 0.9);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = "rgba(120, 180, 255, 0.18)";
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    let t = i / (points - 1);
    let v = 0.15 + 0.35 * Math.abs(Math.sin(now * 1.8 + t * Math.PI * 3));
    if (dataArray) {
      const dataIndex = Math.floor(t * usableBins);
      v = Math.max(v, dataArray[dataIndex] / 255);
    }
    if (i === 0) ctx.moveTo(t * width, height - v * height * 0.9);
    else ctx.lineTo(t * width, height - v * height * 0.9);
  }
  ctx.strokeStyle = "rgba(180, 220, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawEqualizerCircularWave(width, height, dataArray) {
  if (!dataArray) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.35, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  const cx = width / 2;
  const cy = height / 2;
  const baseR = Math.min(width, height) * 0.25;
  const usableBins = Math.floor(dataArray.length * 0.6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(200, 230, 255, 0.9)";

  ctx.beginPath();
  for (let i = 0; i <= usableBins; i++) {
    const angle = (i / usableBins) * Math.PI * 2 - Math.PI / 2;
    const value = dataArray[i] / 255;
    const r = baseR + value * baseR * 0.6;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawEqualizerFilledBand(width, height, timeDomainData) {
  if (!timeDomainData || timeDomainData.length === 0) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }

  const sliceWidth = width / timeDomainData.length;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  for (let i = 0; i < timeDomainData.length; i++) {
    const v = timeDomainData[i] / 128.0;
    const y = v * height / 2;
    ctx.lineTo(i * sliceWidth, y);
  }
  ctx.lineTo(width, height / 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(120, 200, 255, 0.2)";
  ctx.fill();
  ctx.strokeStyle = "rgba(200, 230, 255, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawEqualizerWaterfall(width, height, dataArray) {
  if (!dataArray) return;
  const usableBins = Math.floor(dataArray.length * 0.7);
  const maxHistory = Math.floor(height);

  while (waterfallHistory.length >= maxHistory) waterfallHistory.shift();
  if (waterfallHistory.length === 0 || waterfallHistory[0].length !== usableBins) {
    waterfallHistory = [];
  }

  const frame = new Uint8Array(usableBins);
  for (let i = 0; i < usableBins; i++) frame[i] = dataArray[Math.floor(i / usableBins * dataArray.length)];
  waterfallHistory.push(frame);

  const rowH = 1;
  const colW = width / usableBins;

  for (let row = 0; row < waterfallHistory.length; row++) {
    const y = height - row - 1;
    for (let col = 0; col < usableBins; col++) {
      const v = waterfallHistory[row][col] / 255;
      ctx.fillStyle = `rgb(${Math.floor(v * 80)}, ${Math.floor(v * 160 + 40)}, ${Math.floor(v * 220 + 35)})`;
      ctx.fillRect(col * colW, y, Math.ceil(colW), rowH);
    }
  }
}

function drawEqualizerTerrain(width, height, dataArray) {
  if (!dataArray) return;
  const usableBins = Math.floor(dataArray.length * 0.7);
  const cols = Math.max(6, Math.floor(width / 10));
  const rows = 8;
  const cellW = width / cols;
  const cellH = height / rows;
  const now = performance.now() / 1000;

  while (waterfallHistory.length >= rows) waterfallHistory.shift();
  const frame = [];
  for (let i = 0; i < cols; i++) {
    const idx = Math.floor(i / cols * usableBins);
    let v = dataArray[idx] / 255;
    v = Math.max(0.05, v + 0.05 * Math.sin(now * 2 + i * 0.5));
    frame.push(v);
  }
  waterfallHistory.push(frame);

  ctx.lineWidth = 1;
  for (let row = 0; row < waterfallHistory.length; row++) {
    const vScale = 1 - row / rows * 0.7;
    const yBase = height - (row + 1) * cellH;
    ctx.beginPath();
    for (let col = 0; col < waterfallHistory[row].length; col++) {
      const x = col * cellW;
      const y = yBase - waterfallHistory[row][col] * cellH * vScale;
      if (col === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const hue = 200 + (row / rows) * 40;
    ctx.strokeStyle = `hsla(${hue}, 70%, 55%, ${0.4 + (row / rows) * 0.6})`;
    ctx.stroke();
  }
}

function drawEqualizerGradientBars(width, height, dataArray) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const barCount = Math.max(1, Math.floor(width / 12));
  const gap = 2;
  const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
  const now = performance.now() / 1000;

  for (let i = 0; i < barCount; i++) {
    let value = 0.12 + 0.2 * Math.sin(now * 3 + i * 0.4) + 0.1 * Math.sin(now * 7 + i * 0.8);
    if (dataArray) {
      const dataIndex = Math.floor(i / barCount * usableBins);
      const raw = dataArray[dataIndex] / 255;
      value = Math.max(raw, value);
    }
    value = Math.max(0.05, Math.min(1, value));

    const barH = Math.max(3, value * height);
    const x = i * (barWidth + gap);
    const y = height - barH;

    const grad = ctx.createLinearGradient(0, y, 0, height);
    grad.addColorStop(0, `hsla(${200 + value * 80}, 100%, 75%, 1)`);
    grad.addColorStop(0.5, `hsla(${200 + value * 60}, 85%, 55%, 0.9)`);
    grad.addColorStop(1, `hsla(${200 + value * 40}, 70%, 30%, 0.6)`);
    ctx.fillStyle = grad;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, Math.min(barWidth / 2, 6));
      ctx.fill();
    } else {
      ctx.fillRect(x, y, barWidth, barH);
    }
  }
}

function drawEqualizerBezier(width, height, dataArray) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const points = Math.max(6, Math.floor(width / 16));
  const now = performance.now() / 1000;

  const pts = [];
  for (let i = 0; i < points; i++) {
    let v = 0.18 + 0.32 * Math.abs(Math.sin(now * 1.6 + i * 0.5));
    if (dataArray) {
      const dataIndex = Math.floor(i / points * usableBins);
      v = Math.max(v, dataArray[dataIndex] / 255);
    }
    v = Math.max(0.05, Math.min(0.95, v));
    pts.push({ x: (i / (points - 1)) * width, y: height - v * height * 0.9 });
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, height);
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const xc = (pts[i].x + pts[i + 1].x) / 2;
    const yc = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.lineTo(pts[pts.length - 1].x, height);
  ctx.closePath();
  ctx.fillStyle = "rgba(120, 180, 255, 0.15)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const xc = (pts[i].x + pts[i + 1].x) / 2;
    const yc = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.strokeStyle = "rgba(200, 235, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawEqualizerLine(width, height, dataArray) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const points = Math.max(4, Math.floor(width / 10));
  ctx.beginPath();
  ctx.moveTo(0, height);

  for (let i = 0; i < points; i++) {
    let value = 0.2 + 0.3 * Math.abs(Math.sin(performance.now() / 1000 * 2.5 + i * 0.35));
    if (dataArray) {
      const dataIndex = Math.floor(i / points * usableBins);
      value = Math.max(value, dataArray[dataIndex] / 255);
    }
    value = Math.max(0.05, Math.min(0.95, value));

    const x = (i / (points - 1)) * width;
    const y = height - value * height;
    ctx.lineTo(x, y);
  }

  ctx.lineTo(width, height);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.25)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0.03)");
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    let value = 0.2 + 0.3 * Math.abs(Math.sin(performance.now() / 1000 * 2.5 + i * 0.35));
    if (dataArray) {
      const dataIndex = Math.floor(i / points * usableBins);
      value = Math.max(value, dataArray[dataIndex] / 255);
    }
    value = Math.max(0.05, Math.min(0.95, value));

    const x = (i / (points - 1)) * width;
    const y = height - value * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "rgba(200, 230, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawEqualizerWaveform(width, height, dataArray) {
  if (!dataArray || dataArray.length === 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const maxDots = Math.max(20, Math.min(80, Math.floor(width / 10)));
  const stride = Math.max(1, Math.floor(dataArray.length / maxDots));
  const samples = Math.min(maxDots, Math.floor(dataArray.length / stride));
  const step = width / samples;
  const dotRadius = Math.max(1, Math.min(1.8, step * 0.2));

  ctx.fillStyle = "rgba(180, 220, 255, 0.9)";
  for (let i = 0; i < samples; i++) {
    const idx = i * stride;
    const v = dataArray[idx] / 128.0;
    const y = v * height / 2;
    const x = i * step + step / 2;
    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateParticles(width, height) {
  const now = performance.now() / 1000;
  if (particles.length < 120) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 1.5 + Math.random() * 2.5,
      speedX: 0.2 + Math.random() * 0.6,
      speedY: -0.3 - Math.random() * 0.5,
      life: 1,
      decay: 0.005 + Math.random() * 0.01,
      hue: 200 + Math.random() * 60,
    });
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.speedX;
    p.y += p.speedY;
    p.life -= p.decay;
    if (p.life <= 0 || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
      particles.splice(i, 1);
    }
  }

  let energy = 0.2 + 0.3 * Math.sin(now * 1.8);
  if (analyser) {
    const freq = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freq);
    let sum = 0;
    for (let i = 0; i < freq.length; i++) sum += freq[i];
    energy = Math.max(energy, (sum / freq.length) / 255);
  }

  const spawn = Math.floor(energy * 12);
  for (let i = 0; i < spawn; i++) {
    particles.push({
      x: Math.random() * width,
      y: height,
      radius: 1 + Math.random() * 2,
      speedX: 0.3 + Math.random() * 0.7,
      speedY: -1 - energy * 3 - Math.random() * 2,
      life: 1,
      decay: 0.008 + Math.random() * 0.012,
      hue: 200 + energy * 60,
    });
  }
}

function drawEqualizerParticles(width, height) {
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${p.life * 0.7})`;
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function setRenderMode(mode) {
  currentRenderMode = mode;
  particles.length = 0;
  peakHoldValues.length = 0;
  gridPeakHoldValues.length = 0;
  waterfallHistory = [];
}

function drawEqualizer() {
  const { dpr, width, height } = getCanvasSize();
  setCanvasTransform(dpr, width, height);

  let frequencyData = null;
  let timeDomainData = null;
  if (analyser) {
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyData);

    if (currentRenderMode === "waveform" || currentRenderMode === "filledBand") {
      timeDomainData = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(timeDomainData);
    }

    if (currentRenderMode === "waterfall" || currentRenderMode === "terrain") {
      if (waterfallHistory.length === 0 || waterfallHistory[0].length !== Math.floor(frequencyData.length * 0.7)) {
        waterfallHistory = [];
      }
    }
  }

  switch (currentRenderMode) {
    case "gridBlocks":
      drawEqualizerGridBlocks(width, height, frequencyData);
      break;
    case "gridPeakBlocks":
      drawEqualizerGridPeakBlocks(width, height, frequencyData);
      break;
    case "gradientBars":
      drawEqualizerGradientBars(width, height, frequencyData);
      break;
    case "mirrorBars":
      drawEqualizerMirrorBars(width, height, frequencyData);
      break;
    case "peakBars":
      drawEqualizerPeakBars(width, height, frequencyData);
      break;
    case "dotMatrix":
      drawEqualizerDotMatrix(width, height, frequencyData);
      break;
    case "area":
      drawEqualizerArea(width, height, frequencyData);
      break;
    case "bezier":
      drawEqualizerBezier(width, height, frequencyData);
      break;
    case "circularWave":
      drawEqualizerCircularWave(width, height, frequencyData);
      break;
    case "filledBand":
      drawEqualizerFilledBand(width, height, timeDomainData);
      break;
    case "waterfall":
      drawEqualizerWaterfall(width, height, frequencyData);
      break;
    case "terrain":
      drawEqualizerTerrain(width, height, frequencyData);
      break;
    case "particles":
      updateParticles(width, height);
      drawEqualizerParticles(width, height);
      break;
    case "line":
      drawEqualizerLine(width, height, frequencyData);
      break;
    case "waveform":
      drawEqualizerWaveform(width, height, timeDomainData);
      break;
    case "bars":
    default:
      drawEqualizerBars(width, height, frequencyData, timeDomainData);
      break;
  }

  animationId = requestAnimationFrame(drawEqualizer);
}

// Function to play the selected audio URL
function playAudio() {
  const selectedUrl = audioSelector.value;
  const audioPlayer = document.getElementById("audioPlayer");

  if (!selectedUrl) return;

  setupAudioContext();

  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }

  audioPlayer.crossOrigin = "anonymous";

  if (audioPlayer.src !== selectedUrl) {
    audioPlayer.src = selectedUrl;
    audioPlayer.load();
  }

  connectAudioSource();

  if (!animationId) {
    animationId = requestAnimationFrame(drawEqualizer);
  }

  const playPromise = audioPlayer.play();
  if (playPromise) {
    playPromise.catch(err => {
      console.warn("Playback failed:", err);
    });
  }
}

async function captureSystemAudio() {
  setupAudioContext();
  if (!audioContext) {
    alert("Audio capture is not supported. Try Chrome, Edge, or Opera.");
    return;
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: { width: 1, height: 1 },
    });

    const audioPlayer = document.getElementById("audioPlayer");
    audioPlayer.pause();
    audioPlayer.crossOrigin = null;
    audioPlayer.src = "";
    audioPlayer.load();

    if (sourceNode) {
      try { sourceNode.disconnect(); } catch (e) { /* ignore */ }
      sourceNode = null;
    }

    if (!analyser) {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      alert("No audio track found. In the picker, be sure to check the 'Share audio' option and select a tab that is playing sound.");
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    const audioStream = new MediaStream(audioTracks);
    const externalSource = audioContext.createMediaStreamSource(audioStream);

    if (!analyser) {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
    }

    externalSource.connect(analyser);

    mediaElementSourceCreated = true;
    sourceNode = externalSource;
    captureMuteGain = null;

    if (!animationId) {
      animationId = requestAnimationFrame(drawEqualizer);
    }

    stream.getVideoTracks().forEach(t => t.stop());

    stream.getAudioTracks().forEach(track => {
      track.onended = () => {
        console.log("System audio capture stopped.");
        if (captureMuteGain) {
          try { captureMuteGain.disconnect(); } catch (e) { /* ignore */ }
          captureMuteGain = null;
        }
        if (sourceNode) {
          try { sourceNode.disconnect(); } catch (e) { /* ignore */ }
          sourceNode = null;
        }
      };
    });

    console.log("System audio capture started.");
  } catch (err) {
    if (err.name === "NotAllowedError") {
      console.warn("User denied system audio capture permission:", err.message);
      alert("Audio capture requires permission. Please allow tab/window audio capture when prompted.");
    } else {
      console.warn("System audio capture failed:", err.message, err);
      alert("Audio capture failed: " + err.message + ". This feature works best in Chrome, Edge, or Opera.");
    }
  }
}

function playLocalFile(input) {
  if (!input.files || !input.files[0]) return;

  setupAudioContext();

  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }

  const audioPlayer = document.getElementById("audioPlayer");
  audioPlayer.pause();
  audioPlayer.crossOrigin = null;
  const fileURL = URL.createObjectURL(input.files[0]);

  if (audioPlayer.src !== fileURL) {
    audioPlayer.src = fileURL;
    audioPlayer.load();
  }

  connectAudioSource();

  if (!animationId) {
    animationId = requestAnimationFrame(drawEqualizer);
  }

  audioPlayer.play().catch(err => {
    console.warn("Local file playback failed:", err);
  });
}

function setPlaybackRate(rate) {
  const audioPlayer = document.getElementById("audioPlayer");
  if (audioPlayer) {
    audioPlayer.playbackRate = parseFloat(rate);
  }
}

function setPlayerMode(mode) {
  const customPlayer = document.getElementById("customPlayer");
  const audioPlayer = document.getElementById("audioPlayer");

  if (mode === "custom") {
    customPlayer.style.display = "flex";
    audioPlayer.style.display = "none";
    updateCustomPlayer();
  } else if (mode === "none") {
    customPlayer.style.display = "none";
    audioPlayer.style.display = "none";
  } else {
    customPlayer.style.display = "none";
    audioPlayer.style.display = "flex";
  }
}

function togglePlay() {
  const audioPlayer = document.getElementById("audioPlayer");
  const btn = document.getElementById("playPauseBtn");
  if (!audioPlayer) return;

  if (audioPlayer.paused) {
    audioPlayer.play();
    btn.textContent = "⏸";
  } else {
    audioPlayer.pause();
    btn.textContent = "▶";
  }
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function updateCustomPlayer() {
  const audioPlayer = document.getElementById("audioPlayer");
  const seekBar = document.getElementById("seekBar");
  const timeDisplay = document.getElementById("timeDisplay");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const volumeBar = document.getElementById("volumeBar");

  if (!audioPlayer) return;

  if (seekBar && audioPlayer.duration && isFinite(audioPlayer.duration)) {
    if (!seekBar.matches(":active")) {
      seekBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 1000;
    }
  }

  if (timeDisplay) {
    const current = formatTime(audioPlayer.currentTime);
    const total = formatTime(audioPlayer.duration);
    timeDisplay.textContent = current + " / " + total;
  }

  if (playPauseBtn) {
    playPauseBtn.textContent = audioPlayer.paused ? "▶" : "⏸";
  }

  if (volumeBar && !volumeBar.matches(":active")) {
    volumeBar.value = audioPlayer.volume;
  }

  requestAnimationFrame(updateCustomPlayer);
}

function onSeekChange() {
  const audioPlayer = document.getElementById("audioPlayer");
  const seekBar = document.getElementById("seekBar");
  if (!audioPlayer || !seekBar || !audioPlayer.duration) return;
  audioPlayer.currentTime = (seekBar.value / 1000) * audioPlayer.duration;
}

function onVolumeChange() {
  const audioPlayer = document.getElementById("audioPlayer");
  const volumeBar = document.getElementById("volumeBar");
  if (!audioPlayer || !volumeBar) return;
  audioPlayer.volume = parseFloat(volumeBar.value);
}

function toggleStatusbar() {
  const statusbar = document.getElementById("statusbar");
  const toggle = statusbar.querySelector(".statusbar-toggle");
  const isCollapsed = statusbar.classList.toggle("collapsed");
  toggle.textContent = isCollapsed ? "▲" : "▼";
}

// Function to update the real-time clock in 12-hour AM/PM format
function updateClock() {
  const now = new Date();
  
  // FIX: Use getHours() which returns local hours (0-23) consistently across browsers
  // This is the key fix - we explicitly use local time methods rather than relying on 
  // toLocaleTimeString which may behave differently in LibreWolf vs Chrome
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  // Determine AM or PM suffix
  const ampm = hours >= 12 ? 'pm' : 'am';

  // Convert to 12-hour format
  hours = hours % 12;
  hours = hours ? hours : 12; // Show "12" instead of "0" for midnight and noon
  
  // FIX: Pad hours with leading zero for consistency (optional but cleaner)
  const hoursStr = String(hours).padStart(2, '0');
  
  const formattedTime = `${hoursStr}·${minutes}·${seconds}`;

  // Display the time
  document.getElementById("clock").textContent = formattedTime;
  document.getElementById("ampm").textContent = ampm;
}

// Function to update and display the human-readable date
function updateDate() {
  const now = new Date();
  
  // FIX: Explicitly specify 'en-US' locale and add timeZone option
  // This ensures consistent behavior across all browsers including LibreWolf
  // The 'timeZone' option forces use of the system's local timezone
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone // Explicit local timezone
  };
  
  // FIX: Use 'en-US' or leave as undefined but with explicit timeZone
  // Using navigator.language ensures it matches the browser's preferred language
  const formattedDate = now.toLocaleDateString(navigator.language || 'en-US', options);
  document.getElementById("dateDisplay").textContent = formattedDate;
}

// FIX: Initialize immediately before interval starts to prevent delay
updateClock();
updateDate();

// Start the clock - runs every second
setInterval(updateClock, 1000);

// FIX: Update date only every minute (not every second) for efficiency
setInterval(updateDate, 60000);

(function initPlayer() {
  const audioPlayer = document.getElementById("audioPlayer");
  if (!audioPlayer) return;

  audioPlayer.addEventListener("play", () => {
    const btn = document.getElementById("playPauseBtn");
    if (btn && document.getElementById("playerMode").value === "custom") btn.textContent = "⏸";
  });

  audioPlayer.addEventListener("pause", () => {
    const btn = document.getElementById("playPauseBtn");
    if (btn && document.getElementById("playerMode").value === "custom") btn.textContent = "▶";
  });

  audioPlayer.addEventListener("ended", () => {
    const btn = document.getElementById("playPauseBtn");
    if (btn) btn.textContent = "▶";
  });
})();