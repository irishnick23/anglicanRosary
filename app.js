const APP = document.getElementById("app");
const GLOBAL_CANVAS = document.getElementById("globalCloudCanvas");

/* 1. CONFIGURATION & FULL PRAYER TEXT */
const SESSION_KEY = "anglican_rosary_v2";
const DEFAULT_LOAD_MS = 7140;
const DUR_GHOST_EXIT_MS = 600;
const DUR_REVEAL_NEXT_DELAY_MS = 2000;
const PARTICLE_SPEED_SCALE = 0.62;
const BREATH_CYCLE_MS = 10000;
const DRIFT_SMOOTHNESS = 0.015;
const PARTICLE_COUNT_BASELINE = 18000;
const PARTICLE_COUNT_MULTIPLIER = 20;
const PARTICLE_COUNT_SAFETY_CAP = 65000;

const STANZAS_PER_PRAYER = {
  creed: [
    "I believe in God, the Father Almighty,\nthe Maker of heaven and earth:",
    "And in Jesus Christ his only Son our Lord:\nWho was conceived by the Holy Ghost,\nBorn of the Virgin Mary:",
    "Suffered under Pontius Pilate,\nWas crucified, dead, and buried:\nHe descended into hell;",
    "The third day he rose again from the dead:\nHe ascended into heaven,\nAnd sitteth on the right hand of God the Father Almighty:",
    "From thence he shall come\nto judge the quick and the dead.",
    "I believe in the Holy Ghost:\nThe holy catholic church;\nThe communion of saints:",
    "The forgiveness of sins:\nThe resurrection of the body,\nAnd the life everlasting. Amen."
  ],
  lords_prayer: [
    "Our Father which art in heaven,\nhallowed be thy name.",
    "Thy kingdom come,\nThy will be done in earth,\nas it is in heaven.",
    "Give us this day our daily bread.",
    "And forgive us our trespasses,\nas we forgive them that trespass against us.",
    "And lead us not into temptation,\nbut deliver us from evil:",
    "For thine is the kingdom,\nand the power, and the glory,\nfor ever and ever. Amen."
  ],
  invitatory: [
    "O God, make speed to save us.",
    "O Lord, make haste to help us."
  ],
  gloria: [
    "Glory be to the Father, and to the Son, and to the Holy Ghost;",
    "As it was in the beginning, is now, and ever shall be, world without end. Amen."
  ]
};

const MYSTERIES = [
  "By the Mystery of Thy Holy Incarnation;", "By Thy Holy Nativity and Circumcision;",
  "By Thy Baptism, Fasting, and Temptation;", "By Thine Agony and Bloody Sweat;",
  "By Thy Cross and Passion;", "By Thy Precious Death and Burial;",
  "By Thy Glorious Resurrection;", "By the coming of the Holy Ghost;"
];

const OPENING_SCREEN_ORDER = [
  { type: "load" },
  {
    type: "prayer",
    kind: "creed",
    title: "Apostles' Creed",
    meta: "Opening"
  },
  { type: "load" },
  {
    type: "prayer",
    kind: "invitatory",
    title: "Invitatory",
    meta: "Opening",
    text: ""
  },
  {
    type: "prayer",
    kind: "gloria",
    title: "Gloria",
    meta: "Opening",
    text: ""
  },
  { type: "load" }
];

const INVOCATIONS_PER_MYSTERY = 7;
const INVOCATION_TEXT = "God the Son, Redeemer of the World: have mercy upon us miserable Sinners.";

function createLoadNode(step = {}) {
  return { type: "load", durationMs: step.durationMs || DEFAULT_LOAD_MS };
}

function createSinglePassMysteryNodes() {
  const nodes = [];

  nodes.push({
    type: "prayer",
    kind: "lords_prayer",
    title: "The Lord's Prayer",
    meta: "Main Sequence"
  });
  nodes.push(createLoadNode());

  for (let mysteryIndex = 1; mysteryIndex <= MYSTERIES.length; mysteryIndex += 1) {
    nodes.push({
      type: "prayer",
      kind: `mystery_${mysteryIndex}`,
      title: `Mystery ${mysteryIndex}`,
      meta: "Main Sequence",
      text: MYSTERIES[mysteryIndex - 1] || "By thy cross and passion;"
    });

    for (let bead = 1; bead <= INVOCATIONS_PER_MYSTERY; bead += 1) {
      nodes.push({
        type: "prayer",
        kind: `invocation_${mysteryIndex}_${bead}`,
        title: "Invocation",
        meta: `Mystery ${mysteryIndex} · Bead ${bead}`,
        text: INVOCATION_TEXT
      });
    }
    nodes.push(createLoadNode());
  }

  return nodes;
}

