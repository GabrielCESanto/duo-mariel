-- Pedido "ignorado": vai pro Arquivo sem ser excluído, pra revisão depois
-- (distingue de "atendido" — foi tocado; "ignorado" — decidiu não atender)
alter table public.pedidos add column if not exists ignorado boolean not null default false;

-- Senha de playlist de evento passa a ser por show, não mais compartilhada
-- entre todos os eventos (evento_config.senha fica obsoleta, mas não é
-- removida — só para de ser usada pelo app)
alter table public.eventos add column if not exists senha text;
