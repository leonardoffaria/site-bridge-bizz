/* Bridge Bizz — comportamento mínimo: header, nav mobile, reveals.
   Sem dependências. Tudo degrada para conteúdo estático se o JS falhar. */
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');

  /* --- header ganha filete ao sair do topo ------------------------------ */
  var header = document.querySelector('.header');
  if (header) {
    var onScroll = function () {
      header.dataset.scrolled = String(window.scrollY > 8);
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }

  /* --- nav mobile ------------------------------------------------------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.dataset.open = String(open);
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    // Ao voltar para desktop, o menu não pode ficar preso fechado
    matchMedia('(min-width: 48em)').addEventListener('change', function (e) {
      if (e.matches) setOpen(false);
    });
  }

  /* --- reveals ---------------------------------------------------------- */
  var targets = document.querySelectorAll('[data-reveal]');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

  // Stagger: 60ms entre irmãos do mesmo grupo (regra Emil — curto, decorativo)
  var groups = new Map();
  targets.forEach(function (el) {
    var parent = el.parentElement;
    var n = groups.get(parent) || 0;
    groups.set(parent, n + 1);
    if (n > 0) el.style.setProperty('--d', Math.min(n, 5) * 60 + 'ms');
    io.observe(el);
  });
})();
