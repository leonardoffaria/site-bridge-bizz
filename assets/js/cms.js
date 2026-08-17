/* Bridge Bizz — hidratação do conteúdo editável.
   O HTML já vem completo do servidor; este script só SOBRESCREVE o que a Luiza
   editou no CMS. Se o Supabase estiver fora, ou o JS falhar, a página continua
   inteira — por isso nada aqui é `await` bloqueante e nada apaga conteúdo. */
(function () {
  'use strict';
  var cfg = window.BB_CMS;
  if (!cfg || !cfg.url || !cfg.anon) return;

  var pagina = (location.pathname.split('/').pop() || 'index.html').replace(/\?.*$/, '');
  if (!pagina) pagina = 'index.html';

  /* --- copy das páginas ------------------------------------------------- */
  fetch(cfg.url + '/rest/v1/conteudo?pagina=eq.' + encodeURIComponent(pagina) + '&select=dados', {
    headers: { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon }
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (linhas) {
      var dados = (linhas[0] && linhas[0].dados) || {};
      Object.keys(dados).forEach(function (chave) {
        var el = document.querySelector('[data-cms="' + CSS.escape(chave) + '"]');
        if (!el) return;
        var v = dados[chave];
        if (v === null || v === undefined || v === '') return;
        if (el.tagName === 'IMG') { el.src = v; return; }
        // innerHTML só para poder manter <br> e <em> do texto original
        el.innerHTML = v;
      });
    })
    .catch(function () { /* silêncio: o conteúdo estático já está na tela */ });

  /* --- formulário de diagnóstico ---------------------------------------- */
  document.querySelectorAll('form.form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var botao = form.querySelector('[type=submit]');
      var aviso = form.querySelector('[data-form-aviso]');
      if (!form.reportValidity()) return;
      if (form.querySelector('[name=_gotcha]').value) return;   // honeypot

      var fd = new FormData(form);
      botao.disabled = true;
      var textoOriginal = botao.textContent;
      botao.textContent = 'Enviando…';

      fetch(cfg.url + '/rest/v1/mensagens', {
        method: 'POST',
        headers: {
          apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          nome: fd.get('nome'), email: fd.get('email'), contato: fd.get('contato'),
          empresa: fd.get('empresa'), site: fd.get('site'), cargo: fd.get('cargo'),
          origem: pagina, consentimento: !!fd.get('consentimento')
        })
      })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          form.reset();
          if (aviso) { aviso.textContent = 'Recebemos sua mensagem. Retornamos em até dois dias úteis.'; aviso.dataset.estado = 'ok'; }
        })
        .catch(function () {
          if (aviso) { aviso.textContent = 'Não consegui enviar agora. Tente de novo em instantes.'; aviso.dataset.estado = 'erro'; }
        })
        .finally(function () { botao.disabled = false; botao.textContent = textoOriginal; });
    });
  });
})();
