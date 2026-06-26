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
let captureSourceNode = null;
let animationId = null;
let mediaElementSourceCreated = false;
let currentRenderMode = "bars";
let captureMuteGain = null;
let isCaptureMode = false;
const canvas = document.getElementById("equalizer");
const ctx = canvas.getContext("2d");
const particles = [];
const fireParticles = [];
const peakHoldValues = [];
const gridPeakHoldValues = [];
let waterfallHistory = [];
let terrainHistory = [];
let bpmPeakHistory = [];
let bpmEstimate = 120;
let metaballs = [];
const METABALL_COUNT = 6;

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
      const audioPlayer = document.getElementById("audioPlayer");
      if (audioPlayer) {
        audioPlayer.style.maxWidth = `${clockWidth}px`;
        audioPlayer.style.width = `${clockWidth}px`;
      }
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

  if (captureMuteGain) {
    try { captureMuteGain.disconnect(); } catch (e) { /* ignore */ }
    captureMuteGain = null;
  }

  if (captureSourceNode) {
    try { captureSourceNode.disconnect(); } catch (e) { /* ignore */ }
    captureSourceNode = null;
  }

  if (sourceNode) {
    try { sourceNode.disconnect(); } catch (e) { /* ignore */ }
  }

  try { analyser.disconnect(); } catch (e) { /* ignore */ }

  if (!isCaptureMode && !mediaElementSourceCreated) {
    try {
      sourceNode = audioContext.createMediaElementSource(audioPlayer);
      sourceNode.connect(analyser);
      mediaElementSourceCreated = true;
    } catch (e) {
      console.warn("Analyser connection failed:", e.message);
      mediaElementSourceCreated = false;
      sourceNode = null;
      return false;
    }
  } else if (!isCaptureMode && mediaElementSourceCreated && sourceNode) {
    sourceNode.connect(analyser);
  } else if (isCaptureMode && captureSourceNode) {
    captureSourceNode.connect(analyser);
  }

  if (!isCaptureMode) {
    try {
      analyser.connect(audioContext.destination);
    } catch (e) { /* ignore */ }
  }

  return true;
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
  const blockW = (width - gap * (cols - 1)) / cols;
  const blockH = (height - gap * (rows - 1)) / rows;
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
      const x = col * (blockW + gap);
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
  const blockW = (width - gap * (cols - 1)) / cols;
  const blockH = (height - gap * (rows - 1)) / rows;
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
      const x = col * (blockW + gap);
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

