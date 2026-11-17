const APP = document.getElementById("app");
const GLOBAL_CANVAS = document.getElementById("globalCloudCanvas");

/* 1. CONFIGURATION & FULL PRAYER TEXT */
const SESSION_KEY = "anglican_rosary_v2";
const DEFAULT_LOAD_MS = 7140;
const DUR_GHOST_EXIT_MS = 850;
const DUR_REVEAL_NEXT_DELAY_MS = 2000;
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
let loadTimerId = null;
let flowNodes = [];

function startLoadVisual(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Project grains from a softly lit volume into reusable layers.
  const resolution = 640;
  const layers = Array.from({ length: 5 }, (_, layer) => {
    const texture = document.createElement("canvas");
    texture.width = texture.height = resolution;
    const paint = texture.getContext("2d");
    for (let i = 0; i < 26000; i++) {
      const angle = Math.random() * Math.PI * 2;
      const z = 2 * Math.random() - 1;
      const latitude = Math.sqrt(1 - z * z);
      const radius = 0.39 * Math.cbrt(Math.random()) *
        (0.88 + 0.20 * Math.random() + 0.035 * Math.sin(angle * 3 + layer));
      const x = latitude * Math.cos(angle);
      const y = latitude * Math.sin(angle);
      const light = (1.6 - x - y + z) / 4;
      const size = Math.random() < 0.025 ? 2.3 : 1.25;
      paint.fillStyle = "rgba(236,231,219," + (0.07 + 0.69 * Math.max(0, light)) + ")";
      paint.fillRect((0.5 + radius * x) * resolution, (0.5 + radius * y) * resolution, size, size);
    }
    return texture;
  });
  let frame = 0, last = 0, time = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const span = Math.min(canvas.width * 0.84, canvas.height * 0.53);
    const center = canvas.height * (session.status === "start" ? 0.39 : 0.5);
    ctx.globalCompositeOperation = "lighter";
    layers.forEach((texture, layer) => {
      const phase = layer * 1.3;
      const diameter = span * (1 + 0.027 * Math.sin(time * 0.22 + phase * 0.3));
      ctx.save();
      ctx.translate(canvas.width / 2 + span * 0.012 * Math.sin(time * 0.17 + phase),
        center + span * 0.015 * Math.cos(time * 0.21 + phase));
      ctx.rotate(0.23 * Math.sin(time * 0.09 + phase));
      ctx.drawImage(texture, -diameter / 2, -diameter / 2, diameter, diameter);
      ctx.restore();
    });
  }

  function tick(now) {
    if (!last || now - last >= 32) {
      if (last) time += Math.min(now - last, 100) / 1000;
      last = now;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    last = 0;
    if (document.hidden || getComputedStyle(canvas).opacity === "0" && canvas.style.opacity === "0") return;
    draw();
    if (!reduced.matches) frame = requestAnimationFrame(tick);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    sync();
  }
  new MutationObserver(sync).observe(canvas, { attributes: true, attributeFilter: ["style"] });
  canvas.addEventListener("transitionend", sync);
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);
  window.addEventListener("resize", resize);
  resize();
}

/* 4. REFINED RENDERING (Fixes Double Load & Particle Visibility) */
function render() {
  const node = flowNodes[session.nodeIndex];
  if (!node) return;

  const isSameNode = lastRenderedScreen?.nodeIndex === session.nodeIndex;

  if (isSameNode && node.type === "prayer") {
    renderStickyPrayerBody(node);
  } else {
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
  const nextNode = flowNodes[session.nodeIndex];
  if (!activeScreen) {
    GLOBAL_CANVAS.style.opacity = nextNode?.type === "load" ? "1" : "0";
    renderFn();
    applyScreenState();
    return;
  }
  // Start canvas fade-in while the prayer screen exits to avoid a hard cut.
  if (nextNode?.type === "load") {
    GLOBAL_CANVAS.style.opacity = "1";
  }
  activeScreen.classList.add("screen--leaving");
  setTimeout(() => {
    GLOBAL_CANVAS.style.opacity = nextNode?.type === "load" ? "1" : "0";
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
  startLoadVisual(GLOBAL_CANVAS);
  flowNodes = buildFlowTimeline();
  renderStart();
}

init();