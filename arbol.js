// Bonsái de tinta de Nagori — GSAP + DrawSVG.
// El tronco, las ramas y la roca son la pintura sumi-e original (assets/arbol/bonsai-tinta-marron.webp), tal cual: tinta negra con sus
// grises y huecos de papel pasada a transparencia. Crece con las máscaras de DrawSVG a lo largo de la línea de cada rama.
// Encima van las hojas (una por entrada) y el viento. Arranca tapado por la pantalla de carga (kanji) y crece al destaparse.
// Las hojas representan emociones registradas: se acumulan, no se pierden. La brisa solo las mece (revoloteo corto y vuelta a su
// rama) y las rachas de viento se dibujan dentro del lienzo del árbol, que queda siempre a la derecha del bloque de texto.
// Todo se pausa cuando el árbol no está en el viewport (IntersectionObserver) o la pestaña está oculta.
(function () {
  "use strict";

  var N = window.__nagori || { release: function () {}, onReveal: function (f) { f(); } };   // controlador de la pantalla de carga
  var stage = document.getElementById("treeStage");
  if (!stage) { N.release("tree"); return; }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wide = window.matchMedia("(min-width: 1180px)").matches;     // en pantallas estrechas el árbol es una marca de agua quieta (ligera para el scroll)
  var motion = wide && !reduceMotion;                // crecimiento y balanceo: solo en pantallas anchas
  var animated = wide && motion;                    // viento y hojas que revolotean en el árbol: solo en pantallas anchas
  var topLeaves = !wide && !reduceMotion;           // en estrecho: solo unas pocas hojas revolotean en una capa por encima de la página
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
    if (typeof gsap === "undefined" || typeof DrawSVGPlugin === "undefined") { N.release("tree"); return; }   // sin GSAP: la página queda sin árbol
    Promise.all([loadScript("assets/arbol/bonsai-data.js?v=20261020-8"), loadScript("assets/arbol/viento-data.js?v=20261020-8")])
      .then(init).catch(function () { N.release("tree"); });
  }
  boot();

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
    stage.innerHTML =
      '<svg class="tree-rock" viewBox="0 0 800 1000" aria-hidden="true" focusable="false"><g id="trRock"></g></svg>' +
      '<svg class="tree-art" viewBox="0 0 800 1000" aria-hidden="true" focusable="false">' +
      "<defs></defs>" +
      '<g id="trCenters" visibility="hidden"></g><g id="trMasks"></g><g id="trArt"></g>' +
      '<g id="trWind"></g><g id="trLeaves"></g></svg>';
    var svg = stage.lastChild;
    var $ = function (id) { return stage.querySelector("#" + id); };
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
    /* ---------- La pintura ---------- */
    // Una sola imagen (la silueta, el grosor y las transparencias son los de la pintura) descubierta por una máscara que es la
    // unión de un trazo ancho sobre la línea central de cada rama. DrawSVG anima esos trazos: el árbol se «dibuja» a la vez.
    var PAINT_URL = "assets/arbol/bonsai-tinta-marron.webp?v=20261020-8";
    var washOn = function () {};                                  // (antes: lavado difuminado; la pintura ya lo trae)
    var growMask = el("mask", { id: "trGrow", maskUnits: "userSpaceOnUse", x: -10, y: -10, width: 310, height: 400 }, $("trMasks"));
    var paint = el("image", { x: 0, y: 0, width: 287.337, height: 383.117, preserveAspectRatio: "none", mask: "url(#trGrow)" }, $("trArt"));
    paint.setAttribute("href", PAINT_URL);
    paint.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", PAINT_URL);
    var paintReady = new Promise(function (res) {                 // la pantalla de carga espera a que la pintura esté descodificada
      var im = new Image(); im.onload = im.onerror = res; im.src = PAINT_URL;
    });
    function growStroke(pts, w, a, b) {                           // trazo «butt» para que DrawSVG no deje un punto al 0 %
      return el("path", { d: smooth(extend(pts, a, b)), fill: "none", stroke: "#fff", "stroke-width": w,
        "stroke-linecap": "butt", "stroke-linejoin": "round" }, growMask);
    }
    BONSAI.pieces.forEach(function (sp) {
      var pc = { id: sp.id, parent: sp.parent };
      pc.center = el("path", { d: smooth(sp.pts) }, $("trCenters"));
      pc.len = pc.center.getTotalLength();
      pc.mask = growStroke(sp.pts, sp.w + 8, sp.w > 40 ? 18 : 5, sp.w > 40 ? 18 : 8);
      gsap.set(pc.mask, { drawSVG: "0% 0%" });
      pieces[sp.id] = pc;
    });
    // La roca y su reflejo se descubren de izquierda a derecha
    var rockMask = growStroke([[14, 330], [275, 330]], 80, 0, 0);
    gsap.set(rockMask, { drawSVG: "0% 0%" });

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

    /* ---------- Formas de hoja pre-deformadas: el borde irregular de tinta va horneado en el trazado ----------
       (antes cada hoja llevaba un filtro SVG con turbulencia + desplazamiento + desenfoque: 356 filtros que repintar) */
    var LEAF_L = 36, LEAF_W = LEAF_L * .3;
    function bakeLeaf(seed) {
      var r = mulberryR(seed + 900), L = LEAF_L, w = LEAF_W, pts = [], i, t;
      var bez = function (p0, p1, p2, p3, t) { var v = 1 - t; return [v*v*v*p0[0] + 3*v*v*t*p1[0] + 3*v*t*t*p2[0] + t*t*t*p3[0], v*v*v*p0[1] + 3*v*v*t*p1[1] + 3*v*t*t*p2[1] + t*t*t*p3[1]]; };
      for (i = 0; i < 13; i++) pts.push(bez([0, 0], [w, -L * .25], [w * 1.1, -L * .7], [0, -L], i / 12));            // lado derecho, base -> punta
      for (i = 1; i < 12; i++) pts.push(bez([0, -L], [-w * 1.1, -L * .7], [-w, -L * .25], [0, 0], i / 12));          // lado izquierdo, punta -> base
      var bend = (r() - .5) * 9, p1 = r() * 6, p2 = r() * 6, k1 = 5 + r() * 4, k2 = 11 + r() * 5, A = 1.4 + r() * .9, out = [];
      for (i = 0; i < pts.length; i++) {
        var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
        t = i / pts.length;
        var d = (i === 0 || i === 12) ? 0 : A * (Math.sin(k1 * t * 6.28 + p1) + .6 * Math.sin(k2 * t * 6.28 + p2));   // base y punta quedan firmes
        out.push([pts[i][0] - dy / m * d + bend * Math.pow(-pts[i][1] / L, 2), pts[i][1] + dx / m * d]);   // la punta se curva, como un golpe de pincel
      }
      return smooth(out) + "Z";
    }
    var LEAF_SHAPES = [0, 1, 2, 3, 4, 5].map(bakeLeaf);

    /* ---------- Hoja: tinta que se asienta ---------- */
    var leafSeq = 0;
    function makeLeaf(mood, instant, tracked, parent) {
      var id = ++leafSeq, L = LEAF_L, w = LEAF_W;
      var g = el("g", {}, parent || gLeaves), shape = LEAF_SHAPES[id % LEAF_SHAPES.length], color = COLORS[mood];
      // Pincelada de lavado: el color de la emoción, translúcido (al solaparse se ven las capas), con un charco de tinta
      // más oscura hacia la base, como cuando el pigmento se asienta; sin contorno ni halo.
      var rt = mulberryR(id + 3), tone = .5 + .3 * rt();
      var rgb = color.replace("#", ""), dark = "#" + [0, 2, 4].map(function (i) { return ("0" + Math.round(parseInt(rgb.substr(i, 2), 16) * .66).toString(16)).slice(-2); }).join("");
      var halo = el("path", { d: shape, opacity: tone, fill: color }, g);
      el("path", { d: shape, transform: "translate(" + (rt() - .5) * 1.6 + " -3) scale(" + (.5 + .12 * rt()).toFixed(2) + " .58)", opacity: .34, fill: dark }, g);
      for (var i = 0; i < 2; i++) el("circle", { cx: rnd(-w * 1.5, w * 1.5), cy: rnd(-L * 1.15, -L * .35), r: rnd(.9, 1.9), opacity: .5, fill: dark }, g);
      var leaf = { id: id, mood: mood, g: g, halo: halo, x: 0, y: 0, a: 0, s: 0, o: 0, pop: 1, sway: 0, settled: false };
      leaf.applyT = function () {
        g.setAttribute("transform", "translate(" + leaf.x.toFixed(2) + " " + leaf.y.toFixed(2) + ") rotate(" + (leaf.a + leaf.sway).toFixed(2) + ") scale(" + (leaf.s * leaf.pop).toFixed(3) + ")");
      };
      leaf.apply = function () { leaf.applyT(); g.style.opacity = leaf.o; };
      leaf.settle = function () { leaf.settled = true; };
      if (tracked !== false) state.leaves.push(leaf);
      return leaf;
    }

    /* ---------- Balanceo del árbol entero: una sola rotación CSS sobre su capa, 60 fps sin repintar ----------
       amb = respiración lenta · gust = empujón de cada racha (vuelve con muelle) · scroll = inercia al desplazarse */
    var sway = { amb: 0, gust: 0, scroll: 0 }, lastY = window.scrollY, lastR = 1e9;
    var inView = true, started = false, ambTween = null, growTl = null;
    function setActive() {                              // en pantalla y con la pestaña activa: todo corre; si no, todo se detiene
      var on = inView && !document.hidden;
      master.paused(!(started && on));
      if (ambTween) ambTween.paused(!on);
      if (growTl && growTl.progress() < 1) growTl.paused(!on);
    }
    if (motion) {
      if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { inView = en[0].isIntersecting; setActive(); }).observe(stage);
      document.addEventListener("visibilitychange", setActive);
    }
    (function pivot() {                                 // la capa gira sobre la base del tronco, donde se apoya en la roca
      var c = pieces.Ta.center, a = c.getPointAtLength(0), b = c.getPointAtLength(pieces.Ta.len), p = a.y > b.y ? a : b;
      svg.style.transformOrigin = ((p.x * K + OX) / 8).toFixed(2) + "% " + ((p.y * K + OY) / 10).toFixed(2) + "%";
    })();
    if (motion) {
      ambTween = gsap.fromTo(sway, { amb: -.32 }, { amb: .32, duration: 5.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.ticker.add(function () {
        if (document.hidden || !inView) return;
        var y = window.scrollY, dy = y - lastY; lastY = y;
        var target = Math.max(-1.4, Math.min(1.4, -dy * .03));
        sway.scroll += (target - sway.scroll) * .06;
        var r = sway.amb + sway.gust + sway.scroll;
        if (Math.abs(r - lastR) > .003) { lastR = r; svg.style.transform = "rotate(" + r.toFixed(3) + "deg)"; }
      });
    }
    function push(amount, hold) {                       // racha: el árbol cede hacia la izquierda y vuelve con un muelle suave
      if (!motion) return;
      gsap.to(sway, { gust: amount, duration: hold || 1.4, ease: "sine.inOut", overwrite: "auto",
        onComplete: function () { gsap.to(sway, { gust: 0, duration: 3.4, ease: "elastic.out(1, 0.45)", overwrite: "auto" }); } });
    }

    /* ---------- Viento ---------- */
    function windPath(S, T, phase, tin) {               // tin: dirección del aire al llegar a T (empalma con el trazo)
      var c1 = { x: S.x - rnd(200, 340), y: S.y + rnd(40, 200) };
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
    function makeGust(T, parent, scale, bounds) {
      var gi; do { gi = Math.floor(Math.random() * WIND.length); } while (gi === lastGust && WIND.length > 1);
      lastGust = gi;
      var G = WIND[gi], mx = Math.random() < .5 ? -1 : 1, rot = rnd(-.45, .45), sc = scale || rnd(2, 3);
      var co = Math.cos(rot), si = Math.sin(rot), a = sc * mx * co, b = sc * mx * si, c = -sc * si, d = sc * co;
      var tf = function (p) { return [a * p[0] + c * p[1], b * p[0] + d * p[1]]; };
      var orig = G.pts.map(function (p) { return p.slice(); });
      if (tf(orig[orig.length - 1])[0] > tf(orig[0])[0]) orig.reverse();       // el inicio es el extremo más a la derecha
      var e = tf(orig[orig.length - 1]), tx = T.x - e[0], ty = T.y - e[1];
      var W = orig.map(function (p) { var q = tf(p); return [q[0] + tx, q[1] + ty]; });
      if (bounds) for (var bi = 0; bi < W.length; bi++) {                       // fuera del lienzo permitido: se descarta
        if (W[bi][0] < bounds[0] || W[bi][0] > bounds[2] || W[bi][1] < bounds[1] || W[bi][1] > bounds[3]) return null;
      }
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
        if (!state.drawn[id]) { state.drawn[id] = true; if (!motion) gsap.set(pieces[id].mask, { drawSVG: "0% 100%" }); }
      });
      leaf.x = f.x; leaf.y = f.y; leaf.a = ang; leaf.s = sizeF * (.9 + .25 * r()); leaf.o = 1;
      leaf.piece = slot.p; leaf.t = slot.t;
      if (motion) leaf.pop = 0;                         // brotará cuando la rama la alcance
      leaf.apply(); leaf.settle();
    }
    function buildTree(done) {                          // en tandas, para no bloquear la página
      var i = 0;
      (function chunk() {
        for (var k = 0; k < 45 && i < TOTAL; k++, i++) addLeaf(moodAt(i));
        if (i < TOTAL) setTimeout(chunk, 0); else done();
      })();
    }

    /* ---------- Crecimiento: cada rama nace a mitad de su madre; las hojas brotan cuando el trazo llega a ellas ---------- */
    function grow(done) {
      var maxLen = 0, T = {};
      Object.keys(state.drawn).forEach(function (id) { maxLen = Math.max(maxLen, pieces[id].len); });
      var dur = function (id) { return .7 + 1.1 * pieces[id].len / maxLen; };
      var start = function (id) {
        if (T[id] != null) return T[id];
        var p = pieces[id].parent;
        return (T[id] = p ? start(p) + dur(p) * .45 : 0);
      };
      var tl = gsap.timeline({ delay: .2, onComplete: function () { washOn(); done(); } });
      growTl = tl;
      tl.fromTo(stage, { opacity: 0 }, { opacity: 1, duration: .9, ease: "sine.out" }, 0);
      tl.fromTo(rockMask, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 1.3, ease: "sine.inOut" }, .1);
      Object.keys(state.drawn).forEach(function (id) {
        tl.fromTo(pieces[id].mask, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: dur(id), ease: "sine.inOut" }, .15 + start(id));
      });
      var end = 0;
      state.leaves.forEach(function (l) {
        var at = .15 + start(l.piece) + dur(l.piece) * Math.min(1, l.t * .85 + .1) + rnd(0, .35);
        end = Math.max(end, at);
        tl.to(l, { pop: 1, duration: .55, ease: "back.out(2.2)", onUpdate: l.applyT }, at);
      });
      if (kanji) tl.fromTo(kanji, { opacity: 0, scale: 1.25, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: .5, ease: "power3.out" }, end * .8);
      tl.add(function () { push(-.7, 1.1); }, end * .6);       // primera brisa: el árbol recién crecido se despereza
      // Guarda de rendimiento: cada 8 fotogramas se mide la media; si pasa de 40 ms (< 25 fps) el crecimiento se acelera
      // (hasta ×8) para que la fase pesada dure menos en equipos justos. En equipos buenos nunca interviene.
      var tA = performance.now(), nA = 0;
      var probe = function () {
        if (++nA < 8) return;
        var avg = (performance.now() - tA) / nA; tA = performance.now(); nA = 0;
        if (avg > 40) tl.timeScale(Math.min(8, tl.timeScale() * 1.8));
        if (tl.progress() >= 1) gsap.ticker.remove(probe);
      };
      gsap.ticker.add(probe);
    }

    /* ---------- Hojas que se mecen: revoloteo corto alrededor de su rama ---------- */
    // Cada hoja es una emoción registrada y se queda: la brisa solo la hace revolotear unas decenas de unidades del lienzo
    // (con una pequeña rotación) y volver a su sitio. Los límites mantienen todo dentro del lienzo del árbol.
    var fluttering = 0;
    function flutter() {
      master.call(flutter, null, master.time() + rnd(1.6, 3.2));
      if (fluttering >= 6) return;
      var leaf = null, k;
      for (k = 0; k < 20 && !leaf; k++) { var l = state.leaves[Math.floor(Math.random() * state.leaves.length)]; if (!l.busy && l.pop > .99) leaf = l; }
      if (!leaf) return;
      leaf.busy = true; fluttering++;
      var hx = leaf.x, hy = leaf.y, ha = leaf.a, ph = rnd(0, 6), spin = rnd(12, 26) * (Math.random() < .5 ? -1 : 1);
      var dx = Math.max(-rnd(10, 30), 16 - hx), dy = Math.min(Math.max(rnd(-12, 22), 24 - hy), 976 - hy);   // el aire sopla hacia la izquierda; sin salir del lienzo
      var p = { t: 0 };
      track(gsap.to(p, { t: 1, duration: rnd(2.4, 3.6), ease: "none",
        onUpdate: function () {
          var e = Math.sin(Math.PI * p.t), w = Math.sin(p.t * 7 + ph);       // ida y vuelta suave + temblor
          leaf.x = hx + dx * e; leaf.y = hy + dy * e + w * 2.2 * e; leaf.a = ha + spin * e + w * 6 * e;
          leaf.applyT();
        },
        onComplete: function () { leaf.x = hx; leaf.y = hy; leaf.a = ha; leaf.applyT(); leaf.busy = false; fluttering--; } }));
      push(-rnd(.15, .35), 1.6);                        // el tronco responde levemente
    }

    /* ---------- Viento ambiente: rachas tenues dentro del follaje ---------- */
    var WIND_ZONE = [200, 130, 760, 700], WIND_BOUNDS = [24, 40, 776, 960];   // lienzo del árbol (800x1000)
    function ambientWind() {
      master.call(ambientWind, null, master.time() + rnd(5, 9));
      var gust = null, k;
      for (k = 0; k < 8 && !gust; k++)
        gust = makeGust({ x: rnd(WIND_ZONE[0], WIND_ZONE[2]), y: rnd(WIND_ZONE[1], WIND_ZONE[3]) }, gWind, Math.max(.7, rnd(1.1, 1.8) - k * .1), WIND_BOUNDS);
      if (!gust) return;
      var dur = rnd(6, 8);
      master.call(function () { push(-rnd(.2, .45), 2.2); }, null, master.time() + dur * .3);
      var tl = gsap.timeline({ onComplete: gust.remove });
      tl.fromTo(gust.mp, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: dur, ease: "sine.inOut" }, 0)
        .fromTo(gust.rib, { opacity: 0 }, { opacity: .12, duration: dur * .4, ease: "sine.inOut" }, 0)
        .to(gust.mp, { drawSVG: "100% 100%", duration: dur * .6, ease: "sine.inOut" }, dur * .7)
        .to(gust.rib, { opacity: 0, duration: dur * .5, ease: "sine.inOut" }, dur * .75);
      track(tl);
    }

    /* ---------- Balanceo por scroll (móvil) ----------
       El árbol quieto se inclina un poco con el desplazamiento y vuelve solo a su sitio. Solo hay trabajo mientras se mueve:
       el bucle se engancha al hacer scroll y se suelta cuando el árbol ha vuelto al reposo. */
    function scrollSway() {
      var cur = 0, lastY = window.scrollY, on = false, K2 = 2.6;
      function tick() {
        var y = window.scrollY, dy = y - lastY; lastY = y;
        cur += (Math.max(-1.4, Math.min(1.4, -dy * .03)) - cur) * .06;
        svg.style.transform = "rotate(" + (cur * K2).toFixed(3) + "deg)";
        if (Math.abs(cur) < .004 && dy === 0) { svg.style.transform = ""; gsap.ticker.remove(tick); on = false; }
      }
      window.addEventListener("scroll", function () { if (!on) { on = true; lastY = window.scrollY - 1; gsap.ticker.add(tick); } }, { passive: true });
    }

    /* ---------- Hojas viajeras por encima de la página (móvil) ----------
       El árbol queda quieto y tenue tras el contenido. Tres hojas se sueltan de él y vagan por la pantalla, por encima del texto
       (capa fija, sin capturar toques), con un trayecto aleatorio: cada tramo va a un punto nuevo de la pantalla, a paso lento. */
    function floatLeaves() {
      var sky = document.createElement("div");
      sky.className = "leaf-sky"; sky.setAttribute("aria-hidden", "true");
      sky.innerHTML = '<svg focusable="false"><g></g></svg>';
      document.body.appendChild(sky);
      var g = sky.querySelector("g"), list = state.leaves, SPEED = 11, tweens = [];   // px por segundo
      var vw = function () { return window.innerWidth; }, vh = function () { return window.innerHeight; };
      [40, 150, 260].forEach(function (idx, n) {
        var src = list[idx], box = src.g.getBoundingClientRect();
        var leaf = makeLeaf(src.mood, true, false, g);
        src.g.style.display = "none";                       // la hoja del árbol quieto pasa a la capa superior
        leaf.x = box.left + box.width / 2; leaf.y = box.top + box.height / 2; leaf.a = src.a; leaf.s = .55 + .1 * n; leaf.o = 1; leaf.apply();
        var ph = rnd(0, 6), spin = rnd(18, 34), t0 = 0, p = { t: 0 }, base = leaf.a;
        function leg() {                                    // siguiente punto al azar dentro de la pantalla
          var tx = rnd(24, vw() - 24), ty = rnd(84, vh() - 24), dist = Math.hypot(tx - leaf.x, ty - leaf.y);
          tweens.push(gsap.to(leaf, { x: tx, y: ty, duration: Math.max(4, dist / SPEED), ease: "sine.inOut", onComplete: leg }));
        }
        leg();
        tweens.push(gsap.to(p, { t: 1, duration: 1e5, ease: "none", onUpdate: function () {   // revoloteo: giro y vaivén continuos
          var T = p.t * 1e5; leaf.a = base + Math.sin(T * .9 + ph) * spin + Math.sin(T * .37) * 12; leaf.applyT();
        } }));
      });
      document.addEventListener("visibilitychange", function () { tweens.forEach(function (t) { t.paused(document.hidden); }); });
    }

    /* ---------- Arranque ---------- */
    if (motion) gsap.set(kanji ? [stage, kanji] : stage, { opacity: 0 });
    buildTree(function () {
      if (!motion) {                                    // movimiento reducido o pantalla estrecha: árbol quieto, completo
        gsap.set(rockMask, { drawSVG: "0% 100%" });
        if (topLeaves) { floatLeaves(); scrollSway(); }
        paintReady.then(function () { N.release("tree"); });
        return;
      }
      paintReady.then(function () { N.release("tree"); });   // árbol construido y pintura descodificada: la pantalla de carga puede retirarse
      N.onReveal(function () {                          // el crecimiento empieza cuando ya se ve la página
        grow(function () {
          if (!animated) return;
          started = true; setActive();                  // desde aquí corre el bucle, salvo que el árbol salga del viewport o la pestaña se oculte
          master.call(ambientWind, null, master.time() + 1.5);
          master.call(flutter, null, master.time() + 2.5);
        });
      });
    });
  }
})();
