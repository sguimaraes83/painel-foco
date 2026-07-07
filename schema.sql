-- ============================================================
-- Painel de Foco — schema do banco (Supabase / PostgreSQL)
-- Cole este script inteiro no SQL Editor do seu projeto Supabase
-- (menu lateral "SQL Editor" > "New query") e clique em "Run".
-- ============================================================

-- Tabela principal de atividades
create table if not exists public.activities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  date         date not null,
  cat_id       text not null,
  project      text not null default 'Sem projeto',
  description  text default '',
  duration     integer not null check (duration > 0),
  status       text not null check (status in ('Concluída','Em andamento','Bloqueada','Retrabalho')),
  value        text not null check (value in ('Alto','Médio','Baixo')),
  created_at   timestamptz not null default now()
);

-- Índices úteis para as consultas do painel (por usuário/dia e por usuário/projeto)
create index if not exists activities_user_date_idx on public.activities (user_id, date);
create index if not exists activities_user_project_idx on public.activities (user_id, project);

-- Ativa Row Level Security: sem isso, por padrão ninguém acessa a tabela
-- via API — depois de ativado, as políticas abaixo definem o acesso.
alter table public.activities enable row level security;

-- Cada usuário só pode LER as próprias atividades
create policy "select_own_activities"
  on public.activities for select
  using (auth.uid() = user_id);

-- Cada usuário só pode CRIAR atividades vinculadas ao próprio id
create policy "insert_own_activities"
  on public.activities for insert
  with check (auth.uid() = user_id);

-- Cada usuário só pode ATUALIZAR as próprias atividades
create policy "update_own_activities"
  on public.activities for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Cada usuário só pode APAGAR as próprias atividades
create policy "delete_own_activities"
  on public.activities for delete
  using (auth.uid() = user_id);
