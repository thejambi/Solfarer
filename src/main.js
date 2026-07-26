// main.js — Solfarer: wander the real stars.
//
// The exploration sibling of Lighthaul, come home to the web. A 2D chart of
// the Local Bubble (2,236 real systems, HYG catalog) with click-to-inspect
// star cards and honest 1g twin-paradox travel. The optional flight rides
// Lighthaul's relativistic optics: aberration, Doppler, beaming, and the
// blueshifted CMB, on the real star field.
import * as THREE from "three";
import { STAR_VERT, STAR_FRAG, CMB_VERT, CMB_FRAG, lorentz } from "./relativity.js";
import { STARS, BEACONS } from "./stars.js";

// ---------------------------------------------------------------------------
// Catalog accessors — stars.js rows are
// [name, x, y, z, class, absmag, tempK, constellation, named, lum,
//  apparent mag, variable, luminosity class]
// index -1 is Sol. The bubble comes first; the far beacons — famous named
// stars beyond 100 ly — follow at BEACON0 and up.
// ---------------------------------------------------------------------------
const SOL = -1;
const CAT = STARS.concat(BEACONS);
const N = CAT.length;
const BEACON0 = STARS.length;
const isBeacon = (i) => i >= BEACON0;
const name_ = (i) => (i < 0 ? "Sol" : CAT[i][0]);
const px_ = (i) => (i < 0 ? 0 : CAT[i][1]);
const py_ = (i) => (i < 0 ? 0 : CAT[i][2]);
const pz_ = (i) => (i < 0 ? 0 : CAT[i][3]);
const cls_ = (i) => (i < 0 ? "G2" : CAT[i][4]);
const absmag_ = (i) => (i < 0 ? 4.83 : CAT[i][5]);
const temp_ = (i) => (i < 0 ? 5772 : CAT[i][6]);
const con_ = (i) => (i < 0 ? "" : CAT[i][7]);
const named_ = (i) => (i < 0 ? 1 : CAT[i][8]);
const lum_ = (i) => (i < 0 ? 1 : CAT[i][9]);
const amag_ = (i) => (i < 0 ? -26.7 : CAT[i][10]);
const var_ = (i) => (i < 0 ? 0 : CAT[i][11]);
const lc_ = (i) => (i < 0 ? 5 : CAT[i][12]);

const CLASS_DESC = { O: "blue giant", B: "blue-white star", A: "white star",
  F: "yellow-white star", G: "yellow dwarf", K: "orange dwarf",
  M: "red dwarf", D: "white dwarf", "?": "star" };
const CLASS_WORD = { O: "blue", B: "blue-white", A: "white",
  F: "yellow-white", G: "yellow", K: "orange", M: "red" };
const LC_WORD = { 1: " supergiant", 2: " bright giant", 3: " giant",
  4: " subgiant" };
// what kind of star: the luminosity class outranks the dwarf wording, so
// Betelgeuse is a red supergiant, not a red dwarf
function starDesc(i) {
  const c = cls_(i)[0];
  if (c !== "D" && LC_WORD[lc_(i)] && CLASS_WORD[c])
    return CLASS_WORD[c] + LC_WORD[lc_(i)];
  return CLASS_DESC[c] || "star";
}
const CLASS_COL = { O: "#9fc0ff", B: "#aecaff", A: "#f2f4ff", F: "#faf1c8",
  G: "#ffdd7a", K: "#ffaa50", M: "#ff6e50", D: "#c8e0ff", "?": "#9a9a9a" };

const dist = (a, b) => Math.hypot(px_(a) - px_(b), py_(a) - py_(b), pz_(a) - pz_(b));
const distSol = (i) => Math.hypot(px_(i), py_(i), pz_(i));

// honest 1g burn-flip-brake, closed form in rapidity
const A1G = 1.032; // c per year at 1 g
function fare(d) {
  const m = (A1G * d) / 2 + 1;
  const phi = Math.acosh(m);
  return {
    tShip: (2 * phi) / A1G,
    tUni: (2 * Math.sinh(phi)) / A1G,
    beta: Math.tanh(phi),
    gamma: m,
  };
}

