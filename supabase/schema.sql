-- =============================================================
-- Schema do Site Duo Mariel
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)
--
-- O arquivo inteiro é seguro pra rodar de novo a qualquer momento (tabelas,
-- colunas e policies só são criadas "se não existir" — cada "create policy"
-- vem com um "drop policy if exists" antes). Sempre que este arquivo
-- ganhar uma seção nova, é só colar e rodar ele inteiro de novo; não
-- precisa garimpar só o trecho novo.
-- =============================================================

-- ---------- TABELA: musicas ----------
create table if not exists public.musicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  artista text not null,
  estilo text,
  created_at timestamptz not null default now()
);

-- Favorita (estrela) na tela de cifra — usada pra filtrar na aba Cifras
alter table public.musicas add column if not exists favorito boolean not null default false;

alter table public.musicas enable row level security;

-- Qualquer visitante pode LER o repertório
drop policy if exists "musicas: leitura publica" on public.musicas;
create policy "musicas: leitura publica"
  on public.musicas for select
  using (true);

-- Apenas usuários logados (você e sua parceira) podem alterar
drop policy if exists "musicas: insert autenticado" on public.musicas;
create policy "musicas: insert autenticado"
  on public.musicas for insert
  to authenticated
  with check (true);

drop policy if exists "musicas: update autenticado" on public.musicas;
create policy "musicas: update autenticado"
  on public.musicas for update
  to authenticated
  using (true);

drop policy if exists "musicas: delete autenticado" on public.musicas;
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
drop policy if exists "pedidos: select autenticado" on public.pedidos;
create policy "pedidos: select autenticado"
  on public.pedidos for select
  to authenticated
  using (true);

drop policy if exists "pedidos: update autenticado" on public.pedidos;
create policy "pedidos: update autenticado"
  on public.pedidos for update
  to authenticated
  using (true);

drop policy if exists "pedidos: delete autenticado" on public.pedidos;
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
drop policy if exists "sugestoes: select autenticado" on public.sugestoes;
create policy "sugestoes: select autenticado"
  on public.sugestoes for select
  to authenticated
  using (true);

drop policy if exists "sugestoes: insert autenticado" on public.sugestoes;
create policy "sugestoes: insert autenticado"
  on public.sugestoes for insert
  to authenticated
  with check (true);

drop policy if exists "sugestoes: update autenticado" on public.sugestoes;
create policy "sugestoes: update autenticado"
  on public.sugestoes for update
  to authenticated
  using (true);

drop policy if exists "sugestoes: delete autenticado" on public.sugestoes;
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
drop policy if exists "eventos: leitura publica" on public.eventos;
create policy "eventos: leitura publica"
  on public.eventos for select
  using (true);

revoke select on table public.eventos from anon;
grant select (id, titulo, local, data, hora, observacao)
  on table public.eventos to anon;

drop policy if exists "eventos: insert autenticado" on public.eventos;
create policy "eventos: insert autenticado"
  on public.eventos for insert
  to authenticated
  with check (true);

drop policy if exists "eventos: update autenticado" on public.eventos;
create policy "eventos: update autenticado"
  on public.eventos for update
  to authenticated
  using (true);

drop policy if exists "eventos: delete autenticado" on public.eventos;
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
drop policy if exists "videos: leitura publica" on public.videos;
create policy "videos: leitura publica"
  on public.videos for select
  using (true);

drop policy if exists "videos: insert autenticado" on public.videos;
create policy "videos: insert autenticado"
  on public.videos for insert
  to authenticated
  with check (true);

drop policy if exists "videos: update autenticado" on public.videos;
create policy "videos: update autenticado"
  on public.videos for update
  to authenticated
  using (true);

drop policy if exists "videos: delete autenticado" on public.videos;
create policy "videos: delete autenticado"
  on public.videos for delete
  to authenticated
  using (true);

-- ---------- CIFRAS (PDFs no Storage) ----------
-- Coluna que liga a música ao arquivo de cifra no bucket
alter table public.musicas add column if not exists cifra_path text;

-- Quantidade de páginas já convertidas em imagem (arquivos
-- "<id>-imgs<cifra_versao>-p1.jpg", "-p2.jpg" etc. no mesmo bucket).
-- Null/0 = cifra antiga que ainda só tem o PDF; nesse caso o app renderiza
-- o PDF na hora, mais devagar.
alter table public.musicas add column if not exists cifra_paginas integer;

