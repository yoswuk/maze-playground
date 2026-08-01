"use strict";

const NS = "http://www.w3.org/2000/svg";
const DIFFICULTIES = {
  easy: {
    label: "쉬움", size: 8, newestChance: 0.96, straightChance: 0.68, candidateCount: 8,
    targets: { solutionRatio: 0.34, deadEndRatio: 0.09, turnRatio: 0.24, branchDepth: 3.5 },
    description: "8×8 · 길이 넓고 갈림길이 적어요",
  },
  medium: {
    label: "보통", size: 16, newestChance: 0.82, straightChance: 0.35, candidateCount: 9,
    targets: { solutionRatio: 0.27, deadEndRatio: 0.15, turnRatio: 0.38, branchDepth: 3 },
    description: "16×16 · 적당한 갈림길과 우회로가 있어요",
  },
  hard: {
    label: "어려움", size: 24, newestChance: 0.68, straightChance: 0.14, candidateCount: 10,
    targets: { solutionRatio: 0.20, deadEndRatio: 0.19, turnRatio: 0.50, branchDepth: 2.5 },
    description: "24×24 · 긴 정답 길과 헷갈리는 막다른 길이 많아요",
  },
  expert: {
    label: "매우 어려움", size: 32, newestChance: 0.58, straightChance: 0.06, candidateCount: 12,
    targets: { solutionRatio: 0.16, deadEndRatio: 0.21, turnRatio: 0.55, branchDepth: 2.2 },
    description: "32×32 · 길고 촘촘한 최고난도 미로예요",
  },
};
const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
];
const DIFFICULTY_NUMBERS = { easy: "1", medium: "2", hard: "3", expert: "4" };
const NUMBER_DIFFICULTIES = Object.fromEntries(Object.entries(DIFFICULTY_NUMBERS).map(([key, value]) => [value, key]));
const MAX_MAZE_SEED = 0xffffff;
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
  lookupForm: document.querySelector("#maze-lookup"),
  mazeNumber: document.querySelector("#maze-number"),
  lookupMessage: document.querySelector("#lookup-message"),
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

function mazeChecksum(difficulty, seed) {
  return hashText(`${DIFFICULTY_NUMBERS[difficulty]}:${seed}:maze-playground`) % 97;
}

function formatMazeNumber(difficulty, seed) {
  const safeSeed = seed & MAX_MAZE_SEED;
  const seedText = String(safeSeed).padStart(8, "0");
  const checksum = String(mazeChecksum(difficulty, safeSeed)).padStart(2, "0");
  return `${DIFFICULTY_NUMBERS[difficulty]}-${seedText}-${checksum}`;
}

function parseMazeNumber(value) {
  const raw = value.trim();
  if (/[^0-9\s-]/.test(raw)) throw new Error("숫자와 하이픈만 입력해 주세요.");
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) throw new Error("미로 번호 11자리를 확인해 주세요.");

  const difficulty = NUMBER_DIFFICULTIES[digits[0]];
  if (!difficulty) throw new Error("첫 숫자는 1부터 4까지여야 해요.");
  const seed = Number(digits.slice(1, 9));
  if (!Number.isInteger(seed) || seed > MAX_MAZE_SEED) throw new Error("미로 번호의 가운데 숫자를 확인해 주세요.");
  const expectedChecksum = mazeChecksum(difficulty, seed);
  if (Number(digits.slice(9)) !== expectedChecksum) throw new Error("미로 번호가 맞지 않아요. 다시 확인해 주세요.");

  return { difficulty, seed, number: formatMazeNumber(difficulty, seed) };
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
  let turns = 0;

  for (let index = 2; index < solution.length; index += 1) {
    const previous = solution[index - 2];
    const current = solution[index - 1];
    const next = solution[index];
    const firstDirection = [current.row - previous.row, current.col - previous.col];
    const secondDirection = [next.row - current.row, next.col - current.col];
    if (firstDirection[0] !== secondDirection[0] || firstDirection[1] !== secondDirection[1]) turns += 1;
  }

  let branchDepthTotal = 0;
  for (let leaf = 0; leaf < total; leaf += 1) {
    if (degrees[leaf] !== 1) continue;
    let previous = -1;
    let current = leaf;
    let depth = 0;
    while (degrees[current] <= 2) {
      const next = adjacency[current].find((neighbor) => neighbor !== previous);
      if (next === undefined) break;
      previous = current;
      current = next;
      depth += 1;
      if (degrees[current] !== 2) break;
    }
    branchDepthTotal += depth;
  }

  return {
    solutionRatio: (solution.length - 1) / Math.max(1, total - 1),
    deadEndRatio: deadEnds / total,
    turnRatio: turns / Math.max(1, solution.length - 2),
    averageBranchDepth: branchDepthTotal / Math.max(1, deadEnds),
  };
}

function targetFit(value, target) {
  return 1 - Math.min(Math.abs(value - target) / Math.max(target, Number.EPSILON), 1);
}

