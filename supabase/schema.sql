-- 仅供全新 Supabase 项目初始化。已有项目的表结构可能不同，请勿直接重跑。
-- 先在 Authentication 中创建用户；每个用户只能访问自己的条目。
create table public.entries (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id),
  kind        text not null check (kind in ('task','event','note')),
  content     text default '',
  plain_text  text default '',
  done        boolean default false,
  starred     boolean default false,
  done_at     timestamptz,
  start_at    timestamptz,
  end_at      timestamptz,
  all_day     boolean default false,
  tentative   boolean default false,
  date_key    date,
  -- 旧字段，应用用它承载重复任务 / 删除状态等附属元数据。
  color       text,
  category    text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  sort_order  bigint default 0,
  deleted     smallint default 0
);

create index entries_user_id_idx on public.entries(user_id);
alter table public.entries enable row level security;
revoke all on public.entries from anon;
grant select, insert, update, delete on public.entries to authenticated;

create policy "entries_owner" on public.entries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
