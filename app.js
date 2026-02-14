const APP = document.getElementById("app");
const GLOBAL_CLOUD_CANVAS = document.getElementById("globalCloudCanvas");

const SESSION_KEY = "anglican_rosary_session_v2";
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_LOAD_MS = 7140;
const DEV_RESET_ENABLED = true;
const DEV_GESTURE_TAP_TARGET = 5;

const DUR_BREATH_CYCLE = 10000;
const DUR_BREATH_INHALE = 4000;
const DUR_BREATH_HOLD = 1000;
const DUR_BREATH_EXHALE = 5000;
const DUR_GHOST_EXIT_MS = 1200;
const DUR_GHOST_ENTER_MS = 1500;
const DUR_REVEAL_NEXT_DELAY_MS = 2000;
const DUR_FINALE_MS = 2200;
const TRANSITION_GHOST = "1500ms cubic-bezier(0.22, 1, 0.36, 1)";
const COLOR_MOONLIGHT = "#D4D4D8";
const COLOR_FOCUS_CORE = "#E4E4E7";

const APOSTLES_CREED =
  "I believe in God, the Father Almighty, the maker of heaven and earth: and in Jesus Christ his only Son our Lord: who was conceived by the Holy Ghost, born of the Virgin Mary: suffered under Pontius Pilate, was crucified, dead, and buried: he descended into hell; the third day he rose again from the dead: he ascended into heaven, and sitteth on the right hand of God the Father Almighty: from thence he shall come to judge the quick and the dead. I believe in the Holy Ghost: the holy catholic church; the communion of saints: the forgiveness of sins: the resurrection of the body, and the life everlasting. Amen.";

const INVITATORY_GLORIA =
  "V. O God, make speed to save us.\nR. O Lord, make haste to help us.\nV. Glory be to the Father, and to the Son, and to the Holy Ghost;\nR. As it was in the beginning, is now, and ever shall be, world without end. Amen.";

const LORDS_PRAYER =
  "Our Father which art in heaven, hallowed be thy name. Thy kingdom come, thy will be done in earth, as it is in heaven. Give us this day our daily bread. And forgive us our trespasses, as we forgive them that trespass against us. And lead us not into temptation, but deliver us from evil: for thine is the kingdom, and the power, and the glory, for ever and ever. Amen.";

const INVOCATION =
  "O God the Son, Redeemer of the world: have mercy upon us miserable sinners.";

const STANZAS_PER_PRAYER = {
  creed: [
    "I believe in God, the Father Almighty,\nthe maker of heaven and earth:",
    "And in Jesus Christ his only Son our Lord:\nwho was conceived by the Holy Ghost,\nborn of the Virgin Mary:",
    "Suffered under Pontius Pilate,\nwas crucified, dead, and buried:\nhe descended into hell;",
    "The third day he rose again from the dead:\nhe ascended into heaven,\nand sitteth on the right hand of God the Father Almighty:",
    "From thence he shall come\nto judge the quick and the dead.",
    "I believe in the Holy Ghost:\nthe holy catholic church;\nthe communion of saints:",
    "The forgiveness of sins:\nthe resurrection of the body,\nand the life everlasting. Amen.",
  ],
  lords_prayer: [
    "Our Father which art in heaven,\nhallowed be thy name.",
    "Thy kingdom come,\nthy will be done in earth,\nas it is in heaven.",
    "Give us this day our daily bread.",
    "And forgive us our trespasses,\nas we forgive them that trespass against us.",
    "And lead us not into temptation,\nbut deliver us from evil:",
    "For thine is the kingdom,\nand the power, and the glory,\nfor ever and ever. Amen.",
  ],
};

const MYSTERIES = [
  "By the mystery of thy holy incarnation;",
  "By thy holy nativity and circumcision;",
  "By thy baptism, fasting, and temptation;",
  "By thine agony and bloody sweat;",
];

let flowNodes = [];
let flowVersion = "";
let session = createBaseSession();

let loadTimerId = null;
let expiryWatcherId = null;
let revealReadyTimerId = null;
let finaleTimerId = null;
let stanzaSwapTimerId = null;
let renderTransitionId = 0;
let devLeftTapCount = 0;
let devRightTapCount = 0;
let lastRenderedScreen = null;
let globalCloudStop = null;
let loadRampStartEpochMs = 0;
let loadRampDurationMs = 0;

const breathEase = createBezierEasing(0.445, 0.05, 0.55, 0.95);
const focusCoreRgb = hexToRgb(COLOR_FOCUS_CORE);

