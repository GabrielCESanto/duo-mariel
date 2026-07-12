# 🎶 Site Duo Mariel

Site de repertório, pedidos de música e portfólio do **Duo Mariel**, inspirado no
[repertorio-show](https://gabrielcesanto.github.io/repertorio-show/).

**Stack:** React 18 + Vite 7 + Tailwind CSS 4 + Supabase (banco, autenticação e
Edge Function) + GitHub Pages (hospedagem gratuita).

## Funcionalidades

- **Página pública:** hero com a logo, repertório com busca e filtros
  (artista/estilo), pedido de música livre ou da lista, vídeos, sobre o duo.
- **Pedidos:** salvos no banco e notificados em tempo real no **Telegram**.
- **Área do músico** (`/#/admin`): login restrito (Supabase Auth) para você e
  sua parceira adicionarem/editarem/excluírem músicas e gerenciarem pedidos —
  sem precisar mexer em código nem rebuildar o site.
- **Modo demonstração:** sem Supabase configurado, o site roda com um
  repertório local de exemplo (bom para desenvolver o visual).

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
2. No **SQL Editor**, cole e execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
3. Em **Authentication > Users > Add user**, crie os 2 usuários (você e sua
   parceira) com e-mail e senha. Em **Authentication > Sign In / Up**,
   **desabilite** "Allow new users to sign up" para ninguém mais se cadastrar.
4. Em **Project Settings > API**, copie a `URL` e a `anon key`.
5. Crie o arquivo `.env` na raiz (copie de `.env.example`) e preencha os valores.

### 2. Notificação no Telegram (pedidos)

1. Fale com o [@BotFather](https://t.me/BotFather) no Telegram, crie um bot
   (`/newbot`) e guarde o **token**.
2. Crie um grupo com você + sua parceira + o bot, e descubra o `chat_id` do
   grupo (ex.: adicione o bot [@getidsbot](https://t.me/getidsbot) temporariamente).
3. Instale a CLI do Supabase e faça o deploy da função:

   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase secrets set TELEGRAM_TOKEN=seu-token TELEGRAM_CHAT_ID=seu-chat-id
   npx supabase functions deploy pedido --no-verify-jwt
   ```

### 3. GitHub Pages

1. Crie um repositório no GitHub e envie o projeto (`git init`, `git add .`, etc.).
2. Em **Settings > Secrets and variables > Actions**, crie os secrets
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (mesmos valores do `.env`).
3. Em **Settings > Pages**, escolha **Source: GitHub Actions**.
4. Faça push na branch `main` — o workflow
   [`deploy.yml`](.github/workflows/deploy.yml) builda e publica sozinho.

### 4. Personalização rápida

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
  diários (7 dias no plano free). Para algo extra, dá para criar um workflow
  mensal que exporta a tabela `musicas` para um JSON no repositório.
- **Monitoramento gratuito:** cadastre a URL do site no
  [UptimeRobot](https://uptimerobot.com) (plano free) para receber e-mail se
  o site cair.

## Ideias de melhorias futuras

- **QR Code nas mesas/eventos** apontando para o site (a área de pedidos vira
  interação ao vivo com o público).
- **"Tocando agora" / fila de pedidos ao vivo** usando Supabase Realtime.
- **Domínio próprio** (ex.: `duomariel.com.br`, ~R$40/ano no Registro.br) —
  GitHub Pages aceita domínio customizado com HTTPS grátis.
- **Fotos/agenda de shows** em uma tabela `eventos` gerenciada pela área admin.
- **Analytics leve** (ex.: [GoatCounter](https://www.goatcounter.com/), grátis)
  para saber quantas pessoas acessam durante os shows.
