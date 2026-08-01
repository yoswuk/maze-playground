"use strict";

const NS = "http://www.w3.org/2000/svg";
const DIFFICULTIES = {
  easy: {
    label: "쉬움", size: 12, newestChance: 0.96, straightChance: 0.68, candidateCount: 12,
    targets: { detour: 2.4, deadEnds: 0.08, turns: 0.24, decisions: 0.08, decoyDepth: 8, nearGoalTrap: 12, longestStraight: 0.20 },
    description: "12×12 · 길이 넓고 갈림길이 적어요",
  },
  medium: {
    label: "보통", size: 18, newestChance: 0.82, straightChance: 0.35, candidateCount: 14,
    targets: { detour: 3.3, deadEnds: 0.13, turns: 0.38, decisions: 0.13, decoyDepth: 7.5, nearGoalTrap: 10, longestStraight: 0.12 },
    description: "18×18 · 적당한 갈림길과 우회로가 있어요",
  },
  hard: {
    label: "어려움", size: 24, newestChance: 0.68, straightChance: 0.14, candidateCount: 16,
    targets: { detour: 4.4, deadEnds: 0.17, turns: 0.49, decisions: 0.18, decoyDepth: 5.5, nearGoalTrap: 6, longestStraight: 0.08 },
    description: "24×24 · 긴 정답 길과 헷갈리는 막다른 길이 많아요",
  },
  expert: {
    label: "매우 어려움", size: 30, newestChance: 0.58, straightChance: 0.06, candidateCount: 20,
    targets: { detour: 5.4, deadEnds: 0.20, turns: 0.56, decisions: 0.22, decoyDepth: 7, nearGoalTrap: 9, longestStraight: 0.06 },
    description: "30×30 · 길고 촘촘한 최고난도 미로예요",
  },
};
const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
];
const PDF_LIBRARY_URLS = {
  html2canvas: "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  jspdf: "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js",
};

const state = {
  difficulty: "easy",
  seed: 260801,
  showSolution: false,
  printAnswers: true,
  mazes: [],
};

const elements = {
  printArea: document.querySelector("#print-area"),
  status: document.querySelector("#status"),
  difficultyDescription: document.querySelector("#difficulty-description"),
  toggleSolution: document.querySelector("#toggle-solution"),
  printAnswers: document.querySelector("#print-answers"),
  pdfCount: document.querySelector("#pdf-count"),
  savePdf: document.querySelector("#save-pdf"),
};

function hashText(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed) {
  let current = seed >>> 0;
  return () => {
    current += 0x6d2b79f5;
    let value = current;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function indexOfCell(row, col, size) { return row * size + col; }
function cellFromIndex(index, size) { return { row: Math.floor(index / size), col: index % size }; }
function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

function distancesFrom(start, adjacency) {
  const distances = Array(adjacency.length).fill(-1);
  const queue = [start];
  distances[start] = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const next of adjacency[current]) {
      if (distances[next] !== -1) continue;
      distances[next] = distances[current] + 1;
      queue.push(next);
    }
  }
  return distances;
}

function findPath(start, end, adjacency, size) {
  const parent = Array(adjacency.length).fill(-1);
  const queue = [start];
  parent[start] = start;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === end) break;
    for (const next of adjacency[current]) {
      if (parent[next] !== -1) continue;
      parent[next] = current;
      queue.push(next);
    }
  }
  const result = [end];
  let current = end;
  while (current !== start) {
    current = parent[current];
    result.push(current);
  }
  return result.reverse().map((index) => cellFromIndex(index, size));
}

