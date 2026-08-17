/* CMS Bridge Bizz — vanilla + supabase-js. Sem build, sem framework.
   Tudo o que protege dado está na RLS do Postgres, não aqui: este arquivo é
   público e a chave anon também. Ver supabase/schema.sql. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.BB_CMS;
if (!cfg?.url || !cfg?.anon) {
  document.body.innerHTML = '<p style="padding:3rem;font:16px system-ui">' +
    'Falta configurar o Supabase: preencha <code>window.BB_CMS</code> em admin/index.html ' +
    'com a URL e a chave anon do projeto.</p>';
  throw new Error('BB_CMS não configurado');
}
const sb = createClient(cfg.url, cfg.anon);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const aviso = (el, txt, estado = 'ok') => { el.textContent = txt; el.dataset.estado = estado; };

const PAGINAS = ['index.html', 'about.html', 'metodologia.html', 'blog.html', 'work.html', 'contact.html', '404.html'];
const NOMES = { 'index.html': 'Home', 'about.html': 'Quem Somos', 'metodologia.html': 'Metodologia e Serviços',
                'blog.html': 'Blog', 'work.html': 'Projetos', 'contact.html': 'Contato', '404.html': 'Página não encontrada' };

let sessao = null, campos = {}, postAtual = null;

/* ============================================================== entrada === */
$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#li-email').value.trim();
  const { error } = await sb.auth.signInWithOtp({
    email, options: { emailRedirectTo: location.href.split('#')[0] }
  });
  aviso($('#login-aviso'),
    error ? 'Não consegui enviar: ' + error.message : 'Link enviado. Confira seu e-mail.',
    error ? 'erro' : 'ok');
});

$('#sair').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

sb.auth.onAuthStateChange((_e, s) => { sessao = s; render(); });
sb.auth.getSession().then(({ data }) => { sessao = data.session; render(); });

async function render() {
  const entrou = !!sessao;
  $('#login').hidden = entrou;
  $('#app').hidden = !entrou;
  if (!entrou) return;

  // a RLS decide de verdade; isto é só para dar recado claro a quem não é membro
  const { data: eu } = await sb.from('membros').select('nome,papel').eq('email', sessao.user.email).maybeSingle();
  if (!eu) {
    $('#app').hidden = true; $('#login').hidden = false;
    aviso($('#login-aviso'), 'Este e-mail não tem acesso ao CMS. Peça para a Luiza cadastrar.', 'erro');
    await sb.auth.signOut();
    return;
  }
  $('#quem').textContent = `${eu.nome || sessao.user.email} · ${eu.papel}`;
  montarSeletorPaginas();
  carregarPagina();
  carregarPosts();
  carregarMensagens();
  carregarMembros();
}

/* ================================================================= abas === */
$$('#abas button').forEach(b => b.addEventListener('click', () => {
  $$('#abas button').forEach(x => x.classList.toggle('is-ativa', x === b));
  $$('[data-painel]').forEach(p => { p.hidden = p.dataset.painel !== b.dataset.aba; });
}));

/* ============================================================== páginas === */
function montarSeletorPaginas() {
  const sel = $('#sel-pagina');
  if (sel.options.length) return;
  sel.innerHTML = PAGINAS.map(p => `<option value="${p}">${NOMES[p]}</option>`).join('');
  sel.addEventListener('change', carregarPagina);
}

