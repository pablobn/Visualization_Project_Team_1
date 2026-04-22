// Real-time values (latest month in the CSV: April 2026)
const dashboardData = {
  shelter: [{ name: 'Katos', temperature: 3.7, humidity: 64.6 }],
  compounds: [
    {
      title: 'Compound 1',
      top:    { temperature: 24.1, humidity: 0 },
      middle: { temperature: 23.6, humidity: 1 },
      bottom: { temperature: 25.3, humidity: 25.8 },
      heating: 1.8, // kWh for Apr 2026
      // Previous middle temp (Mar '26) used to decide Enfriamiento vs Mesofílica
      prevMiddleTemp: 28.0
    },
    {
      title: 'Compound 2',
      top:    { temperature: 17.0, humidity: 1.1 },
      middle: { temperature: 17.1, humidity: 2.7 },
      bottom: { temperature: 23.6, humidity: 21 },
      heating: 5.6,
      prevMiddleTemp: 18.9
    }
  ],
  outdoor: [
    { name: 'Ulko', temperature: 4.2, humidity: 64.1 }
  ]
};

/* ==========================================================================
   Composting phases (Mesofílica · Termofílica · Enfriamiento · Maduración)
   Detected from the middle-zone temperature (compost core) and its trend.
   ========================================================================== */
const PHASES = {
  mesophilic: {
    id: 'mesophilic',
    label: 'Mesophilic',
    short: 'Meso',
    color: '#3ddc97',            // green
    band:  'rgba(61, 220, 151, 0.10)',
    ring:  'rgba(61, 220, 151, 0.55)',
    description: '20–40 °C · active mesophilic bacteria (start-up)'
  },
  thermophilic: {
    id: 'thermophilic',
    label: 'Thermophilic',
    short: 'Thermo',
    color: '#ff6b6b',            // red
    band:  'rgba(255, 107, 107, 0.14)',
    ring:  'rgba(255, 107, 107, 0.60)',
    description: '> 40 °C · peak activity, pathogens eliminated'
  },
  cooling: {
    id: 'cooling',
    label: 'Cooling',
    short: 'Cool',
    color: '#ffb84d',            // amber
    band:  'rgba(255, 184, 77, 0.12)',
    ring:  'rgba(255, 184, 77, 0.55)',
    description: 'Descent from the thermophilic peak back to 20–30 °C'
  },
  maturation: {
    id: 'maturation',
    label: 'Maturation',
    short: 'Mat',
    color: '#6dd3ff',            // cyan
    band:  'rgba(109, 211, 255, 0.12)',
    ring:  'rgba(109, 211, 255, 0.55)',
    description: '< 20 °C · final stabilization, cured compost'
  }
};

const PHASE_ORDER = ['mesophilic', 'thermophilic', 'cooling', 'maturation'];

// Decide phase for point i in a temperature series.
// Rules:
//   temp >= 40  → Termofílica
//   temp <  20  → Maduración
//   20 <= temp < 40:
//       · Enfriamiento if coming down from a recent thermophilic peak
//         or dropping noticeably vs. the previous point
//       · Mesofílica otherwise (initial warm-up / steady state)
function detectPhase(temps, i) {
  const t = temps[i];
  if (t == null || isNaN(t)) return null;
  if (t >= 40) return 'thermophilic';
  if (t < 20)  return 'maturation';

  // Look back up to 2 points for a recent thermophilic peak
  for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
    if (temps[j] >= 40) return 'cooling';
  }
  // Or a clear descending trend inside the mesophilic band
  if (i > 0 && temps[i - 1] - t >= 3) return 'cooling';
  return 'mesophilic';
}

// Same logic for a single point + its previous value (used in real-time cards)
function detectPhaseSingle(currentTemp, previousTemp) {
  if (currentTemp == null || isNaN(currentTemp)) return null;
  if (currentTemp >= 40) return 'thermophilic';
  if (currentTemp < 20)  return 'maturation';
  if (previousTemp != null && previousTemp >= 40) return 'cooling';
  if (previousTemp != null && previousTemp - currentTemp >= 3) return 'cooling';
  return 'mesophilic';
}

function tempStatus(value) {
  if (value == null) return '';
  if (value < 18) return 'status-low';
  if (value > 30) return 'status-high';
  return 'status-normal';
}

function humStatus(value) {
  if (value == null) return '';
  if (value < 40) return 'status-low';
  if (value > 70) return 'status-high';
  return 'status-normal';
}