-- Marca de versão (timestamp) de quando as imagens foram geradas/regeradas.
-- Entra no nome do arquivo: sem isso, reprocessar uma cifra reaproveitaria
-- o mesmo nome de arquivo de antes, e o cache do navegador (CacheFirst)
-- continuaria servindo pra sempre a resposta antiga (ou corrompida, de uma
-- tentativa que falhou no meio) em vez de buscar a nova.
alter table public.musicas add column if not exists cifra_versao bigint;

-- Cifra em ChordPro (texto puro, com acordes entre colchetes embutidos na
-- letra) — alternativa ao PDF, guardada direto na linha (arquivo pequeno,
-- não precisa de Storage). Quando preenchida, Cifra.jsx renderiza o texto
-- em vez do PDF/imagens; as duas colunas podem conviver (ex.: durante a
-- migração de uma cifra de PDF para .cho).
alter table public.musicas add column if not exists cifra_cho text;

-- As cifras são "restritas aos integrantes do duo" (ver Cifra.jsx) — mas
-- isso até aqui era só um gate de UI: a policy "musicas: leitura publica"
-- (using true, sem filtro de coluna) deixava cifra_path/cifra_paginas/
-- cifra_versao/cifra_cho legíveis por QUALQUER UM via API REST direta com
-- a anon key (que já é pública no bundle JS), sem passar pelo login nem
-- pela tela. Mesma técnica já usada em "eventos" pra esconder cache/
-- duracao do público: revoga o select geral do anon e libera de volta só
-- as colunas que a página pública realmente usa.
revoke select on table public.musicas from anon;
grant select (id, nome, artista, estilo) on table public.musicas to anon;

-- Bucket público para leitura (URLs estáveis = funciona offline no PWA);
-- escrita somente autenticada.
insert into storage.buckets (id, name, public)
values ('cifras', 'cifras', true)
on conflict (id) do nothing;

drop policy if exists "cifras: upload autenticado" on storage.objects;
create policy "cifras: upload autenticado"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cifras');

drop policy if exists "cifras: update autenticado" on storage.objects;
create policy "cifras: update autenticado"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'cifras');

drop policy if exists "cifras: delete autenticado" on storage.objects;
create policy "cifras: delete autenticado"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'cifras');

-- ---------- Confirmação dupla nas sugestões "Ambos" ----------
-- A música só vai ao repertório quando Gabs E Mari confirmarem
alter table public.sugestoes add column if not exists ok_gabs boolean not null default false;
alter table public.sugestoes add column if not exists ok_mari boolean not null default false;

-- ---------- TABELA: gorjeta (config única — pix + qrcode + liga/desliga) ----------
-- Linha única (id sempre true) com os dados de gorjeta configurados pela
-- dupla — pix_qrcode_path aponta pro bucket "gorjeta" no Storage. Quando
-- ativo=true, o site mostra o convite de gorjeta no modal de pedido e o
-- botão na página principal.
create table if not exists public.gorjeta (
  id boolean primary key default true,
  pix_chave text,
  pix_qrcode_path text,
  ativo boolean not null default false,
  constraint gorjeta_singleton check (id)
);
insert into public.gorjeta (id) values (true) on conflict (id) do nothing;

alter table public.gorjeta enable row level security;

-- Qualquer visitante lê (precisa ver se está ativo e os dados do pix) —
-- só usuários logados alteram
drop policy if exists "gorjeta: leitura publica" on public.gorjeta;
create policy "gorjeta: leitura publica"
  on public.gorjeta for select
  using (true);

drop policy if exists "gorjeta: update autenticado" on public.gorjeta;
create policy "gorjeta: update autenticado"
  on public.gorjeta for update
  to authenticated
  using (true);

-- Bucket público para o QR code (mesma lógica do bucket "cifras")
insert into storage.buckets (id, name, public)
values ('gorjeta', 'gorjeta', true)
on conflict (id) do nothing;

drop policy if exists "gorjeta: upload autenticado" on storage.objects;
create policy "gorjeta: upload autenticado"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'gorjeta');

drop policy if exists "gorjeta: update objeto autenticado" on storage.objects;
create policy "gorjeta: update objeto autenticado"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'gorjeta');

drop policy if exists "gorjeta: delete objeto autenticado" on storage.objects;
create policy "gorjeta: delete objeto autenticado"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'gorjeta');