function createBaseSession() {
  return {
    status: "start",
    nodeIndex: -1,
    startedAtEpochMs: null,
    updatedAtEpochMs: null,
    activeRoundId: null,
    nodeProgress: {},
  };
}

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function createBezierEasing(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  function sampleCurveX(t) {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleCurveY(t) {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleCurveDerivativeX(t) {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  function solveCurveX(x) {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const x2 = sampleCurveX(t) - x;
      if (Math.abs(x2) < 1e-6) {
        return t;
      }
      const d2 = sampleCurveDerivativeX(t);
      if (Math.abs(d2) < 1e-6) {
        break;
      }
      t -= x2 / d2;
    }

    let t0 = 0;
    let t1 = 1;
    t = x;
    while (t0 < t1) {
      const x2 = sampleCurveX(t);
      if (Math.abs(x2 - x) < 1e-6) {
        return t;
      }
      if (x > x2) t0 = t;
      else t1 = t;
      t = (t1 - t0) * 0.5 + t0;
    }
    return t;
  }

  return (x) => {
    const xClamped = Math.max(0, Math.min(1, x));
    return sampleCurveY(solveCurveX(xClamped));
  };
}

function hexToRgb(hex) {
  const clean = String(hex).replace("#", "");
  if (clean.length !== 6) {
    return "255, 255, 255";
  }
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function devGestureZonesMarkup() {
  if (!DEV_RESET_ENABLED) {
    return "";
  }

  return `
    <div class="dev-zone dev-zone--left" id="devZoneLeft" aria-hidden="true"></div>
    <div class="dev-zone dev-zone--right" id="devZoneRight" aria-hidden="true"></div>
  `;
}

function prayerNode(kind, title, text, meta, extra = {}) {
  return { type: "prayer", kind, title, text, meta, ...extra };
}

function loadNode(durationMs) {
  return { type: "load", durationMs };
}

function buildPrayerSequence() {
  const prayers = [
    prayerNode("creed", "Apostles' Creed", APOSTLES_CREED, "Opening"),
    prayerNode(
      "invitatory",
      "Invitatory and Gloria",
      INVITATORY_GLORIA,
      "Invitation",
    ),
  ];

  MYSTERIES.forEach((mystery, setIndex) => {
    const setNumber = setIndex + 1;
    prayers.push(
      prayerNode(
        "lords_prayer",
        "Lord's Prayer",
        LORDS_PRAYER,
        `Set ${setNumber}`,
      ),
    );
    prayers.push(
      prayerNode("mystery", `Mystery ${setNumber}`, mystery, `Set ${setNumber}`),
    );

    for (let i = 1; i <= 7; i += 1) {
      prayers.push(
        prayerNode("invocation", "Invocation", INVOCATION, `Set ${setNumber}`, {
          invocationIndex: i,
          invocationTotal: 7,
        }),
      );
    }
  });

  return prayers;
}

function shouldSkipLoadBetween(currentPrayer, nextPrayer) {
  if (!currentPrayer || !nextPrayer) {
    return false;
  }

  const mysteryToFirstInvocation =
    currentPrayer.kind === "mystery" && nextPrayer.kind === "invocation";
  const invocationToInvocation =
    currentPrayer.kind === "invocation" && nextPrayer.kind === "invocation";

  return mysteryToFirstInvocation || invocationToInvocation;
}

function buildFlowTimeline() {
  const prayers = buildPrayerSequence();
  const nodes = [loadNode(DEFAULT_LOAD_MS)];

  for (let index = 0; index < prayers.length; index += 1) {
    const current = prayers[index];
    const next = prayers[index + 1];
    nodes.push(current);

    if (next) {
      if (!shouldSkipLoadBetween(current, next)) {
        nodes.push(loadNode(DEFAULT_LOAD_MS));
      }
    } else {
      nodes.push(loadNode(DEFAULT_LOAD_MS));
    }
  }

  return nodes;
}

function computeFlowVersion() {
  return `flow-v2-${MYSTERIES.length}-${buildPrayerSequence().length}`;
}

function focusPrimary(id) {
  const el = document.getElementById(id);
  if (el) {
    el.focus({ preventScroll: true });
  }
}

function isSystemControlTarget(target) {
  return target instanceof Element && target.closest(".dev-zone");
}

function clearTimers() {
  if (loadTimerId) {
    window.clearTimeout(loadTimerId);
    loadTimerId = null;
  }
  if (revealReadyTimerId) {
    window.clearTimeout(revealReadyTimerId);
    revealReadyTimerId = null;
  }
  if (finaleTimerId) {
    window.clearTimeout(finaleTimerId);
    finaleTimerId = null;
  }
  if (stanzaSwapTimerId) {
    window.clearTimeout(stanzaSwapTimerId);
    stanzaSwapTimerId = null;
  }
}

function getBreathAmount(nowMs) {
  const phaseMs = nowMs % DUR_BREATH_CYCLE;
  if (phaseMs <= DUR_BREATH_INHALE) {
    return breathEase(phaseMs / DUR_BREATH_INHALE);
  }
  if (phaseMs <= DUR_BREATH_INHALE + DUR_BREATH_HOLD) {
    return 1;
  }
  const exhaleProgress =
    (phaseMs - DUR_BREATH_INHALE - DUR_BREATH_HOLD) / DUR_BREATH_EXHALE;
  return 1 - breathEase(exhaleProgress);
}

function startLoadVisual(canvas, options = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) return () => {};
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const {
    rampDurationMs = 0,
    rampStartEpochMs = Date.now(),
    rampValueProvider = null,
  } = options;

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let rafId = null;
  let particles = [];
  let isRunning = true;
  let reduceMotion = reducedMotionQuery.matches;

  function createParticle() {
    const planeAngle = (Math.floor(Math.random() * 3) * Math.PI) / 3;
    const tilt = (Math.random() - 0.5) * 0.8;
    const r = Math.pow(Math.random(), 2.5);
    const theta = Math.random() * Math.PI * 2;

    return {
      r,
      theta,
      planeAngle,
      tilt,
      size: Math.random() < 0.98 ? 0.6 : 1.8,
      speed: 0.0001 + Math.random() * 0.0003,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function resize() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    width = Math.max(10, Math.round(canvas.clientWidth));
    height = Math.max(10, Math.round(canvas.clientHeight));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = Array.from({ length: 6500 }, createParticle);
  }

  function drawCloud(now) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const minSide = Math.min(width, height);
    const breath = getBreathAmount(now);
    const loadRamp =
      typeof rampValueProvider === "function"
        ? Math.max(0, Math.min(1, rampValueProvider()))
        : rampDurationMs > 0
          ? Math.max(0, Math.min(1, (Date.now() - rampStartEpochMs) / rampDurationMs))
          : 0;
    const baseRadius = minSide * 0.35;
    const currentRadius = baseRadius * (1 + breath * 0.2);
    const cloudAlpha = 0.52 + breath * 0.28 + loadRamp * 0.08;

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      const currentTheta =
        particle.theta + now * particle.speed + particle.phase * 0.08;
      const x = Math.cos(currentTheta) * particle.r;
      const y = Math.sin(currentTheta) * particle.r * 0.4;
      const z = particle.tilt * particle.r;

      const cosA = Math.cos(particle.planeAngle);
      const sinA = Math.sin(particle.planeAngle);
      const xRot = x * cosA - z * sinA;
      const zRot = x * sinA + z * cosA;

      const screenX = cx + xRot * currentRadius;
      const screenY = cy + y * currentRadius;
      const coreBias = 1.1 - particle.r;
      const alpha = coreBias * cloudAlpha * 0.3 * ((zRot + 1) / 2);

      if (particle.size > 1) {
        ctx.fillStyle = `rgba(${focusCoreRgb}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, particle.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(${focusCoreRgb}, ${alpha * 0.65})`;
        ctx.fillRect(screenX, screenY, 1, 1);
      }
    }

    const nucleusRadius = baseRadius * (0.35 + loadRamp * 0.22);
    const nucleus = ctx.createRadialGradient(cx, cy, 0, cx, cy, nucleusRadius);
    nucleus.addColorStop(
      0,
      `rgba(${focusCoreRgb}, ${0.15 + breath * 0.2 + loadRamp * 0.22})`,
    );
    nucleus.addColorStop(1, `rgba(${focusCoreRgb}, 0)`);
    ctx.fillStyle = nucleus;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawStatic() {
    drawCloud(0);
  }

  function frame(now) {
    if (!isRunning) return;
    drawCloud(now);
    rafId = window.requestAnimationFrame(frame);
  }

  function onMotionPreferenceChange(event) {
    reduceMotion = event.matches;
    if (reduceMotion) {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      drawStatic();
      return;
    }
    if (!rafId && isRunning) {
      rafId = window.requestAnimationFrame(frame);
    }
  }

  resize();
  window.addEventListener("resize", resize);

  if (typeof reducedMotionQuery.addEventListener === "function") {
    reducedMotionQuery.addEventListener("change", onMotionPreferenceChange);
  } else {
    reducedMotionQuery.addListener(onMotionPreferenceChange);
  }

  if (reduceMotion) {
    drawStatic();
  } else {
    rafId = window.requestAnimationFrame(frame);
  }

  return () => {
    isRunning = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    window.removeEventListener("resize", resize);
    if (typeof reducedMotionQuery.removeEventListener === "function") {
      reducedMotionQuery.removeEventListener("change", onMotionPreferenceChange);
    } else {
      reducedMotionQuery.removeListener(onMotionPreferenceChange);
    }
    ctx.clearRect(0, 0, width, height);
  };
}

function getGlobalLoadRamp() {
  if (!loadRampDurationMs || !loadRampStartEpochMs) {
    return 0;
  }
  const elapsed = Date.now() - loadRampStartEpochMs;
  if (elapsed >= loadRampDurationMs) {
    return 0;
  }
  return Math.max(0, Math.min(1, elapsed / loadRampDurationMs));
}

function setGlobalLoadRamp(durationMs) {
  if (!durationMs || durationMs <= 0) {
    loadRampStartEpochMs = 0;
    loadRampDurationMs = 0;
    return;
  }
  loadRampStartEpochMs = Date.now();
  loadRampDurationMs = durationMs;
}

function initGlobalCloudCanvas() {
  if (!GLOBAL_CLOUD_CANVAS || typeof globalCloudStop === "function") {
    return;
  }
  globalCloudStop = startLoadVisual(GLOBAL_CLOUD_CANVAS, {
    rampValueProvider: getGlobalLoadRamp,
  });
}

function startExpiryWatcher() {
  if (expiryWatcherId) {
    window.clearInterval(expiryWatcherId);
  }

  expiryWatcherId = window.setInterval(() => {
    if (session.status === "in_progress" && isExpired(session.startedAtEpochMs)) {
      resetToStart();
    }
  }, 1000);
}

function persistSession() {
  session.updatedAtEpochMs = Date.now();
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      ...session,
      flowVersion,
    }),
  );
}

