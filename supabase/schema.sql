-- =============================================================
-- Schema do Site Duo Mariel
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
-- =============================================================

-- ---------- TABELA: musicas ----------
create table if not exists public.musicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  artista text not null,
  estilo text,
  created_at timestamptz not null default now()
);

alter table public.musicas enable row level security;

-- Qualquer visitante pode LER o repertório
create policy "musicas: leitura publica"
  on public.musicas for select
  using (true);

-- Apenas usuários logados (você e sua parceira) podem alterar
create policy "musicas: insert autenticado"
  on public.musicas for insert
  to authenticated
  with check (true);

create policy "musicas: update autenticado"
  on public.musicas for update
  to authenticated
  using (true);

create policy "musicas: delete autenticado"
  on public.musicas for delete
  to authenticated
  using (true);

-- ---------- TABELA: pedidos ----------
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  pedido text not null,
  mensagem text,
  atendido boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.pedidos enable row level security;

-- Visitantes NÃO acessam a tabela diretamente:
-- a inserção é feita pela Edge Function (service role, ignora RLS).
-- Somente usuários logados leem/gerenciam os pedidos.
create policy "pedidos: select autenticado"
  on public.pedidos for select
  to authenticated
  using (true);

create policy "pedidos: update autenticado"
  on public.pedidos for update
  to authenticated
  using (true);

create policy "pedidos: delete autenticado"
  on public.pedidos for delete
  to authenticated
  using (true);

-- ---------- TABELA: sugestoes (músicas para aprender) ----------
create table if not exists public.sugestoes (
  id uuid primary key default gen_random_uuid(),
  musica text not null,
  artista text,
  mensagem text,
  origem text not null default 'visitante', -- 'visitante' | 'admin'
  para text not null default 'Ambos',       -- 'Ambos' | 'Gabriel' | 'Mariana'
  created_at timestamptz not null default now()
);

-- (Se a tabela já existia, adiciona a coluna nova)
alter table public.sugestoes add column if not exists para text not null default 'Ambos';

alter table public.sugestoes enable row level security;

-- Visitantes NÃO acessam a tabela diretamente:
-- a inserção é feita pela Edge Function (service role, ignora RLS).
-- Somente usuários logados leem/gerenciam as sugestões.
create policy "sugestoes: select autenticado"
  on public.sugestoes for select
  to authenticated
  using (true);

create policy "sugestoes: insert autenticado"
  on public.sugestoes for insert
  to authenticated
  with check (true);

create policy "sugestoes: update autenticado"
  on public.sugestoes for update
  to authenticated
  using (true);

create policy "sugestoes: delete autenticado"
  on public.sugestoes for delete
  to authenticated
  using (true);

-- ---------- TABELA: eventos (agenda de shows) ----------
create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  local text,
  data date not null,
  hora time,
  observacao text,
  cache text,   -- privado: só a área admin vê
  duracao text, -- privado: tempo de apresentação combinado
  created_at timestamptz not null default now()
);

-- (Se a tabela já existia, adiciona as colunas novas)
alter table public.eventos add column if not exists cache text;
alter table public.eventos add column if not exists duracao text;

alter table public.eventos enable row level security;

-- Qualquer visitante pode LER a agenda, mas SEM as colunas privadas
-- (cache e duracao ficam visíveis apenas para usuários logados)
create policy "eventos: leitura publica"
  on public.eventos for select
  using (true);

revoke select on table public.eventos from anon;
grant select (id, titulo, local, data, hora, observacao)
  on table public.eventos to anon;

create policy "eventos: insert autenticado"
  on public.eventos for insert
  to authenticated
  with check (true);

create policy "eventos: update autenticado"
  on public.eventos for update
  to authenticated
  using (true);

create policy "eventos: delete autenticado"
  on public.eventos for delete
  to authenticated
  using (true);

-- ---------- TABELA: videos ----------
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  youtube_id text,      -- vídeo do YouTube OU...
  instagram_id text,    -- ...reel do Instagram
  created_at timestamptz not null default now()
);

-- (Se a tabela já existia, ajusta para aceitar reels)
alter table public.videos alter column youtube_id drop not null;
alter table public.videos add column if not exists instagram_id text;

alter table public.videos enable row level security;

-- Qualquer visitante pode LER os vídeos
create policy "videos: leitura publica"
  on public.videos for select
  using (true);

create policy "videos: insert autenticado"
  on public.videos for insert
  to authenticated
  with check (true);

create policy "videos: update autenticado"
  on public.videos for update
  to authenticated
  using (true);

create policy "videos: delete autenticado"
  on public.videos for delete
  to authenticated
  using (true);

-- ---------- CIFRAS (PDFs no Storage) ----------
-- Coluna que liga a música ao arquivo de cifra no bucket
alter table public.musicas add column if not exists cifra_path text;

-- Bucket público para leitura (URLs estáveis = funciona offline no PWA);
-- escrita somente autenticada.
insert into storage.buckets (id, name, public)
values ('cifras', 'cifras', true)
on conflict (id) do nothing;

create policy "cifras: upload autenticado"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cifras');

create policy "cifras: update autenticado"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'cifras');

create policy "cifras: delete autenticado"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'cifras');

-- ---------- Confirmação dupla nas sugestões "Ambos" ----------
-- A música só vai ao repertório quando Gabs E Mari confirmarem
alter table public.sugestoes add column if not exists ok_gabs boolean not null default false;
alter table public.sugestoes add column if not exists ok_mari boolean not null default false;

-- ---------- (Opcional) Repertório inicial ----------
-- insert into public.musicas (nome, artista, estilo) values
--   ('Trevo (Tu)', 'Anavitória', 'MPB'),
--   ('Wave', 'Tom Jobim', 'Bossa Nova');
