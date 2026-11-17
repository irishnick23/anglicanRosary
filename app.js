const APP = document.getElementById("app");
const GLOBAL_CANVAS = document.getElementById("globalCloudCanvas");

const session = { status: "start" };

function startLoadVisual(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Project grains from a softly lit volume into reusable layers.
  const resolution = 640;
  const driftingGrains = [];
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
      // Shear and taper the whole volume so its outline feels wind-shaped.
      const across = radius * x;
      const rise = radius * y;
      const driftX = across * 1.08 + 0.18 * rise;
      const driftY = rise * (0.68 - 0.48 * across) - 0.18 * across
        + 0.045 * Math.sin(across * 9 + layer * 0.18);
      const grainX = (0.5 + driftX) * resolution;
      const grainY = (0.5 + driftY) * resolution;
      if (i % 64 === 0) {
        driftingGrains.push({
          x: grainX, y: grainY, phase: Math.random() * Math.PI * 2,
          speed: 0.17 + Math.random() * 0.24, reach: 9 + Math.random() * 19,
          size: 1.65 + Math.random() * 1.2
        });
      } else {
        paint.fillRect(grainX, grainY, size, size);
      }
    }
    return texture;
  });
  const cloud = document.createElement("canvas");
  cloud.width = cloud.height = resolution;
  const cloudPaint = cloud.getContext("2d");
  cloudPaint.globalCompositeOperation = "lighter";
  let frame = 0, last = 0, time = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const span = Math.min(canvas.width * 0.84, canvas.height * 0.53);
    const center = canvas.height * (session.status === "start" ? 0.39 : 0.5);
    const breath = time * Math.PI * 2 / 15;
    cloudPaint.clearRect(0, 0, resolution, resolution);
    layers.forEach((texture, layer) => {
      const phase = layer * 1.3;
      cloudPaint.save();
      cloudPaint.translate(resolution / 2, resolution / 2);
      cloudPaint.rotate(0.18 * Math.sin(time * 0.09 + phase));
      cloudPaint.drawImage(texture, -resolution / 2, -resolution / 2);
      cloudPaint.restore();
    });

    // Persistent paths let the eye follow a grain as nearby grains pass it.
    cloudPaint.fillStyle = "rgba(240,235,224,0.62)";
    for (const grain of driftingGrains) {
      const phase = grain.phase + time * grain.speed;
      const x = grain.x + grain.reach * Math.sin(phase);
      const y = grain.y + grain.reach * (0.42 * Math.cos(phase)
        + 0.24 * Math.sin(phase * 1.7 + grain.x * 0.012));
      cloudPaint.fillRect(x, y, grain.size, grain.size);
    }

    // A broad swell travels across the grains. Align slice edges on device
    // pixels so adjacent columns stay joined throughout the breath.
    const width = span * (1 - 0.035 * Math.sin(breath));
    const left = (canvas.width - width) / 2;
    for (let x = 0; x < resolution; x += 4) {
      const u = (x + 2) / resolution - 0.5;
      const wave = breath - u * 5.2;
      const height = span * (1 + 0.16 * Math.sin(wave)
        + 0.035 * Math.sin(time * 0.19 + u * 7));
      const lift = span * 0.047 * Math.cos(wave);
      const start = Math.round(left + width * x / resolution);
      const end = Math.round(left + width * (x + 4) / resolution);
      ctx.drawImage(cloud, x, 0, 4, resolution, start,
        center + lift - height / 2, end - start, height);
    }
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

const offices = {
  morning_prayer: "Morning Prayer",
  midday_prayer: "Midday Prayer",
  evening_prayer: "Evening Prayer",
  compline: "Compline"
};
const now = new Date();
const hour = now.getHours();
let office = hour < 4 || hour >= 21 ? "compline" : hour < 11 ? "morning_prayer" :
  hour < 16 ? "midday_prayer" : "evening_prayer";
let date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  .map(n => String(n).padStart(2, "0")).join("-");
let pages = [];
let index = 0;
let activeRequest;
let pauseTimer;

const officeIcons = {
  morning_prayer: '<path d="M2 17h20M5 21h14M6 17a6 6 0 0 1 12 0M12 3v4M3 9l2 2m16-2-2 2"/>',
  midday_prayer: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
  evening_prayer: '<path d="M2 15h20M5 19h14M8 15a4 4 0 0 1 8 0M12 2v6m-3-3 3 3 3-3"/>',
  compline: '<path d="M19.8 15.3A8.4 8.4 0 0 1 9 4a8.6 8.6 0 1 0 10.8 11.3Z"/>'
};

function home(message = "") {
  clearTimeout(pauseTimer);
  activeRequest?.abort();
  session.status = "start";
  GLOBAL_CANVAS.style.opacity = "1";
  APP.innerHTML = `<section class="screen screen--start">
    <h1 class="title">The Daily Office</h1>
    <form class="office-picker">
      <fieldset class="office-options"><legend>Choose an office</legend>
        ${Object.entries(offices).map(([key, name]) => `<label class="office-option">
          <input type="radio" name="office" value="${key}" aria-label="${name}">
          <span><svg viewBox="0 0 24 24" aria-hidden="true">${officeIcons[key]}</svg>${name.replace(" Prayer", "")}</span>
        </label>`).join("")}
      </fieldset>
      <label class="office-date">Date<input type="date" name="date" required></label>
      <button type="submit" class="btn">Begin prayer</button>
    </form>
    <small class="source">Book of Common Prayer (2019) · <a href="https://www.dailyoffice2019.com/">Daily Office 2019</a></small>
    <span role="status"></span>
  </section>`;
  const form = APP.querySelector("form");
  form.elements.office.value = office;
  form.elements.date.value = date;
  APP.querySelector("[role=status]").textContent = message;
  form.onsubmit = event => {
    event.preventDefault();
    office = form.elements.office.value;
    date = form.elements.date.value;
    beginOffice();
  };
}

