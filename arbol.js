// Bonsái de tinta de Nagori — GSAP + DrawSVG.
// Árbol fijo en un lateral de la página, completo desde el primer momento (356 hojas, una por entrada).
// En bucle y muy despacio, rachas de viento y hojas (con sus puntos de tinta) cruzan toda la pantalla, de lado a lado,
// sobre una capa transparente de pantalla completa; las hojas del árbol no se ven recortadas por ninguna caja.
// Se carga cuando el navegador está libre: los datos (~70 KB gzip) no compiten con el resto de la página.
(function () {
  "use strict";

  var stage = document.getElementById("treeStage");
  if (!stage) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wide = window.matchMedia("(min-width: 1180px)").matches;     // en pantallas estrechas el árbol es solo una marca de agua: sin animar
  var animated = wide && !reduceMotion;             // el bucle de viento y hojas solo en pantallas anchas y sin movimiento reducido
  var TOTAL = 356;                       // hojas del árbol

  /* ---------- Carga diferida ---------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function boot() {
    if (typeof gsap === "undefined" || typeof DrawSVGPlugin === "undefined") return;   // sin GSAP: la página queda sin árbol
    Promise.all([loadScript("assets/arbol/bonsai-data.js"), loadScript("assets/arbol/viento-data.js")])
      .then(init).catch(function () {});
  }
  function whenIdle() {
    if ("requestIdleCallback" in window) requestIdleCallback(boot, { timeout: 2500 });
    else setTimeout(boot, 800);
  }
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle);

  function init() {
    gsap.registerPlugin(DrawSVGPlugin);

    /* ---------- Datos de la app (MoodStyle.kt, paleta Clásica) ---------- */
    var MOODS = ["TRANQUILO", "FELIZ", "AGRADECIDO", "CANSADO", "TRISTE", "ANSIOSO"];
    var COLORS = { TRANQUILO: "#5E7A55", FELIZ: "#B07A12", AGRADECIDO: "#C1662F", CANSADO: "#5A5A7E", TRISTE: "#4F6B80", ANSIOSO: "#A2412E" };
    var SAMPLE = ["TRANQUILO", "FELIZ", "FELIZ", "CANSADO", "ANSIOSO", "TRISTE", "AGRADECIDO", "TRANQUILO", "FELIZ",
                  "CANSADO", "TRISTE", "TRISTE", "ANSIOSO", "TRANQUILO", "AGRADECIDO", "FELIZ", "TRANQUILO", "AGRADECIDO"];

    /* ---------- Kanji 名残: fijo, en su propio SVG a tamaño constante (no depende de la escala del árbol) ---------- */
    var kanji = document.getElementById("treeKanji");
    if (kanji) kanji.querySelector("path").setAttribute("d", BONSAI.kanji);

    /* ---------- SVG del árbol ---------- */
    var NS = "http://www.w3.org/2000/svg";
    var leafFilters = [3, 8, 15].map(function (seed, k) {
      return '<filter id="trLeaf' + k + '" x="-100%" y="-100%" width="300%" height="300%"><feTurbulence type="fractalNoise" baseFrequency=".07" numOctaves="2" seed="' + seed +
             '" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation=".35"/></filter>';
    }).join("");
    stage.innerHTML =
      '<svg viewBox="0 0 800 1000" aria-hidden="true" focusable="false">' +
      "<defs>" +
        '<filter id="trWash" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.1"/></filter>' +
        '<filter id="trSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>' +
        leafFilters +
      "</defs>" +
      '<g id="trRock"></g><g id="trCenters" visibility="hidden"></g><g id="trMasks"></g><g id="trArt"></g>' +
      '<g id="trWind"></g><g id="trLeaves"></g></svg>';
    var svg = stage.firstChild;
    var $ = function (id) { return svg.querySelector("#" + id); };
    var defs = svg.querySelector("defs");
    var el = function (name, attrs, parent) {
      var e = document.createElementNS(NS, name);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    };
    var mulberry = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
    var mulberryR = function (seed) { return mulberry(seed * 2654435761 >>> 0); };
    var rnd = function (a, b) { return a + (b - a) * Math.random(); };
    var f1 = function (n) { return n.toFixed(1); };

    /** Spline Catmull-Rom -> Béziers cúbicas. */
    function smooth(pts) {
      pts = pts.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
      var d = "M" + f1(pts[0][0]) + " " + f1(pts[0][1]);
      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        d += " C" + f1(p1[0] + (p2[0] - p0[0]) / 6) + " " + f1(p1[1] + (p2[1] - p0[1]) / 6) + " " +
             f1(p2[0] - (p3[0] - p1[0]) / 6) + " " + f1(p2[1] - (p3[1] - p1[1]) / 6) + " " + f1(p2[0]) + " " + f1(p2[1]);
      }
      return d;
    }

    /* ---------- Reloj propio: un único timeline maestro que se pausa si la pestaña no está visible ---------- */
    var master = gsap.timeline({ paused: true });
    function track(tl) { master.add(tl, master.time()); return tl; }

    /* ---------- Bonsái: 23 piezas de la silueta, cada una con su línea central ---------- */
    var K = 2.6, OX = 26, OY = 0;                       // unidades del SVG -> lienzo de 800x1000
    var pieces = {};
    function extend(pts, a, b) {                        // prolonga la línea central: el trazo de la máscara tiene remate plano
      var out = pts.map(function (p) { return p.slice(); });
      var dir = function (p, q) { var dx = p[0] - q[0], dy = p[1] - q[1], m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m]; };
      var f = dir(pts[0], pts[1]), l = dir(pts[pts.length - 1], pts[pts.length - 2]);
      out.unshift([pts[0][0] + f[0] * a, pts[0][1] + f[1] * a]);
      out.push([pts[pts.length - 1][0] + l[0] * b, pts[pts.length - 1][1] + l[1] * b]);
      return out;
    }
    var xf = "translate(" + OX + " " + OY + ") scale(" + K + ")";
    ["trCenters", "trMasks", "trArt", "trRock"].forEach(function (id) { $(id).setAttribute("transform", xf); });

    // Orden en que nacen las hojas (hoja n -> hueco n); pasado el último se reparten al azar por las ramas.
    var SLOTS = ["RT", "BL", "BL1", "Tc", "BM", "RM", "BU", "RU", "BM1", "BM2", "RM2", "BL2", "BU1", "RM3", "BM4", "RU1", "BU2", "BM3", "RM1", "BL3", "RT2"]
      .map(function (p) { return { p: p, t: 1 }; })
      .concat([{ p: "BL", t: .6 }, { p: "BM", t: .55 }, { p: "BU", t: .6 }, { p: "RM", t: .55 }, { p: "BM", t: .8 }, { p: "BL", t: .8 }]);

    function frame(pc, s) {                             // punto + tangente de la línea central, en el lienzo
      var l = pc.len * s, P = pc.center.getPointAtLength(l);
      var A = pc.center.getPointAtLength(Math.max(0, l - 1.5)), B = pc.center.getPointAtLength(Math.min(pc.len, l + 1.5));
      var tx = B.x - A.x, ty = B.y - A.y, m = Math.hypot(tx, ty) || 1;
      return { x: P.x * K + OX, y: P.y * K + OY, tx: tx / m, ty: ty / m };
    }
    var gWashL = el("g", { filter: "url(#trWash)" }, $("trArt"));     // halo de agua bajo la tinta
    var gInkL = el("g", {}, $("trArt"));
    BONSAI.pieces.forEach(function (sp) {
      var pc = { id: sp.id, parent: sp.parent };
      pc.center = el("path", { d: smooth(sp.pts) }, $("trCenters"));
      pc.len = pc.center.getTotalLength();
      var mk = el("mask", { id: "trmk_" + sp.id, maskUnits: "userSpaceOnUse", x: -60, y: -60, width: 420, height: 520 }, $("trMasks"));
      // máscara: trazo ancho sobre la línea central; "butt" para que DrawSVG no deje un punto al 0%
      pc.mask = el("path", { d: smooth(extend(sp.pts, sp.w > 40 ? 18 : 5, sp.w > 40 ? 18 : 8)), fill: "none", stroke: "#fff",
        "stroke-width": sp.w, "stroke-linecap": "butt", "stroke-linejoin": "round" }, mk);
      var wash = el("g", { mask: "url(#trmk_" + sp.id + ")" }, gWashL);
      el("path", { d: sp.d, style: "fill:var(--tree-wash)", opacity: .35, transform: "translate(.5 .4)" }, wash);
      var ink = el("g", { mask: "url(#trmk_" + sp.id + ")" }, gInkL);
      el("path", { d: sp.d, style: "fill:var(--tree-ink)", "fill-rule": "evenodd", opacity: .93 }, ink);
      gsap.set(pc.mask, { drawSVG: "0% 0%" });
      pieces[sp.id] = pc;
    });
    // Roca con su reflejo: fija, no crece
    el("path", { d: BONSAI.rock, style: "fill:var(--tree-ink)", "fill-rule": "evenodd", opacity: .93 }, $("trRock"));

    /* ---------- Estado ---------- */
    var state = { n: 0, drawn: {}, leaves: [] };
    var gLeaves = $("trLeaves"), gWind = $("trWind");

    var WEIGHTED = BONSAI.pieces.filter(function (p) { return p.id !== "Ta" && p.id !== "Tb"; })
      .map(function (p) { return { id: p.id, w: pieces[p.id].len }; });
    var WTOTAL = WEIGHTED.reduce(function (a, p) { return a + p.w; }, 0);
    function slotFor(n) {
      if (n < SLOTS.length) return { p: SLOTS[n].p, t: SLOTS[n].t, off: 0, extra: false };
      var r = mulberryR(n + 17), x = r() * WTOTAL, pick = WEIGHTED[0];
      for (var i = 0; i < WEIGHTED.length; i++) { x -= WEIGHTED[i].w; if (x <= 0) { pick = WEIGHTED[i]; break; } }
      return { p: pick.id, t: .12 + .88 * r(), off: (r() - .5) * 12, extra: true };
    }
    function chain(id) { var c = []; for (var p = id; p; p = pieces[p].parent) c.unshift(p); return c; }
    var moodAt = function (i) { return i < SAMPLE.length ? SAMPLE[i] : MOODS[Math.floor(mulberryR(i + 5)() * 6)]; };

    /* ---------- Hoja: tinta que se asienta ---------- */
    var leafSeq = 0;
    function makeLeaf(mood, instant, tracked, parent) {
      var id = ++leafSeq, L = 34, w = L * .38;
      var g = el("g", {}, parent || gLeaves), flt = null, disp = null, blur = null;
      if (!instant) {                                   // filtro propio solo mientras la tinta se asienta
        flt = el("filter", { id: "trlf" + id, x: "-100%", y: "-100%", width: "300%", height: "300%" }, defs);
        el("feTurbulence", { type: "fractalNoise", baseFrequency: .07, numOctaves: 2, seed: id, result: "n" }, flt);
        disp = el("feDisplacementMap", { "in": "SourceGraphic", in2: "n", scale: 9, xChannelSelector: "R", yChannelSelector: "G", result: "d" }, flt);
        blur = el("feGaussianBlur", { "in": "d", stdDeviation: 6 }, flt);
      }
      var shape = "M0 0 C" + w + " " + (-L * .25) + " " + (w * 1.1) + " " + (-L * .7) + " 0 " + (-L) +
                  " C" + (-w * 1.1) + " " + (-L * .7) + " " + (-w) + " " + (-L * .25) + " 0 0Z";
      var color = COLORS[mood];
      var halo = el("path", { d: shape, filter: "url(#trSoft)", transform: "scale(1.5)", opacity: .2, fill: color }, g);
      var main = el("path", { d: shape, filter: instant ? "url(#trLeaf" + (id % 3) + ")" : "url(#trlf" + id + ")", opacity: .9, fill: color }, g);
      el("path", { d: "M0 -1 L" + rnd(-1, 1) + " " + (-L * .8), fill: "none", style: "stroke:var(--paper)", "stroke-width": .7, opacity: .35 }, g);
      for (var i = 0; i < 2; i++) el("circle", { cx: rnd(-w * 1.4, w * 1.4), cy: rnd(-L * 1.1, -L * .4), r: rnd(1.2, 2.6), opacity: .65, fill: color }, g);
      var leaf = { id: id, g: g, flt: flt, blur: blur, disp: disp, halo: halo, x: 0, y: 0, a: 0, s: 0, o: 0, b: 6, dsp: 9, pop: 1, sway: 0, settled: false };
      leaf.applyT = function () {
        g.setAttribute("transform", "translate(" + leaf.x.toFixed(2) + " " + leaf.y.toFixed(2) + ") rotate(" + (leaf.a + leaf.sway).toFixed(2) + ") scale(" + (leaf.s * leaf.pop).toFixed(3) + ")");
      };
      leaf.apply = function () {
        leaf.applyT(); g.style.opacity = leaf.o;
        if (leaf.blur) { leaf.blur.setAttribute("stdDeviation", Math.max(.05, leaf.b).toFixed(2)); leaf.disp.setAttribute("scale", leaf.dsp.toFixed(2)); }
      };
      leaf.settle = function () {                       // la tinta ya está seca: filtro compartido + balanceo muy suave
        if (leaf.settled) return;
        leaf.settled = true; main.setAttribute("filter", "url(#trLeaf" + (id % 3) + ")");
        if (leaf.flt) { leaf.flt.remove(); leaf.flt = leaf.blur = leaf.disp = null; }
        leaf.amp = rnd(.8, 1.8) * (Math.random() < .5 ? -1 : 1); leaf.freq = rnd(.25, .5); leaf.ph = rnd(0, 6);
      };
      if (tracked !== false) state.leaves.push(leaf);
      return leaf;
    }

    // Un único bucle mueve todas las hojas asentadas (~15 fps): con cientos de hojas no puede haber un tween por hoja.
    var swayTick = 0;
    if (animated) gsap.ticker.add(function (time) {
      if (document.hidden || ++swayTick % 4) return;
      for (var i = 0; i < state.leaves.length; i++) {
        var l = state.leaves[i];
        if (l.settled) { l.sway = l.amp * Math.sin(time * l.freq + l.ph); l.applyT(); }
      }
    });

    /* ---------- Viento ---------- */
    function windPath(S, T, phase, tin) {               // tin: dirección del aire al llegar a T (empalma con el trazo)
      var c1 = { x: S.x - rnd(250, 400), y: S.y + rnd(-200, 200) };
      var c2 = tin ? { x: T.x - tin.x * rnd(140, 220), y: T.y - tin.y * rnd(140, 220) } : { x: T.x + rnd(120, 260), y: T.y + rnd(-160, 160) };
      return function (u) {
        var v = 1 - u, x = v*v*v*S.x + 3*v*v*u*c1.x + 3*v*u*u*c2.x + u*u*u*T.x, y = v*v*v*S.y + 3*v*v*u*c1.y + 3*v*u*u*c2.y + u*u*u*T.y;
        var damp = Math.pow(v, 1.2);
        return { x: x + Math.cos(u * 11 + phase) * 5 * damp, y: y + (Math.sin(u * 17 + phase) * 8 + Math.sin(u * 7) * 12) * damp };
      };
    }
    /** Racha: un trazo de viento.svg (cinta rellena + línea central). Se escala, gira y refleja al azar y
     *  se coloca para que su final caiga en T y su inicio quede a la derecha (el aire sopla hacia la izquierda). */
    var gustSeq = 0, lastGust = -1, GUST_OPACITY = .16;
    function makeGust(T, parent, scale) {
      var gi; do { gi = Math.floor(Math.random() * WIND.length); } while (gi === lastGust && WIND.length > 1);
      lastGust = gi;
      var G = WIND[gi], mx = Math.random() < .5 ? -1 : 1, rot = rnd(-.45, .45), sc = scale || rnd(2, 3);
      var co = Math.cos(rot), si = Math.sin(rot), a = sc * mx * co, b = sc * mx * si, c = -sc * si, d = sc * co;
      var tf = function (p) { return [a * p[0] + c * p[1], b * p[0] + d * p[1]]; };
      var orig = G.pts.map(function (p) { return p.slice(); });
      if (tf(orig[orig.length - 1])[0] > tf(orig[0])[0]) orig.reverse();       // el inicio es el extremo más a la derecha
      var e = tf(orig[orig.length - 1]), tx = T.x - e[0], ty = T.y - e[1];
      var W = orig.map(function (p) { var q = tf(p); return [q[0] + tx, q[1] + ty]; });
      var cum = [0]; for (var i = 1; i < W.length; i++) cum.push(cum[i - 1] + Math.hypot(W[i][0] - W[i - 1][0], W[i][1] - W[i - 1][1]));
      var total = cum[cum.length - 1];
      var at = function (u) {                                                   // posición a lo largo de la línea central, u en 0..1
        var l = Math.min(1, Math.max(0, u)) * total, j = 1; while (j < cum.length - 1 && cum[j] < l) j++;
        var t = (l - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
        return { x: W[j - 1][0] + (W[j][0] - W[j - 1][0]) * t, y: W[j - 1][1] + (W[j][1] - W[j - 1][1]) * t };
      };
      var t0 = Math.hypot(W[3][0] - W[0][0], W[3][1] - W[0][1]) || 1;
      var id = "trgm" + (++gustSeq);
      var mk = el("mask", { id: id, maskUnits: "userSpaceOnUse", x: -20, y: -20, width: 260, height: 340 }, defs);
      var mp = el("path", { d: smooth(orig), fill: "none", stroke: "#fff", "stroke-width": G.w * 1.5 + 1.2, "stroke-linecap": "butt", "stroke-linejoin": "round" }, mk);
      var rib = el("path", { d: G.d, style: "fill:var(--tree-wind)", opacity: 0, mask: "url(#" + id + ")",
        transform: "matrix(" + [a, b, c, d].map(function (v) { return v.toFixed(4); }).join(" ") + " " + tx.toFixed(2) + " " + ty.toFixed(2) + ")" }, parent || gWind);
      gsap.set(mp, { drawSVG: "0% 0%" });
      return { start: { x: W[0][0], y: W[0][1] }, tin: { x: (W[3][0] - W[0][0]) / t0, y: (W[3][1] - W[0][1]) / t0 }, at: at, mp: mp, rib: rib,
        remove: function () { rib.remove(); mk.remove(); } };
    }

    /* ---------- El árbol completo, desde el inicio ---------- */
    function addLeaf(mood) {
      var n = state.n++, slot = slotFor(n), pc = pieces[slot.p];
      var r = mulberryR(n + 101), f = frame(pc, slot.t);
      if (slot.off) { f.x += -f.ty * slot.off; f.y += f.tx * slot.off; }
      var ang = Math.atan2(f.ty, f.tx) * 180 / Math.PI + 90 + (r() - .5) * 76;
      if (slot.extra && slot.t < .9) ang += (r() < .5 ? -1 : 1) * (25 + r() * 40);      // las hojas intermedias salen de lado
      var sizeF = n < 30 ? 1 : Math.max(.5, 1 - (n - 30) / 500);                        // con muchas hojas, algo más pequeñas
      var leaf = makeLeaf(mood, true);
      chain(slot.p).forEach(function (id) {
        if (!state.drawn[id]) { state.drawn[id] = true; gsap.set(pieces[id].mask, { drawSVG: "0% 100%" }); }
      });
      leaf.x = f.x; leaf.y = f.y; leaf.a = ang; leaf.s = sizeF * (.9 + .25 * r()); leaf.o = 1; leaf.b = .35; leaf.dsp = 3.5;
      leaf.apply(); leaf.settle();
    }
    function buildTree(done) {                          // en tandas, para no bloquear la página
      var i = 0;
      (function chunk() {
        for (var k = 0; k < 45 && i < TOTAL; k++, i++) addLeaf(moodAt(i));
        if (i < TOTAL) setTimeout(chunk, 0); else done();
      })();
    }

    /* ---------- Capa de pantalla completa (transparente) por la que viaja el bucle ---------- */
    var flow = null, fLeaves = null, fWind = null, FW = 0, FH = 0;
    function setupFlow() {
      flow = el("svg", { "class": "tree-flow", "aria-hidden": "true", focusable: "false" });
      fWind = el("g", {}, flow); fLeaves = el("g", {}, flow);
      document.body.appendChild(flow);
      var fit = function () {
        FW = window.innerWidth; FH = window.innerHeight;
        flow.setAttribute("viewBox", "0 0 " + FW + " " + FH);
      };
      fit(); window.addEventListener("resize", fit);
    }

    /* ---------- Bucle: hojas y puntos de tinta que cruzan la página de lado a lado, llevados por una racha ---------- */
    var drifting = 0;
    function drifter() {
      master.call(drifter, null, master.time() + rnd(2.2, 3.8));
      if (drifting >= 7) return;
      drifting++;
      var mood = MOODS[Math.floor(Math.random() * 6)], color = COLORS[mood];
      var leaf = makeLeaf(mood, true, false, fLeaves);
      var T = { x: rnd(FW * .15, FW * .85), y: rnd(FH * .12, FH * .88) };
      var S = { x: FW + 60, y: rnd(30, FH - 30) }, E = { x: rnd(-160, -80), y: rnd(30, FH - 30) };
      var gust = makeGust(T, fWind, rnd(3, 5)), ph = Math.random() * 6, dir = Math.random() < .5 ? -1 : 1;
      var A = windPath(S, gust.start, ph, gust.tin), B = windPath(gust.at(1), E, ph + 1);
      var path = function (u) { return u < .3 ? A(u / .3) : u < .7 ? gust.at((u - .3) / .4) : B((u - .7) / .3); };
      var dots = [];
      for (var i = 0; i < 4; i++) dots.push({ c: el("circle", { r: rnd(1.4, 3.2), fill: color, opacity: 0 }, fLeaves), lag: .012 * (i + 1) + rnd(0, .008), ph: rnd(0, 6) });
      var size = rnd(.6, .95), probe = { u: 0 };
      var place = function () {
        var u = probe.u, P = path(u), fade = Math.min(1, u * 14, (1 - u) * 14);
        leaf.x = P.x; leaf.y = P.y; leaf.s = size; leaf.o = .9 * fade;
        leaf.a = 90 + dir * 40 + Math.sin(u * 22 + ph) * 28;                    // aleteo suave
        leaf.apply();
        dots.forEach(function (d) {
          var Q = path(Math.max(0, u - d.lag));
          d.c.setAttribute("cx", (Q.x + Math.cos(d.ph + u * 9) * 8).toFixed(1));
          d.c.setAttribute("cy", (Q.y + Math.sin(d.ph + u * 9) * 8).toFixed(1));
          d.c.setAttribute("opacity", (.55 * fade).toFixed(2));
        });
        if (u > .28) {                                                           // la racha se dibuja por delante de la hoja y se borra por detrás
          var reveal = Math.min(1, (u - .3) / .4 + .1), erase = u > .72 ? Math.min(1, (u - .72) / .22) : 0;
          gsap.set(gust.mp, { drawSVG: (erase * 100).toFixed(1) + "% " + (reveal * 100).toFixed(1) + "%" });
          gust.rib.style.opacity = GUST_OPACITY * Math.min(1, (u - .28) * 6) * (1 - erase);
        }
      };
      var tl = gsap.timeline({ onComplete: function () {
        leaf.g.remove(); dots.forEach(function (d) { d.c.remove(); }); gust.remove(); drifting--;
      } });
      tl.to(probe, { u: 1, duration: Math.min(24, Math.max(13, FW / 85)), ease: "none", onUpdate: place }, 0);   // más ancho -> más tiempo: velocidad constante y calmada
      track(tl);
    }

    /* ---------- Viento ambiente: rachas tenues sueltas por toda la pantalla ---------- */
    function ambientWind() {
      var gust = makeGust({ x: rnd(FW * .1, FW * .9), y: rnd(FH * .1, FH * .9) }, fWind, rnd(3, 5)), dur = rnd(6, 8);
      var tl = gsap.timeline({ onComplete: gust.remove });
      tl.fromTo(gust.mp, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: dur, ease: "sine.inOut" }, 0)
        .fromTo(gust.rib, { opacity: 0 }, { opacity: .11, duration: dur * .4, ease: "sine.inOut" }, 0)
        .to(gust.mp, { drawSVG: "100% 100%", duration: dur * .6, ease: "sine.inOut" }, dur * .7)
        .to(gust.rib, { opacity: 0, duration: dur * .5, ease: "sine.inOut" }, dur * .75);
      track(tl);
      master.call(ambientWind, null, master.time() + rnd(5, 9));
    }

    /* ---------- Arranque ---------- */
    buildTree(function () {
      if (!animated) return;                            // pantalla estrecha o movimiento reducido: árbol quieto
      setupFlow();
      master.paused(document.hidden);
      document.addEventListener("visibilitychange", function () { master.paused(document.hidden); });   // pestaña oculta: todo se detiene
      master.call(drifter, null, master.time() + 1);
      master.call(ambientWind, null, master.time() + 3);
    });
  }
})();
