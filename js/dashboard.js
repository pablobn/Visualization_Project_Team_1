const dashboardData = {
  breedingTrials: [
    { name: '18E0', temperature: 23.4, humidity: 56 },
    { name: '4B21', temperature: 24.8, humidity: 61 },
    { name: '5D20', temperature: 21.6, humidity: 54 },
    { name: 'E43B', temperature: 26.2, humidity: 67 },
    { name: 'R9A5E', temperature: 19.9, humidity: 48 },
    { name: 'Sensor 01', humidity: 52 },
    { name: 'Sensor 02', humidity: 55 },
    { name: 'Sensor 03', humidity: 58 },
    { name: 'Sensor 04', humidity: 51 },
    { name: 'Sensor 05', humidity: 49 },
    { name: 'Sensor 06', humidity: 60 },
    { name: 'Sensor 07', humidity: 57 },
    { name: 'Sensor 08', humidity: 53 },
    { name: 'Sensor 09', humidity: 62 },
    { name: 'Sensor 10', humidity: 59 },
    { name: 'Sensor 11', humidity: 50 },
    { name: 'Sensor 12', humidity: 54 }
  ],
  shelter: [{ name: 'Canopy', temperature: 20.8, humidity: 64 }],
  compounds: [
    {
      title: 'Compound 1',
      top: { temperature: 31.2, humidity: 66 },
      middle: { temperature: 42.8, humidity: 61 },
      bottom: { temperature: 36.4, humidity: 72 },
      heating: 39.5
    },
    {
      title: 'Compound 2',
      top: { temperature: 29.1, humidity: 63 },
      middle: { temperature: 40.4, humidity: 58 },
      bottom: { temperature: 35.6, humidity: 70 },
      heating: 37.8
    }
  ],
  outdoor: [
    { name: 'Outdoor', humidity: 71 },
    { name: 'Outside', temperature: 14.7 }
  ]
};

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

function composterCard(compost) {
  return `
    <article class="composter">
      <div class="composter-head">
        <h3>${compost.title}</h3>
        <span class="pill">Top / Middle / Bottom</span>
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
        <div class="value status-heat">${compost.heating.toFixed(1)}°C</div>
      </div>
    </article>
  `;
}

function renderDashboard(data) {
  document.getElementById('breeding-grid').innerHTML = data.breedingTrials.map(sensorCard).join('');
  document.getElementById('shelter-grid').innerHTML = data.shelter.map(sensorCard).join('');
  document.getElementById('compounds-grid').innerHTML = data.compounds.map(composterCard).join('');
  document.getElementById('outdoor-grid').innerHTML = data.outdoor.map(sensorCard).join('');
}

renderDashboard(dashboardData);

// Ready for backend integration:
// 1. Replace dashboardData with fetch('/api/dashboard') data.
// 2. Keep the JSON keys: breedingTrials, shelter, compounds, outdoor.
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