async function carregarPagina() {
  const pagina = $('#sel-pagina').value;
  const alvo = $('#campos');
  alvo.innerHTML = '<p class="small muted">Carregando…</p>';

  // lê o HTML publicado para descobrir os campos e mostrar o texto atual
  const html = await fetch('../' + pagina, { cache: 'no-store' }).then(r => r.text());
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const { data } = await sb.from('conteudo').select('dados').eq('pagina', pagina).maybeSingle();
  const salvos = data?.dados || {};
  campos = {};

  const itens = [...doc.querySelectorAll('[data-cms]')].map(el => {
    const chave = el.getAttribute('data-cms');
    const img = el.tagName === 'IMG';
    const original = img ? el.getAttribute('src') : el.innerHTML.trim();
    campos[chave] = { img, original };
    const valor = salvos[chave] ?? '';
    const rotulo = img ? 'Imagem' : (el.tagName === 'H1' || el.tagName === 'H2' ? 'Título'
                  : el.tagName === 'H3' ? 'Subtítulo' : el.tagName === 'A' ? 'Botão' : 'Texto');
    if (img) {
      return `<div class="adm-campo" data-chave="${chave}">
        <label>${rotulo} <code>${chave}</code></label>
        <img class="adm-campo__preview" src="../${esc(valor || original)}" alt="">
        <input type="file" accept="image/*" data-upload="${chave}">
        <input type="hidden" data-valor="${chave}" value="${esc(valor)}">
      </div>`;
    }
    const linhas = Math.min(8, Math.max(2, Math.ceil((valor || original).length / 70)));
    return `<div class="adm-campo" data-chave="${chave}">
      <label for="c-${chave}">${rotulo} <code>${chave}</code></label>
      <textarea id="c-${chave}" rows="${linhas}" data-valor="${chave}"
        placeholder="${esc(original).replace(/\n/g, ' ')}">${esc(valor)}</textarea>
      <p class="adm-campo__atual">Atual no site: ${esc(original).slice(0, 160)}</p>
    </div>`;
  });

  alvo.innerHTML = itens.length ? itens.join('') : '<p class="small muted">Nenhum campo editável nesta página.</p>';

  $$('[data-upload]', alvo).forEach(inp => inp.addEventListener('change', async e => {
    const arq = e.target.files[0]; if (!arq) return;
    const chave = inp.dataset.upload;
    const caminho = `${pagina.replace('.html', '')}/${Date.now()}-${arq.name.replace(/[^a-zA-Z0-9.\-]/g, '_')}`;
    const { error } = await sb.storage.from('midia').upload(caminho, arq, { upsert: true });
    if (error) return alert('Falha no upload: ' + error.message);
    const url = sb.storage.from('midia').getPublicUrl(caminho).data.publicUrl;
    $(`[data-valor="${chave}"]`, alvo).value = url;
    $('.adm-campo__preview', inp.closest('.adm-campo')).src = url;
  }));
}

$('#salvar-pagina').addEventListener('click', async () => {
  const pagina = $('#sel-pagina').value;
  const dados = {};
  $$('#campos [data-valor]').forEach(el => { if (el.value.trim()) dados[el.dataset.valor] = el.value.trim(); });
  const { error } = await sb.from('conteudo')
    .upsert({ pagina, dados, atualizado_em: new Date().toISOString(), atualizado_por: sessao.user.email });
  alert(error ? 'Erro ao salvar: ' + error.message : 'Página salva. Recarregue o site para ver.');
});

/* ================================================================= blog === */
async function carregarPosts() {
  const { data } = await sb.from('posts').select('*').order('criado_em', { ascending: false });
  $('#lista-posts').innerHTML = (data || []).map(p => `
    <li><button data-post="${p.id}">
      <strong>${esc(p.titulo)}</strong>
      <span class="small muted">${p.publicado ? 'publicado' : 'rascunho'} · /${esc(p.slug)}</span>
    </button></li>`).join('') || '<li class="small muted">Nenhum post ainda.</li>';
  $$('#lista-posts [data-post]').forEach(b => b.addEventListener('click', () => abrirPost((data || []).find(p => p.id === b.dataset.post))));
}

function abrirPost(p) {
  postAtual = p || null;
  $('#form-post').hidden = false;
  $('#po-titulo').value = p?.titulo || '';
  $('#po-slug').value = p?.slug || '';
  $('#po-resumo').value = p?.resumo || '';
  $('#po-corpo').value = p?.corpo || '';
  $('#po-publicado').checked = !!p?.publicado;
  $('#post-apagar').hidden = !p;
}

$('#post-novo').addEventListener('click', () => abrirPost(null));
$('#po-titulo').addEventListener('input', e => {
  if (postAtual) return;
  $('#po-slug').value = e.target.value.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
});

$('#form-post').addEventListener('submit', async e => {
  e.preventDefault();
  let capa = postAtual?.capa_url || null;
  const arq = $('#po-capa').files[0];
  if (arq) {
    const caminho = `blog/${Date.now()}-${arq.name.replace(/[^a-zA-Z0-9.\-]/g, '_')}`;
    const { error } = await sb.storage.from('midia').upload(caminho, arq, { upsert: true });
    if (error) return aviso($('#post-aviso'), 'Falha no upload da capa: ' + error.message, 'erro');
    capa = sb.storage.from('midia').getPublicUrl(caminho).data.publicUrl;
  }
  const publicado = $('#po-publicado').checked;
  const linha = {
    titulo: $('#po-titulo').value.trim(), slug: $('#po-slug').value.trim(),
    resumo: $('#po-resumo').value.trim(), corpo: $('#po-corpo').value,
    capa_url: capa, publicado, autor: sessao.user.email,
    publicado_em: publicado ? (postAtual?.publicado_em || new Date().toISOString()) : null
  };
  const q = postAtual ? sb.from('posts').update(linha).eq('id', postAtual.id) : sb.from('posts').insert(linha);
  const { error } = await q;
  aviso($('#post-aviso'), error ? 'Erro: ' + error.message : 'Post salvo.', error ? 'erro' : 'ok');
  if (!error) { carregarPosts(); }
});