function carvePassages(config, seed) {
  const size = config.size;
  const total = size * size;
  const random = makeRandom(seed);
  const passages = new Set();
  const visited = Array(total).fill(false);
  const directionInto = Array(total).fill(null);
  const first = Math.floor(random() * total);
  const frontier = [first];
  visited[first] = true;

  while (frontier.length) {
    const position = random() < config.newestChance
      ? frontier.length - 1
      : Math.floor(random() * frontier.length);
    const currentIndex = frontier[position];
    const current = cellFromIndex(currentIndex, size);
    const candidates = DIRS.map((dir, directionIndex) => ({
      ...dir,
      directionIndex,
      row: current.row + dir.dr,
      col: current.col + dir.dc,
    })).filter((cell) =>
      cell.row >= 0 && cell.col >= 0 && cell.row < size && cell.col < size &&
      !visited[indexOfCell(cell.row, cell.col, size)]
    );

    if (!candidates.length) {
      frontier.splice(position, 1);
      continue;
    }

    const straight = candidates.find((candidate) => candidate.directionIndex === directionInto[currentIndex]);
    const next = straight && random() < config.straightChance
      ? straight
      : candidates[Math.floor(random() * candidates.length)];
    const nextIndex = indexOfCell(next.row, next.col, size);
    passages.add(edgeKey(currentIndex, nextIndex));
    visited[nextIndex] = true;
    directionInto[nextIndex] = next.directionIndex;
    frontier.push(nextIndex);
  }

  return passages;
}