function resetSessionData() {
  session = createBaseSession();
  window.localStorage.removeItem(SESSION_KEY);
}

function resetToStart() {
  clearTimers();
  resetSessionData();
  lastRenderedScreen = null;
  render();
}

function isExpired(startedAtEpochMs) {
  if (!startedAtEpochMs) {
    return false;
  }
  return Date.now() - startedAtEpochMs >= SESSION_MAX_AGE_MS;
}

function getNodeProgressKey(index) {
  return String(index);
}

function parseVRPairs(text) {
  const lines = String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) {
    const versicle = lines[i] ?? "";
    const response = lines[i + 1] ?? "";
    pairs.push({ versicle, response });
  }
  return pairs;
}

function defaultProgressForNode(node) {
  if (node.kind === "invitatory") {
    return {
      mode: "vr",
      pairIndex: 0,
      phase: "await_response",
      nextVisibleAtEpochMs: null,
    };
  }
  if (node.kind === "creed" || node.kind === "lords_prayer") {
    return {
      mode: "stanza",
      stanzaIndex: 0,
      nextVisibleAtEpochMs: null,
    };
  }
  return {
    mode: "default",
    nextVisibleAtEpochMs: null,
  };
}

function getNodeProgress(nodeIndex, node) {
  const key = getNodeProgressKey(nodeIndex);
  if (!session.nodeProgress[key]) {
    session.nodeProgress[key] = defaultProgressForNode(node);
  }
  return session.nodeProgress[key];
}

