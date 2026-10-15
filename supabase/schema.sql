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
  step       text not null check (step in ('concept', 'observe', 'predict', 'task', 'quiz', 'reflect', 'done')),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

-- `create table if not exists` leaves an older table's check as it was, so
-- replace it to allow the 'quiz' step (#20).
alter table public.module_progress drop constraint if exists module_progress_step_check;
alter table public.module_progress add constraint module_progress_step_check
  check (step in ('concept', 'observe', 'predict', 'task', 'quiz', 'reflect', 'done'));

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

-- ------------------------------------------------------- module quizzes --
-- Modules that close with a quiz (Module 0, issue #20): the Learn pages a
-- student marked as read, which unlock the quiz, the question pool, and
-- every attempt with its answers ([{question_id, chosen, correct}]) for the
-- admin's "most missed questions". A module counts as done only with a
-- passed attempt.
--
-- The questions and their answers live only in quiz_questions, which only
-- admins can read; they are loaded from a private seed file in the SQL
-- editor, never from this public repo. Students get questions without
-- answers from quiz_draw() and are graded by quiz_submit(), which is also
-- the only way to write a quiz_attempts row, so a pass can't be faked.

create table if not exists public.concept_reads (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  module_id  text not null,
  concept_id text not null,
  read_at    timestamptz not null default now(),
  primary key (user_id, module_id, concept_id)
);

alter table public.concept_reads enable row level security;

drop policy if exists "concept reads: read own or admin" on public.concept_reads;
create policy "concept reads: read own or admin" on public.concept_reads
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "concept reads: insert own" on public.concept_reads;
create policy "concept reads: insert own" on public.concept_reads
  for insert with check (user_id = auth.uid());

create table if not exists public.quiz_attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  module_id  text not null,
  score      integer not null check (score >= 0),
  total      integer not null check (total > 0),
  passed     boolean not null,
  answers    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (score <= total)
);

create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, module_id, created_at desc);

alter table public.quiz_attempts enable row level security;

drop policy if exists "quiz attempts: read own or admin" on public.quiz_attempts;
create policy "quiz attempts: read own or admin" on public.quiz_attempts
  for select using (user_id = auth.uid() or public.is_admin());

-- No insert policy: attempts are written by quiz_submit() only.
drop policy if exists "quiz attempts: insert own" on public.quiz_attempts;

create table if not exists public.quiz_questions (
  id            text primary key,
  module_id     text not null,
  topic_id      text not null,
  question      text not null,
  options       jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  correct_index integer not null check (correct_index >= 0),
  explanation   text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  check (correct_index < jsonb_array_length(options))
);

create index if not exists quiz_questions_module_idx on public.quiz_questions (module_id) where active;

alter table public.quiz_questions enable row level security;

-- Admins read the pool (question text for the report); nobody writes it
-- from the browser -- the seed file runs in the SQL editor.
drop policy if exists "quiz questions: admin reads" on public.quiz_questions;
create policy "quiz questions: admin reads" on public.quiz_questions
  for select using (public.is_admin());