function metricHTML(label, value, unit, statusClass) {
  if (value == null) {
    return `
      <div class="metric">
        <span class="label">${label}</span>
        <div class="value value-empty">--</div>
      </div>
    `;
  }

  return `
    <div class="metric">
      <span class="label">${label}</span>
      <div class="value ${statusClass}">${value}${unit}</div>
    </div>
  `;
}

function sensorCard(sensor) {
  const temperature = sensor.temperature != null ? sensor.temperature.toFixed(1) : null;
  const humidity = sensor.humidity != null ? sensor.humidity : null;

  return `
    <article class="card">
      <div class="card-title">
        <span class="card-name">${sensor.name}</span>
        <span class="pill">Current</span>
      </div>
      <div class="metrics">
        ${metricHTML('Temp', temperature, '°C', tempStatus(sensor.temperature))}
        ${metricHTML('Humidity', humidity, '%', humStatus(sensor.humidity))}
      </div>
    </article>
  `;
}

function phaseBadgeHTML(phaseId) {
  if (!phaseId || !PHASES[phaseId]) return '';
  const p = PHASES[phaseId];
  return `
    <span class="phase-badge phase-${p.id}" title="${p.description}">
      <span class="phase-dot"></span>
      <span class="phase-text">Phase: ${p.label}</span>
    </span>
  `;
}

function composterCard(compost) {
  const phaseId = detectPhaseSingle(compost.middle.temperature, compost.prevMiddleTemp);
  return `
    <article class="composter">
      <div class="composter-head">
        <h3>${compost.title}</h3>
        <div class="composter-head-right">
          ${phaseBadgeHTML(phaseId)}
          <span class="pill">Top / Middle / Bottom</span>
        </div>
      </div>

      <div class="zones">
        <div class="zone top">
          <div class="zone-header">
            <div>
              <div class="zone-title">Top</div>
              <div class="zone-sub">Upper section</div>
            </div>
          </div>
          <div class="metrics">
            ${metricHTML('Temp', compost.top.temperature.toFixed(1), '°C', tempStatus(compost.top.temperature))}
            ${metricHTML('Humidity', compost.top.humidity, '%', humStatus(compost.top.humidity))}
          </div>
        </div>

        <div class="zone middle">
          <div class="zone-header">
            <div>
              <div class="zone-title">Middle</div>
              <div class="zone-sub">Middle section</div>
            </div>
          </div>
          <div class="metrics">
            ${metricHTML('Temp', compost.middle.temperature.toFixed(1), '°C', tempStatus(compost.middle.temperature))}
            ${metricHTML('Humidity', compost.middle.humidity, '%', humStatus(compost.middle.humidity))}
          </div>
        </div>

        <div class="zone bottom">
          <div class="zone-header">
            <div>
              <div class="zone-title">Bottom</div>
              <div class="zone-sub">Lower section</div>
            </div>
          </div>
          <div class="metrics">
            ${metricHTML('Temp', compost.bottom.temperature.toFixed(1), '°C', tempStatus(compost.bottom.temperature))}
            ${metricHTML('Humidity', compost.bottom.humidity, '%', humStatus(compost.bottom.humidity))}
          </div>
        </div>
      </div>

      <div class="heat-card">
        <span class="label">Interior Heating</span>
        <div class="value status-heat">${compost.heating.toFixed(1)} kWh</div>
      </div>
    </article>
  `;
}

function renderDashboard(data) {
  document.getElementById('shelter-grid').innerHTML = data.shelter.map(sensorCard).join('');
  document.getElementById('compounds-grid').innerHTML = data.compounds.map(composterCard).join('');
  document.getElementById('outdoor-grid').innerHTML = data.outdoor.map(sensorCard).join('');
}

renderDashboard(dashboardData);

/* ==========================================================================
   Tabs: Real-Time  <>  Data Analysis
   ========================================================================== */
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
let analysisInitialized = false;

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;

    tabs.forEach((t) => {
      const isActive = t === tab;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    panels.forEach((panel) => {
      const isActive = panel.id === `tab-${target}`;
      panel.classList.toggle('active', isActive);
      if (isActive) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    });

    if (target === 'analysis' && !analysisInitialized) {
      initAnalysisCharts();
      analysisInitialized = true;
    }
  });
});

/* ==========================================================================
   Analysis data — real values from mittaukset CSV
   Monthly aggregation from May 2025 → April 2026 (12 points).
   Temperature & humidity per zone (Yläosa=Top, Keskiosa=Middle, Alaosa=Bottom)
   Heating in kWh (Lämmitys - kWh).
   ========================================================================== */