function isNextVisible(progress) {
  if (!progress.nextVisibleAtEpochMs) return true;
  return Date.now() >= progress.nextVisibleAtEpochMs;
}

function ensureRevealTimer(progress, onReady) {
  if (!progress.nextVisibleAtEpochMs || isNextVisible(progress) || revealReadyTimerId) {
    return;
  }
  const waitMs = Math.max(0, progress.nextVisibleAtEpochMs - Date.now());
  revealReadyTimerId = window.setTimeout(() => {
    revealReadyTimerId = null;
    if (typeof onReady === "function") {
      onReady();
    }
  }, waitMs);
}

function triggerNativeBeadHaptic() {
  try {
    const webkitBridge = window.webkit?.messageHandlers?.hapticImpact;
    if (webkitBridge && typeof webkitBridge.postMessage === "function") {
      webkitBridge.postMessage({ style: "light" });
      return;
    }

    const capacitorImpact = window.Capacitor?.Plugins?.Haptics?.impact;
    if (typeof capacitorImpact === "function") {
      capacitorImpact({ style: "LIGHT" });
      return;
    }

    const reactNativeBridge = window.ReactNativeWebView?.postMessage;
    if (typeof reactNativeBridge === "function") {
      reactNativeBridge(JSON.stringify({ type: "haptic", style: "light" }));
      return;
    }

    if (typeof window.NativeHaptics?.impactLight === "function") {
      window.NativeHaptics.impactLight();
    }
  } catch (_error) {
    // Keep silence when no high-fidelity native haptic bridge is available.
  }
}

