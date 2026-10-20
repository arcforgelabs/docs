(function () {
  var base = document.currentScript.dataset.base || "/";
  var root = document.documentElement;

  document.querySelector("[data-theme-toggle]").addEventListener("click", function () {
    var dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  });

  var menu = document.querySelector("[data-menu-toggle]");
  var sidebar = document.querySelector("[data-sidebar]");
  if (menu && sidebar) {
    menu.addEventListener("click", function () {
      var open = sidebar.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(open));
    });
  }

  var panel = document.querySelector("[data-search-panel]");
  var ui = null;
  function openSearch() {
    if (!window.PagefindUI) return;
    panel.hidden = false;
    if (!ui) ui = new PagefindUI({ element: "[data-search-box]", baseUrl: base, bundlePath: base + "pagefind/", showSubResults: true, resetStyles: false });
    var input = panel.querySelector("input");
    if (input) input.focus();
  }
  document.querySelector("[data-search-open]").addEventListener("click", function () {
    panel.hidden ? openSearch() : (panel.hidden = true);
  });
  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); openSearch(); }
    if (e.key === "Escape") panel.hidden = true;
  });

  // Outline follows the reading position.
  var links = Array.prototype.slice.call(document.querySelectorAll(".outline a"));
  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (a) { byId[decodeURIComponent(a.hash.slice(1))] = a; });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove("active"); });
        var a = byId[entry.target.id];
        if (a) a.classList.add("active");
      });
    }, { rootMargin: "-64px 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) { var el = document.getElementById(id); if (el) observer.observe(el); });
  }
})();
