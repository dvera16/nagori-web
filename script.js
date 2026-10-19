// Animaciones de Nagori — GSAP + ScrollTrigger.
// Entradas tipo "waterfall-entry": aparición binaria (opacity 0->1 por tl.set),
// nunca fundido en un arrival; cascada con solape, no en cola.
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
    var F = 1 / 60;
    words.forEach(function (word, i) {
      var isLast = i === words.length - 1;
      var y = isLast ? 46 : 36;
      var dur = isLast ? 0.5 : 0.42;
      tl.set(word, { opacity: 1, y: y }, t);
      tl.to(word, { y: 0, duration: dur, ease: "power4.out" }, t);
      t += dur - 2 * F;
    });
    return t;
  }

  /* ================= HERO ================= */
  var hero = gsap.timeline({ delay: 0.15 });

  hero.set("#heroMark", { opacity: 1, y: -16, scale: 0.9 }, 0);
  hero.to("#heroMark", { y: 0, scale: 1, duration: 0.6, ease: "power3.out" }, 0);

  hero.set("#heroWord", { opacity: 1, y: 28 }, 0.15);
  hero.to("#heroWord", { y: 0, duration: 0.65, ease: "power4.out" }, 0.15);

  // El punto de la «i» es un trozo de cinta: se «pega» al final del wordmark.
  hero.set("#heroTape", { scaleX: 0, rotation: -10, transformOrigin: "left center" }, 0);
  hero.to("#heroTape", { scaleX: 1, duration: 0.35, ease: "power2.out" }, 0.6);

  var tHead = waterfallWords(document.getElementById("heroHeadline"), hero, 0.7);

  hero.set("#heroSub", { opacity: 1, y: 14 }, tHead + 0.05);
  hero.to("#heroSub", { y: 0, duration: 0.5, ease: "power3.out" }, tHead + 0.05);

  hero.set("#scrollCue", { opacity: 1, y: 10 }, tHead + 0.25);
  hero.to("#scrollCue", { y: 0, duration: 0.45, ease: "power3.out" }, tHead + 0.25);

  hero.set("#heroPhone", { opacity: 1, y: 48 }, 0.35);
  hero.to("#heroPhone", { y: 0, duration: 0.8, ease: "power4.out" }, 0.35);

  /* ================= SCROLL REVEALS ================= */
  document.querySelectorAll("[data-reveal-eyebrow]").forEach(function (el) {
    var span = el.querySelector("span");
    gsap.timeline({ scrollTrigger: { trigger: el, start: "top 85%", once: true } })
      .set(span, { opacity: 1, y: 0 }, 0)
      .fromTo(span, { y: "100%" }, { y: "0%", duration: 0.5, ease: "power3.out" }, 0);
  });

  document.querySelectorAll("[data-reveal-heading]").forEach(function (heading) {
    var tl = gsap.timeline({ scrollTrigger: { trigger: heading, start: "top 82%", once: true } });
    waterfallWords(heading, tl, 0);
  });

  document.querySelectorAll("section").forEach(function (section) {
    var cards = section.querySelectorAll("[data-reveal-card]");
    if (!cards.length) return;
    gsap.timeline({ scrollTrigger: { trigger: section, start: "top 68%", once: true } })
      .to(cards, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.09 });
  });
})();
