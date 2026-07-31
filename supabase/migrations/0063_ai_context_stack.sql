-- 0063_ai_context_stack.sql
-- Layered instruction stack for all AI tools.
-- Ladder (ascending authority): 1 org, 2 academic, 3 subject, 4 tool,
-- then at runtime: 5 curriculum context, 6 teacher's lesson plan.
-- Layers 5-6 are request data, not stored here.
-- The output contract and safeguarding floor sit OUTSIDE the ladder,
-- are held in code, and override every layer. No uploaded doc may override them.

do $$ begin
  create type ai_context_layer as enum ('org','academic','subject','tool');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ai_context_tool as enum ('worksheet_builder','resource_generator','smartt_checker');
exception when duplicate_object then null; end $$;

-- Document identity. Many docs may live in one layer.
create table if not exists ai_context_doc (
  id          uuid primary key default gen_random_uuid(),
  layer       ai_context_layer not null,
  subject_id  uuid references subjects(id) on delete cascade,
  tool        ai_context_tool,
  name        text not null,
  sort_order  int not null default 0,
  is_archived boolean not null default false,
  created_by  uuid not null references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint ai_context_doc_scope check (
    (layer in ('org','academic') and subject_id is null and tool is null)
    or (layer = 'subject' and subject_id is not null and tool is null)
    -- layer 'tool': subject_id null = applies to all subjects;
    -- subject_id set = per-subject override of that tool's instructions
    or (layer = 'tool' and tool is not null)
  )
);

create index if not exists ai_context_doc_lookup
  on ai_context_doc (layer, tool, subject_id) where is_archived = false;

-- Immutable versions. Re-upload inserts a new version and deactivates the old.
create table if not exists ai_context_doc_version (
  id                uuid primary key default gen_random_uuid(),
  doc_id            uuid not null references ai_context_doc(id) on delete cascade,
  version           int not null,
  body_md           text not null,
  original_filename text,
  uploaded_by       uuid not null references auth.users(id) default auth.uid(),
  created_at        timestamptz not null default now(),
  is_active         boolean not null default true,
  unique (doc_id, version)
);

create unique index if not exists ai_context_doc_version_one_active
  on ai_context_doc_version (doc_id) where is_active;

alter table ai_context_doc         enable row level security;
alter table ai_context_doc_version enable row level security;

-- Admin-only direct access. Teachers never select these tables;
-- they read through the security-definer function below.
create policy ai_context_doc_admin on ai_context_doc
  for all using (is_admin()) with check (is_admin());

create policy ai_context_doc_version_admin on ai_context_doc_version
  for all using (is_admin()) with check (is_admin());

-- Returns the active stack in composition order for a given tool + subject.
create or replace function get_active_context_stack(
  p_tool       ai_context_tool,
  p_subject_id uuid default null
)
returns table (
  layer_rank int,
  layer      ai_context_layer,
  doc_id     uuid,
  doc_name   text,
  version    int,
  body_md    text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case d.layer
      when 'org'      then 1
      when 'academic' then 2
      when 'subject'  then 3
      when 'tool'     then 4
    end as layer_rank,
    d.layer,
    d.id,
    d.name,
    v.version,
    v.body_md
  from ai_context_doc d
  join ai_context_doc_version v
    on v.doc_id = d.id and v.is_active
  where d.is_archived = false
    and (
      d.layer in ('org','academic')
      or (d.layer = 'subject' and d.subject_id = p_subject_id)
      or (d.layer = 'tool'
          and d.tool = p_tool
          and (d.subject_id is null or d.subject_id = p_subject_id))
    )
  order by layer_rank, d.sort_order, d.created_at;
$$;

revoke all on function get_active_context_stack(ai_context_tool, uuid) from public;
grant execute on function get_active_context_stack(ai_context_tool, uuid) to authenticated;