function advanceFromPrayer() {
  if (session.status !== "in_progress") {
    return;
  }

  const node = flowNodes[session.nodeIndex];
  if (node?.type === "prayer" && node.kind === "invocation") {
    triggerNativeBeadHaptic();
  }

  session.nodeIndex += 1;
  if (session.nodeIndex >= flowNodes.length) {
    playConclusionThenReset();
    return;
  }

  persistSession();
  render();
}

function advanceForTesting() {
  if (session.status !== "in_progress") {
    startRound();
    return;
  }

  session.nodeIndex += 1;
  if (session.nodeIndex >= flowNodes.length) {
    playConclusionThenReset();
    return;
  }

  persistSession();
  render();
}

function retreatForTesting() {
  if (session.status !== "in_progress") {
    return;
  }

  session.nodeIndex -= 1;
  if (session.nodeIndex < 0) {
    resetToStart();
    return;
  }

  persistSession();
  render();
}

function registerDevTap(side) {
  if (side === "left") {
    devLeftTapCount += 1;
    devRightTapCount = 0;
    if (devLeftTapCount >= DEV_GESTURE_TAP_TARGET) {
      devLeftTapCount = 0;
      resetToStart();
    }
    return;
  }

  devRightTapCount += 1;
  devLeftTapCount = 0;
  if (devRightTapCount >= DEV_GESTURE_TAP_TARGET) {
    devRightTapCount = 0;
    advanceForTesting();
  }
}

function startRound() {
  clearTimers();
  session = {
    ...createBaseSession(),
    status: "in_progress",
    nodeIndex: 0,
    startedAtEpochMs: Date.now(),
    updatedAtEpochMs: Date.now(),
    activeRoundId: uid(),
  };
  persistSession();
  render();
}

function hydrateSession() {
  flowNodes = buildFlowTimeline();
  flowVersion = computeFlowVersion();

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const staleFlow = parsed.flowVersion !== flowVersion;
    const staleTime = isExpired(parsed.startedAtEpochMs);
    const invalidIndex =
      typeof parsed.nodeIndex !== "number" ||
      parsed.nodeIndex < 0 ||
      parsed.nodeIndex >= flowNodes.length;

    if (staleFlow || staleTime || invalidIndex) {
      window.localStorage.removeItem(SESSION_KEY);
      return;
    }

    session = {
      ...createBaseSession(),
      status: "in_progress",
      nodeIndex: parsed.nodeIndex,
      startedAtEpochMs: parsed.startedAtEpochMs,
      updatedAtEpochMs: parsed.updatedAtEpochMs ?? parsed.startedAtEpochMs,
      activeRoundId: parsed.activeRoundId ?? uid(),
      nodeProgress:
        parsed.nodeProgress && typeof parsed.nodeProgress === "object"
          ? parsed.nodeProgress
          : {},
    };
  } catch (_error) {
    window.localStorage.removeItem(SESSION_KEY);
  }
}

function applyScreenEntryState() {
  const screen = APP.querySelector(".screen");
  if (!screen || prefersReducedMotion()) {
    return;
  }
  screen.classList.add("screen--entering");
  window.requestAnimationFrame(() => {
    screen.classList.add("screen--entered");
  });
}

function renderWithGhost(renderFn) {
  const currentId = ++renderTransitionId;
  const reduced = prefersReducedMotion();
  const activeScreen = APP.querySelector(".screen");

  const runSwap = () => {
    if (currentId !== renderTransitionId) {
      return;
    }
    renderFn();
    applyScreenEntryState();
  };

  if (!activeScreen || reduced) {
    runSwap();
    return;
  }

  activeScreen.classList.add("screen--leaving");
  window.setTimeout(runSwap, DUR_GHOST_EXIT_MS);
}

function renderStart() {
  lastRenderedScreen = { type: "start" };
  APP.innerHTML = `
    <section class="screen">
      ${devGestureZonesMarkup()}
      <h1 class="title">Anglican Rosary</h1>
      <button class="btn" id="startButton" type="button">Start</button>
      <footer class="actions">
        <p class="prayer-hint prayer-hint--visible">Tap anywhere to continue</p>
      </footer>
    </section>
  `;
  bindDevGestures();
  focusPrimary("startButton");
}

