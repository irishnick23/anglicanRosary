const APP = document.getElementById("app");
const GLOBAL_CANVAS = document.getElementById("globalCloudCanvas");

/* 1. CONFIGURATION & FULL PRAYER TEXT */
const SESSION_KEY = "anglican_rosary_v2";
const DEFAULT_LOAD_MS = 7140;
const DUR_GHOST_EXIT_MS = 600;
const DUR_REVEAL_NEXT_DELAY_MS = 2000;
const PARTICLE_SPEED_SCALE = 0.5;
const BREATH_CYCLE_MS = 5000;
const DRIFT_SMOOTHNESS = 0.008;

const STANZAS_PER_PRAYER = {
  creed: [
    "I believe in God, the Father Almighty,\nthe maker of heaven and earth:",
    "And in Jesus Christ his only Son our Lord:\nwho was conceived by the Holy Ghost,\nborn of the Virgin Mary:",
    "Suffered under Pontius Pilate,\nwas crucified, dead, and buried:\nhe descended into hell;",
    "The third day he rose again from the dead:\nhe ascended into heaven,\nand sitteth on the right hand of God the Father Almighty:",
    "From thence he shall come\nto judge the quick and the dead.",
    "I believe in the Holy Ghost:\nthe holy catholic church;\nthe communion of saints:",
    "The forgiveness of sins:\nthe resurrection of the body,\nand the life everlasting. Amen."
  ],
  lords_prayer: [
    "Our Father which art in heaven,\nhallowed be thy name.",
    "Thy kingdom come,\nthy will be done in earth,\nas it is in heaven.",
    "Give us this day our daily bread.",
    "And forgive us our trespasses,\nas we forgive them that trespass against us.",
    "And lead us not into temptation,\nbut deliver us from evil:",
    "For thine is the kingdom,\nand the power, and the glory,\nfor ever and ever. Amen."
  ]
};

const MYSTERIES = [
  "By the mystery of thy holy incarnation;", "By thy holy nativity and circumcision;",
  "By thy baptism, fasting, and temptation;", "By thine agony and bloody sweat;",
  "By thy cross and passion;", "By thy precious death and burial;",
  "By thy glorious resurrection;", "By the coming of the Holy Ghost;"
];

/* 2. STATE ENGINE */
let session = { status: "start", nodeIndex: -1, nodeProgress: {} };
let lastRenderedScreen = null;
let loadRampStart = 0;
let loadRampDuration = 0;
let loadTimerId = null;
let flowNodes = [];

const breathEase = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

/* 3. PARTICLE ENGINE (Restored) */
function startLoadVisual(canvas) {
  const ctx = canvas.getContext("2d");
  let currentCyFactor = 0.36;
  let particles = Array.from({ length: 6500 }, () => ({
    r: Math.pow(Math.random(), 1.45), theta: Math.random() * Math.PI * 2,
    tilt: (Math.random() - 0.5) * 0.8, phase: Math.random() * Math.PI * 2,
    speed: 0.0001 + Math.random() * 0.0003, size: Math.random() < 0.9 ? 1.4 : 2.6
  }));

  function draw(now) {
    if (!canvas.width) return requestAnimationFrame(draw);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const elapsed = Date.now() - loadRampStart;
    const ramp = loadRampDuration ? Math.min(1, elapsed / loadRampDuration) : 0;
    const breath = 0.5 + 0.5 * Math.sin(now / (BREATH_CYCLE_MS / (2 * Math.PI)));

    const cx = canvas.width / 2;
    const targetCyFactor = session.status === "start" ? 0.36 : 0.5;
    currentCyFactor += (targetCyFactor - currentCyFactor) * DRIFT_SMOOTHNESS;
    const cy = canvas.height * currentCyFactor;
    const currentRadius = (canvas.width * 0.68) * (1 + breath * 0.2);
    const cloudAlpha = 0.62 + breath * 0.3 + ramp * 0.1;

    ctx.globalCompositeOperation = "lighter";
    particles.forEach(p => {
      const theta = p.theta + (now * p.speed * PARTICLE_SPEED_SCALE);
      const x = Math.cos(theta) * p.r, y = Math.sin(theta) * p.r * 0.4, z = p.tilt * p.r;
      const sX = cx + x * currentRadius, sY = cy + y * currentRadius;
      ctx.fillStyle = `rgba(228,228,231,${(1.1 - p.r) * cloudAlpha * 0.42})`;
      ctx.fillRect(sX, sY, p.size, p.size);
    });
    requestAnimationFrame(draw);
  }
  draw(0);
}

