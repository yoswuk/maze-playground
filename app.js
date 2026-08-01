"use strict";

const NS = "http://www.w3.org/2000/svg";
const DIFFICULTIES = {
  easy: { label: "쉬움", size: 12, newestChance: 0.92, straightChance: 0.78, description: "길이 넓고 갈림길이 적어요" },
  medium: { label: "보통", size: 17, newestChance: 0.63, straightChance: 0.38, description: "조금 더 꼬불꼬불해요" },
  hard: { label: "어려움", size: 23, newestChance: 0.25, straightChance: 0.12, description: "막다른 길이 많고 촘촘해요" },
  expert: { label: "매우 어려움", size: 32, newestChance: 0.08, straightChance: 0.03, description: "32×32 최고난도 · 한 장에 1개를 권장해요" },
};
const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
];

const state = {
  difficulty: "easy",
  perPage: 1,
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

function generateMaze(difficulty, seed, id) {
  const config = DIFFICULTIES[difficulty];
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

  const adjacency = Array.from({ length: total }, () => []);
  for (const key of passages) {
    const [a, b] = key.split(":").map(Number);
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

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
    id,
    size,
    passages,
    start: { ...cellFromIndex(startIndex, size), direction: "left" },
    end: { ...cellFromIndex(endIndex, size), direction: "right" },
    solution: findPath(startIndex, endIndex, adjacency, size),
  };
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function renderMazeSvg(maze, showSolution, answer) {
  const padding = 1.55;
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

  const startOutside = { x: -0.36, y: maze.start.row + 0.5 };
  const endOutside = { x: maze.size + 0.36, y: maze.end.row + 0.5 };
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

  const addEndpoint = (kind, point, text) => {
    const group = svgElement("g", { class: `endpoint endpoint-${kind}` });
    group.append(svgElement("circle", { cx: point.x, cy: point.y, r: 0.3 }));
    const label = svgElement("text", { x: point.x, y: point.y });
    label.textContent = text;
    group.append(label);
    svg.append(group);
  };
  addEndpoint("start", startOutside, "출");
  addEndpoint("end", endOutside, "끝");

  const startLabel = svgElement("text", { class: "outside-label start-label", x: -0.84, y: startOutside.y });
  startLabel.textContent = "출발";
  const endLabel = svgElement("text", { class: "outside-label end-label", x: maze.size + 0.84, y: endOutside.y });
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
  footer.innerHTML = `<span>천천히 보고, 막히면 다른 길을 찾아봐요.</span><span>미로 번호 ${String(state.seed % 1000000).padStart(6, "0")}</span>`;
  page.append(footer);
  return page;
}

function generateAll() {
  state.mazes = Array.from({ length: state.perPage }, (_, index) =>
    generateMaze(state.difficulty, hashText(`${state.seed}-${state.difficulty}-${index}`), `${state.seed}-${index}`)
  );
}

function render() {
  elements.printArea.replaceChildren();
  elements.printArea.append(worksheetPage(state.mazes, false));
  if (state.printAnswers) elements.printArea.append(worksheetPage(state.mazes, true));
  elements.status.textContent = `${state.mazes.length}개의 미로가 준비됐어요`;
  elements.difficultyDescription.textContent = DIFFICULTIES[state.difficulty].description;
  elements.toggleSolution.textContent = state.showSolution ? "정답 숨기기" : "정답 보기";
  elements.toggleSolution.setAttribute("aria-pressed", String(state.showSolution));
}

document.querySelectorAll("[data-difficulty]").forEach((button) => {
  button.addEventListener("click", () => {
    state.difficulty = button.dataset.difficulty;
    state.showSolution = false;
    document.querySelectorAll("[data-difficulty]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    generateAll();
    render();
  });
});

document.querySelectorAll("[data-per-page]").forEach((button) => {
  button.addEventListener("click", () => {
    state.perPage = Number(button.dataset.perPage);
    document.querySelectorAll("[data-per-page]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
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

generateAll();
render();
