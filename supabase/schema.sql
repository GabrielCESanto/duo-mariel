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

-- ---------- (Opcional) Repertório inicial ----------
-- insert into public.musicas (nome, artista, estilo) values
--   ('Trevo (Tu)', 'Anavitória', 'MPB'),
--   ('Wave', 'Tom Jobim', 'Bossa Nova');
