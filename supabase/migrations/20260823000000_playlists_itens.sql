-- Itens da playlist, em ordem (a posição no array é a ordem de execução) —
-- substitui musicas_ids, que fica só para compatibilidade com playlists
-- antigas (o admin migra sozinho pra "itens" na primeira alteração de cada
-- uma). Cada elemento tem um de dois formatos:
--   { "musica_id": uuid }                               referência ao repertório (tabela musicas)
--   { "extra_id": uuid, "nome", "artista", "estilo" }    música avulsa, exclusiva desta
--                                                        playlist — não entra no repertório
alter table public.playlists add column if not exists itens jsonb not null default '[]';
