-- Liga uma sugestão de "revisão" à música do repertório que a originou
-- (até aqui o vínculo era só pelo nome digitado, sem FK) — permite abrir a
-- cifra direto a partir da aba Revisão.
alter table public.sugestoes add column if not exists musica_id uuid references public.musicas(id) on delete cascade;

-- Preenche o vínculo pras linhas de revisão já existentes, casando pelo nome
update public.sugestoes s
set musica_id = m.id
from public.musicas m
where s.origem = 'revisao'
  and s.musica_id is null
  and m.nome = s.musica;
