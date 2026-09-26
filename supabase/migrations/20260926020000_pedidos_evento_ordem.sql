-- Ordem das músicas dentro da playlist de um evento — igual ao que já existe
-- em playlists.itens, mas aqui como coluna (a tabela é linha-por-música).
-- Pedidos existentes mantêm a ordem de chegada (created_at) até serem
-- reordenados pela primeira vez na tela.
alter table public.pedidos_evento add column if not exists ordem int;