const analysisData = {
  labels: [
    "May '25", "Jun '25", "Jul '25", "Aug '25",
    "Sep '25", "Oct '25", "Nov '25", "Dec '25",
    "Jan '26", "Feb '26", "Mar '26", "Apr '26"
  ],

  // Shared environmental reference (same for both compounds)
  outdoor: {
    temperature: [9.9, 14.1, 21.5, 15.6, 12.3, 5.1, -5.6, -6.6, -19.3, -14.7, 0.4, 4.2]
  },

  compound1: {
    temperature: {
      top:    [23.7, 27.0, 26.6, 20.3, 13.8, 6.3, 30.0, 29.8, 20.5, 22.9, 29.4, 24.1],
      middle: [29.1, 29.1, 27.2, 20.4, 13.9, 6.3, 27.6, 27.8, 18.2, 20.7, 28.0, 23.6],
      bottom: [28.9, 28.4, 32.2, 22.6, 14.9, 6.1, 23.5, 23.9, 13.6, 16.4, 24.7, 25.3]
    },
    humidity: {
      top:    [0.1, 6.3, 0,    0,    0,  0,    0,   0, 0, 0, 0,   0],
      middle: [25,  11.7, 2.2, 1.1,  0.1, 0.1, 0.5, 0, 0, 0, 0,   1],
      bottom: [30.2, 28.5, 83.6, 87.2, 49, 10.9, 1,  0, 0, 0, 2.1, 25.8]
    },
    heating:  [0.0, 0.0, 0.0, 0.0, 0.0, 0.8, 18.1, 19.7, 26.9, 22.0, 16.2, 1.8] // kWh
  },

  compound2: {
    temperature: {
      top:    [29.9, 30.6, 27.9, 17.4, 11.8, 5.6, 17.2, 17.1, 13.0, 14.5, 20.4, 17.0],
      middle: [37.3, 24.0, 31.9, 18.3, 12.0, 5.8, 15.0, 14.9, 10.2, 12.2, 18.9, 17.1],
      bottom: [35.4, 21.3, 32.4, 19.9, 12.1, 5.6, 10.8, 9.9,  3.4,  5.9,  15.1, 23.6]
    },
    humidity: {
      top:    [1.3,  25.3, 17.6, 3.6,  3.6,  0.6, 0,   0, 0,   0,   0.2, 1.1],
      middle: [18.2, 0,    17.2, 5.8,  5.3,  0,   2.2, 2, 0.4, 0.5, 2.2, 2.7],
      bottom: [85.3, 14.8, 63.5, 96,   49.8, 0,   0,   0, 0,   0,   0.9, 21]
    },
    heating:  [0.0, 0.0, 0.0, 0.0, 0.0, 1.6, 31.1, 31.5, 34.8, 30.5, 28.8, 5.6]
  }
};

/* ==========================================================================
   Chart.js configuration & renderers
   ========================================================================== */
const chartColors = {
  blue: '#4da3ff',
  blueFill: 'rgba(77, 163, 255, 0.18)',
  green: '#2ecc71',
  greenFill: 'rgba(46, 204, 113, 0.18)',
  amber: '#ffb84d',
  amberFill: 'rgba(255, 184, 77, 0.22)',
  red: '#ff6b6b',
  redFill: 'rgba(255, 107, 107, 0.22)',
  grid: 'rgba(255, 255, 255, 0.08)',
  text: '#97a5bf'
};

// Accent palette per compound (used across all 4 charts)
const compoundAccent = {
  compound1: { line: chartColors.red, fill: chartColors.redFill, name: 'Compound 1' },
  compound2: { line: chartColors.amber, fill: chartColors.amberFill, name: 'Compound 2' }
};

// Single combined chart instance (3 metrics · 3 Y-axes)
let combinedChart = null;
let currentCompound = 'compound1';

// Date range selection (indices into analysisData.labels)
let rangeStart = 0;
let rangeEnd = analysisData.labels.length - 1;

// Persist dataset visibility across chart rebuilds (identified by dataset label)
const hiddenDatasetLabels = new Set();

function combinedChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: { color: chartColors.text, usePointStyle: true, boxWidth: 8 }
      },
      tooltip: {
        backgroundColor: 'rgba(16, 27, 52, 0.95)',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        titleColor: '#f8fbff',
        bodyColor: '#e5eefc'
      }
    },
    scales: {
      x: {
        grid: { color: chartColors.grid, drawTicks: false },
        ticks: { color: chartColors.text }
      },
      yTemp: {
        type: 'linear',
        position: 'left',
        title: { display: true, text: 'Temperature (°C)', color: chartColors.red },
        grid: { color: chartColors.grid, drawTicks: false },
        ticks: { color: chartColors.red }
      },
      yHum: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'Humidity (%)', color: chartColors.blue },
        grid: { drawOnChartArea: false },
        ticks: { color: chartColors.blue }
      },
      yHeat: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'Heating (kWh)', color: chartColors.amber },
        grid: { drawOnChartArea: false },
        ticks: { color: chartColors.amber },
        // Offset the third axis so it doesn't overlap the humidity one
        offset: true
      }
    }
  };
}