-- One attempt's questions, answers left out: one per topic, the rest of the
-- 10 at random, questions and options in random order.
create or replace function public.quiz_draw(p_module text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to take the quiz';
  end if;
  with pool as (
    select * from public.quiz_questions where module_id = p_module and active
  ), firsts as (
    select distinct on (topic_id) id from pool order by topic_id, random()
  ), rest as (
    select id from pool where id not in (select id from firsts)
    order by random()
    limit greatest(0, 10 - (select count(*) from firsts))
  ), picked as (
    select id from firsts union all select id from rest
  )
  select jsonb_agg(
           jsonb_build_object(
             'id', q.id,
             'topic', q.topic_id,
             'question', q.question,
             'options', (select jsonb_agg(o order by random()) from jsonb_array_elements_text(q.options) o)
           ) order by random())
    into result
    from pool q join picked using (id);
  return coalesce(result, '[]'::jsonb);
end;
$$;

-- Grades an attempt (p_answers = [{question_id, chosen}], chosen = the
-- option text), records it, and returns the score. The right answers and
-- explanations come back only on a pass, so a retake can't be looked up.
create or replace function public.quiz_submit(p_module text, p_answers jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  graded jsonb;
  v_total integer;
  v_score integer;
  v_passed boolean;
  v_expected integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to take the quiz';
  end if;
  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers must be a list';
  end if;
  select least(10, count(*)) into v_expected
    from public.quiz_questions where module_id = p_module and active;

  with given as (
    select a ->> 'question_id' as question_id, a ->> 'chosen' as chosen, ord
      from jsonb_array_elements(p_answers) with ordinality as t(a, ord)
  ), checked as (
    select g.ord, q.id, g.chosen,
           g.chosen = q.options ->> q.correct_index as correct,
           q.options ->> q.correct_index as answer,
           q.explanation
      from given g
      join public.quiz_questions q on q.id = g.question_id and q.module_id = p_module and q.active
  )
  select jsonb_agg(jsonb_build_object('question_id', id, 'chosen', chosen, 'correct', correct,
                                      'answer', answer, 'explanation', explanation) order by ord),
         count(*), count(*) filter (where correct)
    into graded, v_total, v_score
    from checked;

  if v_total is distinct from v_expected
     or v_total <> jsonb_array_length(p_answers)
     or v_total <> (select count(distinct a ->> 'question_id') from jsonb_array_elements(p_answers) a) then
    raise exception 'Answer every question of one quiz exactly once';
  end if;

  -- 7 of 10 to pass.
  v_passed := v_score * 10 >= v_total * 7;

  insert into public.quiz_attempts (user_id, module_id, score, total, passed, answers)
  values (
    auth.uid(), p_module, v_score, v_total, v_passed,
    (select jsonb_agg(jsonb_build_object('question_id', x ->> 'question_id', 'chosen', x ->> 'chosen',
                                         'correct', (x ->> 'correct')::boolean))
       from jsonb_array_elements(graded) x)
  );

  return jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'passed', v_passed,
    'answers', case when v_passed then graded
                    else (select jsonb_agg(x - 'answer' - 'explanation') from jsonb_array_elements(graded) x) end
  );
end;
$$;

revoke all on function public.quiz_draw(text) from public, anon;
revoke all on function public.quiz_submit(text, jsonb) from public, anon;
grant execute on function public.quiz_draw(text) to authenticated;
grant execute on function public.quiz_submit(text, jsonb) to authenticated;

-- ---------------------------------------------------------------- feedback --
-- Problems and requests sent from the site's Feedback button, read in the
-- admin panel's inbox. Visitors who aren't signed in may send too (user_id
-- null), but nobody can send in someone else's name, and only admins can
-- read every message or change its status.

create table if not exists public.feedback (
  id            bigint generated always as identity primary key,
  user_id       uuid references public.profiles (id) on delete set null,
  kind          text not null check (kind in ('bug', 'suggestion', 'question', 'other')),
  message       text not null check (length(message) between 1 and 5000),
  reply_email   text check (length(reply_email) <= 200),
  code          text check (length(code) <= 20000),
  context       jsonb not null default '{}'::jsonb,
  user_agent    text check (length(user_agent) <= 300),
  status        text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at    timestamptz not null default now()
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "feedback: insert own or anonymous" on public.feedback;
create policy "feedback: insert own or anonymous" on public.feedback
  for insert with check (
    (user_id is null or user_id = auth.uid())
    and status = 'new'
    and length(context::text) <= 2000
  );

drop policy if exists "feedback: read own or admin" on public.feedback;
create policy "feedback: read own or admin" on public.feedback
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "feedback: admin updates" on public.feedback;
create policy "feedback: admin updates" on public.feedback
  for update using (public.is_admin()) with check (public.is_admin());

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
