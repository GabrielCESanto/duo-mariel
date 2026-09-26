# 🎶 Site Duo Mariel

Site de repertório, pedidos de música e portfólio do **Duo Mariel**, inspirado no
[repertorio-show](https://gabrielcesanto.github.io/repertorio-show/). No ar em
[duomariel.com.br](https://duomariel.com.br).

**Stack:** React 18 + Vite 7 + Tailwind CSS 4 + Supabase (banco, autenticação,
Storage, Realtime e Edge Function) + GitHub Pages (hospedagem gratuita).
No cliente: `pdf.js` (renderizar cifra em PDF), `pitchy` (afinador) e a Web
Speech API do navegador (reconhecimento de voz do acompanhamento
experimental).

## Funcionalidades

### Página pública

- **Repertório com busca e filtros** (artista/estilo) e **trecho de 30s**
  (▶ em cada música) via iTunes Search API — grátis, sem chave.
- **Pedido de música**, da lista ou livre (fora do repertório), com
  mensagem opcional.
- **Sugestão de música para aprender**: quem não encontra a música pode
  sugerir que o duo aprenda; cai na aba **Aprender** do admin e, quando
  aprendida, vira item do repertório com um clique.
- **Gorjeta (Pix)**: botão sutil e opcional na página inicial, só aparece
  quando ativado no admin; mostra QR code e/ou chave Pix (copiável) num
  modal, e no fim do fluxo de pedido.
- **Playlist do evento** (`/#/especial`): quem contratou o duo escolhe o
  evento numa lista e entra com uma senha própria (definida pelo duo). Ela
  então busca músicas por nome/artista (API do iTunes) ou escolhe direto do
  repertório do duo, monta a lista do que quer ouvir no show e pode remover
  a qualquer momento. O admin acompanha e modera pela aba **Playlist
  especial**.
- **Agenda de shows**: carrossel automático (arrastável, com autoplay e
  navegação por setas/bolinhas) com os próximos shows, e uma lista à parte
  dos já realizados — mostrado só quando há pelo menos um evento cadastrado.
- **Vídeos**: grade com embeds do YouTube e do Instagram, gerenciados pela
  aba **Vídeos** do admin.
- **PWA / offline**: o site pode ser instalado na tela inicial do tablet;
  as cifras já abertas ficam em cache e funcionam sem internet no show.
- **Modo demonstração**: sem Supabase configurado, o site roda com um
  repertório e agenda locais de exemplo (bom para desenvolver o visual).

### Área do músico (`/#/admin`)

Login restrito (Supabase Auth, sem cadastro aberto — os dois usuários são
criados manualmente no painel do Supabase). Abas do painel:

- **Cifras**: abrir/gerenciar as cifras, com atalhos (favoritas, sorteadas,
  filtro) e a ferramenta de **download em lote para uso offline** (com
  indicador de progresso e aviso quando o navegador não garante
  armazenamento persistente, caso do Safari/iOS).
- **Pedidos**: contador de pendentes, filtro pendentes/atendidos e **pop-up
  em tempo real** (Supabase Realtime) sempre que um pedido novo chega, em
  qualquer aba do painel — com atalho direto pra cifra da música pedida.
- **Músicas**: cadastro com autocomplete via iTunes, upload de PDF de
  cifra (converte para ChordPro automaticamente — veja abaixo), exportar o
  repertório em **xlsx**, e uma checagem em lote de quais músicas **não
  são encontradas na busca do iTunes** (útil pra revisar grafia de nome/
  artista que atrapalha o preview de 30s) com opção de trocar o resultado
  vinculado.
- **Aprender**: sugestões recebidas do público (e também as músicas
  marcadas "em revisão" direto da tela de cifra); promove para o
  repertório com um clique.
- **Agenda**: cadastro dos shows (com campos só visíveis ao duo, como
  cachê e tempo de apresentação).
- **Playlist especial**: acompanha e modera a playlist de cada evento
  contratado; define/troca a senha de acesso por evento.
- **Playlists**: setlists próprios do duo, com ordem de execução definida
  manualmente — cada item pode ser uma música do repertório ou uma faixa
  avulsa (buscada no iTunes) exclusiva daquela playlist.
- **Ocultar**: perfis reutilizáveis (por música, artista ou estilo) para
  esconder temporariamente parte do repertório da página pública — útil
  pra guardar uma "música-surpresa" antes de um show. Um perfil fica ativo
  por vez, com prazo opcional em dias (expira sozinho).
- **Afinador**: afinador de violão pelo microfone (ver abaixo).
- **Gorjeta**: liga/desliga o bloco de gorjeta do site e define QR code
  Pix / chave Pix.
- **Vídeos**: cadastro dos vídeos do YouTube/Instagram exibidos na home.
- **Acompanhamento (teste)**: acesso à página experimental de
  acompanhamento por voz/acorde (ver abaixo) — não fica em nenhum menu
  público.
- **Acessos**: link para o painel do GoatCounter (só aparece se
  `GOATCOUNTER_CODE` estiver definido).

### Cifras: visualizador e conversão

- Upload de PDF na aba **Músicas**: o site tenta **converter automaticamente
  para ChordPro** (texto com acordes embutidos) no navegador — quando dá
  certo, a cifra abre instantânea, sem PDF nem imagem nenhuma envolvida, e
  passa a ter tom/capotraste editáveis. Quando o PDF tem fonte quebrada ou é
  escaneado (não dá pra converter no navegador), o site gera imagens
  pré-renderizadas de cada página no upload, e a cifra abre a partir delas
  (a renderização de PDF completa fica como último recurso).
- **Visualizador** (`/#/cifra/<id>`, restrito): rolagem automática em
  velocidade ajustável, play/pause por toque, zoom por botão ou pinça,
  arrastar um dedo na tela ajusta a velocidade em tempo real, suporte a
  pedal Bluetooth/teclado (setas, PageUp/PageDown, espaço) e tela sempre
  acesa — feito para tablet no palco.
- Cifras em ChordPro ganham **transposição de tom** (com "Salvar tom"),
  **capotraste** (recalcula a cifra exibida) e **edição livre do texto**
  direto na tela.
- Cada música pode ser marcada como **favorita** (★) ou **em revisão**
  (🙈, manda pra aba Aprender até alguém tirar a marca) direto da tela de
  cifra.

### Acompanhamento por voz/acorde (experimental)

Página à parte (`/#/teste-acompanhamento`, só acessível pelo Menu do
admin — não linkada em nenhum lugar público), no mesmo estilo visual da
tela de Cifra, mas com uma linha central fixa: o texto rola por baixo dela
em vez de ela se mover. Quatro modos: **Manual** (só o dedo), **Automático**
(velocidade constante, como a Cifra hoje), **Voz** (reconhecimento de fala
do navegador, tolerante a pequenas variações de letra) e **Acorde**
(compara o áudio captado com o próximo acorde esperado da cifra, via FFT +
similaridade de croma). Só funciona com cifra em ChordPro (não PDF/imagem)
e não grava nem envia áudio nenhum — a escuta é só local, ao vivo.

### Afinador

Afinador de violão via microfone (aba **Afinador** do admin), usando
detecção de tom `pitchy` (McLeod Pitch Method): mostra a corda mais
próxima, o desvio em centavos e um ponteiro visual, com filtros de
frequência para reduzir ruído.

### Scripts auxiliares (Python, uso local do duo)

Em `scripts/`, ferramentas para migrar cifras antigas em PDF para ChordPro
em lote, fora do navegador (útil pra grandes volumes do arquivo de
partituras em `Repertório/`):

- `pdf_para_cho.py` / `lote_cho.py`: convertem PDFs (padrão Cifra Club)
  para `.cho`, com **OCR via Tesseract** como fallback automático quando o
  PDF tem fonte quebrada ou é escaneado.
- `subir_cho_em_lote.py`: sobe os `.cho` já convertidos para as músicas
  correspondentes no Supabase (por padrão só simula; precisa da
  `SUPABASE_SERVICE_ROLE_KEY`, que nunca deve ser commitada).
- `listar_fonte_quebrada.py` / `sem_solucao.txt`: relatórios de PDFs que
  não converteram automaticamente (candidatos a retranscrever manualmente).
- `limpar_imagens_geradas.py`: remove do Storage as imagens de página que
  ficaram órfãs depois que a música migrou para ChordPro.

A segurança é garantida no servidor via **Row Level Security**: qualquer
visitante lê o repertório, mas só usuários autenticados alteram dados. Não há
cadastro aberto — os dois usuários são criados manualmente no painel do Supabase.

## Rodando localmente

```bash
npm install
npm run dev
```

## Configuração completa (passo a passo)

### 1. Supabase

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. No **SQL Editor**, cole e execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql)
   e depois, em ordem, as migrações em [`supabase/migrations/`](supabase/migrations/).
3. Em **Authentication > Users > Add user**, crie os 2 usuários (você e sua
   parceira) com e-mail e senha. Em **Authentication > Sign In / Up**,
   **desabilite** "Allow new users to sign up" para ninguém mais se cadastrar.
4. Em **Database > Replication**, habilite o Realtime na tabela `pedidos`
   (necessário para o pop-up de pedido novo no admin).
5. Em **Project Settings > API**, copie a `URL` e a `anon key`.
6. Crie o arquivo `.env` na raiz (copie de `.env.example`) e preencha os valores.

### 2. Edge Function (pedidos, sugestões e playlist de evento)

Instale a CLI do Supabase e faça o deploy da função:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy pedido --no-verify-jwt
```

(Ou cole o conteúdo de `supabase/functions/pedido/index.ts` no editor de
Edge Functions do Dashboard e clique em Deploy.)

A mesma função também atende a playlist de evento (login com senha, listar,
adicionar e remover músicas) — já incluída no arquivo acima, sem passo
extra. A senha padrão inicial é `trocaressa` (definida em
`supabase/schema.sql`); troque na aba **Playlist especial** do admin antes de
divulgar o recurso.

### 3. GitHub Pages

1. Crie um repositório no GitHub e envie o projeto (`git init`, `git add .`, etc.).
2. Em **Settings > Secrets and variables > Actions**, crie os secrets
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (mesmos valores do `.env`).
3. Em **Settings > Pages**, escolha **Source: GitHub Actions**.
4. Faça push na branch `main` — o workflow
   [`deploy.yml`](.github/workflows/deploy.yml) builda e publica sozinho.
5. Domínio próprio já configurado via [`public/CNAME`](public/CNAME)
   (`duomariel.com.br`) — para trocar, edite esse arquivo e o DNS do domínio.

### 4. Scripts de conversão de cifra em lote (opcional)

Só necessário para migrar um acervo grande de PDFs de uma vez (fora do
fluxo normal de upload pela aba Músicas, que já converte sozinha):

```bash
pip install pdfplumber pytesseract pdf2image
```

Instale também o [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki)
no sistema (o caminho do executável está em `TESSERACT_CMD`, no topo de
`scripts/pdf_para_cho.py`). Todos os scripts que gravam no Supabase rodam
em modo simulação por padrão — passe `--aplicar` para gravar de verdade, e
nunca cole a `SUPABASE_SERVICE_ROLE_KEY` no código ou no repositório.

### 5. Personalização rápida

- **Contatos, tagline, vídeos e texto "sobre":** edite [`src/config.js`](src/config.js).
- **Cores e fontes:** edite os tokens em [`src/index.css`](src/index.css) (`@theme`).
- **Logo:** imagens em `public/img/` (`logo-hero.png` e `logo-circle.png`).

## Mantendo tudo online e automatizado

- **Keep-alive do Supabase:** o plano gratuito pausa projetos após ~1 semana
  sem uso. O workflow [`keepalive.yml`](.github/workflows/keepalive.yml) já
  pinga o banco 2x por semana via GitHub Actions — nada a fazer além de manter
  os secrets configurados.
- **Deploy automático:** qualquer push na `main` republica o site.
- **Backup do repertório:** no Supabase, **Database > Backups** guarda backups
  diários (7 dias no plano free). A aba Músicas do admin também exporta o
  repertório em xlsx a qualquer momento.
- **Monitoramento gratuito:** cadastre a URL do site no
  [UptimeRobot](https://uptimerobot.com) (plano free) para receber e-mail se
  o site cair.

## Ideias de melhorias futuras

- **"Tocando agora" ao vivo para o público** — a fila de pedidos já
  notifica o admin em tempo real via Realtime; falta expor uma versão
  pública disso (ex.: "próxima da fila").
- **Amadurecer o acompanhamento por voz/acorde** — hoje é uma página de
  teste isolada; poderia virar modo oficial da tela de Cifra quando estiver
  confiável o bastante em ambiente de show real.
- **QR Code nas mesas/eventos** apontando para o site — já existe uma arte
  pronta ([`QR CODE.pdf`](QR%20CODE.pdf)), falta só imprimir e espalhar.
- ~~**Domínio próprio**~~ ✅ implementado (`duomariel.com.br`, via
  [`public/CNAME`](public/CNAME)).
- ~~**Fotos dos shows**~~ ✅ implementado (agenda com shows já realizados).
- ~~**Analytics leve**~~ ✅ implementado com [GoatCounter](https://www.goatcounter.com/):
  crie a conta grátis, defina o código do site e preencha `GOATCOUNTER_CODE`
  no [`src/config.js`](src/config.js). O painel mostra visitas por página
  (home e admin separadas) sem cookies e sem banner de consentimento.