function buildAdjacency(total, passages) {
  const adjacency = Array.from({ length: total }, () => []);
  for (const key of passages) {
    const [a, b] = key.split(":").map(Number);
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return adjacency;
}

function findBoundaryRoute(adjacency, size) {
  const left = Array.from({ length: size }, (_, row) => indexOfCell(row, 0, size));
  const right = Array.from({ length: size }, (_, row) => indexOfCell(row, size - 1, size));
  let startIndex = left[0];
  let endIndex = right[0];
  let longest = -1;

  for (const candidateStart of left) {
    const distances = distancesFrom(candidateStart, adjacency);
    for (const candidateEnd of right) {
      if (distances[candidateEnd] > longest) {
        longest = distances[candidateEnd];
        startIndex = candidateStart;
        endIndex = candidateEnd;
      }
    }
  }

  return {
    startIndex,
    endIndex,
    solution: findPath(startIndex, endIndex, adjacency, size),
  };
}

function measureMaze(adjacency, solution, size) {
  const total = size * size;
  const degrees = adjacency.map((neighbors) => neighbors.length);
  const deadEnds = degrees.reduce((count, degree) => count + Number(degree === 1), 0);
  const solutionIndices = solution.map((cell) => indexOfCell(cell.row, cell.col, size));
  const solutionSet = new Set(solutionIndices);
  let turns = 0;
  let currentStraight = 1;
  let longestStraight = 1;

  for (let index = 2; index < solution.length; index += 1) {
    const previous = solution[index - 2];
    const current = solution[index - 1];
    const next = solution[index];
    const firstDirection = [current.row - previous.row, current.col - previous.col];
    const secondDirection = [next.row - current.row, next.col - current.col];
    if (firstDirection[0] !== secondDirection[0] || firstDirection[1] !== secondDirection[1]) {
      turns += 1;
      currentStraight = 1;
    } else {
      currentStraight += 1;
      longestStraight = Math.max(longestStraight, currentStraight);
    }
  }

  const decoyDepths = [];
  let nearGoalTrapDepth = 0;
  let decisions = 0;
  solutionIndices.forEach((pathCell, pathPosition) => {
    const offRoute = adjacency[pathCell].filter((neighbor) => !solutionSet.has(neighbor));
    if (offRoute.length) decisions += 1;
    for (const branchStart of offRoute) {
      let deepest = 0;
      const stack = [[branchStart, pathCell, 1]];
      while (stack.length) {
        const [current, previous, depth] = stack.pop();
        deepest = Math.max(deepest, depth);
        for (const next of adjacency[current]) {
          if (next !== previous && !solutionSet.has(next)) stack.push([next, current, depth + 1]);
        }
      }
      decoyDepths.push(deepest);
      if (pathPosition >= solutionIndices.length * 0.7) {
        nearGoalTrapDepth = Math.max(nearGoalTrapDepth, deepest);
      }
    }
  });

  const minimumRoute = size - 1 + Math.abs(solution[0].row - solution[solution.length - 1].row);
  const averageDecoyDepth = decoyDepths.reduce((sum, depth) => sum + depth, 0) / Math.max(1, decoyDepths.length);

  return {
    detourFactor: (solution.length - 1) / Math.max(1, minimumRoute),
    deadEndRatio: deadEnds / total,
    turnRatio: turns / Math.max(1, solution.length - 2),
    decisionDensity: decisions / Math.max(1, solution.length - 2),
    averageDecoyDepth,
    nearGoalTrapDepth,
    longestStraightRatio: longestStraight / Math.max(1, solution.length - 1),
  };
}

function targetFit(value, target) {
  return 1 - Math.min(Math.abs(value - target) / Math.max(target, Number.EPSILON), 1);
}

function qualityScore(metrics, targets) {
  const fits = {
    detour: targetFit(metrics.detourFactor, targets.detour),
    deadEnds: targetFit(metrics.deadEndRatio, targets.deadEnds),
    turns: targetFit(metrics.turnRatio, targets.turns),
    decisions: targetFit(metrics.decisionDensity, targets.decisions),
    decoyDepth: targetFit(metrics.averageDecoyDepth, targets.decoyDepth),
    nearGoalTrap: targetFit(metrics.nearGoalTrapDepth, targets.nearGoalTrap),
    longestStraight: targetFit(metrics.longestStraightRatio, targets.longestStraight),
  };
  return fits.detour * 3 + fits.decisions * 2.4 + fits.decoyDepth * 1.8 +
    fits.nearGoalTrap * 1.4 + fits.deadEnds * 1.2 + fits.turns + fits.longestStraight * 0.8;
}

function buildCandidate(config, seed) {
  const size = config.size;
  const passages = carvePassages(config, seed);
  const adjacency = buildAdjacency(size * size, passages);
  const route = findBoundaryRoute(adjacency, size);
  const metrics = measureMaze(adjacency, route.solution, size);
  return {
    size,
    passages,
    start: { ...cellFromIndex(route.startIndex, size), direction: "left" },
    end: { ...cellFromIndex(route.endIndex, size), direction: "right" },
    solution: route.solution,
    metrics,
    quality: qualityScore(metrics, config.targets),
  };
}

function generateMaze(difficulty, seed) {
  const config = DIFFICULTIES[difficulty];
  let best = null;

  for (let attempt = 0; attempt < config.candidateCount; attempt += 1) {
    const candidateSeed = hashText(`${seed}-${difficulty}-candidate-${attempt}`);
    const candidate = buildCandidate(config, candidateSeed);
    if (!best || candidate.quality > best.quality) best = candidate;
  }

  return { ...best, difficulty };
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function renderMazeSvg(maze, showSolution, answer) {
  const padding = 1.85;
  const svg = svgElement("svg", {
    class: "maze-svg",
    viewBox: `${-padding} ${-padding} ${maze.size + padding * 2} ${maze.size + padding * 2}`,
    role: "img",
    "aria-label": "출발에서 도착까지 길을 찾는 미로 활동지",
  });
  const title = svgElement("title");
  title.textContent = "인쇄용 미로";
  svg.append(title);

  const walls = svgElement("g", { class: "maze-walls" });
  const hasPassage = (row, col, nextRow, nextCol) => {
    if (nextRow < 0 || nextCol < 0 || nextRow >= maze.size || nextCol >= maze.size) return false;
    return maze.passages.has(edgeKey(indexOfCell(row, col, maze.size), indexOfCell(nextRow, nextCol, maze.size)));
  };

  for (let row = 0; row < maze.size; row += 1) {
    for (let col = 0; col < maze.size; col += 1) {
      if (!hasPassage(row, col, row - 1, col)) {
        walls.append(svgElement("line", { x1: col, y1: row, x2: col + 1, y2: row }));
      }
      if (!hasPassage(row, col, row, col - 1) && !(row === maze.start.row && col === 0)) {
        walls.append(svgElement("line", { x1: col, y1: row, x2: col, y2: row + 1 }));
      }
      if (col === maze.size - 1 && !(row === maze.end.row)) {
        walls.append(svgElement("line", { x1: col + 1, y1: row, x2: col + 1, y2: row + 1 }));
      }
      if (row === maze.size - 1) {
        walls.append(svgElement("line", { x1: col, y1: row + 1, x2: col + 1, y2: row + 1 }));
      }
    }
  }
  svg.append(walls);

  const startOutside = { x: -0.28, y: maze.start.row + 0.5 };
  const endOutside = { x: maze.size + 0.28, y: maze.end.row + 0.5 };
  if (showSolution || answer) {
    const points = [
      `${startOutside.x},${startOutside.y}`,
      ...maze.solution.map((cell) => `${cell.col + 0.5},${cell.row + 0.5}`),
      `${endOutside.x},${endOutside.y}`,
    ].join(" ");
    svg.append(svgElement("polyline", {
      class: `solution-path ${answer ? "answer-solution" : "screen-solution"}`,
      points,
      fill: "none",
    }));
  }

  const addEndpoint = (kind, point) => {
    const group = svgElement("g", { class: `endpoint endpoint-${kind}` });
    group.append(svgElement("circle", { cx: point.x, cy: point.y, r: 0.21 }));
    svg.append(group);
  };
  addEndpoint("start", startOutside);
  addEndpoint("end", endOutside);

  const labelAttributes = {
    "dominant-baseline": "central",
    "text-anchor": "middle",
    "font-family": '"Noto Sans KR", "Malgun Gothic", sans-serif',
    "font-size": 0.34,
    "font-weight": 900,
  };
  const startLabel = svgElement("text", { ...labelAttributes, class: "outside-label start-label", x: -1.35, y: startOutside.y });
  startLabel.textContent = "출발";
  const endLabel = svgElement("text", { ...labelAttributes, class: "outside-label end-label", x: maze.size + 1.35, y: endOutside.y });
  endLabel.textContent = "도착";
  svg.append(startLabel, endLabel);
  return svg;
}

function worksheetPage(mazes, answer, pageNumber = null) {
  const page = document.createElement("section");
  page.className = `worksheet-page ${answer ? "answer-page" : "problem-page"} items-${mazes.length}`;
  page.innerHTML = `
    <header class="worksheet-header">
      <div>
        <p class="worksheet-kicker">미로 놀이터</p>
        <h2>${answer ? "정답을 확인해요" : "길을 찾아가요!"}</h2>
        <p>${answer ? "점선을 따라 내가 찾은 길과 비교해 보세요." : "선을 넘지 않고 출발에서 도착까지 가 보세요."}</p>
      </div>
      <div class="worksheet-fields" aria-label="이름과 날짜를 적는 칸"><span>이름</span><i></i><span>날짜</span><i></i></div>
    </header>
  `;
  const grid = document.createElement("div");
  grid.className = `maze-grid items-${mazes.length}`;
  mazes.forEach((maze, index) => {
    const panel = document.createElement("article");
    panel.className = "maze-panel";
    const config = DIFFICULTIES[maze.difficulty];
    panel.innerHTML = `<div class="maze-panel-title"><strong>미로 ${pageNumber ?? index + 1}</strong><span>${config.label}</span></div>`;
    panel.append(renderMazeSvg(maze, state.showSolution, answer));
    grid.append(panel);
  });
  page.append(grid);
  const footer = document.createElement("footer");
  footer.className = "worksheet-footer";
  const config = DIFFICULTIES[mazes[0].difficulty];
  footer.innerHTML = `<span>천천히 보고, 막히면 다른 길을 찾아봐요.</span><span>${config.label} · ${config.size}×${config.size}</span>`;
  page.append(footer);
  return page;
}

function generateAll() {
  const mazeSeed = hashText(`${state.seed}-${state.difficulty}`);
  state.mazes = [generateMaze(state.difficulty, mazeSeed)];
}

function syncDifficultyButtons() {
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.difficulty === state.difficulty));
  });
}

