-- x86sim backend schema (Supabase / Postgres).
--
-- Run this once in the Supabase dashboard's SQL editor (or with `supabase db
-- push`). It is idempotent, so it is safe to re-run after edits.
--
-- Security model: the browser only ever holds the public "anon" key, so every
-- table below is protected by row-level security (RLS). Students can read and
-- write only their own rows; rows are readable by everyone else only if the
-- reader's profile has role = 'admin'. Nobody can grant themselves admin from
-- the browser -- promote an account with the SQL at the bottom of this file.

-- ---------------------------------------------------------------- profiles --

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  student_no  text not null default '',
  class_group text not null default '',
  role        text not null default 'student' check (role in ('student', 'admin')),
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz
);

-- Creates the profile row when someone signs up. The name / student number
-- come from the sign-up form via `options.data` (auth.users.raw_user_meta_data).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, student_no, class_group)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'student_no', ''),
    coalesce(new.raw_user_meta_data ->> 'class_group', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only university addresses may sign up: students use @ogr.halic.edu.tr,
-- staff @halic.edu.tr. The site checks this too, but the anon key can call
-- the sign-up API directly, so the real gate is here. Accounts that already
-- exist (e.g. the instructor's) are not affected.
create or replace function public.require_school_email()
returns trigger
language plpgsql
as $$
begin
  if lower(new.email) !~ '@(ogr\.)?halic\.edu\.tr$' then
    raise exception 'Sign-up is limited to @ogr.halic.edu.tr and @halic.edu.tr addresses';
  end if;
  return new;
end;
$$;

drop trigger if exists require_school_email on auth.users;
create trigger require_school_email
  before insert on auth.users
  for each row execute function public.require_school_email();

-- security definer so policies can call it without recursing into profiles' RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Students may edit their own name / number / group, never role or email.
-- Requests from the site carry a user id (auth.uid()); the dashboard's SQL
-- editor does not, so the "make an admin" statement below still works.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.email := old.email;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: update own or admin" on public.profiles;
create policy "profiles: update own or admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- --------------------------------------------------------- study sessions --
-- One row per browser visit. The client creates it on load and bumps
-- `active_seconds` every minute while the tab is visible, so the total is
-- real time spent on the site, not time a forgotten tab stayed open.

create table if not exists public.study_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  started_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  user_agent     text not null default ''
);

create index if not exists study_sessions_user_idx on public.study_sessions (user_id, started_at desc);

alter table public.study_sessions enable row level security;

drop policy if exists "sessions: read own or admin" on public.study_sessions;
create policy "sessions: read own or admin" on public.study_sessions
  for select using (user_id = auth.uid() or public.is_admin());

-- Sessions start at zero; time is only ever added through session_heartbeat
-- below (no update policy), so students can't edit their own totals.
drop policy if exists "sessions: insert own" on public.study_sessions;
create policy "sessions: insert own" on public.study_sessions
  for insert with check (user_id = auth.uid() and active_seconds = 0);

drop policy if exists "sessions: update own" on public.study_sessions;

-- Heartbeat: adds the seconds since the last beat (capped, so a laptop waking
-- from sleep can't add hours) and stamps last_seen on the profile too.
create or replace function public.session_heartbeat(p_session_id uuid, p_seconds integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.study_sessions
     set active_seconds = active_seconds + least(greatest(p_seconds, 0), 120),
         last_seen_at = now()
   where id = p_session_id and user_id = auth.uid();
  update public.profiles set last_seen_at = now() where id = auth.uid();
end;
$$;

-- ------------------------------------------------------------ activity log --
-- Lab actions (assemble, run, step, opening an assignment, ...). `detail`
-- holds small action-specific data such as an error count.

create table if not exists public.activity_events (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  session_id    uuid references public.study_sessions (id) on delete set null,
  kind          text not null,
  assignment_id text,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists activity_events_user_idx on public.activity_events (user_id, created_at desc);

alter table public.activity_events enable row level security;

drop policy if exists "events: read own or admin" on public.activity_events;
create policy "events: read own or admin" on public.activity_events
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "events: insert own" on public.activity_events;
create policy "events: insert own" on public.activity_events
  for insert with check (user_id = auth.uid());

-- ---------------------------------------------------- assignment attempts --
-- Every "Run Tests" press on a curriculum assignment, with the exact source
-- that was graded, so the instructor can see how a student got there.

create table if not exists public.assignment_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  assignment_id text not null,
  passed_count  integer not null,
  total_count   integer not null,
  assembled     boolean not null,
  passed        boolean generated always as (assembled and total_count > 0 and passed_count = total_count) stored,
  source        text not null,
  created_at    timestamptz not null default now()
);

create index if not exists assignment_attempts_user_idx on public.assignment_attempts (user_id, assignment_id, created_at desc);

alter table public.assignment_attempts enable row level security;

drop policy if exists "attempts: read own or admin" on public.assignment_attempts;
create policy "attempts: read own or admin" on public.assignment_attempts
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "attempts: insert own" on public.assignment_attempts;
create policy "attempts: insert own" on public.assignment_attempts
  for insert with check (user_id = auth.uid() and length(source) <= 50000);

-- -------------------------------------------------------- learning path --
-- Where each student is in each module of the learning path
-- (src/learningPath.ts). Only the current step is stored; a module with
-- assignments counts as done once they are all passed (assignment_attempts),
-- so a student can't mark one done by editing this row. updated_at picks the
-- module the "Continue" card resumes on any device.

create table if not exists public.module_progress (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  module_id  text not null,
  step       text not null check (step in ('concept', 'observe', 'predict', 'task', 'reflect', 'done')),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table public.module_progress enable row level security;

drop policy if exists "module progress: read own or admin" on public.module_progress;
create policy "module progress: read own or admin" on public.module_progress
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "module progress: insert own" on public.module_progress;
create policy "module progress: insert own" on public.module_progress
  for insert with check (user_id = auth.uid());

drop policy if exists "module progress: update own" on public.module_progress;
create policy "module progress: update own" on public.module_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------------ report --
-- One row per student for the admin panel. security_invoker makes the view
-- obey the RLS above, so a student querying it sees only their own row.

create or replace view public.student_summary
with (security_invoker = true) as
select
  p.id,
  p.email,
  p.full_name,
  p.student_no,
  p.class_group,
  p.role,
  p.created_at,
  p.last_seen_at,
  coalesce(s.total_seconds, 0)        as total_seconds,
  coalesce(s.session_count, 0)        as session_count,
  coalesce(a.attempt_count, 0)        as attempt_count,
  coalesce(a.completed_count, 0)      as completed_count,
  coalesce(e.event_count, 0)          as event_count
from public.profiles p
left join (
  select user_id, sum(active_seconds)::bigint as total_seconds, count(*) as session_count
  from public.study_sessions group by user_id
) s on s.user_id = p.id
left join (
  select user_id,
         count(*) as attempt_count,
         count(distinct assignment_id) filter (where passed) as completed_count
  from public.assignment_attempts group by user_id
) a on a.user_id = p.id
left join (
  select user_id, count(*) as event_count from public.activity_events group by user_id
) e on e.user_id = p.id;

-- Per student, per assignment: how many tries, best score, when first passed.
create or replace view public.assignment_progress
with (security_invoker = true) as
select
  user_id,
  assignment_id,
  count(*)                                   as attempt_count,
  max(passed_count)                          as best_passed,
  max(total_count)                           as total_count,
  bool_or(passed)                            as passed,
  min(created_at) filter (where passed)      as first_passed_at,
  max(created_at)                            as last_attempt_at
from public.assignment_attempts
group by user_id, assignment_id;

-- ------------------------------------------------------- making an admin --
-- After signing up on the site with your own email, run (once):
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