function servicePages(modules) {
  const result = [];
  for (const module of modules) {
    let title = module.name, lines = [], length = 0;
    function flush() {
      if (lines.length) result.push({ section: module.name, title, lines });
      lines = [];
      length = 0;
    }
    for (const line of module.lines) {
      const type = line.line_type;
      if (["spacer", "audio"].includes(type)) { flush(); continue; }
      const fragment = document.createElement("template");
      fragment.innerHTML = String(line.content ?? "");
      fragment.content.querySelectorAll("script,style,.footnotes,.crossrefs,sup.footnote").forEach(el => el.remove());
      fragment.content.querySelectorAll("br,p,div,h3,h4").forEach(el => el.append(" "));
      const content = fragment.content.textContent.replace(/\s+/g, " ").trim();
      if (!content) continue;
      if (type === "heading") { flush(); title = content; continue; }
      let phrase = line.preface ? String(line.preface) + " " : "";
      for (const word of content.split(" ")) {
        if (phrase.length > 230 && (/[.!?;:,]$/.test(phrase.trimEnd()) || phrase.length > 310)) {
          if (length + phrase.length > 340) flush();
          lines.push({ type, text: phrase.trim() });
          flush();
          phrase = "";
        }
        phrase += word + " ";
      }
      if (length + phrase.length > 340) flush();
      lines.push({ type, text: phrase.trim() });
      length += phrase.length;
    }
    flush();
  }
  return result;
}

async function beginOffice() {
  const controller = new AbortController();
  activeRequest = controller;
  session.status = "loading";
  APP.innerHTML = '<section class="screen"><p>Preparing your office…</p><button class="quiet" data-home>Back</button></section>';
  const key = "office-kjv-v1/" + office + "/" + date;
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let data;
    try {
      const response = await fetch("https://api.dailyoffice2019.com/api/v1/office/" + office + "/" + date + "?bible_translation=kjv", {signal: controller.signal});
      if (!response.ok) throw Error();
      data = await response.json();
      if (!data.modules?.length) throw Error();
      try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
    } catch {
      data = JSON.parse(localStorage.getItem(key));
    }
    if (session.status !== "loading" || controller !== activeRequest) return;
    pages = servicePages(data.modules);
    if (!pages.length) throw Error();
    index = 0;
    showPrayer();
  } catch {
    if (session.status === "loading" && controller === activeRequest)
      home("This office could not be loaded. Check your connection and try again.");
  } finally { clearTimeout(timeout); }
}

function showPrayer() {
  session.status = "prayer";
  GLOBAL_CANVAS.style.opacity = "0";
  const page = pages[index];
  APP.innerHTML = `<section class="screen screen--prayer">
    <div class="prayer-main"><header><span class="meta"></span><h2 class="prayer-title"></h2></header>
    <div class="stanza-wrap prayer-text"></div></div>
    <footer><button class="quiet" data-home>Offices</button><button class="quiet" data-back>Back</button>
    <button class="quiet" data-next></button></footer></section>`;
  APP.querySelector(".meta").textContent = offices[office] + " · " + date;
  APP.querySelector("h2").textContent = page.title;
  const stanza = APP.querySelector(".stanza-wrap");
  for (const line of page.lines) {
    const p = document.createElement("p");
    p.className = "line-" + line.type;
    p.textContent = line.text;
    stanza.append(p);
  }
  APP.querySelector("[data-back]").disabled = index === 0;
  APP.querySelector("[data-next]").textContent = index === pages.length - 1 ? "Finish" : "Continue";
  window.scrollTo(0, 0);
}

function next() {
  index++;
  if (index >= pages.length) return home("Office complete.");
  if (pages[index].section === pages[index - 1].section) return showPrayer();
  session.status = "pause";
  GLOBAL_CANVAS.style.opacity = "1";
  APP.innerHTML = '<section class="screen screen--start"><p class="meta"></p><button class="quiet" data-skip>Continue</button></section>';
  APP.querySelector(".meta").textContent = pages[index].section;
  pauseTimer = setTimeout(showPrayer, 7140);
}
APP.addEventListener("click", event => {
  if (event.target.closest("[data-skip]")) { clearTimeout(pauseTimer); return showPrayer(); }
  if (event.target.closest("[data-home]")) return home();
  if (session.status !== "prayer") return;
  if (event.target.closest("[data-back]")) { if (index > 0) { index--; showPrayer(); } }
  else if (!window.getSelection()?.toString()) next();
});
window.addEventListener("keydown", event => {
  if (session.status !== "prayer" || event.repeat || event.target.closest("button")) return;
  if ([" ", "Enter", "ArrowRight"].includes(event.key)) { event.preventDefault(); next(); }
});
startLoadVisual(GLOBAL_CANVAS);
home();