const fmtLy = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + " ly";
function fmtYr(v) {
  if (v >= 1000) return (v / 1000).toFixed(2) + " kyr";
  return v.toFixed(1) + " yr";
}
// never round up to "1.0000c" — extend digits until the truth shows
function fmtBeta(b) {
  for (let d = 4; d <= 8; d++) {
    const s = b.toFixed(d);
    if (!s.startsWith("1")) return s.replace(/^0/, "") + "c";
  }
  return ".99999999c";
}
function fmtLum(l) {
  if (!l) return "—";
  const n = l >= 100 ? Math.round(l).toLocaleString("en-US")
    : l >= 10 ? l.toFixed(0)
    : l >= 1 ? l.toFixed(1)
    : l >= 0.01 ? l.toFixed(2)
    : l.toPrecision(1).replace("e-", "e−");
  return n + (n === "1.0" || n === "1" ? " Sun" : " Suns");
}

// ---------------------------------------------------------------------------
// State — where you are and what your life has cost
// ---------------------------------------------------------------------------
const state = {
  cur: SOL, hops: 0, ly: 0, tUni: 0, tShip: 0, far: 0,
  auto: false,
};
try {
  Object.assign(state, JSON.parse(localStorage.getItem("solfarer") || "{}"));
} catch (e) { /* fresh start */ }
if (state.cur < -1 || state.cur >= N) state.cur = SOL;
const save = () => localStorage.setItem("solfarer", JSON.stringify(state));

let selected = -2;              // star under inspection, -2 = none

// ---------------------------------------------------------------------------
// Search & filter — matching stars stay bright, the rest fall into shadow
// (and out of reach of the pointer).
// ---------------------------------------------------------------------------
const filter = { q: "", cls: new Set(), con: "", namedOnly: false };
let filterOn = false;
const matchSet = new Uint8Array(N);
let matchCount = 0;

function filterActive() {
  return filter.q !== "" || filter.cls.size > 0 || filter.con !== "" ||
         filter.namedOnly;
}