// Zone-specific line styles for clarity within each metric family
const zoneStyle = {
  top:    { dash: [],     alpha: 1.00 },
  middle: { dash: [6, 4], alpha: 0.90 },
  bottom: { dash: [2, 3], alpha: 0.80 }
};

// Zone color shades per metric
const zoneColor = {
  temperature: {
    top:    '#ff6b6b',
    middle: '#ff9557',
    bottom: '#ffc46b'
  },
  humidity: {
    top:    '#4da3ff',
    middle: '#6dd3ff',
    bottom: '#2ecc71'
  }
};

const zoneLabel = { top: 'Top', middle: 'Middle', bottom: 'Bottom' };

function sliceRange(arr) {
  return arr.slice(rangeStart, rangeEnd + 1);
}

function zoneDatasets(metric, zones, yAxisID) {
  return ['top', 'middle', 'bottom'].map((zone) => {
    const label = `${metric === 'temperature' ? 'Temp' : 'Humidity'} · ${zoneLabel[zone]}`;
    return {
      label,
      data: sliceRange(zones[zone]),
      yAxisID,
      borderColor: zoneColor[metric][zone],
      backgroundColor: zoneColor[metric][zone],
      tension: 0.3,
      fill: false,
      pointRadius: 2,
      borderWidth: 2,
      borderDash: zoneStyle[zone].dash,
      hidden: hiddenDatasetLabels.has(label)
    };
  });
}

/* ==========================================================================
   Chart.js plugin: paint composting-phase background bands on the time axis.
   For each visible month we compute the phase from the middle-zone temp
   (the compost core) and fill the vertical strip with that phase color.
   ========================================================================== */
const phaseBackgroundPlugin = {
  id: 'phaseBackground',
  beforeDatasetsDraw(chart, _args, opts) {
    const phases = opts && opts.phases;
    if (!phases || !phases.length) return;

    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;
    if (!xScale || !chartArea) return;

    const n = phases.length;
    for (let i = 0; i < n; i++) {
      const phaseId = phases[i];
      const phase = PHASES[phaseId];
      if (!phase) continue;

      const xCenter = xScale.getPixelForValue(i);
      const xPrev = i > 0 ? xScale.getPixelForValue(i - 1) : null;
      const xNext = i < n - 1 ? xScale.getPixelForValue(i + 1) : null;

      const xStart = xPrev == null ? chartArea.left : (xPrev + xCenter) / 2;
      const xEnd   = xNext == null ? chartArea.right : (xCenter + xNext) / 2;

      ctx.save();
      ctx.fillStyle = phase.band;
      ctx.fillRect(
        xStart,
        chartArea.top,
        xEnd - xStart,
        chartArea.bottom - chartArea.top
      );

      // Small top marker stripe so the phase is unmistakable
      ctx.fillStyle = phase.ring;
      ctx.fillRect(xStart + 1, chartArea.top, Math.max(0, xEnd - xStart - 2), 3);
      ctx.restore();
    }
  }
};

if (typeof Chart !== 'undefined' && Chart.register) {
  Chart.register(phaseBackgroundPlugin);
}

function buildPhaseArray(compoundKey) {
  const temps = analysisData[compoundKey].temperature.middle;
  // Detect phase using the full series (so previous months can influence
  // "Enfriamiento" detection), then slice to the current visible range.
  const full = temps.map((_, i) => detectPhase(temps, i));
  return full.slice(rangeStart, rangeEnd + 1);
}

function buildCombinedChart(compoundKey) {
  const ctx = document.getElementById('chart-combined');
  if (!ctx) return null;
  const series = analysisData[compoundKey];

  const outsideLabel = 'Outside · Temperature';
  const heatingLabel = 'Heating (kWh)';

  const datasets = [
    ...zoneDatasets('temperature', series.temperature, 'yTemp'),
    {
      label: outsideLabel,
      data: sliceRange(analysisData.outdoor.temperature),
      yAxisID: 'yTemp',
      borderColor: '#6dd3ff',
      backgroundColor: 'rgba(109, 211, 255, 0.18)',
      tension: 0.3,
      fill: false,
      pointRadius: 2,
      borderWidth: 2,
      borderDash: [1, 3],
      hidden: hiddenDatasetLabels.has(outsideLabel)
    },
    ...zoneDatasets('humidity', series.humidity, 'yHum'),
    {
      label: heatingLabel,
      data: sliceRange(series.heating),
      yAxisID: 'yHeat',
      borderColor: chartColors.amber,
      backgroundColor: chartColors.amberFill,
      tension: 0.3,
      fill: false,
      pointRadius: 3,
      borderWidth: 2,
      borderDash: [8, 4],
      hidden: hiddenDatasetLabels.has(heatingLabel)
    }
  ];

  const options = combinedChartOptions();
  options.plugins = options.plugins || {};
  options.plugins.phaseBackground = { phases: buildPhaseArray(compoundKey) };

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: sliceRange(analysisData.labels),
      datasets
    },
    options
  });
}

