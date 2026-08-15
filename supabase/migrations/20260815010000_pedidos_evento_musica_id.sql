-- Vínculo manual entre um pedido de evento e uma música do repertório,
-- pra quando o nome do pedido não bate automaticamente (ex.: grafia
-- diferente) com a música já cadastrada.
alter table public.pedidos_evento
  add column musica_id uuid references public.musicas(id) on delete set null;

create index if not exists pedidos_evento_musica_id_idx on public.pedidos_evento (musica_id);
