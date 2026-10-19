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
  var hero = gsap.timeline({ delay: 0.15 });

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
