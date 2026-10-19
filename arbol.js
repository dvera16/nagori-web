// Bonsái de tinta de Nagori — GSAP + DrawSVG.
// El tronco, las ramas y la roca son la pintura sumi-e original (assets/arbol/bonsai-tinta-marron.webp), tal cual: tinta negra con sus
// grises y huecos de papel pasada a transparencia. Crece con las máscaras de DrawSVG a lo largo de la línea de cada rama.
// Encima van las hojas (una por entrada) y el viento. Arranca tapado por la pantalla de carga (kanji) y crece al destaparse.
(function () {
  "use strict";

  var N = window.__nagori || { release: function () {}, onReveal: function (f) { f(); } };   // controlador de la pantalla de carga
  var stage = document.getElementById("treeStage");
  if (!stage) { N.release("tree"); return; }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wide = window.matchMedia("(min-width: 1180px)").matches;     // en pantallas estrechas el árbol es solo una marca de agua: sin animar
  var motion = wide && !reduceMotion;                // crecimiento y balanceo: solo en pantallas anchas (en móvil el árbol es una marca de agua quieta)
  var animated = wide && motion;                    // hojas que se sueltan y cruzan la página: solo en pantallas anchas
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
    Promise.all([loadScript("assets/arbol/bonsai-data.js?v=20261020-3"), loadScript("assets/arbol/viento-data.js?v=20261020-3")])
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
    var PAINT_URL = "assets/arbol/bonsai-tinta-marron.webp?v=20261020-6";
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
    (function pivot() {                                 // la capa gira sobre la base del tronco, donde se apoya en la roca
      var c = pieces.Ta.center, a = c.getPointAtLength(0), b = c.getPointAtLength(pieces.Ta.len), p = a.y > b.y ? a : b;
      svg.style.transformOrigin = ((p.x * K + OX) / 8).toFixed(2) + "% " + ((p.y * K + OY) / 10).toFixed(2) + "%";
    })();
    if (motion) {
      gsap.fromTo(sway, { amb: -.32 }, { amb: .32, duration: 5.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.ticker.add(function () {
        if (document.hidden) return;
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

    /* ---------- Hoja que se suelta del árbol: tiembla, se desprende y deja su hueco hasta que vuelve a brotar ---------- */
    function pickTreeLeaf() {
      for (var k = 0; k < 20; k++) {
        var l = state.leaves[Math.floor(Math.random() * state.leaves.length)];
        if (!l.away && l.pop > .99) return l;
      }
      return null;
    }
    function release(leaf, onFree) {
      leaf.away = true;
      var tug = { k: 0 }, amp = rnd(8, 14);
      track(gsap.to(tug, { k: 1, duration: rnd(.8, 1.2), ease: "none",
        onUpdate: function () { leaf.sway = Math.sin(tug.k * Math.PI * 6) * amp * (1 - tug.k * .5); leaf.applyT(); },
        onComplete: function () {
          leaf.sway = 0; leaf.applyT();
          var m = leaf.g.getScreenCTM();
          leaf.g.style.opacity = 0;
          onFree({ x: m.e, y: m.f, s: Math.hypot(m.a, m.b), a: Math.atan2(m.b, m.a) * 180 / Math.PI });
          master.call(function () {                     // vuelve a brotar en su sitio
            leaf.pop = 0; leaf.applyT(); leaf.g.style.opacity = 1;
            track(gsap.to(leaf, { pop: 1, duration: .8, ease: "back.out(2)", onUpdate: leaf.applyT, onComplete: function () { leaf.away = false; } }));
          }, null, master.time() + rnd(16, 28));
        } }));
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
      master.call(drifter, null, master.time() + rnd(3.4, 5.6));
      if (drifting >= 5) return;
      var src = pickTreeLeaf();
      if (!src) return;
      drifting++;
      release(src, function (from) { fly(src.mood, from); });
    }
    function fly(mood, from) {
      var color = COLORS[mood];
      var leaf = makeLeaf(mood, true, false, fLeaves);
      var S = { x: from.x, y: from.y };
      var T = { x: rnd(FW * .1, Math.max(FW * .2, Math.min(FW * .6, S.x - 420))), y: rnd(FH * .15, FH * .85) };
      var E = { x: rnd(-160, -80), y: rnd(30, FH - 30) };
      push(-rnd(.6, 1.1));
      var gust = makeGust(T, fWind, rnd(3, 5)), ph = Math.random() * 6, dir = Math.random() < .5 ? -1 : 1;
      var A = windPath(S, gust.start, ph, gust.tin), B = windPath(gust.at(1), E, ph + 1);
      var path = function (u) { return u < .3 ? A(u / .3) : u < .7 ? gust.at((u - .3) / .4) : B((u - .7) / .3); };
      var dots = [];
      for (var i = 0; i < 4; i++) dots.push({ c: el("circle", { r: rnd(1.4, 3.2), fill: color, opacity: 0 }, fLeaves), lag: .012 * (i + 1) + rnd(0, .008), ph: rnd(0, 6) });
      var size = rnd(.6, .95), probe = { u: 0 }, a0 = from.a, lastKey = "";
      var place = function () {
        var u = probe.u, P = path(u), fade = Math.min(1, (1 - u) * 14);
        var w = Math.min(1, u / .1), e = w * w * (3 - 2 * w);                 // del árbol al vuelo, sin saltos
        var aim = 90 + dir * 40 + Math.sin(u * 22 + ph) * 28;                    // aleteo suave
        while (a0 - aim > 180) a0 -= 360; while (aim - a0 > 180) a0 += 360;
        leaf.x = P.x; leaf.y = P.y; leaf.s = from.s + (size - from.s) * e; leaf.o = fade;
        leaf.a = a0 + (aim - a0) * e;
        leaf.apply();
        dots.forEach(function (d) {
          var Q = path(Math.max(0, u - d.lag));
          d.c.setAttribute("cx", (Q.x + Math.cos(d.ph + u * 9) * 8).toFixed(1));
          d.c.setAttribute("cy", (Q.y + Math.sin(d.ph + u * 9) * 8).toFixed(1));
          d.c.setAttribute("opacity", (.55 * fade * Math.min(1, u * 8)).toFixed(2));
        });
        if (u > .28) {                                                           // la racha se dibuja por delante de la hoja y se borra por detrás
          var reveal = Math.min(1, (u - .3) / .4 + .1), erase = u > .72 ? Math.min(1, (u - .72) / .22) : 0;
          var key = Math.round(erase * 200) + "/" + Math.round(reveal * 200);
          if (key !== lastKey) { lastKey = key; gsap.set(gust.mp, { drawSVG: (erase * 100).toFixed(1) + "% " + (reveal * 100).toFixed(1) + "%" }); }
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
      master.call(function () { push(-rnd(.2, .45), 2.2); }, null, master.time() + dur * .3);
      var tl = gsap.timeline({ onComplete: gust.remove });
      tl.fromTo(gust.mp, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: dur, ease: "sine.inOut" }, 0)
        .fromTo(gust.rib, { opacity: 0 }, { opacity: .11, duration: dur * .4, ease: "sine.inOut" }, 0)
        .to(gust.mp, { drawSVG: "100% 100%", duration: dur * .6, ease: "sine.inOut" }, dur * .7)
        .to(gust.rib, { opacity: 0, duration: dur * .5, ease: "sine.inOut" }, dur * .75);
      track(tl);
      master.call(ambientWind, null, master.time() + rnd(5, 9));
    }

    /* ---------- Arranque ---------- */
    if (motion) gsap.set(kanji ? [stage, kanji] : stage, { opacity: 0 });
    buildTree(function () {
      if (!motion) {                                    // movimiento reducido o pantalla estrecha: árbol quieto, completo
        gsap.set(rockMask, { drawSVG: "0% 100%" });
        paintReady.then(function () { N.release("tree"); });
        return;
      }
      paintReady.then(function () { N.release("tree"); });   // árbol construido y pintura descodificada: la pantalla de carga puede retirarse
      N.onReveal(function () {                          // el crecimiento empieza cuando ya se ve la página
        grow(function () {
          if (!animated) return;
          setupFlow();
          master.paused(document.hidden);
          document.addEventListener("visibilitychange", function () { master.paused(document.hidden); });   // pestaña oculta: todo se detiene
          master.call(ambientWind, null, master.time() + 1.5);
          master.call(drifter, null, master.time() + 3);
        });
      });
    });
  }
})();