/* 2. STATE ENGINE */
let session = { status: "start", nodeIndex: -1, nodeProgress: {} };
let lastRenderedScreen = null;
let loadRampStart = 0;
let loadRampDuration = 0;
let loadTimerId = null;
let flowNodes = [];

const breathEase = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

/* 3. PARTICLE ENGINE: The Breath of the Spirit */
function startLoadVisual(canvas) {
  const ctx = canvas.getContext("2d");
  let currentCyFactor = 0.41;
  const particleCount = Math.min(
    PARTICLE_COUNT_BASELINE * PARTICLE_COUNT_MULTIPLIER,
    PARTICLE_COUNT_SAFETY_CAP
  );
  const particles = Array.from({ length: particleCount }, () => ({
    r: Math.pow(Math.random(), 1.85),
    theta: Math.random() * Math.PI * 2,
    speed: 0.000035 + Math.random() * 0.000055,
    size: Math.random() < 0.96 ? 0.38 : 0.9,
    wavePhase: Math.random() * Math.PI * 2,
    depth: 0.7 + Math.random() * 0.6
  }));

  function draw(now) {
    if (!canvas.width) return requestAnimationFrame(draw);
    // Keep a subtle trail for cohesion, but clear faster so particles stay crisp.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const elapsed = Date.now() - loadRampStart;
    const ramp = loadRampDuration ? Math.min(1, elapsed / loadRampDuration) : 0;
    const breath = 0.5 + 0.5 * Math.sin(now / (BREATH_CYCLE_MS / (2 * Math.PI)));

    const cx = canvas.width / 2;
    const targetCyFactor = session.status === "start" ? 0.41 : 0.5;
    currentCyFactor += (targetCyFactor - currentCyFactor) * DRIFT_SMOOTHNESS;
    const cy = canvas.height * currentCyFactor;
    const currentRadius = (Math.min(canvas.width, canvas.height) * 0.62) * (1 + breath * 0.22);
    const spiritGlow = 0.55 + breath * 0.35 + ramp * 0.08;

    const flameSway = Math.sin(now / 2200) * 0.018 + Math.sin(now / 900) * 0.008;
    ctx.globalCompositeOperation = "lighter";
    particles.forEach(p => {
      const ripple = Math.sin(now / 1600 + p.wavePhase) * 0.032;
      const theta = p.theta + (now * p.speed * PARTICLE_SPEED_SCALE);
      const radial = p.r + ripple;
      const coreWeight = 1 - p.r;
      const upliftPulse = 0.12 + 0.08 * Math.sin(now / 950 + p.wavePhase);
      const flameLift = coreWeight * upliftPulse * (0.72 + breath * 0.28);
      const taper = Math.max(0.5, 1 - flameLift * 1.2);
      const dance = (
        Math.sin(now / 1600 + p.wavePhase) +
        0.6 * Math.sin(now / 760 + p.wavePhase * 1.7)
      ) * 0.02 * coreWeight;
      const x = Math.cos(theta) * radial * taper + dance + flameSway * coreWeight;
      const y = Math.sin(theta) * radial * (1 + coreWeight * 0.18) - flameLift;
      const sX = cx + x * currentRadius;
      const sY = cy + y * currentRadius;
      const alpha = Math.max(0.01, (1.1 - p.r) * spiritGlow * 0.24 * p.depth);

      ctx.fillStyle = `rgba(228,228,231,${alpha})`;
      const drawSize = p.size * (0.8 + breath * 0.22) * p.depth;
      if (drawSize <= 0.95) {
        ctx.fillRect(sX, sY, 1, 1);
      } else {
        ctx.beginPath();
        ctx.arc(sX, sY, drawSize, 0, Math.PI * 2);
        ctx.fill();
      }
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
  const nodes = [];

  OPENING_SCREEN_ORDER.forEach((step) => {
    if (step.type === "load") {
      nodes.push(createLoadNode(step));
      return;
    }

    if (step.type === "prayer") {
      nodes.push({ ...step });
    }
  });

  nodes.push(...createSinglePassMysteryNodes());

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