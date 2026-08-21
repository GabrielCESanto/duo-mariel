-- Subtítulo do card padrão da Agenda (ver Agenda.jsx) — título, subtítulo e
-- observação (usada como "detalhes") são os três textos editáveis que
-- preenchem o mesmo template visual em todos os shows, substituindo a
-- antiga lista simples por um carrossel de cards.
alter table public.eventos add column if not exists subtitulo text;

-- Libera a coluna nova pro anon, junto das demais colunas públicas da
-- agenda (grant é aditivo por coluna — não precisa refazer a lista toda).
grant select (subtitulo) on table public.eventos to anon;
