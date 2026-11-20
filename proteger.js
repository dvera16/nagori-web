/* Disuade de copiar el contenido de la web: sin seleccionar ni copiar texto, sin arrastrar ni guardar
   imágenes con el clic derecho o la pulsación larga, y sin los atajos de guardar, imprimir o ver el
   código. No es un candado: quien sepa puede verlo igual desde las herramientas del navegador. */
(function () {
  var d = document;
  var css = d.createElement("style");
  css.textContent =
    "html, body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }" +
    "input, textarea, [contenteditable] { -webkit-user-select: text; user-select: text; }" +
    "img, video, svg, picture { -webkit-user-drag: none; user-drag: none; -webkit-touch-callout: none; }";
  (d.head || d.documentElement).appendChild(css);

  function editable(el) {
    return el && el.closest && el.closest("input, textarea, [contenteditable]");
  }
  function block(e) {
    if (!editable(e.target)) e.preventDefault();
  }
  ["contextmenu", "copy", "cut", "selectstart", "dragstart"].forEach(function (type) {
    d.addEventListener(type, block, true);
  });

  d.addEventListener("keydown", function (e) {
    var k = (e.key || "").toLowerCase();
    var mod = e.ctrlKey || e.metaKey;
    var blocked =
      k === "f12" ||
      (mod && (k === "s" || k === "u" || k === "p")) ||
      (mod && !editable(e.target) && (k === "c" || k === "x" || k === "a")) ||
      (mod && e.shiftKey && (k === "i" || k === "j" || k === "c"));
    if (blocked) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