$('#post-apagar').addEventListener('click', async () => {
  if (!postAtual || !confirm(`Apagar "${postAtual.titulo}"? Não dá para desfazer.`)) return;
  const { error } = await sb.from('posts').delete().eq('id', postAtual.id);
  if (error) return aviso($('#post-aviso'), 'Erro: ' + error.message, 'erro');
  $('#form-post').hidden = true; postAtual = null; carregarPosts();
});

/* ============================================================ mensagens === */
let msgs = [];
async function carregarMensagens() {
  const { data } = await sb.from('mensagens').select('*').order('criado_em', { ascending: false });
  msgs = data || [];
  const novas = msgs.filter(m => !m.lida).length;
  const badge = $('#badge-msg');
  badge.hidden = !novas; badge.textContent = novas;
  $('#msg-contagem').textContent = `${msgs.length} no total · ${novas} não lidas`;
  $('#lista-msg').innerHTML = msgs.map(m => `
    <article class="adm-msg${m.lida ? '' : ' is-nova'}">
      <header>
        <strong>${esc(m.nome)}</strong>
        <span class="small muted">${new Date(m.criado_em).toLocaleString('pt-BR')} · ${esc(m.origem || '')}</span>
      </header>
      <dl>
        <dt>E-mail</dt><dd><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></dd>
        <dt>Contato</dt><dd>${esc(m.contato)}</dd>
        <dt>Empresa</dt><dd>${esc(m.empresa)}</dd>
        <dt>Site</dt><dd>${esc(m.site)}</dd>
        <dt>Cargo</dt><dd>${esc(m.cargo)}</dd>
      </dl>
      <button class="btn btn--fantasma" data-lida="${m.id}" data-estado="${m.lida}">
        ${m.lida ? 'Marcar como não lida' : 'Marcar como lida'}</button>
    </article>`).join('') || '<p class="small muted">Nenhuma mensagem ainda.</p>';

  $$('[data-lida]').forEach(b => b.addEventListener('click', async () => {
    await sb.from('mensagens').update({ lida: b.dataset.estado !== 'true' }).eq('id', b.dataset.lida);
    carregarMensagens();
  }));
}

$('#msg-csv').addEventListener('click', () => {
  const cols = ['criado_em', 'nome', 'email', 'contato', 'empresa', 'site', 'cargo', 'origem'];
  const csv = [cols.join(';')].concat(msgs.map(m => cols.map(c => `"${String(m[c] ?? '').replace(/"/g, '""')}"`).join(';'))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `mensagens-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});

/* ============================================================= usuários === */
async function carregarMembros() {
  const { data } = await sb.from('membros').select('*').order('criado_em');
  $('#lista-membros').innerHTML = (data || []).map(m => `
    <li>
      <div><strong>${esc(m.nome || m.email)}</strong>
        <span class="small muted">${esc(m.email)} · ${esc(m.papel)}</span></div>
      <button class="btn btn--fantasma" data-remover="${m.id}"
        ${m.email === sessao.user.email ? 'disabled title="Você não pode remover a si mesmo"' : ''}>Remover</button>
    </li>`).join('');
  $$('[data-remover]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Remover o acesso desta pessoa?')) return;
    const { error } = await sb.from('membros').delete().eq('id', b.dataset.remover);
    if (error) return aviso($('#membro-aviso'), 'Erro: ' + error.message, 'erro');
    carregarMembros();
  }));
}

$('#form-membro').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.from('membros').insert({
    nome: $('#me-nome').value.trim(), email: $('#me-email').value.trim().toLowerCase(), papel: $('#me-papel').value
  });
  aviso($('#membro-aviso'),
    error ? 'Erro: ' + error.message : 'Pronto. A pessoa já pode entrar pelo e-mail cadastrado.',
    error ? 'erro' : 'ok');
  if (!error) { e.target.reset(); carregarMembros(); }
});