/* 4. REFINED RENDERING (Fixes Double Load & Particle Visibility) */
function render() {
  const node = flowNodes[session.nodeIndex];
  if (!node) return;

  const isSameNode = lastRenderedScreen?.nodeIndex === session.nodeIndex;

  if (isSameNode && node.type === "prayer") {
    renderStickyPrayerBody(node);
  } else {
    if (node.type === "load") {
      loadRampStart = Date.now();
      loadRampDuration = node.durationMs;
    }

    renderWithGhost(() => {
      if (node.type === "load") renderLoad(node);
      else renderPrayer(node);
    });
  }
}

function renderStart() {
  if (loadTimerId) {
    clearTimeout(loadTimerId);
    loadTimerId = null;
  }

  // Show particles immediately on the start screen.
  GLOBAL_CANVAS.style.opacity = "1";
  // Reset ramp so the cloud remains in steady breathing mode.
  loadRampStart = 0;
  loadRampDuration = 0;

  lastRenderedScreen = { type: "start", nodeIndex: -1 };
  APP.innerHTML = `
    <section class="screen screen--start">
      <h1 class="title">Anglican Rosary</h1>
      <button class="btn" id="startButton" type="button">Start</button>
    </section>
  `;
}

function renderLoad(node) {
  APP.innerHTML = `<section class="screen" id="loadScreen"></section>`;
  lastRenderedScreen = { type: "load", nodeIndex: session.nodeIndex };

  if (loadTimerId) clearTimeout(loadTimerId);
  loadTimerId = setTimeout(() => {
    loadTimerId = null;
    advanceToNextNode();
  }, node.durationMs || DEFAULT_LOAD_MS);
}

function renderPrayer(node) {
  if (loadTimerId) {
    clearTimeout(loadTimerId);
    loadTimerId = null;
  }

  const nodeProgress = getNodeProgress(session.nodeIndex, node);
  const initialState = getPrayerFlowState(node, nodeProgress);

  APP.innerHTML = `
    <section class="screen screen--prayer" id="prayerScreen">
      <div class="prayer-main">
        <div class="prayer-header">
          <p class="meta">${node.meta || ""}</p>
          <h2 class="prayer-title">${node.title || ""}</h2>
        </div>
        <div id="prayerFlow">${initialState.markup}</div>
      </div>
      <footer class="actions">
        <p class="prayer-hint" id="prayerHint">Tap anywhere to continue</p>
      </footer>
    </section>
  `;
  updateHint(initialState.canAdvance || initialState.canProgress);

  lastRenderedScreen = {
    type: "prayer",
    nodeIndex: session.nodeIndex,
    stanzaIndex: nodeProgress.stanzaIndex,
    pairIndex: nodeProgress.pairIndex
  };
}

function renderWithGhost(renderFn) {
  const activeScreen = APP.querySelector(".screen");
  if (!activeScreen) {
    const node = flowNodes[session.nodeIndex];
    GLOBAL_CANVAS.style.opacity = node?.type === "load" ? "1" : "0";
    renderFn();
    applyScreenState();
    return;
  }
  activeScreen.classList.add("screen--leaving");
  setTimeout(() => {
    const node = flowNodes[session.nodeIndex];
    GLOBAL_CANVAS.style.opacity = node?.type === "load" ? "1" : "0";
    renderFn();
    applyScreenState();
  }, DUR_GHOST_EXIT_MS);
}

function applyScreenState() {
  const screen = APP.querySelector(".screen");
  if (screen) {
    screen.classList.add("screen--entering");
    requestAnimationFrame(() => screen.classList.add("screen--entered"));
  }
}

function renderStickyPrayerBody(node) {
  const progress = getNodeProgress(session.nodeIndex, node);
  const flowState = getPrayerFlowState(node, progress);
  const prayerFlow = document.getElementById("prayerFlow");

  // FIX: Only re-render the stanza if the index actually changed
  if (lastRenderedScreen?.stanzaIndex !== progress.stanzaIndex || lastRenderedScreen?.pairIndex !== progress.pairIndex) {
    const current = prayerFlow.querySelector(".stanza-wrap") || prayerFlow.firstChild;
    if (current && current.classList) current.classList.add("stanza--leaving");

    setTimeout(() => {
      prayerFlow.innerHTML = flowState.markup;
      updateHint(flowState.canAdvance || flowState.canProgress);
    }, 400);
  } else {
    // If just a timer update, only show the hint
    updateHint(flowState.canAdvance || flowState.canProgress);
  }

  lastRenderedScreen = { ...lastRenderedScreen, stanzaIndex: progress.stanzaIndex, pairIndex: progress.pairIndex };
}

