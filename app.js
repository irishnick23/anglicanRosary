const APP = document.getElementById("app");

const SESSION_KEY = "anglican_rosary_session_v1";
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_LOAD_MS = 7140;
const DEV_RESET_ENABLED = true;

const APOSTLES_CREED =
  "I believe in God, the Father Almighty, the maker of heaven and earth: and in Jesus Christ his only Son our Lord: who was conceived by the Holy Ghost, born of the Virgin Mary: suffered under Pontius Pilate, was crucified, dead, and buried: he descended into hell; the third day he rose again from the dead: he ascended into heaven, and sitteth on the right hand of God the Father Almighty: from thence he shall come to judge the quick and the dead. I believe in the Holy Ghost: the holy catholic church; the communion of saints: the forgiveness of sins: the resurrection of the body, and the life everlasting. Amen.";

const INVITATORY_GLORIA =
  "V. O God, make speed to save us.\nR. O Lord, make haste to help us.\nV. Glory be to the Father, and to the Son, and to the Holy Ghost;\nR. As it was in the beginning, is now, and ever shall be, world without end. Amen.";

const LORDS_PRAYER =
  "Our Father which art in heaven, hallowed be thy name. Thy kingdom come, thy will be done in earth, as it is in heaven. Give us this day our daily bread. And forgive us our trespasses, as we forgive them that trespass against us. And lead us not into temptation, but deliver us from evil: for thine is the kingdom, and the power, and the glory, for ever and ever. Amen.";

const INVOCATION =
  "O God the Son, Redeemer of the world: have mercy upon us miserable sinners.";

const MYSTERIES = [
  "By the mystery of thy holy incarnation;",
  "By thy holy nativity and circumcision;",
  "By thy baptism, fasting, and temptation;",
  "By thine agony and bloody sweat;",
];

let flowNodes = [];
let flowVersion = "";
let session = {
  status: "start",
  nodeIndex: -1,
  startedAtEpochMs: null,
  updatedAtEpochMs: null,
  activeRoundId: null,
};

let loadTimerId = null;
let loadCountdownId = null;
let expiryWatcherId = null;
let stopLoadAnimation = null;

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function formatSeconds(ms) {
  return Math.ceil(ms / 1000);
}

function prayerNode(kind, title, text, meta) {
  return { type: "prayer", kind, title, text, meta };
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
      prayerNode(
        "mystery",
        `Mystery ${setNumber}`,
        mystery,
        `Set ${setNumber}`,
      ),
    );

    for (let i = 1; i <= 7; i += 1) {
      prayers.push(
        prayerNode(
          "invocation",
          `Invocation ${i} of 7`,
          INVOCATION,
          `Set ${setNumber}`,
        ),
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
  return `flow-${MYSTERIES.length}-${buildPrayerSequence().length}`;
}

function focusPrimary(id) {
  const el = document.getElementById(id);
  if (el) {
    el.focus({ preventScroll: true });
  }
}

function clearTimers() {
  stopLoadVisual();
  if (loadTimerId) {
    window.clearTimeout(loadTimerId);
    loadTimerId = null;
  }
  if (loadCountdownId) {
    window.clearInterval(loadCountdownId);
    loadCountdownId = null;
  }
}

function stopLoadVisual() {
  if (typeof stopLoadAnimation === "function") {
    stopLoadAnimation();
  }
  stopLoadAnimation = null;
}

function startLoadVisual(canvas, cycleMs = 5000) {
  if (!(canvas instanceof HTMLCanvasElement)) return () => {};
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

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

    const total = 6500;
    particles = Array.from({ length: total }, createParticle);
  }

  function drawCloud(now) {
    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const minSide = Math.min(width, height);

    const pulseCycleMs = Math.max(1, cycleMs);
    const breathPhase = (now % pulseCycleMs) / pulseCycleMs;
    const breath = 0.5 - 0.5 * Math.cos(breathPhase * Math.PI * 2);
    const baseRadius = minSide * 0.42;
    const currentRadius = baseRadius * (0.9 + breath * 0.2);

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      const currentTheta = particle.theta + now * particle.speed + particle.phase * 0.08;
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
      const alpha = coreBias * (0.1 + breath * 0.45) * ((zRot + 1) / 2);

      if (particle.size > 1) {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, particle.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
        ctx.fillRect(screenX, screenY, 1, 1);
      }
    }

    const nucleus = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 0.3);
    nucleus.addColorStop(0, `rgba(255, 255, 255, ${0.15 + breath * 0.15})`);
    nucleus.addColorStop(1, "rgba(255, 255, 255, 0)");
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

function resetToStart() {
  clearTimers();
  session = {
    status: "start",
    nodeIndex: -1,
    startedAtEpochMs: null,
    updatedAtEpochMs: null,
    activeRoundId: null,
  };
  window.localStorage.removeItem(SESSION_KEY);
  render();
}

function isExpired(startedAtEpochMs) {
  if (!startedAtEpochMs) {
    return false;
  }
  return Date.now() - startedAtEpochMs >= SESSION_MAX_AGE_MS;
}

function advanceFromPrayer() {
  if (session.status !== "in_progress") {
    return;
  }

  session.nodeIndex += 1;
  if (session.nodeIndex >= flowNodes.length) {
    resetToStart();
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
    resetToStart();
    return;
  }

  persistSession();
  render();
}