function drawEqualizerRainbowMirrorBars(width, height, dataArray) {
  const usableBins = dataArray ? Math.floor(dataArray.length * 0.7) : 0;
  const barCount = Math.max(1, Math.floor(width / 14));
  const gap = 2;
  const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
  const midY = height / 2;
  const now = performance.now() / 1000;

  let bassEnergy = 0;
  if (dataArray) {
    const bassBins = Math.min(8, dataArray.length);
    for (let i = 0; i < bassBins; i++) bassEnergy += dataArray[i];
    bassEnergy /= bassBins * 255;
  }

  const threshold = 0.45;
  if (bassEnergy > threshold && (!bpmPeakHistory.length || now - bpmPeakHistory[bpmPeakHistory.length - 1] > 0.2)) {
    bpmPeakHistory.push(now);
    while (bpmPeakHistory.length > 0 && bpmPeakHistory[0] < now - 30) bpmPeakHistory.shift();
  }

  let bpm = 120;
  if (bpmPeakHistory.length >= 4) {
    const intervals = [];
    for (let i = 1; i < bpmPeakHistory.length; i++) intervals.push(bpmPeakHistory[i] - bpmPeakHistory[i - 1]);
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    bpm = Math.round(60 / median);
    bpm = Math.max(60, Math.min(200, bpm));
  }

  const palette = [0, 30, 60, 120, 200, 240, 270, 300, 360];
  const holdSeconds = 5;
  const fadeSeconds = 4;
  const step = holdSeconds + fadeSeconds;
  const totalCycle = palette.length * step;
  const phase = (now * 1.0) % totalCycle;
  const idx = Math.floor(phase / step) % palette.length;
  const localT = phase - idx * step;
  const nextIdx = (idx + 1) % palette.length;
  let baseHue;
  if (localT < holdSeconds) {
    baseHue = palette[idx];
  } else {
    const t = (localT - holdSeconds) / fadeSeconds;
    baseHue = palette[idx] + (palette[nextIdx] - palette[idx]) * t;
  }

  ctx.save();
  ctx.globalAlpha = 0.9;

  for (let i = 0; i < barCount; i++) {
    let value = 0.12 + 0.2 * Math.sin(now * 3 + i * 0.45) + 0.1 * Math.sin(now * 6.8 + i * 0.7);
    if (dataArray) {
      const dataIndex = Math.floor(i / barCount * usableBins);
      const raw = dataArray[dataIndex] / 255;
      value = Math.max(raw, value);
    }
    value = Math.max(0.05, Math.min(1, value));

    const barH = Math.max(2, value * midY * 0.9);
    const x = i * (barWidth + gap);

    ctx.fillStyle = `hsla(${baseHue}, 90%, 55%, 0.9)`;
    ctx.fillRect(x, midY - barH, barWidth, barH);

    ctx.fillStyle = `hsla(${baseHue}, 75%, 38%, 0.7)`;
    ctx.fillRect(x, midY, barWidth, barH);
  }

  ctx.restore();
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
   const cols = Math.max(8, Math.floor(width / 8));
   const rows = 16;
   const cellW = width / cols;
   const cellH = height / rows;
   const now = performance.now() / 1000;

   while (terrainHistory.length >= rows) terrainHistory.shift();
   
   let energy = 0;
   if (dataArray && dataArray.length > 0) {
     const bassBins = Math.min(15, dataArray.length);
     for (let i = 0; i < bassBins; i++) energy += dataArray[i] / 255;
     energy = (energy / bassBins);
   }

   const frame = [];
   for (let i = 0; i < cols; i++) {
     const idx = Math.floor(i / cols * usableBins);
     const freq = dataArray[idx] / 255;
     const t = i / cols;
     const heartbeatPulse = 0.6 * Math.abs(Math.sin(now * 8 + t * Math.PI * 4));
     const energySpike = Math.pow(freq, 1.5) * 0.8;
     const randomPeak = Math.random() < 0.03 ? 0.7 + Math.random() * 0.25 : 0;
     const randomValley = Math.random() < 0.02 ? -0.4 - Math.random() * 0.3 : 0;
     
     let v = energy * 0.4 + heartbeatPulse * 0.35 + energySpike * 0.25 + randomPeak + randomValley;
     v = Math.max(0.05, Math.min(0.95, v));
     frame.push(v);
   }
   terrainHistory.push(frame);

   ctx.lineWidth = 2;
   for (let row = 0; row < terrainHistory.length; row++) {
     const vScale = 1.2 - row / rows * 0.3;
     const yBase = height - (row + 1) * cellH;
     ctx.beginPath();
     for (let col = 0; col < terrainHistory[row].length; col++) {
       const x = col * cellW;
       const y = yBase - Math.pow(terrainHistory[row][col], 1.8) * cellH * vScale;
       if (col === 0) ctx.moveTo(x, y);
       else ctx.lineTo(x, y);
     }
     const hue = 180 + Math.sin(now * 2 + row * 0.2) * 40;
     const lightness = 40 + Math.cos(now * 1.5 + row * 0.3) * 20;
     ctx.strokeStyle = `hsla(${hue}, 80%, ${lightness}%, ${0.6 + (row / rows) * 0.4})`;
     ctx.stroke();
   }

   ctx.lineWidth = 1;
   ctx.strokeStyle = "rgba(200, 220, 255, 0.25)";
   for (let row = 0; row < terrainHistory.length; row++) {
     const yCrevice = height - (row + 1) * cellH + cellH * 0.3;
     ctx.beginPath();
     for (let col = 0; col < terrainHistory[row].length; col++) {
       const x = col * cellW;
       const crevice = 0.35 * Math.sin(now * 6 + col * 1.5) * Math.cos(now * 4 + col * 1.1);
       const y = yCrevice + crevice * cellH * 0.3;
       if (col === 0) ctx.moveTo(x, y);
       else ctx.lineTo(x, y);
     }
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

function updateFireParticles(width, height) {
  const now = performance.now() / 1000;

  let energy = 0.25 + 0.2 * Math.sin(now * 2.0);
  if (analyser) {
    const freq = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freq);
    let sum = 0;
    for (let i = 0; i < freq.length; i++) sum += freq[i];
    energy = Math.max(energy, (sum / freq.length) / 255);
  }
  energy = Math.min(energy, 1.0);

  const spawn = Math.floor(4 + energy * 18);
  for (let i = 0; i < spawn; i++) {
    fireParticles.push({
      x: Math.random() * width,
      y: height + 2,
      radius: 1.5 + Math.random() * 3 + energy * 5,
      speedX: (Math.random() - 0.5) * 1.2,
      speedY: -1.2 - energy * 3 - Math.random() * 2.5,
      life: 1,
      decay: 0.006 + Math.random() * 0.014,
      energy: energy,
    });
  }

  for (let i = fireParticles.length - 1; i >= 0; i--) {
    const p = fireParticles[i];
    p.x += p.speedX;
    p.y += p.speedY;
    p.speedY *= 0.995;
    p.life -= p.decay;
    p.radius *= 0.999;
    if (p.life <= 0 || p.y < -20) {
      fireParticles.splice(i, 1);
    }
  }
}

function drawEqualizerFire(width, height) {
  ctx.globalCompositeOperation = "lighter";
  for (const p of fireParticles) {
    const t = p.life;
    const hue = 10 + 35 * t + p.energy * 10;
    const saturation = 100;
    const lightness = 25 + 55 * t;
    const alpha = t * 0.85;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${Math.min(lightness + 10, 95)}%, ${alpha * 0.25})`;
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function updateMetaballs(width, height, dataArray) {
  const now = performance.now() / 1000;
  
  const volume = document.getElementById("audioPlayer")?.volume ?? 1;
  
  let energy = 0;
  let bass = 0;
  if (dataArray && dataArray.length > 0) {
    const bassBins = Math.min(10, dataArray.length);
    for (let i = 0; i < bassBins; i++) bass += (dataArray[i] / 255) * volume;
    bass = bass / bassBins;
    for (let i = 0; i < dataArray.length; i++) energy += (dataArray[i] / 255) * volume;
    energy = Math.pow(energy / dataArray.length, 0.7);
  }

  while (metaballs.length < METABALL_COUNT) {
    metaballs.push({
      x: Math.random() * width,
      y: Math.random() * height * 0.6 + height * 0.2,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.3,
      baseRadius: 20 + Math.random() * 30,
      phase: Math.random() * Math.PI * 2
    });
  }

  for (const b of metaballs) {
    b.x += b.vx + (Math.random() - 0.5) * 0.3;
    b.y += b.vy * (0.5 + bass * 2);
    b.phase += 0.02;
    
    if (b.x < -50) b.x = width + 50;
    if (b.x > width + 50) b.x = -50;
    if (b.y < 0) b.y = height;
    if (b.y > height) b.y = 0;
  }
}

function drawMetaballs(width, height, dataArray) {
  const gridSize = 2;
  const gridW = Math.ceil(width / gridSize);
  const gridH = Math.ceil(height / gridSize);
  
  const field = new Float32Array(gridW * gridH);
  
  const volume = document.getElementById("audioPlayer")?.volume ?? 1;
  const now = performance.now() / 1000;
  
  let energy = 0.1;
  if (dataArray) {
    for (let i = 0; i < dataArray.length; i++) energy += dataArray[i] * volume;
    energy = Math.pow(energy / dataArray.length / 255, 0.8);
  }
  const threshold = 0.25 + energy * 0.5;

  for (const b of metaballs) {
    const radius = b.baseRadius * (0.8 + energy * 0.8);
    const r2 = radius * radius;
    
    const startX = Math.max(0, Math.floor((b.x - radius) / gridSize));
    const endX = Math.min(gridW - 1, Math.floor((b.x + radius) / gridSize));
    const startY = Math.max(0, Math.floor((b.y - radius) / gridSize));
    const endY = Math.min(gridH - 1, Math.floor((b.y + radius) / gridSize));

    for (let gy = startY; gy <= endY; gy++) {
      for (let gx = startX; gx <= endX; gx++) {
        const px = gx * gridSize - b.x;
        const py = gy * gridSize - b.y;
        const dist2 = px * px + py * py;
        const idx = gy * gridW + gx;
        if (dist2 < r2) {
          const falloff = 1 - Math.sqrt(dist2) / radius;
          field[idx] += falloff;
        }
      }
    }
  }

ctx.globalAlpha = volume;
   ctx.globalCompositeOperation = "screen";
   
   for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const idx = gy * gridW + gx;
      if (field[idx] > threshold) {
        const hue = 180 + Math.sin(now * 2 + (gy + gx) * 0.1) * 80;
        const alpha = Math.min(0.8, field[idx] * 0.4);
        ctx.fillStyle = `hsla(${hue}, 80%, 70%, ${alpha})`;
        ctx.fillRect(gx * gridSize, gy * gridSize, gridSize, gridSize);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

let ribbons = [];
const RIBBON_COUNT = 3;
const RIBBON_POINTS = 60;
const RIBBON_MAX_HISTORY = 200;

function updateRibbons(width, height, dataArray, timeDomainData) {
  if (!analyser) return;
  
  const volume = document.getElementById("audioPlayer")?.volume ?? 1;
  
  let energy = 0;
  let bass = 0;
  let mid = 0;
  let high = 0;
  
  if (dataArray) {
    const len = dataArray.length;
    for (let i = 0; i < Math.min(8, len); i++) bass += (dataArray[i] / 255) * volume;
    for (let i = 8; i < Math.min(30, len); i++) mid += (dataArray[i] / 255) * volume;
    for (let i = 30; i < len; i++) high += (dataArray[i] / 255) * volume;
    bass /= Math.min(8, len);
    mid /= Math.max(1, Math.min(22, len));
    high /= Math.max(1, len - 30);
    for (let i = 0; i < len; i++) energy += (dataArray[i] / 255) * volume;
    energy = Math.pow(energy / len, 0.7);
  }

  while (ribbons.length < RIBBON_COUNT) {
    ribbons.push({
      points: [],
      hue: 200 + Math.random() * 60,
      thickness: 15 + Math.random() * 20,
      phase: Math.random() * Math.PI * 2
    });
  }

  for (const ribbon of ribbons) {
    const centerX = width / 2;
    const centerY = height / 2;
    const amplitude = height * 0.25 * (0.5 + bass * 1.5);
    const freqScale = 0.5 + mid * 1.5;
    const time = performance.now() / 1000;
    
    const x = width * 0.3 + Math.sin(time * 0.8 + ribbon.phase) * width * 0.4;
    const y = centerY + Math.sin(time * 1.2 + ribbon.phase * 1.5 + bass * 2) * amplitude;
    
    ribbon.points.push({ x, y, energy, time });
    
    while (ribbon.points.length > RIBBON_MAX_HISTORY) {
      ribbon.points.shift();
    }
  }
}

function drawRibbons(width, height, dataArray) {
  if (ribbons.length === 0) return;
  
  const volume = document.getElementById("audioPlayer")?.volume ?? 1;
  const now = performance.now() / 1000;
  
  let energy = 0.1;
  let bass = 0;
  if (dataArray) {
    const len = dataArray.length;
    for (let i = 0; i < Math.min(8, len); i++) bass += (dataArray[i] / 255) * volume;
    for (let i = 0; i < len; i++) energy += (dataArray[i] / 255) * volume;
    energy /= len;
    bass /= Math.min(8, len);
  }
  
  ctx.globalAlpha = volume;
  ctx.globalCompositeOperation = "screen";
  
  for (const ribbon of ribbons) {
    if (ribbon.points.length < 2) continue;
    
    ctx.beginPath();
    
    for (let i = 0; i < ribbon.points.length - 1; i++) {
      const p0 = ribbon.points[i];
      const p1 = ribbon.points[i + 1];
      
      const thickness = ribbon.thickness * (0.5 + p0.energy * 1.5);
      
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;
      
      if (i === 0) {
        ctx.moveTo(p0.x + nx * thickness, p0.y + ny * thickness);
      }
      
      ctx.lineTo(p1.x + nx * thickness, p1.y + ny * thickness);
    }
    
    for (let i = ribbon.points.length - 1; i >= 0; i--) {
      const p0 = ribbon.points[i];
      const p1 = ribbon.points[i + 1];
      
      const thickness = ribbon.thickness * (0.5 + p0.energy * 1.5);
      
      const dx = p0.x - (i > 0 ? ribbon.points[i - 1].x : ribbon.points[0].x);
      const dy = p0.y - (i > 0 ? ribbon.points[i - 1].y : ribbon.points[0].y);
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      
      if (i === ribbon.points.length - 1) {
        ctx.lineTo(p0.x - nx * thickness, p0.y - ny * thickness);
      }
      
      if (i > 0 && i < ribbon.points.length - 1) {
        const prev = ribbon.points[i - 1];
        ctx.lineTo(prev.x - nx * thickness, prev.y - ny * thickness);
      }
    }
    
    ctx.closePath();
    
    const grad = ctx.createLinearGradient(0, 0, width, height);
    const baseHue = ribbon.hue + Math.sin(performance.now() / 1000 * 0.5) * 20;
    grad.addColorStop(0, `hsla(${baseHue}, 90%, 65%, 0.6)`);
    grad.addColorStop(0.5, `hsla(${baseHue + 30}, 80%, 55%, 0.4)`);
    grad.addColorStop(1, `hsla(${baseHue - 30}, 70%, 45%, 0.2)`);
    
    ctx.fillStyle = grad;
    ctx.fill();
    
    ctx.strokeStyle = `hsla(${baseHue}, 80%, 70%, 0.8)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

let vectors = [];
const VECTOR_SEGMENTS = 80;

function updateVectors(width, height, dataArray) {
  const now = performance.now() / 1000;
  
  const volume = document.getElementById("audioPlayer")?.volume ?? 1;
  
  let energy = 0.1;
  let bass = 0;
  if (dataArray && dataArray.length > 0) {
    const len = dataArray.length;
    for (let i = 0; i < Math.min(8, len); i++) bass += (dataArray[i] / 255) * volume;
    for (let i = 0; i < len; i++) energy += (dataArray[i] / 255) * volume;
    bass /= Math.min(8, len);
    energy /= len;
  }
  
  while (vectors.length < VECTOR_SEGMENTS) {
    vectors.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 60,
      vy: (Math.random() - 0.5) * 60,
      len: 25 + Math.random() * 45,
      hue: 200 + Math.random() * 80,
      phase: Math.random() * Math.PI * 2
    });
  }
  
  for (const v of vectors) {
    v.x += v.vx * (0.5 + energy * 2);
    v.y += v.vy * (0.5 + energy * 2);
    
    const speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
    const baseSpeed = 40 + speed * 20;
    
    v.x += Math.sin(now * 2 + v.phase) * 20 + bass * 50;
    v.y += Math.cos(now * 1.5 + v.phase) * 15 + bass * 60;
    
    v.vx += (Math.random() - 0.5) * 15 * (0.5 + bass);
    v.vy += (Math.random() - 0.5) * 15 * (0.5 + bass);
    
    const speedLimit = 120;
    const currentSpeed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
    if (currentSpeed > speedLimit) {
      v.vx = (v.vx / currentSpeed) * speedLimit;
      v.vy = (v.vy / currentSpeed) * speedLimit;
    }
    
    if (v.x < -100) v.x = width + 100;
    if (v.x > width + 100) v.x = -100;
    if (v.y < -100) v.y = height + 100;
    if (v.y > height + 100) v.y = -100;
  }
}