function qualityScore(metrics, targets) {
  const solutionFit = targetFit(metrics.solutionRatio, targets.solutionRatio);
  const deadEndFit = targetFit(metrics.deadEndRatio, targets.deadEndRatio);
  const turnFit = targetFit(metrics.turnRatio, targets.turnRatio);
  const branchDepthFit = Math.min(metrics.averageBranchDepth / targets.branchDepth, 1);
  return solutionFit * 4 + deadEndFit * 2 + turnFit * 1.25 + branchDepthFit * 0.75;
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
    quality: qualityScore(metrics, config.targets),
  };
}

function generateMaze(difficulty, seed, id) {
  const config = DIFFICULTIES[difficulty];
  let best = null;

  for (let attempt = 0; attempt < config.candidateCount; attempt += 1) {
    const candidateSeed = hashText(`${seed}-${difficulty}-candidate-${attempt}`);
    const candidate = buildCandidate(config, candidateSeed);
    if (!best || candidate.quality > best.quality) best = candidate;
  }

  return {
    ...best,
    id,
  };
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function renderMazeSvg(maze, showSolution, answer) {
  const padding = 1.7;
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

  const startOutside = { x: -0.32, y: maze.start.row + 0.5 };
  const endOutside = { x: maze.size + 0.32, y: maze.end.row + 0.5 };
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
    group.append(svgElement("circle", { cx: point.x, cy: point.y, r: 0.24 }));
    svg.append(group);
  };
  addEndpoint("start", startOutside);
  addEndpoint("end", endOutside);

  const startLabel = svgElement("text", { class: "outside-label start-label", x: -1.15, y: startOutside.y });
  startLabel.textContent = "출발";
  const endLabel = svgElement("text", { class: "outside-label end-label", x: maze.size + 1.15, y: endOutside.y });
  endLabel.textContent = "도착";
  svg.append(startLabel, endLabel);
  return svg;
}

function worksheetPage(mazes, answer) {
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
    panel.innerHTML = `<div class="maze-panel-title"><strong>미로 ${index + 1}</strong><span>${DIFFICULTIES[state.difficulty].label}</span></div>`;
    panel.append(renderMazeSvg(maze, state.showSolution, answer));
    grid.append(panel);
  });
  page.append(grid);
  const footer = document.createElement("footer");
  footer.className = "worksheet-footer";
  footer.innerHTML = `<span>천천히 보고, 막히면 다른 길을 찾아봐요.</span><span>미로 번호 ${mazes[0].id}</span>`;
  page.append(footer);
  return page;
}

function generateAll() {
  const mazeSeed = hashText(`${state.seed}-${state.difficulty}`) & MAX_MAZE_SEED;
  const mazeNumber = formatMazeNumber(state.difficulty, mazeSeed);
  state.mazes = [generateMaze(state.difficulty, mazeSeed, mazeNumber)];
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
  elements.status.textContent = `미로 ${state.mazes[0].id}가 준비됐어요`;
  elements.difficultyDescription.textContent = DIFFICULTIES[state.difficulty].description;
  elements.toggleSolution.textContent = state.showSolution ? "정답 숨기기" : "정답 보기";
  elements.toggleSolution.setAttribute("aria-pressed", String(state.showSolution));
  syncDifficultyButtons();
}

function setLookupMessage(message, error = false) {
  elements.lookupMessage.textContent = message;
  elements.lookupMessage.classList.toggle("is-error", error);
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

async function saveCurrentMazeAsPdf() {
  await ensurePdfLibraries();
  if (document.fonts?.ready) await document.fonts.ready;

  const pages = [...elements.printArea.querySelectorAll(".worksheet-page")];
  const host = document.createElement("div");
  host.className = "pdf-capture-host";
  document.body.append(host);

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index].cloneNode(true);
      page.querySelectorAll(".screen-solution").forEach((element) => element.remove());
      host.replaceChildren(page);
      await nextFrame();

      const canvas = await window.html2canvas(page, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: 3,
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

    pdf.save(`miro-${state.mazes[0].id}.pdf`);
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
elements.lookupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const parsed = parseMazeNumber(elements.mazeNumber.value);
    state.difficulty = parsed.difficulty;
    state.seed = parsed.seed;
    state.showSolution = false;
    state.mazes = [generateMaze(parsed.difficulty, parsed.seed, parsed.number)];
    elements.mazeNumber.value = parsed.number;
    render();
    setLookupMessage("같은 미로를 불러왔어요.");
  } catch (error) {
    setLookupMessage(error.message, true);
  }
});
document.querySelector("#new-maze").addEventListener("click", () => {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  state.seed = random[0] & MAX_MAZE_SEED;
  state.showSolution = false;
  elements.mazeNumber.value = "";
  setLookupMessage("");
  generateAll();
  render();
});
document.querySelector("#print-maze").addEventListener("click", () => window.print());
elements.savePdf.addEventListener("click", async () => {
  const original = elements.savePdf.innerHTML;
  elements.savePdf.disabled = true;
  elements.savePdf.textContent = "PDF 만드는 중…";
  elements.status.textContent = "PDF 파일을 만들고 있어요";
  try {
    await saveCurrentMazeAsPdf();
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
