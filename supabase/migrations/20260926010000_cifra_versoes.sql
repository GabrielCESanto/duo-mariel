-- Múltiplas versões de cifra por música (ex.: "Tom original", "Ao vivo",
-- "Versão simplificada") — antes cada música só tinha 1 conjunto de campos
-- de cifra direto em "musicas". Cada linha aqui é uma versão completa e
-- independente (upload próprio, tom/capotraste/edição próprios).
create table if not exists public.cifra_versoes (
  id uuid primary key default gen_random_uuid(),
  musica_id uuid not null references public.musicas(id) on delete cascade,
  rotulo text not null default 'Versão 1',
  cifra_path text,
  cifra_paginas int not null default 0,
  cifra_versao bigint,
  cifra_cho text,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.cifra_versoes enable row level security;

drop policy if exists "cifra_versoes: leitura publica" on public.cifra_versoes;
create policy "cifra_versoes: leitura publica"
  on public.cifra_versoes for select
  using (true);

drop policy if exists "cifra_versoes: insert autenticado" on public.cifra_versoes;
create policy "cifra_versoes: insert autenticado"
  on public.cifra_versoes for insert
  to authenticated
  with check (true);

drop policy if exists "cifra_versoes: update autenticado" on public.cifra_versoes;
create policy "cifra_versoes: update autenticado"
  on public.cifra_versoes for update
  to authenticated
  using (true);

drop policy if exists "cifra_versoes: delete autenticado" on public.cifra_versoes;
create policy "cifra_versoes: delete autenticado"
  on public.cifra_versoes for delete
  to authenticated
  using (true);

-- Versão que abre por padrão quando ninguém escolheu uma pelo seletor
alter table public.musicas add column if not exists cifra_versao_padrao_id uuid references public.cifra_versoes(id) on delete set null;

-- Migra a cifra que já existia em "musicas" (campo único) pra ser a
-- "Versão 1" de cada música — só roda pra quem ainda não tem nenhuma versão
insert into public.cifra_versoes (musica_id, rotulo, cifra_path, cifra_paginas, cifra_versao, cifra_cho, ordem)
select m.id, 'Versão 1', m.cifra_path, coalesce(m.cifra_paginas, 0), m.cifra_versao, m.cifra_cho, 0
from public.musicas m
where (m.cifra_path is not null or m.cifra_cho is not null)
  and not exists (select 1 from public.cifra_versoes v where v.musica_id = m.id);

update public.musicas m
set cifra_versao_padrao_id = v.id
from public.cifra_versoes v
where v.musica_id = m.id
  and v.rotulo = 'Versão 1'
  and m.cifra_versao_padrao_id is null;
