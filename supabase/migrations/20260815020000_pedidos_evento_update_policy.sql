-- Faltava a policy de UPDATE em pedidos_evento pro admin autenticado —
-- só existiam SELECT e DELETE, então o link manual (musica_id) do modal
-- da Playlist especial falhava silenciosamente (bloqueado pelo RLS).
create policy "pedidos_evento: update autenticado"
  on public.pedidos_evento
  for update
  to authenticated
  using (true)
  with check (true);