function matches(i) {
  if (filter.namedOnly && !named_(i)) return false;
  if (filter.cls.size > 0 && !filter.cls.has(cls_(i)[0])) return false;
  if (filter.con && con_(i) !== filter.con) return false;
  if (filter.q) {
    const q = filter.q;
    const hay = (name_(i) + " " + con_(i) + " " + cls_(i)).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function refilter() {
  filterOn = filterActive();
  matchCount = 0;
  for (let i = 0; i < N; i++) {
    matchSet[i] = filterOn ? (matches(i) ? 1 : 0) : 1;
    if (filterOn && matchSet[i]) matchCount++;
  }
  const el = document.getElementById("matchCount");
  el.textContent = filterOn ? matchCount + " match" + (matchCount === 1 ? "" : "es") : "";
  document.getElementById("searchBadge").classList.toggle("on", filterOn);
  drawChart();
}

// ---------------------------------------------------------------------------
// The chart — 2D canvas, pan/zoom, top-down galactic plane
// ---------------------------------------------------------------------------
const chart = document.getElementById("chart");
const ctx = chart.getContext("2d");
const cam = { x: 0, y: 0, s: 4 };   // center (ly), scale (px per ly)
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  chart.width = W * DPR; chart.height = H * DPR;
  chart.style.width = W + "px"; chart.style.height = H + "px";
  drawChart();
}
addEventListener("resize", resize);

const sx = (x) => (x - cam.x) * cam.s + W / 2;
const sy = (y) => H / 2 - (y - cam.y) * cam.s;

function starRadius(i) {
  const am = absmag_(i);
  const base = am <= 2 ? 3.2 : am <= 6 ? 2.2 : am <= 10 ? 1.5 : 1.0;
  return base * Math.max(0.7, Math.min(2.2, cam.s / 4));
}

function drawChart() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#000308";
  ctx.fillRect(0, 0, W, H);

  // faint range rings from Sol — the outer ones carry their distance, so
  // zooming out reads as a journey: 100 ly of neighborhood, then the void
  ctx.lineWidth = 1;
  ctx.font = "11px ui-monospace, Menlo, monospace";
  for (const r of [25, 50, 75, 100, 250, 500, 1000, 2000]) {
    const pr = r * cam.s;
    if (pr < 12 || pr > Math.max(W, H) * 1.5) continue;
    ctx.strokeStyle = "rgba(255,215,106,.09)";
    ctx.beginPath();
    ctx.arc(sx(0), sy(0), pr, 0, Math.PI * 2);
    ctx.stroke();
    if (r > 100) {
      ctx.fillStyle = "rgba(255,215,106,.35)";
      ctx.fillText(r + " ly", sx(0) + 4, sy(0) - pr - 5);
    }
  }

  // route to the selected star
  if (selected > -2 && selected !== state.cur) {
    ctx.strokeStyle = "rgba(255,215,106,.8)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx(px_(state.cur)), sy(py_(state.cur)));
    ctx.lineTo(sx(px_(selected)), sy(py_(selected)));
    ctx.stroke();
  }

  // the neighborhood — under a filter, non-matches fall into shadow and
  // matches get labels while they're few enough to read
  const labelZoom = cam.s >= 6;
  const labelMatches = filterOn && matchCount > 0 && matchCount <= 40;
  ctx.font = "11px ui-monospace, Menlo, monospace";
  const labelBoxes = [];   // beacon labels yield to each other when crowded
  for (let i = 0; i < N; i++) {
    const x = sx(px_(i)), y = sy(py_(i));
    if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
    const r = starRadius(i);
    const hit = matchSet[i] === 1;
    if (filterOn && !hit) {
      ctx.fillStyle = "rgba(110,110,110,.16)";
      ctx.beginPath();
      ctx.arc(x, y, Math.min(r, 1.4), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = CLASS_COL[cls_(i)[0]] || CLASS_COL["?"];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (isBeacon(i)) {
      ctx.strokeStyle = "rgba(255,215,106,.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if ((isBeacon(i) || labelZoom && named_(i) || labelMatches) &&
        i !== selected && i !== state.cur) {
      if (isBeacon(i)) {
        const w = name_(i).length * 6.6;
        if (labelBoxes.some((b) =>
            Math.abs(b.x - x) < (b.w + w) / 2 + 8 && Math.abs(b.y - y) < 13))
          continue;
        labelBoxes.push({ x, y, w });
      }
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fillText(name_(i), x + r + 3, y + 3.5);
    }
  }

  // Sol, always marked
  {
    const x = sx(0), y = sy(0);
    ctx.strokeStyle = "#ffd76a";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ffd76a";
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    if (state.cur !== SOL) {
      ctx.fillStyle = "rgba(255,215,106,.85)";
      ctx.fillText("Sol", x + 9, y + 4);
    }
  }

  // you are here
  {
    const x = sx(px_(state.cur)), y = sy(py_(state.cur));
    ctx.strokeStyle = "#ffd76a";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
  }

  // the selected star
  if (selected > -2) {
    const x = sx(px_(selected)), y = sy(py_(selected));
    ctx.strokeStyle = "#8fe9ff";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#8fe9ff";
    ctx.fillText(name_(selected), x + 10, y + 4);
  }
}

// --- pan / zoom / pick ------------------------------------------------------
let dragging = false, moved = false, lx = 0, ly = 0;
chart.addEventListener("pointerdown", (e) => {
  dragging = true; moved = false; lx = e.clientX; ly = e.clientY;
  chart.setPointerCapture(e.pointerId);
});
chart.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lx, dy = e.clientY - ly;
  if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
  cam.x -= dx / cam.s; cam.y += dy / cam.s;
  lx = e.clientX; ly = e.clientY;
  drawChart();
});
chart.addEventListener("pointerup", (e) => {
  dragging = false;
  if (moved) return;
  // pick: nearest star within 14 px — shadowed stars are out of reach,
  // but where you are and home always answer
  let best = -2, bd = 14;
  for (let i = -1; i < N; i++) {
    if (filterOn && i >= 0 && !matchSet[i] && i !== state.cur) continue;
    const d = Math.hypot(sx(px_(i)) - e.clientX, sy(py_(i)) - e.clientY);
    if (d < bd) { bd = d; best = i; }
  }
  if (best > -2) select(best);
  else { selected = -2; starPanel.classList.remove("on"); drawChart(); }
});
chart.addEventListener("wheel", (e) => {
  e.preventDefault();
  const f = Math.exp(-e.deltaY * 0.0016);
  zoomAt(e.clientX, e.clientY, f);
}, { passive: false });