function playConclusionThenReset() {
  clearTimers();
  lastRenderedScreen = { type: "finale" };
  APP.innerHTML = `
    <section class="screen finale-screen" id="finaleScreen" tabindex="-1">
    </section>
  `;
  applyScreenEntryState();
  finaleTimerId = window.setTimeout(() => {
    finaleTimerId = null;
    resetSessionData();
    render();
  }, DUR_FINALE_MS);
}

function renderLoad(node) {
  lastRenderedScreen = { type: "load", durationMs: node.durationMs };
  setGlobalLoadRamp(node.durationMs);
  APP.innerHTML = `
    <section class="screen" id="loadScreen" tabindex="-1">
      ${devGestureZonesMarkup()}
    </section>
  `;

  loadTimerId = window.setTimeout(() => {
    loadTimerId = null;
    session.nodeIndex += 1;

    if (isExpired(session.startedAtEpochMs)) {
      resetToStart();
      return;
    }
    if (session.nodeIndex >= flowNodes.length) {
      playConclusionThenReset();
      return;
    }

    persistSession();
    render();
  }, node.durationMs);

  bindDevGestures();
  focusPrimary("loadScreen");
}

function stanzaMarkup(text) {
  return `<div class="stanza-wrap"><p class="prayer-text stanza">${text}</p></div>`;
}

function invocationBeadsInnerMarkup(node) {
  if (node.kind !== "invocation") {
    return "";
  }
  const total = node.invocationTotal ?? 7;
  const activeIndex = node.invocationIndex ?? 1;
  return Array.from({ length: total }, (_, i) => {
    const isActive = i + 1 <= activeIndex;
    return `<span class="bead ${isActive ? "bead--active" : ""}" aria-hidden="true"></span>`;
  }).join("");
}

function getPrayerFlowState(node, nodeProgress) {
  if (nodeProgress.mode === "vr") {
    const pairs = parseVRPairs(node.text);
    const lastPairIndex = Math.max(0, pairs.length - 1);
    const currentPair = pairs[nodeProgress.pairIndex] ?? pairs[0] ?? { versicle: "", response: "" };
    const responseVisible = nodeProgress.phase === "await_next_pair";
    const finalResponseShown =
      nodeProgress.pairIndex === lastPairIndex && nodeProgress.phase === "await_next_pair";
    const canAdvance = finalResponseShown && isNextVisible(nodeProgress);
    return {
      mode: "vr",
      canAdvance,
      canProgress:
        nodeProgress.phase === "await_response" ||
        (nodeProgress.phase === "await_next_pair" && nodeProgress.pairIndex < lastPairIndex),
      markup: `
        <div class="prayer-progress">
          <p class="prayer-text vr-line ${responseVisible ? "vr-line--versicle-dimmed" : "vr-line--versicle-active"}">${currentPair.versicle}</p>
          <p class="prayer-text vr-line ${responseVisible ? "vr-line--response-visible" : "vr-line--response-hidden"}">${currentPair.response}</p>
        </div>
      `,
      onTap: () => {
        const progress = getNodeProgress(session.nodeIndex, node);
        if (progress.phase === "await_response") {
          progress.phase = "await_next_pair";
          const isFinal = progress.pairIndex >= lastPairIndex;
          if (isFinal && !progress.nextVisibleAtEpochMs) {
            progress.nextVisibleAtEpochMs = Date.now() + DUR_REVEAL_NEXT_DELAY_MS;
          }
          persistSession();
          return;
        }
        if (progress.pairIndex < lastPairIndex) {
          progress.pairIndex += 1;
          progress.phase = "await_response";
          persistSession();
        }
      },
    };
  }

  if (nodeProgress.mode === "stanza") {
    const stanzas = STANZAS_PER_PRAYER[node.kind] ?? [node.text];
    const lastIndex = Math.max(0, stanzas.length - 1);
    const stanzaIndex = Math.max(0, Math.min(nodeProgress.stanzaIndex, lastIndex));
    const finalStanzaVisible = stanzaIndex >= lastIndex;
    const canAdvance = finalStanzaVisible && isNextVisible(nodeProgress);
    return {
      mode: "stanza",
      canAdvance,
      canProgress: stanzaIndex < lastIndex,
      markup: `
        <div class="prayer-progress">
          ${stanzaMarkup(stanzas[stanzaIndex])}
        </div>
      `,
      onTap: () => {
        const progress = getNodeProgress(session.nodeIndex, node);
        if (progress.stanzaIndex < lastIndex) {
          progress.stanzaIndex += 1;
          if (progress.stanzaIndex >= lastIndex && !progress.nextVisibleAtEpochMs) {
            progress.nextVisibleAtEpochMs = Date.now() + DUR_REVEAL_NEXT_DELAY_MS;
          }
          persistSession();
        }
      },
    };
  }

  return {
    mode: "default",
    canAdvance: true,
    canProgress: false,
    markup: `<p class="prayer-text">${node.text}</p>`,
    onTap: null,
  };
}

