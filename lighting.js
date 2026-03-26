// Lighting demo logic: deterministic route playback, light proximity response, and weather-adjusted behavior.
(function () {
  const map = document.getElementById("lightingMap");
  if (!map) {
    return;
  }

  const walker = document.getElementById("walker");
  const playButton = document.getElementById("lightingPlay");
  const resetButton = document.getElementById("lightingReset");
  const weatherButton = document.getElementById("weatherToggle");
  const speedInput = document.getElementById("lightingSpeed");
  const weatherValue = document.getElementById("weatherValue");
  const activeRange = document.getElementById("activeRange");
  const energySaved = document.getElementById("energySaved");
  const chartBars = Array.from(document.querySelectorAll(".mini-chart span"));
  const streetPaths = Array.from(map.querySelectorAll(".map-streets path"));

  const weatherModes = [
    { name: "Clear", radius: 132, maxBrightness: 84, savings: 41, impact: [34, 44, 58, 50, 40] },
    { name: "Rain", radius: 150, maxBrightness: 92, savings: 36, impact: [28, 38, 49, 43, 34] },
    { name: "Fog", radius: 164, maxBrightness: 100, savings: 32, impact: [24, 34, 44, 38, 30] }
  ];

  // Lamps are sampled from the actual SVG street paths so they stay visually locked to the road network.
  const lightLayout = [
    [0.16, 0.54, 0.86],
    [0.22, 0.74],
    [0.18, 0.72],
    [0.28, 0.72],
    [0.2, 0.62],
    [0.28, 0.72]
  ];

  const routePoints = [
    [90, 70], [275, 70], [355, 145], [445, 145], [445, 310], [700, 310], [785, 385]
  ];

  let weatherIndex = 0;
  let animationFrame = 0;
  let progress = 0;
  let speed = Number(speedInput.value) || 1;
  let playing = true;
  const routeLength = getRouteLength(routePoints);

  const lights = lightLayout.flatMap((samples, pathIndex) => {
    const path = streetPaths[pathIndex];
    if (!path) {
      return [];
    }

    const pathLength = path.getTotalLength();
    return samples.map((sample) => {
      const point = path.getPointAtLength(pathLength * sample);
      return [point.x, point.y];
    });
  });

  const lightElements = lights.map(([x, y]) => {
    const node = document.createElement("div");
    node.className = "light-node";
    node.style.left = `${(x / 900) * 100}%`;
    node.style.top = `${(y / 560) * 100}%`;
    map.appendChild(node);
    return { x, y, node };
  });

  function getRouteLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += distance(points[index - 1], points[index]);
    }
    return total;
  }

  function distance([ax, ay], [bx, by]) {
    return Math.hypot(ax - bx, ay - by);
  }

  function pointAt(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const targetDistance = routeLength * clamped;
    let traversed = 0;

    for (let index = 1; index < routePoints.length; index += 1) {
      const start = routePoints[index - 1];
      const end = routePoints[index];
      const segment = distance(start, end);

      if (traversed + segment >= targetDistance) {
        const local = (targetDistance - traversed) / segment;
        return [
          start[0] + (end[0] - start[0]) * local,
          start[1] + (end[1] - start[1]) * local
        ];
      }

      traversed += segment;
    }

    return routePoints[routePoints.length - 1];
  }

  function updateLights(position) {
    const mode = weatherModes[weatherIndex];
    let activeCount = 0;

    lightElements.forEach((light) => {
      const dist = distance(position, [light.x, light.y]);
      const active = dist < mode.radius;
      const intensity = Math.max(0, 1 - dist / mode.radius);
      const scale = 1 + intensity * 0.45;
      const opacity = 0.48 + intensity * 0.52;

      light.node.classList.toggle("active", active);
      light.node.style.setProperty("transform", `translate(-50%, -50%) scale(${scale})`);
      light.node.style.setProperty("opacity", `${opacity}`);
      if (active) {
        activeCount += 1;
      }
    });

    const dynamicSaving = Math.round(mode.savings - activeCount * 0.28 + (1 - progress) * 3);
    energySaved.textContent = `${Math.max(24, dynamicSaving)}%`;
  }

  function positionWalker() {
    const [x, y] = pointAt(progress);
    walker.style.left = `${(x / 900) * 100}%`;
    walker.style.top = `${(y / 560) * 100}%`;
    updateLights([x, y]);
  }

  function tick() {
    if (playing) {
      progress += 0.0016 * speed;
      if (progress > 1) {
        progress = 0;
      }
      positionWalker();
    }

    animationFrame = requestAnimationFrame(tick);
  }

  function applyWeatherMode() {
    const mode = weatherModes[weatherIndex];
    weatherValue.textContent = mode.name;
    weatherButton.textContent = `Weather: ${mode.name}`;
    activeRange.textContent = `80-${mode.maxBrightness}%`;
    chartBars.forEach((bar, index) => {
      bar.style.setProperty("--bar-height", String(mode.impact[index] || 34));
    });
    positionWalker();
  }

  function reset() {
    progress = 0;
    positionWalker();
  }

  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Play";
  });

  resetButton.addEventListener("click", reset);

  weatherButton.addEventListener("click", () => {
    weatherIndex = (weatherIndex + 1) % weatherModes.length;
    applyWeatherMode();
  });

  speedInput.addEventListener("input", () => {
    speed = Number(speedInput.value) || 1;
  });

  reset();
  applyWeatherMode();
  animationFrame = requestAnimationFrame(tick);

  window.addEventListener("beforeunload", () => cancelAnimationFrame(animationFrame));
})();
