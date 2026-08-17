-- =============================================================================
-- Bridge Bizz Hub — CMS
-- Rodar uma vez no SQL Editor do projeto Supabase.
-- 4 tabelas: conteudo (copy das páginas), posts (blog), mensagens (formulário),
-- membros (quem acessa o CMS). Nada além disso.
-- =============================================================================

-- quem pode entrar no CMS. o e-mail é a chave: a pessoa entra por magic link e
-- só passa se estiver aqui.
create table if not exists public.membros (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null check (position('@' in email) > 1),
  nome        text,
  papel       text not null default 'editor' check (papel in ('admin','editor')),
  criado_em   timestamptz not null default now()
);

-- helper: o usuário logado é membro? (security definer para a policy poder ler
-- a tabela sem cair na própria RLS)
create or replace function public.eh_membro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and papel = 'admin'
  );
$$;

-- copy das páginas: uma linha por página, um JSON de chave→texto.
-- as chaves vêm do atributo data-cms no HTML.
create table if not exists public.conteudo (
  pagina        text primary key,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  titulo       text not null,
  resumo       text,
  corpo        text,                       -- markdown
  capa_url     text,
  publicado    boolean not null default false,
  publicado_em timestamptz,
  criado_em    timestamptz not null default now(),
  autor        text
);
create index if not exists posts_publicados_idx
  on public.posts (publicado_em desc) where publicado;

create table if not exists public.mensagens (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  email      text not null,
  contato    text,
  empresa    text,
  site       text,
  cargo      text,
  origem     text,                          -- qual página enviou
  lida       boolean not null default false,
  criado_em  timestamptz not null default now(),
  -- LGPD: guarda o aceite junto com o dado
  consentimento boolean not null default false,
  ip_hash    text
);
create index if not exists mensagens_novas_idx on public.mensagens (criado_em desc);

-- ---------------------------------------------------------------- RLS -------
alter table public.membros   enable row level security;
alter table public.conteudo  enable row level security;
alter table public.posts     enable row level security;
alter table public.mensagens enable row level security;

-- conteúdo: o site público LÊ sem autenticar; só membro escreve.
drop policy if exists conteudo_leitura_publica on public.conteudo;
create policy conteudo_leitura_publica on public.conteudo for select to anon, authenticated using (true);
drop policy if exists conteudo_escrita_membro on public.conteudo;
create policy conteudo_escrita_membro on public.conteudo for all to authenticated
  using (public.eh_membro()) with check (public.eh_membro());

-- posts: público só vê publicado; membro vê e edita tudo.
drop policy if exists posts_leitura_publica on public.posts;
create policy posts_leitura_publica on public.posts for select to anon using (publicado = true);
drop policy if exists posts_membro on public.posts;
create policy posts_membro on public.posts for all to authenticated
  using (public.eh_membro()) with check (public.eh_membro());

-- mensagens: qualquer visitante INSERE, ninguém anônimo LÊ.
-- é isto que impede alguém de puxar os leads com a chave anon, que é pública.
drop policy if exists mensagens_insert_publico on public.mensagens;
create policy mensagens_insert_publico on public.mensagens for insert to anon, authenticated
  with check (consentimento = true and length(nome) between 2 and 120 and length(email) between 5 and 160);
drop policy if exists mensagens_leitura_membro on public.mensagens;
create policy mensagens_leitura_membro on public.mensagens for select to authenticated using (public.eh_membro());
drop policy if exists mensagens_update_membro on public.mensagens;
create policy mensagens_update_membro on public.mensagens for update to authenticated
  using (public.eh_membro()) with check (public.eh_membro());
drop policy if exists mensagens_delete_membro on public.mensagens;
create policy mensagens_delete_membro on public.mensagens for delete to authenticated using (public.eh_admin());

-- membros: membro lê a lista; só admin mexe. sem acesso anônimo.
drop policy if exists membros_leitura on public.membros;
create policy membros_leitura on public.membros for select to authenticated using (public.eh_membro());
drop policy if exists membros_escrita_admin on public.membros;
create policy membros_escrita_admin on public.membros for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- --------------------------------------------------------------- storage ----
insert into storage.buckets (id, name, public)
values ('midia', 'midia', true)
on conflict (id) do nothing;

drop policy if exists midia_leitura_publica on storage.objects;
create policy midia_leitura_publica on storage.objects for select to anon, authenticated
  using (bucket_id = 'midia');
drop policy if exists midia_escrita_membro on storage.objects;
create policy midia_escrita_membro on storage.objects for all to authenticated
  using (bucket_id = 'midia' and public.eh_membro())
  with check (bucket_id = 'midia' and public.eh_membro());

-- ------------------------------------------------------------- primeiro uso -
-- Trocar pelo e-mail real da Luiza antes de rodar.
insert into public.membros (email, nome, papel)
values ('EMAIL-DA-LUIZA@EXEMPLO.COM', 'Luiza Teixeira', 'admin')
on conflict (email) do nothing;
