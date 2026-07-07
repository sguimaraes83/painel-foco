# Painel de Foco — Dev/Tech Lead Mendix

Sistema de controle de atividades com login por email (com verificação) e banco
de dados na nuvem. Uso individual — só você acessa seus dados.

Stack: front-end estático (HTML/CSS/JS puro) + **Supabase** (autenticação e
banco Postgres) + **Vercel** (hospedagem gratuita).

---

## Passo 1 — Criar o projeto no Supabase (5 min)

1. Acesse **https://supabase.com** e crie uma conta gratuita (pode entrar com GitHub ou Google).
2. Clique em **New Project**.
   - Dê um nome (ex: `painel-foco`).
   - Crie uma senha para o banco (guarde em local seguro — só é usada internamente).
   - Escolha a região mais próxima de você (ex: South America / São Paulo, se disponível).
3. Aguarde ~2 minutos até o projeto ficar pronto.

## Passo 2 — Criar a tabela e as regras de segurança

1. No menu lateral do Supabase, abra **SQL Editor** → **New query**.
2. Abra o arquivo `schema.sql` (nesta pasta), copie todo o conteúdo e cole no editor.
3. Clique em **Run**. Isso cria a tabela `activities` e as políticas que garantem
   que cada usuário só enxerga as próprias atividades.

## Passo 3 — Ativar confirmação de email (já vem ativado por padrão)

1. No menu lateral, vá em **Authentication** → **Providers** → **Email**.
2. Confirme que **"Confirm email"** está ativado (é o padrão). Isso garante que
   ninguém consegue entrar sem clicar no link enviado para o email cadastrado.
3. (Opcional) Em **Authentication** → **URL Configuration**, depois de publicar
   na Vercel (Passo 5), cole a URL final do site em **Site URL** — é para lá
   que o link do email de confirmação vai redirecionar.

> O Supabase já envia os emails de confirmação e redefinição de senha
> automaticamente, sem precisar configurar nenhum serviço de email à parte.

## Passo 4 — Pegar suas chaves e configurar o projeto

1. No menu lateral, vá em **Project Settings** (ícone de engrenagem) → **API**.
2. Copie o valor de **Project URL** e cole em `config.js`, na variável `SUPABASE_URL`.
3. Copie o valor de **anon public** (em "Project API keys") e cole em `config.js`,
   na variável `SUPABASE_ANON_KEY`.

```js
const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

## Passo 5 — Publicar na Vercel (gratuito)

**Opção mais simples — sem linha de comando:**

1. Acesse **https://vercel.com** e crie uma conta gratuita.
2. No painel, clique em **Add New → Project**.
3. Escolha a opção de enviar os arquivos diretamente (**"Deploy" via upload**,
   disponível na aba de importação) ou suba esta pasta inteira para um
   repositório no GitHub e importe o repositório — qualquer um dos dois funciona,
   pois o site é 100% estático (não precisa de build).
4. Confirme o deploy. Em menos de um minuto você recebe uma URL pública, algo como:
   `https://painel-foco-seunome.vercel.app`

**Opção via linha de comando (se preferir):**

```bash
npm install -g vercel
cd painel-foco
vercel --prod
```

5. Volte ao Supabase (Passo 3, item 3) e cole essa URL final em **Site URL**,
   para os links de confirmação de email e redefinição de senha funcionarem
   corretamente.

## Passo 6 — Criar sua conta e usar

1. Abra a URL publicada.
2. Clique em **Criar conta**, informe seu email e uma senha.
3. Verifique seu email e clique no link de confirmação.
4. Volte à página e faça login. Pronto — seus dados agora ficam salvos no
   banco de dados, acessíveis de qualquer dispositivo, protegidos por login.

---

## Estrutura dos arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Estrutura da página (login, cadastro e painel) |
| `style.css` | Todo o visual do sistema |
| `app.js` | Lógica: autenticação e leitura/escrita das atividades no Supabase |
| `config.js` | Onde você cola suas chaves do Supabase |
| `schema.sql` | Script que cria a tabela e as regras de segurança no banco |

## Segurança

- A senha nunca fica visível nem é armazenada por este app — quem cuida disso
  é o Supabase Auth.
- A chave `SUPABASE_ANON_KEY` é pública por natureza (ela roda no navegador);
  a proteção real dos dados vem das políticas de **Row Level Security**
  criadas em `schema.sql`, que garantem que cada usuário só lê/escreve as
  próprias atividades.

## Custos

Os planos gratuitos da Vercel e do Supabase cobrem tranquilamente o uso
individual deste painel (sem custo, com limites generosos de banco de dados
e de emails de autenticação por hora).