function render() {
  elements.printArea.replaceChildren();
  elements.printArea.append(worksheetPage(state.mazes, false));
  if (state.printAnswers) elements.printArea.append(worksheetPage(state.mazes, true));
  const config = DIFFICULTIES[state.difficulty];
  elements.status.textContent = `${config.label} ${config.size}×${config.size} 미로가 준비됐어요`;
  elements.difficultyDescription.textContent = DIFFICULTIES[state.difficulty].description;
  elements.toggleSolution.textContent = state.showSolution ? "정답 숨기기" : "정답 보기";
  elements.toggleSolution.setAttribute("aria-pressed", String(state.showSolution));
  syncDifficultyButtons();
}

function loadExternalScript(src, isReady) {
  if (isReady()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => isReady() ? resolve() : reject(new Error(`라이브러리를 불러오지 못했습니다: ${src}`)));
    script.addEventListener("error", () => reject(new Error(`라이브러리를 불러오지 못했습니다: ${src}`)));
    document.head.append(script);
  });
}

let pdfLibrariesPromise = null;
function ensurePdfLibraries() {
  if (!pdfLibrariesPromise) {
    pdfLibrariesPromise = Promise.all([
      loadExternalScript(PDF_LIBRARY_URLS.html2canvas, () => typeof window.html2canvas === "function"),
      loadExternalScript(PDF_LIBRARY_URLS.jspdf, () => typeof window.jspdf?.jsPDF === "function"),
    ]).catch((error) => {
      pdfLibrariesPromise = null;
      throw error;
    });
  }
  return pdfLibrariesPromise;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function normalizedPdfCount() {
  const value = Math.trunc(Number(elements.pdfCount.value));
  const count = Number.isFinite(value) ? Math.min(10, Math.max(1, value)) : 1;
  elements.pdfCount.value = String(count);
  return count;
}

function buildPdfPages(count) {
  const difficulty = state.difficulty;
  const mazes = [state.mazes[0]];
  for (let index = 1; index < count; index += 1) {
    const seed = hashText(`${state.seed}-${difficulty}-pdf-${index}`);
    mazes.push(generateMaze(difficulty, seed));
  }

  const problemPages = mazes.map((maze, index) => worksheetPage([maze], false, index + 1));
  const answerPages = state.printAnswers
    ? mazes.map((maze, index) => worksheetPage([maze], true, index + 1))
    : [];
  return [...problemPages, ...answerPages];
}

async function saveCurrentMazeAsPdf(count) {
  await ensurePdfLibraries();
  if (document.fonts?.ready) await document.fonts.ready;

  const pages = buildPdfPages(count);
  const host = document.createElement("div");
  host.className = "pdf-capture-host";
  document.body.append(host);

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const mobile = window.matchMedia("(max-width: 720px)").matches;
    const lowMemory = Number(navigator.deviceMemory ?? 8) <= 4;
    const captureScale = mobile ? (lowMemory ? 2 : 2.35) : 3;

    for (let index = 0; index < pages.length; index += 1) {
      elements.status.textContent = `PDF ${index + 1}/${pages.length} 페이지 만드는 중`;
      const page = pages[index].cloneNode(true);
      page.querySelectorAll(".screen-solution").forEach((element) => element.remove());
      host.replaceChildren(page);
      await nextFrame();

      const canvas = await window.html2canvas(page, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: captureScale,
        useCORS: true,
        width: 794,
        height: 1123,
        windowWidth: 1440,
        windowHeight: 1123,
      });
      if (index > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
      canvas.width = 1;
      canvas.height = 1;
    }

    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    pdf.save(`miro-${state.difficulty}-${count}mazes-${date}.pdf`);
  } finally {
    host.remove();
  }
}

