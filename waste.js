// Waste demo logic: deterministic bin states, street-network routing, and animated truck collection.
(function () {
  const map = document.getElementById("wasteMap");
  if (!map) {
    return;
  }

  const routePath = document.getElementById("wasteRoutePath");
  const truck = document.getElementById("truck");
  const startButton = document.getElementById("wasteStart");
  const pauseButton = document.getElementById("wastePause");
  const resetButton = document.getElementById("wasteReset");
  const randomizeButton = document.getElementById("wasteRandomize");

  const totalBinsLabel = document.getElementById("totalBins");
  const pickupBinsLabel = document.getElementById("pickupBins");
  const routeEfficiencyLabel = document.getElementById("routeEfficiency");
  const distanceSavedLabel = document.getElementById("distanceSaved");
  const collectionStatusLabel = document.getElementById("collectionStatus");
  const collectedCountLabel = document.getElementById("collectedCount");

  const depot = [90, 500];
  const binSeeds = [
    [130, 90], [220, 90], [290, 90], [390, 180], [505, 180], [630, 180], [760, 120],
    [150, 280], [250, 280], [345, 280], [445, 350], [560, 350], [720, 350],
    [205, 455], [300, 455], [395, 455], [515, 410], [655, 410], [810, 410]
  ];

  const patterns = [
    [true, false, false, true, false, true, false, false, true, false, true, false, false, true, false, false, true, false, true],
    [false, true, false, true, false, false, true, false, true, true, false, false, true, false, true, false, false, true, false],
    [true, true, false, false, true, false, true, false, false, true, false, true, false, false, true, true, false, false, true]
  ];

  // Street network segments mirror the visible map-streets SVG so routing stays on-road.
  const streetSegments = [
    { a: [110, 90], b: [290, 90] },
    { a: [290, 90], b: [390, 180] },
    { a: [390, 180], b: [445, 180] },
    { a: [445, 180], b: [630, 180] },
    { a: [630, 180], b: [760, 120] },
    { a: [150, 280], b: [290, 280] },
    { a: [290, 280], b: [345, 280] },
    { a: [345, 280], b: [445, 350] },
    { a: [445, 350], b: [630, 350] },
    { a: [630, 350], b: [720, 350] },
    { a: [205, 455], b: [290, 455] },
    { a: [290, 455], b: [395, 455] },
    { a: [395, 455], b: [515, 410] },
    { a: [515, 410], b: [630, 410] },
    { a: [630, 410], b: [810, 410] },
    { a: [290, 90], b: [290, 280] },
    { a: [290, 280], b: [290, 455] },
    { a: [445, 180], b: [445, 350] },
    { a: [445, 350], b: [445, 455] },
    { a: [630, 120], b: [630, 180] },
    { a: [630, 180], b: [630, 350] },
    { a: [630, 350], b: [630, 410] }
  ];

  let bins = [];
  let urgentBins = [];
  let routePoints = [];
  let routeLengths = [];
  let totalRouteLength = 0;
  let progress = 0;
  let playing = false;
  let animationFrame = 0;
  let collected = new Set();
  let patternIndex = 0;
  let routeStops = [];
  let serviceLookup = new Map();

  const binElements = binSeeds.map(([x, y], index) => {
    const node = document.createElement("div");
    node.className = "bin-node";
    node.dataset.index = String(index);
    node.style.left = `${(x / 900) * 100}%`;
    node.style.top = `${(y / 560) * 100}%`;
    map.appendChild(node);
    return { x, y, node, index };
  });

  function distance([ax, ay], [bx, by]) {
    return Math.hypot(ax - bx, ay - by);
  }

  function pointKey([x, y]) {
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }

  function projectPointToSegment(point, segment) {
    const [px, py] = point;
    const [ax, ay] = segment.a;
    const [bx, by] = segment.b;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const rawT = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, rawT));
    const projected = [ax + dx * t, ay + dy * t];

    return {
      point: projected,
      t,
      distance: distance(point, projected)
    };
  }

  function getNearestStreetPoint(point) {
    let best = null;

    streetSegments.forEach((segment, index) => {
      const candidate = projectPointToSegment(point, segment);
      if (!best || candidate.distance < best.distance) {
        best = {
          ...candidate,
          segmentIndex: index
        };
      }
    });

    return best;
  }

  function buildGraph(servicePoints) {
    const graph = new Map();
    const addNode = (point) => {
      const key = pointKey(point);
      if (!graph.has(key)) {
        graph.set(key, { point, edges: [] });
      }
      return key;
    };

    streetSegments.forEach((segment, index) => {
      const candidates = [
        { point: segment.a, t: 0 },
        { point: segment.b, t: 1 }
      ];

      servicePoints.forEach((service) => {
        if (service.segmentIndex === index) {
          candidates.push({ point: service.point, t: service.t });
        }
      });

      candidates
        .sort((left, right) => left.t - right.t)
        .forEach((candidate, candidateIndex, list) => {
          addNode(candidate.point);
          if (candidateIndex === 0) {
            return;
          }

          const previous = list[candidateIndex - 1];
          const from = addNode(previous.point);
          const to = addNode(candidate.point);
          const segmentDistance = distance(previous.point, candidate.point);

          graph.get(from).edges.push({ to, distance: segmentDistance });
          graph.get(to).edges.push({ to: from, distance: segmentDistance });
        });
    });

    return graph;
  }

  function shortestPath(graph, startPoint, endPoint) {
    const startKey = pointKey(startPoint);
    const endKey = pointKey(endPoint);
    const distances = new Map();
    const previous = new Map();
    const queue = new Set(graph.keys());

    graph.forEach((_value, key) => distances.set(key, Infinity));
    distances.set(startKey, 0);

    while (queue.size > 0) {
      let currentKey = null;
      let currentDistance = Infinity;

      queue.forEach((key) => {
        const candidateDistance = distances.get(key);
        if (candidateDistance < currentDistance) {
          currentDistance = candidateDistance;
          currentKey = key;
        }
      });

      if (!currentKey || currentDistance === Infinity) {
        break;
      }

      queue.delete(currentKey);

      if (currentKey === endKey) {
        break;
      }

      const currentNode = graph.get(currentKey);
      currentNode.edges.forEach((edge) => {
        if (!queue.has(edge.to)) {
          return;
        }

        const nextDistance = currentDistance + edge.distance;
        if (nextDistance < distances.get(edge.to)) {
          distances.set(edge.to, nextDistance);
          previous.set(edge.to, currentKey);
        }
      });
    }

    const path = [];
    let current = endKey;
    while (current) {
      path.unshift(graph.get(current).point);
      current = previous.get(current);
    }

    return {
      distance: distances.get(endKey),
      points: path
    };
  }

  function buildBins(pattern) {
    bins = binElements.map((bin, index) => ({
      ...bin,
      urgent: pattern[index]
    }));
    urgentBins = bins.filter((bin) => bin.urgent);
    collected = new Set();
    renderBins();
    buildRoute();
    updateDashboard("Idle");
  }

  function renderBins() {
    bins.forEach((bin) => {
      const serviced = collected.has(bin.index);
      bin.node.className = "bin-node";
      bin.node.classList.add(serviced || !bin.urgent ? "normal" : "urgent");
    });
  }

  function buildRoute() {
    const depotSnap = getNearestStreetPoint(depot);
    const servicePoints = [
      { id: "depot", point: depotSnap.point, segmentIndex: depotSnap.segmentIndex, t: depotSnap.t },
      ...urgentBins.map((bin) => {
        const snap = getNearestStreetPoint([bin.x, bin.y]);
        return {
          id: String(bin.index),
          binIndex: bin.index,
          point: snap.point,
          segmentIndex: snap.segmentIndex,
          t: snap.t
        };
      })
    ];

    const graph = buildGraph(servicePoints);
    serviceLookup = new Map(servicePoints.map((service) => [service.id, service]));

    const remaining = servicePoints.slice(1);
    const orderedStops = [servicePoints[0]];
    let current = servicePoints[0];

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let bestPath = null;

      remaining.forEach((candidate, index) => {
        const candidatePath = shortestPath(graph, current.point, candidate.point);
        if (!bestPath || candidatePath.distance < bestPath.distance) {
          bestPath = { ...candidatePath, candidate };
          nearestIndex = index;
        }
      });

      const [nextStop] = remaining.splice(nearestIndex, 1);
      orderedStops.push(nextStop);
      current = nextStop;
    }

    routeStops = orderedStops;
    routePoints = [orderedStops[0].point];

    for (let index = 1; index < orderedStops.length; index += 1) {
      const segmentPath = shortestPath(graph, orderedStops[index - 1].point, orderedStops[index].point).points;
      segmentPath.slice(1).forEach((point) => routePoints.push(point));
    }

    routeLengths = [];
    totalRouteLength = 0;

    for (let index = 1; index < routePoints.length; index += 1) {
      const segmentLength = distance(routePoints[index - 1], routePoints[index]);
      routeLengths.push(segmentLength);
      totalRouteLength += segmentLength;
    }

    routePath.setAttribute("d", routePoints.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" "));
    routePath.style.strokeDasharray = `${Math.max(totalRouteLength, 1)} ${Math.max(totalRouteLength, 1)}`;
    routePath.style.strokeDashoffset = `${Math.max(totalRouteLength, 1)}`;
  }

  function pointAt(t) {
    if (routePoints.length <= 1) {
      return depot;
    }

    const clamped = Math.max(0, Math.min(1, t));
    const targetDistance = totalRouteLength * clamped;
    let traversed = 0;

    for (let index = 1; index < routePoints.length; index += 1) {
      const start = routePoints[index - 1];
      const end = routePoints[index];
      const segment = routeLengths[index - 1];

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

  function markCollected(position) {
    urgentBins.forEach((bin) => {
      const servicePoint = serviceLookup.get(String(bin.index));
      const targetPoint = servicePoint ? servicePoint.point : [bin.x, bin.y];
      if (!collected.has(bin.index) && distance(position, targetPoint) < 16) {
        collected.add(bin.index);
      }
    });
    renderBins();
  }

  function updateDashboard(status) {
    const urgentCount = urgentBins.length;
    const servicedCount = collected.size;
    const efficiency = urgentCount === 0 ? 100 : Math.round(100 - (urgentCount / binSeeds.length) * 38);
    const distanceSaved = Math.max(0.8, ((binSeeds.length - urgentCount) * 0.22 + 0.9)).toFixed(1);

    totalBinsLabel.textContent = String(binSeeds.length);
    pickupBinsLabel.textContent = String(urgentCount);
    routeEfficiencyLabel.textContent = `${efficiency}%`;
    distanceSavedLabel.textContent = `${distanceSaved} km`;
    collectionStatusLabel.textContent = status;
    collectedCountLabel.textContent = `${servicedCount}/${urgentCount}`;
  }

  function positionTruck() {
    const [x, y] = pointAt(progress);
    truck.style.left = `${(x / 900) * 100}%`;
    truck.style.top = `${(y / 560) * 100}%`;
    routePath.style.strokeDashoffset = `${Math.max(totalRouteLength * (1 - progress), 0)}`;
    markCollected([x, y]);
    updateDashboard(playing ? "Collecting" : progress >= 1 ? "Completed" : "Paused");
  }

  function reset() {
    progress = 0;
    playing = false;
    startButton.textContent = "Start Route";
    pauseButton.textContent = "Pause";
    positionTruck();
    updateDashboard("Idle");
  }

  function tick() {
    if (playing && totalRouteLength > 0) {
      progress += 0.0019;
      if (progress >= 1) {
        progress = 1;
        playing = false;
        startButton.textContent = "Replay Route";
      }
      positionTruck();
    }

    animationFrame = requestAnimationFrame(tick);
  }

  startButton.addEventListener("click", () => {
    if (progress >= 1) {
      buildBins(patterns[patternIndex]);
      progress = 0;
    }
    playing = true;
    startButton.textContent = "Running";
    pauseButton.textContent = "Pause";
    updateDashboard("Collecting");
  });

  pauseButton.addEventListener("click", () => {
    playing = !playing;
    pauseButton.textContent = playing ? "Pause" : "Resume";
    updateDashboard(playing ? "Collecting" : "Paused");
  });

  resetButton.addEventListener("click", () => {
    pauseButton.textContent = "Pause";
    buildBins(patterns[patternIndex]);
    reset();
  });

  randomizeButton.addEventListener("click", () => {
    patternIndex = (patternIndex + 1) % patterns.length;
    pauseButton.textContent = "Pause";
    buildBins(patterns[patternIndex]);
    reset();
  });

  buildBins(patterns[patternIndex]);
  positionTruck();
  animationFrame = requestAnimationFrame(tick);

  window.addEventListener("beforeunload", () => cancelAnimationFrame(animationFrame));
})();