/* ==========================================================================
   Phase-legend rendering (above the chart)
   ========================================================================== */
function renderPhaseLegend() {
  const root = document.getElementById('phase-legend');
  if (!root) return;
  root.innerHTML = PHASE_ORDER.map((id) => {
    const p = PHASES[id];
    return `
      <span class="phase-chip phase-${p.id}" title="${p.description}">
        <span class="phase-dot"></span>${p.label}
      </span>
    `;
  }).join('');
}

// Capture visibility from the current chart before it gets destroyed,
// so rebuilding (date range / compound change) preserves user's choices.
function captureHiddenState() {
  if (!combinedChart) return;
  combinedChart.data.datasets.forEach((ds, idx) => {
    if (!combinedChart.isDatasetVisible(idx)) {
      hiddenDatasetLabels.add(ds.label);
    } else {
      hiddenDatasetLabels.delete(ds.label);
    }
  });
}

function populateDateSelectors() {
  const fromSel = document.getElementById('range-from');
  const toSel = document.getElementById('range-to');
  if (!fromSel || !toSel) return;

  const options = analysisData.labels
    .map((label, idx) => `<option value="${idx}">${label}</option>`)
    .join('');

  fromSel.innerHTML = options;
  toSel.innerHTML = options;

  fromSel.value = String(rangeStart);
  toSel.value = String(rangeEnd);

  const onRangeChange = () => {
    let from = parseInt(fromSel.value, 10);
    let to = parseInt(toSel.value, 10);

    // Guard: if user picks From after To, snap To to From (and vice versa)
    if (from > to) {
      if (document.activeElement === fromSel) {
        to = from;
        toSel.value = String(to);
      } else {
        from = to;
        fromSel.value = String(from);
      }
    }

    rangeStart = from;
    rangeEnd = to;
    renderAllCharts(currentCompound);
  };

  fromSel.addEventListener('change', onRangeChange);
  toSel.addEventListener('change', onRangeChange);
}

function renderAllCharts(compoundKey) {
  if (combinedChart) {
    captureHiddenState();
    combinedChart.destroy();
    combinedChart = null;
  }
  combinedChart = buildCombinedChart(compoundKey);

  const subtitle = document.getElementById('analysis-subtitle');
  if (subtitle) {
    const fromLabel = analysisData.labels[rangeStart];
    const toLabel = analysisData.labels[rangeEnd];
    const rangeText = fromLabel === toLabel
      ? fromLabel
      : `${fromLabel} → ${toLabel}`;
    subtitle.textContent =
      `Showing ${compoundAccent[compoundKey].name} · ${rangeText}.`;
  }
}

function initAnalysisCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js is not loaded.');
    return;
  }
  renderPhaseLegend();
  populateDateSelectors();
  renderAllCharts(currentCompound);

  document.querySelectorAll('.compound-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const compoundKey = btn.dataset.compound;
      if (!compoundKey || compoundKey === currentCompound) return;

      document.querySelectorAll('.compound-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      currentCompound = compoundKey;
      renderAllCharts(currentCompound);
    });
  });
}

// Ready for backend integration:
// 1. Replace dashboardData with fetch('/api/dashboard') data.
// 2. Keep the JSON keys: shelter, compounds, outdoor.
// 3. Expected CSV shape from the uploaded sample:
//    Device;Sensor;Type;Start;End;Interval;02/04;03/04;04/04;...
// 4. Example source labels from the CSV:
//    Katos -> Shelter
//    Komposti 1 -> Compound 1
//    Komposti 2 -> Compound 2
//    Ulko -> Outdoor
// 5. Example field labels from the CSV:
//    Lampotila -> temperature
//    Kosteus -> humidity
//    Lammitys - w / kWh -> heating metrics
// 6. For Data Analysis, replace analysisData with historical series
//    (hourly / daily arrays per compound).