// pinch
const touches = new Map();
chart.addEventListener("touchstart", (e) => {
  for (const t of e.changedTouches) touches.set(t.identifier, t);
});
chart.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const [a, b] = e.touches;
    const pa = touches.get(a.identifier), pb = touches.get(b.identifier);
    if (pa && pb) {
      const d0 = Math.hypot(pa.clientX - pb.clientX, pa.clientY - pb.clientY);
      const d1 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (d0 > 0) zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, d1 / d0);
    }
    touches.set(a.identifier, a); touches.set(b.identifier, b);
    dragging = false;
  }
}, { passive: false });
chart.addEventListener("touchend", (e) => {
  for (const t of e.changedTouches) touches.delete(t.identifier);
});

function zoomAt(cx, cy, f) {
  const ns = Math.max(0.12, Math.min(60, cam.s * f));
  const wx = cam.x + (cx - W / 2) / cam.s;
  const wy = cam.y - (cy - H / 2) / cam.s;
  cam.s = ns;
  cam.x = wx - (cx - W / 2) / cam.s;
  cam.y = wy + (cy - H / 2) / cam.s;
  drawChart();
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------
const starPanel = document.getElementById("star");
const $ = (id) => document.getElementById(id);

function select(i) {
  selected = i;
  $("stName").textContent = name_(i);
  const c = cls_(i);
  $("stNature").textContent =
    c + " " + starDesc(i) + (con_(i) ? " in " + con_(i) : "") +
    (var_(i) ? " · variable" : "");
  $("stSol").textContent = i === SOL ? "home" : fmtLy(distSol(i));
  $("stHere").textContent = i === state.cur ? "you are here" : fmtLy(dist(state.cur, i));
  $("stLum").textContent = fmtLum(lum_(i));
  $("stEye").textContent = i === SOL ? "it is the day"
    : amag_(i) <= 6.5 ? "naked eye, " + amag_(i).toFixed(1)
    : "telescope, " + amag_(i).toFixed(1);
  const f = fare(dist(state.cur, i));
  $("stUni").textContent = fmtYr(f.tUni);
  $("stShip").textContent = fmtYr(f.tShip);
  $("stPeak").textContent = fmtBeta(f.beta) + "  γ" +
    (f.gamma >= 10 ? f.gamma.toFixed(0) : f.gamma.toFixed(1));
  const go = $("go");
  go.textContent = i === state.cur ? "YOU ARE HERE" : "SET COURSE";
  go.disabled = i === state.cur;
  go.classList.toggle("home", i === SOL);
  starPanel.classList.add("on");
  drawChart();
}

function refreshHere() {
  $("hereName").textContent = name_(state.cur);
  $("hereSub").textContent = state.cur === SOL
    ? "home"
    : fmtLy(distSol(state.cur)) + " from Sol";
  $("lgHops").textContent = state.hops;
  $("lgLy").textContent = fmtLy(state.ly);
  $("lgShip").textContent = fmtYr(state.tShip);
  $("lgUni").textContent = fmtYr(state.tUni);
  $("lgFar").textContent = fmtLy(state.far);
}

function arrive(to, f, d) {
  state.cur = to;
  state.hops++;
  state.ly += d;
  state.tUni += f.tUni;
  state.tShip += f.tShip;
  state.far = Math.max(state.far, distSol(to));
  save();
  selected = -2;
  starPanel.classList.remove("on");
  cam.x = px_(to); cam.y = py_(to);
  refreshHere();
  drawChart();
}

$("go").addEventListener("click", () => {
  if (selected <= -2 || selected === state.cur) return;
  const to = selected, d = dist(state.cur, to), f = fare(d);
  if (state.auto) arrive(to, f, d);
  else startFlight(to, f, d);
});

// toggles
const autoBadge = $("autoBadge");
function reflectAuto() { autoBadge.classList.toggle("on", !!state.auto); }
autoBadge.addEventListener("click", () => { state.auto = !state.auto; save(); reflectAuto(); });
reflectAuto();

$("helpBadge").addEventListener("click", () => $("help").classList.add("on"));
$("help").addEventListener("click", () => $("help").classList.remove("on"));

// --- search & filter wiring -------------------------------------------------
const searchPanel = $("search");
$("searchBadge").addEventListener("click", () => {
  const on = searchPanel.classList.toggle("on");
  if (on) $("q").focus();
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape") searchPanel.classList.remove("on");
});
{
  // constellation dropdown, from the data itself
  const cons = [...new Set(CAT.map((s) => s[7]).filter(Boolean))].sort();
  const sel = $("conSel");
  for (const c of cons) {
    const o = document.createElement("option");
    o.value = o.textContent = c;
    sel.appendChild(o);
  }
}
$("q").addEventListener("input", (e) => {
  filter.q = e.target.value.trim().toLowerCase();
  refilter();
});
for (const chip of document.querySelectorAll("#clsChips .chip")) {
  chip.addEventListener("click", () => {
    const c = chip.dataset.c;
    if (filter.cls.has(c)) { filter.cls.delete(c); chip.classList.remove("on"); }
    else { filter.cls.add(c); chip.classList.add("on"); }
    refilter();
  });
}
$("conSel").addEventListener("change", (e) => {
  filter.con = e.target.value;
  refilter();
});
$("namedOnly").addEventListener("change", (e) => {
  filter.namedOnly = e.target.checked;
  refilter();
});
$("clearFilter").addEventListener("click", () => {
  filter.q = ""; filter.cls.clear(); filter.con = ""; filter.namedOnly = false;
  $("q").value = ""; $("conSel").value = ""; $("namedOnly").checked = false;
  for (const chip of document.querySelectorAll("#clsChips .chip"))
    chip.classList.remove("on");
  refilter();
});

// ---------------------------------------------------------------------------
// The flight — Lighthaul's relativistic optics on the real star field.
// Lazy-built Three.js scene: catalog stars (no wrap), a procedural filler
// field (wrapped, for motion texture), and the CMB sphere.
// ---------------------------------------------------------------------------
let three = null;

function buildThree() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(0x000206, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  $("flight3d").appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera3 = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.01, 100000);

  const uniforms = () => ({
    uShipPos: { value: new THREE.Vector3() },
    uForward: { value: new THREE.Vector3(0, 0, -1) },
    uBeta: { value: 0 },
    uGamma: { value: 1 },
    uCell: { value: 1e5 },
    uSizeMul: { value: 1 },
    uScale: { value: 900 },
    uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
    uWarp: { value: 0 },
    uFxAberration: { value: 1 },
    uFxDoppler: { value: 1 },
    uFxBeaming: { value: 1 },
  });

  function starLayer(positions, temps, brights, sizes, u) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("aTemp", new THREE.Float32BufferAttribute(temps, 1));
    g.setAttribute("aBright", new THREE.Float32BufferAttribute(brights, 1));
    g.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: u, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    return m;
  }

  // the real neighborhood — Sol included
  const cp = [0, 0, 0], ct = [5772], cb = [1], cs = [1.6];
  for (let i = 0; i < N; i++) {
    cp.push(px_(i), py_(i), pz_(i));
    ct.push(temp_(i));
    // brightness from absolute magnitude, gently compressed
    cb.push(Math.max(0.25, Math.min(1, 1.25 - absmag_(i) / 14)));
    cs.push(absmag_(i) <= 2 ? 2.2 : absmag_(i) <= 7 ? 1.5 : 1.0);
  }
  const uCat = uniforms();
  const catMat = starLayer(cp, ct, cb, cs, uCat);

  // filler field: dim wrapped points so motion always has texture
  const FN = 2600, CELL = 260;
  const fp = [], ft = [], fb = [], fs = [];
  for (let i = 0; i < FN; i++) {
    fp.push((Math.random() - 0.5) * CELL, (Math.random() - 0.5) * CELL,
            (Math.random() - 0.5) * CELL);
    ft.push(2600 + Math.random() * 7000);
    fb.push(0.1 + Math.random() * 0.3);
    fs.push(0.6 + Math.random() * 0.9);
  }
  const uFill = uniforms();
  uFill.uCell.value = CELL;
  const fillMat = starLayer(fp, ft, fb, fs, uFill);

  // the CMB, for the deep-gamma glow dead ahead
  const uCmb = {
    uForward: { value: new THREE.Vector3(0, 0, -1) },
    uBeta: { value: 0 },
    uGamma: { value: 1 },
    uGain: { value: 1.1 },
  };
  const cmb = new THREE.Mesh(
    new THREE.SphereGeometry(60000, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: uCmb, vertexShader: CMB_VERT, fragmentShader: CMB_FRAG,
      side: THREE.BackSide, depthWrite: false,
    })
  );
  scene.add(cmb);

  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera3.aspect = innerWidth / innerHeight;
    camera3.updateProjectionMatrix();
  });

  return { renderer, scene, camera3, uCat, uFill, uCmb, cmb };
}

