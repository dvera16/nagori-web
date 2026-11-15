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

  /* ---------- Interfaz orgánica: tinta, acuarelas y pétalos, como en la app ---------- */
  var onReveal = function (fn) { var N = window.__nagori; if (N && N.onReveal) N.onReveal(fn); else fn(); };

  // El sello lleva el mismo kanji que la pantalla de carga (que se retira del documento al terminar).
  (function initHanko() {
    var from = document.querySelector("#loader path"), to = document.querySelector("#hanko path");
    if (from && to) to.setAttribute("d", from.getAttribute("d"));
  })();

  /* Trazos, gotas y marcas se pintan cuando su elemento entra en pantalla (las transiciones están en styles.css). */
  (function initInk() {
    if (!("IntersectionObserver" in window) || reduceMotion) return;
    document.documentElement.classList.add("ink-js");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    onReveal(function () {
      document.querySelectorAll("section, .eyebrow, .nv-more-head, .btn-secondary, .pro, .tag, .nv-pill, .badge, .mark, .shots-arrow, .feature-card .icon")
        .forEach(function (el) { io.observe(el); });
    });
  })();

  /* Acuarelas que se pintan al llegar (WatercolorReveal de la app): un mapa en grises dice cuándo llega el agua a
     cada píxel; primero un velo claro, luego el pigmento y, pegada al frente, una franja húmeda más cargada que
     seca enseguida. Al terminar queda la imagen tal cual y el lienzo se retira. Sin WebGL, o con movimiento
     reducido, se ve la imagen directamente. */
  (function initAcuarela() {
    var els = Array.prototype.slice.call(document.querySelectorAll(".wc[data-wc]"));
    if (!els.length || reduceMotion || !("IntersectionObserver" in window) || !window.WebGLRenderingContext) return;
    document.documentElement.classList.add("wc-js");
    var VS = "attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}";
    var FS = "precision mediump float;uniform sampler2D uImg,uMap;uniform float uClock,uDur;varying vec2 v;" +
      "void main(){vec4 c=texture2D(uImg,v);float age=uClock-texture2D(uMap,v).r*uDur;" +
      "float front=clamp(age/.12,0.,1.);" +
      "float wash=clamp((age+.35)/.35,0.,1.)*.22*step(uClock,uDur);" +
      "float wet=front*(1.-clamp((age-.1)/.9,0.,1.))*.45;" +
      "float g=dot(c.rgb,vec3(.2126,.7152,.0722));" +
      "vec3 rgb=mix(c.rgb,(vec3(g)+(c.rgb-vec3(g))*1.35)*.78,wet);" +
      "float a=c.a*max(front,wash);gl_FragColor=vec4(rgb*a,a);}";
    function load(src) {
      return new Promise(function (ok, ko) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = ko; i.src = src; });
    }
    function done(el, canvas, gl) {
      el.classList.add("is-done");
      requestAnimationFrame(function () {
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        var lose = gl && gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      });
    }
    function paint(el) {
      var img = el.querySelector("img"), src = img.getAttribute("src");
      var dur = parseFloat(el.getAttribute("data-wc-dur")) || 2.6, delay = parseFloat(el.getAttribute("data-wc-delay")) || 0;
      Promise.all([load(src), load(src.replace(/\.webp/, "-mapa.webp"))]).then(function (r) {
        var canvas = document.createElement("canvas");
        canvas.className = "wc-paint";
        canvas.width = r[0].naturalWidth; canvas.height = r[0].naturalHeight;
        var gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false });
        if (!gl) { done(el); return; }
        function shader(type, code) { var s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); return s; }
        var prog = gl.createProgram();
        gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { done(el, null, gl); return; }
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        r.forEach(function (image, unit) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        });
        gl.uniform1i(gl.getUniformLocation(prog, "uImg"), 0);
        gl.uniform1i(gl.getUniformLocation(prog, "uMap"), 1);
        gl.uniform1f(gl.getUniformLocation(prog, "uDur"), dur);
        var uClock = gl.getUniformLocation(prog, "uClock");
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        el.appendChild(canvas);
        var t0 = 0;
        function frame(now) {
          if (!t0) t0 = now + delay * 1000;
          var clock = (now - t0) / 1000 - .35;
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform1f(uClock, clock);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          if (clock < dur + 1.15) requestAnimationFrame(frame); else done(el, canvas, gl);
        }
        requestAnimationFrame(frame);
      }).catch(function () { done(el); });
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); paint(e.target); } });
    }, { threshold: .12 });
    onReveal(function () { els.forEach(function (el) { io.observe(el); }); });
  })();

  /* Los pétalos de la ilustración de Hoy (HoyPetals de la app): asoman donde los pintó Dani y luego vuelan despacio
     hacia la izquierda, abriéndose desde el cerezo de la pagoda; cada uno a su ritmo, meciéndose, y al final de su
     tramo se desvanece y vuelve a salir junto al árbol. Solo se dibujan mientras se ven. */
  (function initPetals() {
    var host = document.querySelector(".wc[data-petals]");
    if (!host || reduceMotion || !("IntersectionObserver" in window)) return;
    var P = [[0, 23, 22, 740, 94], [25, 37, 26, 714, 111], [64, 36, 23, 656, 122], [102, 38, 26, 374, 139], [142, 42, 43, 480, 148],
      [186, 47, 34, 596, 171], [235, 44, 35, 482, 196], [281, 42, 39, 670, 248], [325, 35, 37, 708, 262], [362, 24, 22, 571, 255],
      [388, 20, 17, 721, 342], [410, 23, 22, 688, 378], [435, 22, 18, 619, 381], [459, 36, 38, 593, 417], [497, 43, 28, 446, 633]];
    var W = 934, H = 688, SX = 864, SY = 425, PATH = 300, TAU = Math.PI * 2;
    function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
    var canvas = document.createElement("canvas"), ctx = canvas.getContext("2d"), strip = new Image();
    canvas.className = "wc-petals";
    var visible = false, running = false, t0 = 0, cw = 0;
    function frame(now) {
      if (!visible || document.hidden) { running = false; return; }
      requestAnimationFrame(frame);
      if (!t0) t0 = now;
      var time = (now - t0) / 1000, w = host.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!w) return;
      if (w !== cw) { cw = w; canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * H / W * dpr); }
      var k = canvas.width / W, appear = smooth((time - 1.5) / 1.2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (appear <= 0) return;
      var fly = Math.max(0, time - 3.2), ramp = smooth(fly / 5);
      for (var i = 0; i < P.length; i++) {
        var p = P[i], period = 24 + (i * 7 % 11) * 1.7, home = .15 + (i * 5 % 7) / 7 * .45, s = (home + fly / period) % 1;
        var rx = p[3] - SX, ry = p[4] - SY, rl = Math.sqrt(rx * rx + ry * ry);
        var dx = -.65 + .35 * rx / rl, dy = .35 * ry / rl, dl = Math.sqrt(dx * dx + dy * dy);
        dx /= dl; dy /= dl;
        var along = PATH * (s - home), sway = Math.sin(TAU * (s * 2 + i * .37)) * 9 * ramp;
        var x = (p[3] + dx * along - dy * sway) * k, y = (p[4] + dy * along + dx * sway) * k;
        var angle = (Math.sin(TAU * (s * 1.3 + i * .21)) * 18 + (s - home) * 50) * ramp;
        var alpha = appear * smooth(s / .15) * (1 - smooth((s - .72) / .28));
        if (alpha <= 0) continue;
        ctx.setTransform(1, 0, 0, 1, x, y);
        ctx.rotate(angle * Math.PI / 180);
        ctx.globalAlpha = alpha;
        ctx.drawImage(strip, p[0], 0, p[1], p[2], -p[1] * k / 2, -p[2] * k / 2, p[1] * k, p[2] * k);
      }
      ctx.globalAlpha = 1;
    }
    function sync() { if (visible && !document.hidden && !running && strip.complete && strip.naturalWidth) { running = true; requestAnimationFrame(frame); } }
    strip.onload = sync;
    onReveal(function () {
      host.appendChild(canvas);
      strip.src = "assets/acuarela/petalos.webp";
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }).observe(host);
      document.addEventListener("visibilitychange", sync);
    });
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
        // Las gotas de los ánimos se pintan una tras otra, como la semana de Hoy.
        if (bars.length) gsap.fromTo(bars, { scale: 0.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.75, ease: "power2.out", stagger: 0.22, delay: d + 0.2 });
        // El sello cae sobre la cita cuando la tarjeta ya está en su sitio.
        var hanko = card.querySelector(".hanko");
        if (hanko) {
          gsap.fromTo(hanko, { scale: 1.7, opacity: 0 }, { scale: 1, opacity: 0.88, duration: 0.22, ease: "power3.in", delay: d + 0.75 });
          gsap.fromTo(card, { scale: 1 }, { scale: 0.985, duration: 0.09, ease: "power1.out", yoyo: true, repeat: 1, delay: d + 0.97, overwrite: false });
        }
      });
    }
  });

  // Las fuentes cambian la altura de los titulares: recalcular disparadores cuando terminen de cargar.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