function renderPrayerFlow(node, prayerScreen, prayerFlow, prayerHint, renderNodeIndex) {
  if (!prayerScreen || !prayerFlow || !prayerHint) {
    return;
  }
  if (session.nodeIndex !== renderNodeIndex) {
    return;
  }
  const nodeProgress = getNodeProgress(session.nodeIndex, node);
  const flowState = getPrayerFlowState(node, nodeProgress);
  prayerFlow.innerHTML = flowState.markup;
  const tapEnabled = flowState.canAdvance || flowState.canProgress;
  if (tapEnabled) {
    prayerHint.textContent = "Tap anywhere to continue";
    prayerHint.classList.add("prayer-hint--visible");
  } else {
    prayerHint.textContent = "";
    prayerHint.classList.remove("prayer-hint--visible");
  }

  if (!flowState.canAdvance && !flowState.canProgress) {
    ensureRevealTimer(nodeProgress, () =>
      renderPrayerFlow(node, prayerScreen, prayerFlow, prayerHint, renderNodeIndex),
    );
  } else if (!flowState.canAdvance && nodeProgress.nextVisibleAtEpochMs) {
    ensureRevealTimer(nodeProgress, () =>
      renderPrayerFlow(node, prayerScreen, prayerFlow, prayerHint, renderNodeIndex),
    );
  }

}

function renderPrayer(node) {
  const introInvocationBeads =
    node.kind === "invocation" &&
    (!lastRenderedScreen ||
      lastRenderedScreen.type !== "prayer" ||
      lastRenderedScreen.kind !== "invocation" ||
      lastRenderedScreen.meta !== node.meta);
  const nodeProgress = getNodeProgress(session.nodeIndex, node);
  const initialState = getPrayerFlowState(node, nodeProgress);
  const initialBodyMarkup =
    node.kind === "invocation"
      ? `<div class="prayer-body-ghost">${initialState.markup}</div>`
      : initialState.markup;

  APP.innerHTML = `
    <section class="screen screen--prayer" id="prayerScreen" tabindex="-1">
      ${devGestureZonesMarkup()}
      <div class="prayer-main">
        <div class="prayer-header">
          <p class="meta">${node.meta}</p>
          <h2 class="prayer-title">${node.title}</h2>
        </div>
        ${
          node.kind === "invocation"
            ? `<div class="bead-arc ${introInvocationBeads ? "bead-arc--intro" : ""}" id="invocationBeads" aria-hidden="true">${invocationBeadsInnerMarkup(node)}</div>`
            : ""
        }
        <div id="prayerFlow">${initialBodyMarkup}</div>
      </div>
      <footer class="actions">
        <p class="prayer-hint ${initialState.canAdvance ? "prayer-hint--visible" : ""}" id="prayerHint">
          ${initialState.canAdvance ? "Tap anywhere to continue" : "Continue in stillness..."}
        </p>
      </footer>
    </section>
  `;

  const prayerScreen = document.getElementById("prayerScreen");
  const prayerFlow = document.getElementById("prayerFlow");
  const prayerHint = document.getElementById("prayerHint");
  renderPrayerFlow(node, prayerScreen, prayerFlow, prayerHint, session.nodeIndex);
  lastRenderedScreen = {
    type: "prayer",
    nodeIndex: session.nodeIndex,
    kind: node.kind,
    title: node.title,
    meta: node.meta,
  };
  bindDevGestures();
  focusPrimary("prayerScreen");
}