document.querySelectorAll("[data-difficulty]").forEach((button) => {
  button.addEventListener("click", () => {
    state.difficulty = button.dataset.difficulty;
    state.showSolution = false;
    generateAll();
    render();
  });
});

elements.printAnswers.addEventListener("change", () => {
  state.printAnswers = elements.printAnswers.checked;
  render();
});
elements.toggleSolution.addEventListener("click", () => {
  state.showSolution = !state.showSolution;
  render();
});
document.querySelector("#new-maze").addEventListener("click", () => {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  state.seed = random[0];
  state.showSolution = false;
  generateAll();
  render();
});
document.querySelector("#print-maze").addEventListener("click", () => window.print());
elements.pdfCount.addEventListener("change", normalizedPdfCount);
elements.savePdf.addEventListener("click", async () => {
  const count = normalizedPdfCount();
  const original = elements.savePdf.innerHTML;
  elements.savePdf.disabled = true;
  elements.savePdf.textContent = "PDF 만드는 중…";
  elements.status.textContent = `미로 ${count}개를 준비하고 있어요`;
  try {
    await saveCurrentMazeAsPdf(count);
    elements.status.textContent = "PDF 파일을 저장했어요";
  } catch (error) {
    console.error(error);
    elements.status.textContent = "PDF 저장에 실패했어요. 인터넷 연결을 확인해 주세요";
  } finally {
    elements.savePdf.disabled = false;
    elements.savePdf.innerHTML = original;
  }
});

generateAll();
render();