-- ---------- TABELA: perfis_ocultar (perfis de ocultação por casa) ----------
-- Cada perfil guarda o que ficar oculto do repertório público quando
-- aplicado (ex.: "Casamento Silva" oculta o estilo "Sertanejo" e 3 músicas
-- específicas) — reaproveitável toda vez que a dupla tocar naquela casa de
-- novo, sem reconfigurar a ocultação do zero.
create table if not exists public.perfis_ocultar (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  musicas_ids uuid[] not null default '{}',
  estilos text[] not null default '{}',
  artistas text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.perfis_ocultar enable row level security;

drop policy if exists "perfis_ocultar: select autenticado" on public.perfis_ocultar;
create policy "perfis_ocultar: select autenticado"
  on public.perfis_ocultar for select
  to authenticated
  using (true);

drop policy if exists "perfis_ocultar: insert autenticado" on public.perfis_ocultar;
create policy "perfis_ocultar: insert autenticado"
  on public.perfis_ocultar for insert
  to authenticated
  with check (true);

drop policy if exists "perfis_ocultar: update autenticado" on public.perfis_ocultar;
create policy "perfis_ocultar: update autenticado"
  on public.perfis_ocultar for update
  to authenticated
  using (true);

drop policy if exists "perfis_ocultar: delete autenticado" on public.perfis_ocultar;
create policy "perfis_ocultar: delete autenticado"
  on public.perfis_ocultar for delete
  to authenticated
  using (true);

-- ---------- TABELA: ocultar_ativo (qual perfil está aplicado agora) ----------
-- Linha única (id sempre true): perfil_id é o perfil em uso no show de
-- hoje; expira_em (opcional) é quando o repertório completo deve voltar
-- sozinho — sem prazo definido, fica oculto até alguém desativar na mão.
create table if not exists public.ocultar_ativo (
  id boolean primary key default true,
  perfil_id uuid references public.perfis_ocultar(id) on delete set null,
  ativado_em timestamptz,
  expira_em timestamptz,
  constraint ocultar_ativo_singleton check (id)
);
insert into public.ocultar_ativo (id) values (true) on conflict (id) do nothing;

alter table public.ocultar_ativo enable row level security;

drop policy if exists "ocultar_ativo: select autenticado" on public.ocultar_ativo;
create policy "ocultar_ativo: select autenticado"
  on public.ocultar_ativo for select
  to authenticated
  using (true);

drop policy if exists "ocultar_ativo: update autenticado" on public.ocultar_ativo;
create policy "ocultar_ativo: update autenticado"
  on public.ocultar_ativo for update
  to authenticated
  using (true);

-- View pública com só o que está oculto AGORA — nunca os nomes dos perfis
-- nem os perfis inativos (isso é informação interna da dupla, não pro
-- visitante). Ela mesma "expira": se expira_em já passou, devolve listas
-- vazias sem precisar de nenhum job/cron rodando por fora. Views rodam com
-- o privilégio de quem criou (o dono das tabelas), então funciona mesmo com
-- RLS de "só autenticado" nas duas tabelas de baixo — só o SELECT nesta
-- view é liberado pro público.
create or replace view public.ocultos_ativos as
select
  case when a.expira_em is not null and a.expira_em <= now()
       then '{}'::uuid[] else coalesce(p.musicas_ids, '{}') end as musicas_ids,
  case when a.expira_em is not null and a.expira_em <= now()
       then '{}'::text[] else coalesce(p.estilos, '{}') end as estilos,
  case when a.expira_em is not null and a.expira_em <= now()
       then '{}'::text[] else coalesce(p.artistas, '{}') end as artistas
from public.ocultar_ativo a
left join public.perfis_ocultar p on p.id = a.perfil_id
where a.id = true;

grant select on public.ocultos_ativos to anon, authenticated;

-- ---------- TABELA: playlists (setlists com ordem definida) ----------
-- musicas_ids é um array ORDENADO — a posição no array é a ordem de
-- execução. Ferramenta só do admin (roteiro de show), sem leitura pública.
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  musicas_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.playlists enable row level security;

drop policy if exists "playlists: select autenticado" on public.playlists;
create policy "playlists: select autenticado"
  on public.playlists for select
  to authenticated
  using (true);

drop policy if exists "playlists: insert autenticado" on public.playlists;
create policy "playlists: insert autenticado"
  on public.playlists for insert
  to authenticated
  with check (true);

drop policy if exists "playlists: update autenticado" on public.playlists;
create policy "playlists: update autenticado"
  on public.playlists for update
  to authenticated
  using (true);

drop policy if exists "playlists: delete autenticado" on public.playlists;
create policy "playlists: delete autenticado"
  on public.playlists for delete
  to authenticated
  using (true);

-- ---------- (Opcional) Repertório inicial ----------
-- insert into public.musicas (nome, artista, estilo) values
--   ('Trevo (Tu)', 'Anavitória', 'MPB'),
--   ('Wave', 'Tom Jobim', 'Bossa Nova');
