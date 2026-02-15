const APP = document.getElementById("app");
const GLOBAL_CANVAS = document.getElementById("globalCloudCanvas");

/* 1. CONFIGURATION & FULL PRAYER TEXT */
const SESSION_KEY = "anglican_rosary_v2";
const DEFAULT_LOAD_MS = 7140;
const DUR_GHOST_EXIT_MS = 600;
const DUR_REVEAL_NEXT_DELAY_MS = 2000;

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
let flowNodes = [];

const breathEase = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

/* 3. PARTICLE ENGINE (Restored) */
function startLoadVisual(canvas) {
  const ctx = canvas.getContext("2d");
  let particles = Array.from({ length: 6500 }, () => ({
    r: Math.pow(Math.random(), 2.5), theta: Math.random() * Math.PI * 2,
    tilt: (Math.random() - 0.5) * 0.8, phase: Math.random() * Math.PI * 2,
    speed: 0.0001 + Math.random() * 0.0003, size: Math.random() < 0.98 ? 0.6 : 1.8
  }));

  function draw(now) {
    if (!canvas.width) return requestAnimationFrame(draw);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const elapsed = Date.now() - loadRampStart;
    const ramp = loadRampDuration ? Math.min(1, elapsed / loadRampDuration) : 0;
    const breath = 0.5 + 0.5 * Math.sin(now / 1500); // Simple breath loop

    const cx = canvas.width / 2, cy = canvas.height / 2;
    const currentRadius = (canvas.width * 0.35) * (1 + breath * 0.2);
    const cloudAlpha = 0.52 + breath * 0.28 + ramp * 0.08;

    ctx.globalCompositeOperation = "lighter";
    particles.forEach(p => {
      const theta = p.theta + now * p.speed;
      const x = Math.cos(theta) * p.r, y = Math.sin(theta) * p.r * 0.4, z = p.tilt * p.r;
      const sX = cx + x * currentRadius, sY = cy + y * currentRadius;
      ctx.fillStyle = `rgba(228,228,231,${(1.1 - p.r) * cloudAlpha * 0.3})`;
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
    // Hide particles when entering a prayer screen
    GLOBAL_CANVAS.style.opacity = node.type === "load" ? "1" : "0";
    
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
window.addEventListener("click", (e) => {
  if (e.target.closest(".dev-zone")) return;
  if (session.status === "start") startRound();
  else if (session.status === "in_progress") handleGlobalAdvance();
});

function handleGlobalAdvance() {
  const node = flowNodes[session.nodeIndex];
  const progress = getNodeProgress(session.nodeIndex, node);
  const state = getPrayerFlowState(node, progress);
  if (state.canProgress) { state.onTap(); render(); }
  else if (state.canAdvance) advanceToNextNode();
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