function updateHint(visible) {
  const hint = document.getElementById("prayerHint");
  if (hint) hint.classList.toggle("prayer-hint--visible", visible);
}

/* 5. INTERACTION & BOOTSTRAP */
let lastTouchTime = 0;

function handleTap(e) {
  if (e.target.closest(".dev-zone")) return;

  if (session.status === "start") {
    if (e.target.closest("#startButton")) {
      startRound();
    }
    return;
  }

  if (session.status === "in_progress") {
    handleGlobalAdvance();
  }
}

window.addEventListener("touchend", (e) => {
  lastTouchTime = Date.now();
  handleTap(e);
});

window.addEventListener("click", (e) => {
  if (Date.now() - lastTouchTime < 500) return;
  handleTap(e);
});

function handleGlobalAdvance() {
  const node = flowNodes[session.nodeIndex];
  if (!node || node.type !== "prayer") return;
  const progress = getNodeProgress(session.nodeIndex, node);
  const state = getPrayerFlowState(node, progress);
  if (state.canProgress) { state.onTap(); render(); }
  else if (state.canAdvance) advanceToNextNode();
}

function buildFlowTimeline() {
  const nodes = [
    { type: "prayer", kind: "creed", title: "Apostles' Creed", meta: "Opening" },
    { type: "load", durationMs: DEFAULT_LOAD_MS },
    {
      type: "prayer",
      kind: "invitatory",
      title: "Invitatory / Gloria",
      meta: "Opening",
      text: "O God, make speed to save us. O Lord, make haste to help us. Glory be to the Father, and to the Son, and to the Holy Ghost."
    },
    { type: "load", durationMs: DEFAULT_LOAD_MS }
  ];

  for (let week = 0; week < 4; week += 1) {
    nodes.push({
      type: "prayer",
      kind: "lords_prayer",
      title: "The Lord's Prayer",
      meta: `Week ${week + 1}`
    });
    nodes.push({ type: "load", durationMs: DEFAULT_LOAD_MS });

    nodes.push({
      type: "prayer",
      kind: `mystery_${week + 1}`,
      title: "Mystery",
      meta: `Week ${week + 1}`,
      text: MYSTERIES[week] || "By thy cross and passion;"
    });
    nodes.push({ type: "load", durationMs: DEFAULT_LOAD_MS });

    for (let bead = 0; bead < 7; bead += 1) {
      nodes.push({
        type: "prayer",
        kind: `invocation_${week + 1}_${bead + 1}`,
        title: "Invocation",
        meta: `Week ${week + 1} · Bead ${bead + 1}`,
        text: "Lord Jesus Christ, Son of God, have mercy upon me."
      });
      nodes.push({ type: "load", durationMs: DEFAULT_LOAD_MS });
    }
  }

  return nodes;
}

function getNodeProgress(index, node) {
  if (!session.nodeProgress[index]) {
    session.nodeProgress[index] = {
      stanzaIndex: 0,
      pairIndex: 0,
      nextVisibleAtEpochMs: null
    };
  }
  return session.nodeProgress[index];
}

function getPrayerFlowState(node, progress) {
  const stanzas = STANZAS_PER_PRAYER[node.kind] || [node.text];
  const isFinal = progress.stanzaIndex >= stanzas.length - 1;
  return {
    canProgress: !isFinal,
    canAdvance: isFinal,
    markup: `<div class="stanza-wrap"><p class="prayer-text">${stanzas[progress.stanzaIndex]}</p></div>`,
    onTap: () => { progress.stanzaIndex += 1; }
  };
}

function advanceToNextNode() {
  if (session.nodeIndex + 1 >= flowNodes.length) {
    session.status = "start";
    session.nodeIndex = -1;
    session.nodeProgress = {};
    renderStart();
    return;
  }

  session.nodeIndex += 1;
  render();
}

function startRound() {
  session.status = "in_progress";
  session.nodeIndex = 0;
  session.nodeProgress = {};
  lastRenderedScreen = null;
  render();
}

/* Initialize App */
function init() {
  const dpr = window.devicePixelRatio || 1;
  GLOBAL_CANVAS.width = window.innerWidth * dpr;
  GLOBAL_CANVAS.height = window.innerHeight * dpr;
  startLoadVisual(GLOBAL_CANVAS);
  flowNodes = buildFlowTimeline();
  renderStart();
}

init();