function drawVectors(width, height, dataArray) {
  if (vectors.length === 0) return;
  
  const volume = document.getElementById("audioPlayer")?.volume ?? 1;
  const now = performance.now() / 1000;
  
  let energy = 0.1;
  let bass = 0;
  if (dataArray) {
    const len = dataArray.length;
    for (let i = 0; i < Math.min(8, len); i++) bass += (dataArray[i] / 255) * volume;
    for (let i = 0; i < len; i++) energy += (dataArray[i] / 255) * volume;
    bass /= Math.min(8, len);
    energy /= len;
  }
  
  ctx.globalAlpha = volume;
  ctx.globalCompositeOperation = "screen";
  
  for (const v of vectors) {
    const thickness = 1 + Math.pow(energy, 1.5) * 6 + bass * 10;
    const speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy) * 0.2;
    const hue = (v.hue + now * speed * 2 + bass * 60) % 360;
    const alpha = 0.3 + energy * 0.5;
    
    const angle = Math.atan2(v.vy, v.vx);
    const ex = Math.cos(angle) * v.len;
    const ey = Math.sin(angle) * v.len;
    
    ctx.beginPath();
    ctx.moveTo(v.x, v.y);
    ctx.lineTo(v.x + ex, v.y + ey);
    
    ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${alpha})`;
    ctx.lineWidth = thickness;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(v.x, v.y, thickness * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${alpha * 0.8})`;
    ctx.fill();
  }
  
ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawNebula(width, height, dataArray) {
  if (stars.length === 0 && analyser) initStars(width, height);
  
  const volume = document.getElementById("audioPlayer")?.volume ?? 1;
  const now = performance.now() / 1000;
  
  let energy = 0;
  let bass = 0;
  if (dataArray) {
    const len = dataArray.length;
    for (let i = 0; i < Math.min(6, len); i++) bass += (dataArray[i] / 255) * volume;
    for (let i = 0; i < len; i++) energy += (dataArray[i] / 255) * volume;
    bass /= Math.min(6, len);
    energy /= len;
  }
  
  ctx.globalAlpha = volume;
  ctx.globalCompositeOperation = "lighter";
  
  for (const n of nebula) {
    const size = n.size * (0.8 + bass * 0.8 + Math.sin(n.phase) * 0.2);
    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, size);
    grad.addColorStop(0, `hsla(${n.hue}, 80%, 70%, ${(0.1 + bass * 0.3) * volume})`);
    grad.addColorStop(0.5, `hsla(${(n.hue + 30) % 360}, 60%, 50%, ${(0.08 + bass * 0.2) * volume})`);
    grad.addColorStop(1, `hsla(${(n.hue + 60) % 360}, 40%, 30%, 0)`);
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(n.x, n.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  for (const star of stars) {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${star.hue}, 70%, 80%, ${star.alpha * volume})`;
    ctx.fill();
  }
  
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawNebula(width, height, dataArray) {
  if (stars.length === 0 && analyser) initStars(width, height);
  
  const volume = document.getElementById("audioPlayer")?.volume ?? 1;
  
  let energy = 0;
  let bass = 0;
  if (dataArray) {
    const len = dataArray.length;
    for (let i = 0; i < Math.min(6, len); i++) bass += (dataArray[i] / 255) * volume;
    for (let i = 0; i < len; i++) energy += (dataArray[i] / 255) * volume;
    bass /= Math.min(6, len);
    energy /= len;
  }
  
  const now = performance.now() / 1000;
  
  ctx.globalAlpha = volume;
  ctx.globalCompositeOperation = "lighter";
  
  for (const n of nebula) {
    const size = n.size * (0.8 + bass * 0.8 + Math.sin(n.phase) * 0.2);
    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, size);
    grad.addColorStop(0, `hsla(${n.hue}, 80%, 70%, ${(0.1 + bass * 0.3) * volume})`);
    grad.addColorStop(0.5, `hsla(${(n.hue + 30) % 360}, 60%, 50%, ${(0.08 + bass * 0.2) * volume})`);
    grad.addColorStop(1, `hsla(${(n.hue + 60) % 360}, 40%, 30%, 0)`);
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(n.x, n.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  for (const star of stars) {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${star.hue}, 70%, 80%, ${star.alpha * volume})`;
    ctx.fill();
  }
  
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function setRenderMode(mode) {
    currentRenderMode = mode;
    particles.length = 0;
    fireParticles.length = 0;
 peakHoldValues.length = 0;
    gridPeakHoldValues.length = 0;
    waterfallHistory = [];
    terrainHistory = [];
    bpmPeakHistory = [];
    bpmEstimate = 120;
    metaballs.length = 0;
    ribbons.length = 0;
    vectors.length = 0;
    stars.length = 0;
    nebula.length = 0;
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

    if (currentRenderMode === "waterfall") {
      if (waterfallHistory.length === 0 || waterfallHistory[0].length !== Math.floor(frequencyData.length * 0.7)) {
        waterfallHistory = [];
      }
    }

    if (currentRenderMode === "terrain") {
      if (terrainHistory.length === 0) {
        terrainHistory = [];
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
    case "rainbowMirrorBars":
      drawEqualizerRainbowMirrorBars(width, height, frequencyData);
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
    case "metaballs":
       updateMetaballs(width, height, frequencyData);
       drawMetaballs(width, height, frequencyData);
       break;
    case "ribbons":
       updateRibbons(width, height, frequencyData, timeDomainData);
       drawRibbons(width, height, frequencyData);
       break;
    case "vectors":
       updateVectors(width, height, frequencyData);
       drawVectors(width, height, frequencyData);
       break;
    case "nebula":
       updateNebula(width, height, frequencyData);
       drawNebula(width, height, frequencyData);
       break;
    case "particles":
      updateParticles(width, height);
      drawEqualizerParticles(width, height);
      break;
    case "fire":
      updateFireParticles(width, height);
      drawEqualizerFire(width, height);
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

  isCaptureMode = false;
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch (e) { /* ignore */ }
  }
  try { analyser.disconnect(); } catch (e) { /* ignore */ }

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
    }

    if (captureSourceNode) {
      try { captureSourceNode.disconnect(); } catch (e) { /* ignore */ }
      captureSourceNode = null;
    }

    try { analyser.disconnect(); } catch (e) { /* ignore */ }

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

    mediaElementSourceCreated = false;
    captureSourceNode = externalSource;
    isCaptureMode = true;
    captureMuteGain = null;

    if (!animationId) {
      animationId = requestAnimationFrame(drawEqualizer);
    }

    stream.getVideoTracks().forEach(t => t.stop());

    stream.getAudioTracks().forEach(track => {
      track.onended = () => {
        console.log("System audio capture stopped.");
        isCaptureMode = false;
        if (captureMuteGain) {
          try { captureMuteGain.disconnect(); } catch (e) { /* ignore */ }
          captureMuteGain = null;
        }
        if (captureSourceNode) {
          try { captureSourceNode.disconnect(); } catch (e) { /* ignore */ }
          captureSourceNode = null;
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

  isCaptureMode = false;
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch (e) { /* ignore */ }
  }
  try { analyser.disconnect(); } catch (e) { /* ignore */ }

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