function renderStickyPrayerBody(node, renderNodeIndex = session.nodeIndex) {
  const prayerScreen = document.getElementById("prayerScreen");
  const prayerFlow = document.getElementById("prayerFlow");
  const prayerHint = document.getElementById("prayerHint");
  if (!prayerScreen || !prayerFlow || !prayerHint) {
    renderPrayer(node);
    return;
  }
  if (session.nodeIndex !== renderNodeIndex) {
    return;
  }

  const nodeProgress = getNodeProgress(session.nodeIndex, node);
  const flowState = getPrayerFlowState(node, nodeProgress);
  const stickyMarkup =
    node.kind === "invocation"
      ? `<div class="prayer-body-ghost">${flowState.markup}</div>`
      : flowState.markup;
  const currentStanza = prayerFlow.querySelector(".stanza-wrap");
  const shouldAnimateExit = flowState.mode === "stanza" && currentStanza;
  const applyStickyMarkup = () => {
    if (session.nodeIndex !== renderNodeIndex) {
      return;
    }
    prayerFlow.innerHTML = stickyMarkup;
  };
  if (shouldAnimateExit) {
    currentStanza.classList.add("stanza--leaving");
    if (stanzaSwapTimerId) {
      window.clearTimeout(stanzaSwapTimerId);
    }
    stanzaSwapTimerId = window.setTimeout(() => {
      stanzaSwapTimerId = null;
      applyStickyMarkup();
    }, 600);
  } else {
    applyStickyMarkup();
  }

  const beads = document.getElementById("invocationBeads");
  if (node.kind === "invocation") {
    if (beads) {
      beads.classList.remove("bead-arc--intro");
      beads.innerHTML = invocationBeadsInnerMarkup(node);
    } else {
      prayerFlow.insertAdjacentHTML(
        "beforebegin",
        `<div class="bead-arc bead-arc--intro" id="invocationBeads" aria-hidden="true">${invocationBeadsInnerMarkup(node)}</div>`,
      );
    }
  } else if (beads) {
    beads.remove();
  }

  const tapEnabled = flowState.canAdvance || flowState.canProgress;
  if (tapEnabled) {
    prayerHint.textContent = "Tap anywhere to continue";
    prayerHint.classList.add("prayer-hint--visible");
  } else {
    prayerHint.textContent = "";
    prayerHint.classList.remove("prayer-hint--visible");
  }

  if (!flowState.canAdvance && !flowState.canProgress) {
    ensureRevealTimer(nodeProgress, () => renderStickyPrayerBody(node, renderNodeIndex));
  } else if (!flowState.canAdvance && nodeProgress.nextVisibleAtEpochMs) {
    ensureRevealTimer(nodeProgress, () => renderStickyPrayerBody(node, renderNodeIndex));
  }

  lastRenderedScreen = {
    type: "prayer",
    nodeIndex: session.nodeIndex,
    kind: node.kind,
    title: node.title,
    meta: node.meta,
  };
}

function handleGlobalAdvance() {
  if (session.status !== "in_progress") {
    return;
  }
  const node = flowNodes[session.nodeIndex];
  if (!node || node.type !== "prayer") {
    return;
  }

  const flowState = getPrayerFlowState(node, getNodeProgress(session.nodeIndex, node));
  if (flowState.canProgress && typeof flowState.onTap === "function") {
    flowState.onTap();
    render();
    return;
  }
  if (flowState.canAdvance) {
    advanceFromPrayer();
  }
}

function bindDevGestures() {
  if (!DEV_RESET_ENABLED) {
    return;
  }

  const leftZone = document.getElementById("devZoneLeft");
  leftZone?.addEventListener("click", () => registerDevTap("left"));

  const rightZone = document.getElementById("devZoneRight");
  rightZone?.addEventListener("click", () => registerDevTap("right"));
}

function render() {
  clearTimers();

  if (session.status !== "in_progress") {
    renderWithGhost(renderStart);
    return;
  }

  if (isExpired(session.startedAtEpochMs)) {
    resetToStart();
    return;
  }

  const node = flowNodes[session.nodeIndex];
  if (!node) {
    playConclusionThenReset();
    return;
  }

  if (node.type === "load") {
    renderWithGhost(() => renderLoad(node));
    return;
  }

  const stickyPrayerStep =
    lastRenderedScreen?.type === "prayer" &&
    (lastRenderedScreen.nodeIndex === session.nodeIndex ||
      (lastRenderedScreen.title === node.title && lastRenderedScreen.meta === node.meta));

  if (stickyPrayerStep) {
    renderStickyPrayerBody(node);
    return;
  }

  renderWithGhost(() => renderPrayer(node));
}

APP?.style.setProperty("--transition-ghost", TRANSITION_GHOST);

initGlobalCloudCanvas();
hydrateSession();
startExpiryWatcher();
render();

window.addEventListener("click", (event) => {
  if (isSystemControlTarget(event.target)) {
    return;
  }
  if (session.status === "in_progress") {
    handleGlobalAdvance();
    return;
  }
  if (session.status === "start") {
    startRound();
  }
});