function startRound() {
  clearTimers();
  session = {
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
      status: "in_progress",
      nodeIndex: parsed.nodeIndex,
      startedAtEpochMs: parsed.startedAtEpochMs,
      updatedAtEpochMs: parsed.updatedAtEpochMs ?? parsed.startedAtEpochMs,
      activeRoundId: parsed.activeRoundId ?? uid(),
    };
  } catch (_error) {
    window.localStorage.removeItem(SESSION_KEY);
  }
}

function renderStart() {
  APP.innerHTML = `
    <section class="screen">
      ${DEV_RESET_ENABLED ? '<button class="dev-reset" id="devResetButton" type="button">Back to start</button>' : ""}
      ${DEV_RESET_ENABLED ? '<button class="dev-skip" id="devSkipButton" type="button" aria-label="Skip to next screen" title="Skip to next screen">→</button>' : ""}
      <div class="symbol-wrap symbol-wrap--load" aria-hidden="true">
        <div class="load-cloud">
          <canvas class="load-cloud__canvas" id="startCloudCanvas"></canvas>
        </div>
      </div>
      <h1 class="title">Anglican Rosary</h1>
      <button class="btn" id="startButton" type="button">Start</button>
    </section>
  `;

  const startCloudCanvas = document.getElementById("startCloudCanvas");
  stopLoadVisual();
  stopLoadAnimation = startLoadVisual(startCloudCanvas);

  const startButton = document.getElementById("startButton");
  startButton?.addEventListener("click", startRound);
  bindDevReset();
  focusPrimary("startButton");
}

function renderLoad(node) {
  APP.innerHTML = `
    <section class="screen" id="loadScreen" tabindex="-1">
      ${DEV_RESET_ENABLED ? '<button class="dev-reset" id="devResetButton" type="button">Back to start</button>' : ""}
      ${DEV_RESET_ENABLED ? '<button class="dev-skip" id="devSkipButton" type="button" aria-label="Skip to next screen" title="Skip to next screen">→</button>' : ""}
      <div class="symbol-wrap symbol-wrap--load" aria-hidden="true">
        <div class="load-cloud">
          <canvas class="load-cloud__canvas" id="loadCloudCanvas"></canvas>
        </div>
      </div>
      <p class="timer" id="loadTimer">Next in ${formatSeconds(node.durationMs)}s</p>
    </section>
  `;

  const loadCloudCanvas = document.getElementById("loadCloudCanvas");
  stopLoadVisual();
  stopLoadAnimation = startLoadVisual(loadCloudCanvas, node.durationMs / 2);

  const timerLabel = document.getElementById("loadTimer");
  const startedAt = Date.now();

  loadTimerId = window.setTimeout(() => {
    loadTimerId = null;
    session.nodeIndex += 1;

    if (session.nodeIndex >= flowNodes.length || isExpired(session.startedAtEpochMs)) {
      resetToStart();
      return;
    }

    persistSession();
    render();
  }, node.durationMs);

  loadCountdownId = window.setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(node.durationMs - elapsed, 0);
    if (timerLabel) {
      timerLabel.textContent = `Next in ${formatSeconds(remaining)}s`;
    }
    if (remaining <= 0) {
      window.clearInterval(loadCountdownId);
      loadCountdownId = null;
    }
  }, 220);

  bindDevReset();
  focusPrimary("loadScreen");
}

function renderPrayer(node) {
  APP.innerHTML = `
    <section class="screen screen--prayer">
      ${DEV_RESET_ENABLED ? '<button class="dev-reset" id="devResetButton" type="button">Back to start</button>' : ""}
      ${DEV_RESET_ENABLED ? '<button class="dev-skip" id="devSkipButton" type="button" aria-label="Skip to next screen" title="Skip to next screen">→</button>' : ""}
      <div class="prayer-main">
        <div>
          <p class="meta">${node.meta}</p>
          <h2 class="prayer-title">${node.title}</h2>
        </div>
        <p class="prayer-text">${node.text}</p>
      </div>
      <footer class="actions">
        <button class="btn" id="nextButton" type="button">Next</button>
      </footer>
    </section>
  `;

  const nextButton = document.getElementById("nextButton");
  nextButton?.addEventListener("click", advanceFromPrayer);
  bindDevReset();
  focusPrimary("nextButton");
}

function bindDevReset() {
  if (!DEV_RESET_ENABLED) {
    return;
  }
  const devResetButton = document.getElementById("devResetButton");
  devResetButton?.addEventListener("click", resetToStart);

  const devSkipButton = document.getElementById("devSkipButton");
  devSkipButton?.addEventListener("click", advanceForTesting);
}

function render() {
  clearTimers();

  if (session.status !== "in_progress") {
    renderStart();
    return;
  }

  if (isExpired(session.startedAtEpochMs)) {
    resetToStart();
    return;
  }

  const node = flowNodes[session.nodeIndex];
  if (!node) {
    resetToStart();
    return;
  }

  if (node.type === "load") {
    renderLoad(node);
    return;
  }

  renderPrayer(node);
}

hydrateSession();
startExpiryWatcher();
render();