let flight = null;   // { to, f, d, from[], dir[], t0, T }

function startFlight(to, f, d) {
  if (!three) three = buildThree();
  const fx = px_(state.cur), fy = py_(state.cur), fz = pz_(state.cur);
  const dx = (px_(to) - fx) / d, dy = (py_(to) - fy) / d, dz = (pz_(to) - fz) / d;
  flight = {
    to, f, d,
    from: [fx, fy, fz], dir: [dx, dy, dz],
    t0: performance.now(),
    T: Math.min(16, 7 + d / 12) * 1000,   // real seconds for the whole trip
  };
  $("fdest").textContent = name_(state.cur) + "  →  " + name_(to);
  document.body.classList.add("flight");
  requestAnimationFrame(flightFrame);
}

function endFlight() {
  const { to, f, d } = flight;
  flight = null;
  document.body.classList.remove("flight");
  arrive(to, f, d);
}

$("skip").addEventListener("click", () => { if (flight) endFlight(); });

function flightFrame(now) {
  if (!flight) return;
  const { f, d, from, dir, t0, T } = flight;
  let p = (now - t0) / T;               // 0..1 of the trip, in ship time
  if (p >= 1) { endFlight(); return; }

  // ship proper time τ maps linearly onto the animation; rapidity is
  // linear in proper time under constant acceleration: φ = a·τ
  const tau = p * f.tShip;
  const tauB = Math.min(tau, f.tShip - tau);        // time from nearer endpoint
  const phi = A1G * tauB;
  const beta = Math.tanh(phi);
  const gamma = Math.cosh(phi);
  // distance covered: (cosh(aτ)-1)/a from the near end, mirrored past the flip
  const leg = (Math.cosh(A1G * tauB) - 1) / A1G;
  const x = tau <= f.tShip / 2 ? leg : d - leg;
  // universe clock: sinh(aτ)/a from the near end, mirrored
  const legU = Math.sinh(A1G * tauB) / A1G;
  const tU = tau <= f.tShip / 2 ? legU : f.tUni - legU;

  const shipPos = new THREE.Vector3(
    from[0] + dir[0] * x, from[1] + dir[1] * x, from[2] + dir[2] * x);
  const fwd = new THREE.Vector3(dir[0], dir[1], dir[2]);

  const { renderer, scene, camera3, uCat, uFill, uCmb } = three;
  camera3.position.copy(shipPos);
  camera3.lookAt(shipPos.clone().add(fwd));
  for (const u of [uCat, uFill]) {
    u.uShipPos.value.copy(shipPos);
    u.uForward.value.copy(fwd);
    u.uBeta.value = beta;
    u.uGamma.value = gamma;
  }
  uCmb.uForward.value.copy(fwd);
  uCmb.uBeta.value = beta;
  uCmb.uGamma.value = gamma;
  three.cmb.position.copy(shipPos);

  renderer.render(scene, camera3);

  $("fUni").textContent = fmtYr(tU);
  $("fShip").textContent = fmtYr(tau);
  $("fstats").textContent =
    fmtBeta(beta) + "   γ" + (gamma >= 10 ? gamma.toFixed(0) : gamma.toFixed(2)) +
    "   " + fmtLy(Math.max(0, d - x)) + " to go   1g";

  requestAnimationFrame(flightFrame);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
cam.x = px_(state.cur);
cam.y = py_(state.cur);
refreshHere();
matchSet.fill(1);
resize();
