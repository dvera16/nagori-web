// Animaciones de Nagori — GSAP + ScrollTrigger.
// Entradas tipo "waterfall-entry" para titulares; tarjetas por lotes según entran en pantalla,
// con la cinta que se «pega» al final; el teléfono del hero se asienta con el scroll.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGsap = typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined";

  var hidden = [
    "#heroMark", "#heroWord", "#heroSub", "#scrollCue", "#heroPhone",
    ".hero-headline .line > span", ".reveal-heading .line > span",
    "[data-reveal-eyebrow] span", "[data-reveal-card]"
  ];

  /* ---------- Galería «Pantallas»: sin barra de scroll; flechas, arrastre con el ratón y teclado ---------- */
  (function initShots() {
    var track = document.getElementById("shots");
    var prev = document.querySelector(".shots-prev"), next = document.querySelector(".shots-next");
    if (!track || !prev || !next) return;
    function step() {                                   // ancho de una pantalla + el hueco entre ellas
      var first = track.querySelector(".shot");
      var cs = getComputedStyle(track), gap = parseFloat(cs.columnGap || cs.gap) || 48;
      return (first ? first.getBoundingClientRect().width : 300) + gap;
    }
    var ticking = false;
    function update() {
      ticking = false;
      var first = track.querySelector(".shot");          // posición de reposo: la primera pantalla pegada al borde izquierdo
      var home = first ? first.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft : 0;
      prev.disabled = track.scrollLeft <= home + 4;
      next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    }
    function go(dir) { track.scrollBy({ left: dir * step(), behavior: reduceMotion ? "auto" : "smooth" }); }
    prev.addEventListener("click", function () { go(-1); });
    next.addEventListener("click", function () { go(1); });
    track.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener("resize", update);
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    });
    var drag = null;                                    // arrastrar con el ratón (con el dedo y el trackpad ya funciona de serie)
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: track.scrollLeft, moved: false };
    });
    window.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 4) { drag.moved = true; track.classList.add("is-dragging"); }
      if (drag.moved) track.scrollLeft = drag.left - dx;
    });
    window.addEventListener("pointerup", function () { drag = null; track.classList.remove("is-dragging"); });
    update();
  })();

  /* ---------- Móvil del hero: las capturas reales se suceden despacio, con un fundido largo ----------
     Solo mientras el hero se ve y la pestaña está activa; con movimiento reducido se queda en la primera. */
  (function initHeroCycle() {
    var device = document.getElementById("heroDevice");
    if (!device || reduceMotion) return;
    var imgs = device.querySelectorAll("img"), i = 0, timer = null, visible = true;
    if (imgs.length < 2) return;
    function next() {
      imgs[i].classList.remove("is-on");
      i = (i + 1) % imgs.length;
      imgs[i].classList.add("is-on");
    }
    function sync() {
      var run = visible && !document.hidden;
      if (run && !timer) timer = setInterval(next, 5200);
      else if (!run && timer) { clearInterval(timer); timer = null; }
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }).observe(device);
    }
    document.addEventListener("visibilitychange", sync);
    var N = window.__nagori;
    if (N && N.onReveal) N.onReveal(sync); else sync();
  })();

  /* ---------- Recortes de papel rasgado, como en la app (RoughPageShape + inkEdge) ----------
     Cada borde mezcla un temblor fino con una ondulación lenta y algún mordisco más profundo.
     La semilla es fija por elemento: el papel se ve siempre igual y dos hojas no comparten borde. */
  (function initRecortes() {
    var SVG = "http://www.w3.org/2000/svg", INK = "#3b2e23";
    function rng(seed) {                                   // mulberry32
      return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    function edgeProfile(r, count, amp) {                 // cuánto se mete el borde hacia dentro (>= 0)
      var points = count + 1, every = 6, knots = [], out = [], i, j;
      for (i = 0; i < Math.floor(points / every) + 2; i++) knots.push(r());
      for (i = 0; i < points; i++) {
        var k = Math.floor(i / every), t = (i % every) / every;
        out.push(amp * (0.55 * r() + 0.45 * (knots[k] * (1 - t) + knots[k + 1] * t)));
      }
      i = 2;
      while (i < points - 2) {
        if (r() < 0.045) {
          var half = 1 + Math.floor(r() * 2), depth = amp * (1.4 + r() * 1.2);
          for (j = -half; j <= half; j++) if (i + j >= 0 && i + j < points) out[i + j] += depth * (1 - Math.abs(j) / (half + 1));
          i += half * 2 + 3;
        } else i++;
      }
      return out;
    }
    function roughPath(seed, w, h, amp, step) {
      var r = rng(seed), nx = Math.max(2, Math.floor(w / step)), ny = Math.max(2, Math.floor(h / step)), i;
      var top = edgeProfile(r, nx, amp), right = edgeProfile(r, ny, amp), bottom = edgeProfile(r, nx, amp), left = edgeProfile(r, ny, amp);
      var d = "M" + left[0].toFixed(1) + " " + top[0].toFixed(1);
      for (i = 1; i <= nx; i++) d += "L" + (w * i / nx).toFixed(1) + " " + top[i].toFixed(1);
      for (i = 1; i <= ny; i++) d += "L" + (w - right[i]).toFixed(1) + " " + (h * i / ny).toFixed(1);
      for (i = nx - 1; i >= 0; i--) d += "L" + (w * i / nx).toFixed(1) + " " + (h - bottom[i]).toFixed(1);
      for (i = ny - 1; i >= 1; i--) d += "L" + left[i].toFixed(1) + " " + (h * i / ny).toFixed(1);
      return d + "Z";
    }
    function node(name, attrs) {
      var el = document.createElementNS(SVG, name);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }
    var uid = 0;
    // Papel (o cinta) con el canto de tinta: un velo casi invisible hacia dentro y un contorno fino.
    function paper(host, seed, fill, amp, step, stroke) {
      var svg = node("svg", { "aria-hidden": "true", focusable: "false" }), id = "rc" + (++uid);
      var clip = node("clipPath", { id: id }), clipPath = node("path", {});
      var body = node("path", { fill: fill, stroke: "none" });   // explícito: hay reglas globales que trazan los path de los svg
      var wash = node("path", { fill: "none", stroke: INK, "stroke-opacity": .045, "stroke-width": stroke * 7, "stroke-linejoin": "round", "clip-path": "url(#" + id + ")" });
      var edge = node("path", { fill: "none", stroke: INK, "stroke-opacity": .3, "stroke-width": stroke * .6, "stroke-linejoin": "round", "stroke-linecap": "round" });
      clip.appendChild(clipPath); svg.appendChild(clip); svg.appendChild(body); svg.appendChild(wash); svg.appendChild(edge);
      host.insertBefore(svg, host.firstChild);
      function draw() {
        var w = host.offsetWidth, h = host.offsetHeight;
        if (!w || !h) return;
        svg.setAttribute("viewBox", "0 0 " + w + " " + h);
        var d = roughPath(seed, w, h, amp, step);
        [clipPath, body, wash, edge].forEach(function (p) { p.setAttribute("d", d); });
      }
      draw();
      if ("ResizeObserver" in window) new ResizeObserver(draw).observe(host);
      return svg;
    }
    var cs = getComputedStyle(document.documentElement);
    var paperFill = cs.getPropertyValue("--paper-card").trim() || "#fbf6ec";
    var tapeFill = cs.getPropertyValue("--tape").trim() || "rgba(226,205,148,.82)";
    document.querySelectorAll(".recorte").forEach(function (card, n) {
      var seed = 7919 * (n + 3);
      paper(card, seed, paperFill, 2.4, 5, 1.4).classList.add("recorte-paper");
      card.classList.add("is-torn");
      var tape = card.querySelector(".tape");
      if (tape) { paper(tape, seed * 31 + 7, tapeFill, 1.2, 3, 1); tape.classList.add("is-torn"); }
    });
  })();

  /* ---------- Novedades: un móvil fijo con grabaciones reales que cambian al pasar cada capítulo ----------
     En escritorio, los vídeos de cada capítulo se pasan al móvil de la izquierda y suena (en silencio) solo el del
     capítulo activo; al cambiar, la pantalla vieja se levanta como una hoja, la cinta se vuelve a pegar y el contador
     gira. En móvil cada capítulo reproduce su propio vídeo mientras se ve. Con movimiento reducido no hay
     reproducción automática: se ven los carteles y los controles del vídeo. */
  (function initNovedades() {
    var stage = document.getElementById("nvStage");
    if (!stage || !("IntersectionObserver" in window)) return;
    var steps = Array.prototype.slice.call(stage.querySelectorAll(".nv-step"));
    var device = document.getElementById("nvDevice"), tabs = document.getElementById("nvTabs");
    var cur = document.getElementById("nvCur"), tape = document.getElementById("nvTape");
    var desk = window.matchMedia("(min-width: 861px)");
    var anim = hasGsap && !reduceMotion;
    document.documentElement.classList.add("nv-js");

    var screens = steps.map(function (step, i) {
      var src = step.querySelector("video");
      var fig = document.createElement("figure");
      fig.className = "nv-screen";
      var v = src.cloneNode(true);
      v.removeAttribute("aria-label");
      fig.appendChild(v);
      device.appendChild(fig);
      var tab = document.createElement("button");
      tab.type = "button";
      tab.className = "nv-tab";
      tab.tabIndex = -1;
      tab.style.setProperty("--mood", getComputedStyle(step).getPropertyValue("--mood"));
      tab.addEventListener("click", function () { step.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); });
      tabs.appendChild(tab);
      if (reduceMotion) { src.controls = true; v.controls = true; }
      return { step: step, fig: fig, video: v, own: src, tab: tab, seen: false };
    });

    var active = -1, inView = false;
    function play(v) {
      if (reduceMotion) return;
      try { v.currentTime = 0; } catch (e) {}
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    }
    function pauseAll(except) {
      screens.forEach(function (s) {
        if (s.video !== except && !s.video.paused) s.video.pause();
        if (s.own !== except && !s.own.paused) s.own.pause();
      });
    }

    function setActive(i) {
      if (i === active) return;
      var prev = active >= 0 ? screens[active] : null, next = screens[i];
      active = i;
      screens.forEach(function (s, k) {
        s.step.classList.toggle("is-active", k === i);
        s.tab.classList.toggle("is-active", k === i);
      });
      cur.textContent = (i < 9 ? "0" : "") + (i + 1);
      next.fig.classList.add("is-on");
      // Al pasar deprisa por varios capítulos, cualquier pantalla que no sea la que entra o la que sale se recoge del todo.
      screens.forEach(function (s) {
        if (s === next || s === prev) return;
        if (anim) { gsap.killTweensOf(s.fig); gsap.set(s.fig, { clearProps: "clipPath,transform,zIndex" }); }
        s.fig.classList.remove("is-on");
      });
      if (anim) {
        gsap.killTweensOf(next.fig);
        gsap.set(next.fig, { zIndex: 1, clipPath: "inset(0% 0% 0% 0%)", y: 0 });
        gsap.fromTo(next.video, { scale: 1.06 }, { scale: 1, duration: 1.1, ease: "expo.out" });
        if (prev) {
          gsap.set(prev.fig, { zIndex: 2 });
          gsap.fromTo(prev.fig, { clipPath: "inset(0% 0% 0% 0%)", y: 0 },
            { clipPath: "inset(0% 0% 100% 0%)", y: -18, duration: .75, ease: "power3.inOut",
              onComplete: function () { if (active !== screens.indexOf(prev)) { prev.fig.classList.remove("is-on"); gsap.set(prev.fig, { clearProps: "clipPath,transform,zIndex" }); } } });
        }
        gsap.fromTo(tape, { scaleX: 0 }, { scaleX: 1, duration: .45, ease: "power2.out", delay: .45 });
        gsap.fromTo(cur, { yPercent: 70, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .6, ease: "expo.out" });
        gsap.to(device, { rotation: i % 2 ? 1.1 : -1.2, duration: 1, ease: "power2.out" });
        if (!next.seen) {
          next.seen = true;
          gsap.fromTo(next.step.querySelectorAll(".nv-title .line > span"), { y: 40, rotation: 1.5 },
            { y: 0, rotation: 0, duration: .9, ease: "expo.out", stagger: .11 });
        }
      } else if (prev) prev.fig.classList.remove("is-on");
      sync();
    }

    // Qué vídeo debe sonar: en escritorio el del móvil fijo (si la sección se ve); en móvil el del capítulo a la vista.
    var ownVisible = [];
    function sync() {
      if (document.hidden) { pauseAll(null); return; }
      if (desk.matches) {
        var v = inView && active >= 0 ? screens[active].video : null;
        pauseAll(v);
        if (v && v.paused) play(v);
      } else {
        var o = null;
        screens.forEach(function (s, k) { if (ownVisible[k]) o = s.own; });
        pauseAll(o);
        if (o && o.paused) play(o);
      }
    }

    // El capítulo activo es el que cruza la franja central de la ventana.
    var mid = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(steps.indexOf(e.target)); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    var own = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { ownVisible[steps.indexOf(e.target.closest(".nv-step"))] = e.intersectionRatio >= .6; });
      sync();
    }, { threshold: [0, .6] });
    steps.forEach(function (s) { mid.observe(s); own.observe(s.querySelector(".nv-media")); });
    new IntersectionObserver(function (es) { inView = es[0].isIntersecting; sync(); }).observe(stage);
    document.addEventListener("visibilitychange", sync);
    if (desk.addEventListener) desk.addEventListener("change", sync);
    setActive(0);

    // El trazo de tinta que une los capítulos se dibuja con el scroll (pathLength = 1: el trazo va de 1 a 0).
    if (anim) {
      gsap.registerPlugin(ScrollTrigger);
      gsap.fromTo("#nvInk path", { strokeDashoffset: 1 }, {
        strokeDashoffset: 0, ease: "none",
        scrollTrigger: { trigger: "#nvSteps", start: "top 55%", end: "bottom 55%", scrub: .6 }
      });
    }
  })();

  /* Sin GSAP (CDN caído) o con movimiento reducido: todo visible al instante */
  if (!hasGsap || reduceMotion) {
    document.querySelectorAll(hidden.join(",")).forEach(function (el) {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
    var navEl = document.getElementById("siteNav");
    window.addEventListener("scroll", function () { navEl.classList.toggle("scrolled", window.scrollY > 10); }, { passive: true });
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ overwrite: "auto" });

  /* ---------- Nav con borde al hacer scroll ---------- */
  var nav = document.getElementById("siteNav");
  ScrollTrigger.create({
    start: 0,
    onUpdate: function (self) { nav.classList.toggle("scrolled", self.scroll() > 10); },
  });

  /* ---------- Helper: cascada tipo waterfall sobre un set de <span> ---------- */
  function waterfallWords(container, tl, startTime) {
    var words = container.querySelectorAll(".line > span");
    var t = startTime;
    words.forEach(function (word, i) {
      var isLast = i === words.length - 1;
      tl.set(word, { opacity: 1, y: isLast ? 46 : 38, rotation: isLast ? 1.5 : 1 }, t);
      tl.to(word, { y: 0, rotation: 0, duration: isLast ? 0.9 : 0.8, ease: "expo.out" }, t);
      t += 0.11;
    });
    return t + 0.25;
  }

  /* ================= HERO ================= */
  var hero = gsap.timeline({ delay: 0.15, paused: true });
  // La página está tapada por la pantalla de carga (kanji): el hero arranca cuando se retira.
  var N = window.__nagori;
  var startHero = function () { ScrollTrigger.refresh(); hero.play(); };
  if (N && N.onReveal) N.onReveal(startHero); else startHero();

  hero.set("#heroMark", { opacity: 1, y: -16, scale: 0.9, rotation: -6 }, 0);
  hero.to("#heroMark", { y: 0, scale: 1, rotation: 0, duration: 0.9, ease: "expo.out" }, 0);

  hero.set("#heroWord", { opacity: 1, y: 28 }, 0.12);
  hero.to("#heroWord", { y: 0, duration: 0.9, ease: "expo.out" }, 0.12);

  // El punto de la «i» es un trozo de cinta: se «pega» al final del wordmark.
  hero.set("#heroTape", { scaleX: 0, rotation: -10, transformOrigin: "left center" }, 0);
  hero.to("#heroTape", { scaleX: 1, duration: 0.4, ease: "power2.out" }, 0.55);

  var tHead = waterfallWords(document.getElementById("heroHeadline"), hero, 0.55);

  hero.set("#heroSub", { opacity: 1, y: 14 }, tHead - 0.1);
  hero.to("#heroSub", { y: 0, duration: 0.8, ease: "expo.out" }, tHead - 0.1);

  hero.set("#scrollCue", { opacity: 1, y: 12 }, tHead + 0.05);
  hero.to("#scrollCue", { y: 0, duration: 0.8, ease: "expo.out" }, tHead + 0.05);

  hero.fromTo("#heroPhone", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 1.2, ease: "expo.out" }, 0.3);

  // Al bajar, el teléfono sube un poco más despacio que la página y se endereza: se «asienta» sobre el papel.
  var heroStage = document.querySelector("#heroPhone .phone-stage");
  if (heroStage) {
    gsap.fromTo(heroStage, { rotation: 2, y: 0 }, {
      rotation: -1, y: -70, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.8 }
    });
  }

  /* ================= SCROLL REVEALS ================= */
  document.querySelectorAll("[data-reveal-eyebrow]").forEach(function (el) {
    var span = el.querySelector("span");
    gsap.timeline({ scrollTrigger: { trigger: el, start: "top 88%", once: true } })
      .set(span, { opacity: 1 }, 0)
      .fromTo(span, { y: "100%" }, { y: "0%", duration: 0.7, ease: "expo.out" }, 0);
  });

  document.querySelectorAll("[data-reveal-heading]").forEach(function (heading) {
    var tl = gsap.timeline({ scrollTrigger: { trigger: heading, start: "top 85%", once: true } });
    waterfallWords(heading, tl, 0);
  });

  // Tarjetas por lotes: cada una aparece cuando entra, no cuando entra su sección.
  gsap.set("[data-reveal-card]", { y: 36 });
  ScrollTrigger.batch("[data-reveal-card]", {
    start: "top 90%",
    once: true,
    onEnter: function (batch) {
      gsap.to(batch, { opacity: 1, y: 0, duration: 0.9, ease: "expo.out", stagger: 0.08 });
      batch.forEach(function (card, i) {
        var d = 0.3 + i * 0.08;
        var tape = card.querySelector(".tape");
        if (tape) gsap.fromTo(tape, { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.4, ease: "power2.out", delay: d });
        var bars = card.querySelectorAll(".mood-strip i");
        if (bars.length) gsap.fromTo(bars, { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.6, ease: "back.out(2)", stagger: 0.05, delay: d });
      });
    }
  });

  // Las fuentes cambian la altura de los titulares: recalcular disparadores cuando terminen de cargar.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
