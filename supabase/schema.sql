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

-- First sign-in (#14): when the tour was done, the placement score (0-8,
-- null if skipped) and whether it counted Module 0 as done (6+ and the
-- student chose to start at Module 1).
alter table public.profiles add column if not exists onboarded_at timestamptz;
alter table public.profiles add column if not exists placement_score integer check (placement_score between 0 and 8);
alter table public.profiles add column if not exists placement_credit boolean not null default false;

-- Creates the profile row once someone's email is confirmed (#62), so an
-- unconfirmed sign-up never shows up as a registered student. The name /
-- student number come from the sign-up form via `options.data`
-- (auth.users.raw_user_meta_data), which is kept until confirmation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
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

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_new_user();

-- Accounts opened before #62 got a profile without confirming; they stay
-- valid, so mark them confirmed once. The fixed cut-off keeps a later re-run
-- from confirming new sign-ups (which have no profile anyway).
update auth.users u
set email_confirmed_at = now()
where u.email_confirmed_at is null
  and u.created_at < '2026-10-26 00:00:00+03'
  and exists (select 1 from public.profiles p where p.id = u.id);

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
    -- The placement test is taken once.
    if old.onboarded_at is not null then
      new.onboarded_at := old.onboarded_at;
      new.placement_score := old.placement_score;
      new.placement_credit := old.placement_credit;
    end if;
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
-- quiz_settings holds each quiz's size, pass mark and checklist (#25).

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

-- A short program shown under a question, for code-tracing questions (#25).
alter table public.quiz_questions add column if not exists code text;

alter table public.quiz_questions enable row level security;

-- Admins read the pool (question text for the report); nobody writes it
-- from the browser -- the seed file runs in the SQL editor.
drop policy if exists "quiz questions: admin reads" on public.quiz_questions;
create policy "quiz questions: admin reads" on public.quiz_questions
  for select using (public.is_admin());

-- Interactive items on a module's checklist that a student finished (#25):
-- stepping through a view, running a demo or an example to its end, solving
-- a challenge. item_id matches LearningModule.interactives in the site code.
create table if not exists public.interactive_runs (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  module_id text not null,
  item_id   text not null,
  done_at   timestamptz not null default now(),
  primary key (user_id, module_id, item_id)
);

alter table public.interactive_runs enable row level security;

drop policy if exists "interactive runs: read own or admin" on public.interactive_runs;
create policy "interactive runs: read own or admin" on public.interactive_runs
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "interactive runs: insert own" on public.interactive_runs;
create policy "interactive runs: insert own" on public.interactive_runs
  for insert with check (user_id = auth.uid());

-- Every Check on a Predict-step question (#11), right or wrong, so the
-- instructor sees which ideas don't stick. question_id matches the ids in
-- src/predictQuestions.ts. source = 'review' is for later review cards (#15).
create table if not exists public.predictions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  module_id   text not null,
  question_id text not null,
  answer      text not null,
  correct     boolean not null,
  source      text not null default 'predict' check (source in ('predict', 'review')),
  created_at  timestamptz not null default now()
);

create index if not exists predictions_user_idx on public.predictions (user_id, module_id);
create index if not exists predictions_question_idx on public.predictions (question_id);

alter table public.predictions enable row level security;

drop policy if exists "predictions: read own or admin" on public.predictions;
create policy "predictions: read own or admin" on public.predictions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "predictions: insert own" on public.predictions;
create policy "predictions: insert own" on public.predictions
  for insert with check (user_id = auth.uid());

-- When each learning-path module opens and is due (#13). A row is for every
-- group (class_group null), one group, or one student (user_id: an
-- extension that overrides the group's dates). Students read the rows that
-- can apply to anyone plus their own; only the admin writes.
create table if not exists public.module_schedule (
  id          bigint generated always as identity primary key,
  module_id   text not null,
  class_group text,
  user_id     uuid references public.profiles (id) on delete cascade,
  opens_at    timestamptz,
  due_at      timestamptz,
  updated_at  timestamptz not null default now()
);

create unique index if not exists module_schedule_target_idx
  on public.module_schedule (module_id, coalesce(class_group, ''), coalesce(user_id::text, ''));

alter table public.module_schedule enable row level security;

drop policy if exists "schedule: read shared, own or admin" on public.module_schedule;
create policy "schedule: read shared, own or admin" on public.module_schedule
  for select using (user_id is null or user_id = auth.uid() or public.is_admin());

drop policy if exists "schedule: admin writes" on public.module_schedule;
create policy "schedule: admin writes" on public.module_schedule
  for all using (public.is_admin()) with check (public.is_admin());

-- The instructor's notes under a student's test run (#13). The student reads
-- the ones on their own attempts; nobody else's.
create table if not exists public.attempt_comments (
  id          bigint generated always as identity primary key,
  attempt_id  bigint not null references public.assignment_attempts (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists attempt_comments_attempt_idx on public.attempt_comments (attempt_id);

alter table public.attempt_comments enable row level security;

drop policy if exists "attempt comments: read own attempts or admin" on public.attempt_comments;
create policy "attempt comments: read own attempts or admin" on public.attempt_comments
  for select using (
    public.is_admin()
    or exists (select 1 from public.assignment_attempts a where a.id = attempt_id and a.user_id = auth.uid())
  );

drop policy if exists "attempt comments: admin writes" on public.attempt_comments;
create policy "attempt comments: admin writes" on public.attempt_comments
  for all using (public.is_admin()) with check (public.is_admin() and author_id = auth.uid());

-- The optional one-sentence reflection at the end of a module (#16). Only
-- the student and the admin can read it.
create table if not exists public.reflections (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  module_id   text not null,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);

create index if not exists reflections_module_idx on public.reflections (module_id, created_at desc);

alter table public.reflections enable row level security;

drop policy if exists "reflections: read own or admin" on public.reflections;
create policy "reflections: read own or admin" on public.reflections
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "reflections: insert own" on public.reflections;
create policy "reflections: insert own" on public.reflections
  for insert with check (user_id = auth.uid());

-- Per-module quiz rules, read by quiz_draw / quiz_submit so a student can't
-- change them from the browser. required_* is the module's checklist: the
-- quiz opens only when every concept is read, every interactive done and
-- every assignment passed. Without a row: 10 questions, 1 per topic, 7 to
-- pass, nothing required.
create table if not exists public.quiz_settings (
  module_id             text primary key,
  question_count        integer not null default 10 check (question_count > 0),
  min_per_topic         integer not null default 1 check (min_per_topic >= 0),
  pass_count            integer not null default 7 check (pass_count > 0),
  required_concepts     text[] not null default '{}',
  required_interactives text[] not null default '{}',
  required_assignments  text[] not null default '{}',
  check (pass_count <= question_count)
);

alter table public.quiz_settings enable row level security;

drop policy if exists "quiz settings: admin reads" on public.quiz_settings;
create policy "quiz settings: admin reads" on public.quiz_settings
  for select using (public.is_admin());

drop policy if exists "quiz settings: admin writes" on public.quiz_settings;
create policy "quiz settings: admin writes" on public.quiz_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- The settings the site was built with. "do nothing" keeps any values an
-- admin has changed since; delete a row to get these back.
insert into public.quiz_settings (module_id, question_count, min_per_topic, pass_count,
                                  required_concepts, required_interactives, required_assignments)
values
  ('m0', 10, 1, 7,
   array['bases', 'conversions', 'signed-numbers', 'literals', 'add-sub', 'mul-div', 'logic'],
   array[]::text[], array[]::text[]),
  ('m1', 10, 3, 7,
   array['fetch-decode-execute', 'register-file', 'data-movement'],
   array['fde-program', 'register-file-demo', 'move-it-1', 'move-it-2', 'move-it-3', 'move-it-4', 'move-it-5',
         'example-arithmetic'],
   array['t1-sensor-registers', 't2-swap-readings']),
  ('m11', 10, 3, 7,
   array['ppi-8255-overview', 'ppi-8255-control-word', 'ppi-8255-bsr'],
   array['ppi-cw-1', 'ppi-cw-2', 'ppi-cw-3', 'ppi-bsr-set', 'ppi-bsr-reset'],
   array['t16-ppi-config', 't17-switch-count', 't18-bsr-alarm']),
  ('m12', 10, 3, 7,
   array['program-segments', 'addressing-modes', 'byte-order'],
   array['seg-practice-1', 'seg-practice-2', 'seg-practice-3', 'seg-practice-4', 'seg-practice-5',
         'ea-preset-1', 'ea-preset-2', 'ea-preset-3', 'ea-preset-4', 'byte-layout-value', 'byte-layout-dump'],
   array['t19-store-little-endian', 't20-network-order', 't21-table-lookup']),
  ('m13', 10, 2, 7,
   array['interrupt-types', 'interrupt-vector-table', 'interrupt-sequence', 'pic-8259'],
   array['ivt-calc-1', 'ivt-calc-2', 'ivt-calc-3', 'interrupt-sequence-figure', 'pic-served', 'pic-masked', 'pic-eoi'],
   array['t22-pic-mask', 't23-ivt-entry', 't24-isr-address'])
on conflict (module_id) do nothing;

-- Whether the signed-in student has done everything the quiz requires.
create or replace function public.quiz_ready(p_module text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not exists (
    select 1 from public.quiz_settings s
     where s.module_id = p_module
       and (
         exists (select 1 from unnest(s.required_concepts) c
                  where not exists (select 1 from public.concept_reads r
                                     where r.user_id = auth.uid() and r.module_id = p_module and r.concept_id = c))
         or exists (select 1 from unnest(s.required_interactives) i
                     where not exists (select 1 from public.interactive_runs r
                                        where r.user_id = auth.uid() and r.module_id = p_module and r.item_id = i))
         or exists (select 1 from unnest(s.required_assignments) a
                     where not exists (select 1 from public.assignment_attempts t
                                        where t.user_id = auth.uid() and t.assignment_id = a and t.passed))
       )
  );
$$;

-- One attempt's questions, answers left out: at least min_per_topic from
-- every topic, the rest at random, questions and options in random order.
create or replace function public.quiz_draw(p_module text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  result jsonb;
  v_count integer;
  v_min integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to take the quiz';
  end if;
  if not public.quiz_ready(p_module) then
    raise exception 'Finish every item on the checklist first';
  end if;
  select coalesce(max(question_count), 10), coalesce(max(min_per_topic), 1)
    into v_count, v_min
    from public.quiz_settings where module_id = p_module;

  with pool as (
    select *, row_number() over (partition by topic_id order by random()) as topic_rank
      from public.quiz_questions where module_id = p_module and active
  ), firsts as (
    select id from pool where topic_rank <= v_min
  ), rest as (
    select id from pool where id not in (select id from firsts)
    order by random()
    limit greatest(0, v_count - (select count(*) from firsts))
  ), picked as (
    select id from firsts union all select id from rest
  )
  select jsonb_agg(
           jsonb_build_object(
             'id', q.id,
             'topic', q.topic_id,
             'question', q.question,
             'code', q.code,
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
  v_count integer;
  v_pass integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to take the quiz';
  end if;
  if not public.quiz_ready(p_module) then
    raise exception 'Finish every item on the checklist first';
  end if;
  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers must be a list';
  end if;
  select coalesce(max(question_count), 10), coalesce(max(pass_count), 7)
    into v_count, v_pass
    from public.quiz_settings where module_id = p_module;
  select least(v_count, count(*)) into v_expected
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

  -- pass_count of question_count (7 of 10), scaled if the pool is smaller.
  v_passed := v_score * v_count >= v_pass * v_total;

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
revoke all on function public.quiz_ready(text) from public, anon;
grant execute on function public.quiz_ready(text) to authenticated;

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

-- Replies (#64): the instructor and the student who sent the feedback can
-- write under it, and the student sees status changes and replies on the
-- site. status_changed_at is when an admin last changed the status;
-- student_read_at is when the student last opened it. Anything newer than
-- student_read_at is unread for the student.
alter table public.feedback add column if not exists status_changed_at timestamptz;
alter table public.feedback add column if not exists student_read_at timestamptz;

create or replace function public.feedback_status_stamp()
returns trigger
language plpgsql
as $$
begin
  -- Only an admin's change notifies the student; the reopen caused by the
  -- student's own reply (feedback_message_reopen) runs as the student.
  if new.status is distinct from old.status and public.is_admin() then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_status_stamp on public.feedback;
create trigger feedback_status_stamp
  before update on public.feedback
  for each row execute function public.feedback_status_stamp();

-- Students can't update feedback rows, so this is how they mark their own as read.
create or replace function public.mark_feedback_read(p_id bigint)
returns void
language sql
security definer set search_path = public
as $$
  update public.feedback set student_read_at = now()
   where id = p_id and user_id = auth.uid();
$$;

revoke all on function public.mark_feedback_read(bigint) from public, anon;
grant execute on function public.mark_feedback_read(bigint) to authenticated;

create table if not exists public.feedback_messages (
  id          bigint generated always as identity primary key,
  feedback_id bigint not null references public.feedback (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  body        text not null check (length(body) between 1 and 5000),
  created_at  timestamptz not null default now()
);

create index if not exists feedback_messages_feedback_idx on public.feedback_messages (feedback_id, created_at);

alter table public.feedback_messages enable row level security;

drop policy if exists "feedback_messages: read own or admin" on public.feedback_messages;
create policy "feedback_messages: read own or admin" on public.feedback_messages
  for select using (
    public.is_admin()
    or exists (select 1 from public.feedback f where f.id = feedback_id and f.user_id = auth.uid())
  );

-- Feedback sent without an account has nobody to answer on the site.
drop policy if exists "feedback_messages: insert own or admin" on public.feedback_messages;
create policy "feedback_messages: insert own or admin" on public.feedback_messages
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.feedback f
       where f.id = feedback_id
         and f.user_id is not null
         and (f.user_id = auth.uid() or public.is_admin())
    )
  );

-- A student's reply puts the feedback back at the top of the admin inbox.
create or replace function public.feedback_message_reopen()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    update public.feedback set status = 'new' where id = new.feedback_id and status <> 'new';
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_message_reopen on public.feedback_messages;
create trigger feedback_message_reopen
  after insert on public.feedback_messages
  for each row execute function public.feedback_message_reopen();

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
  coalesce(e.event_count, 0)          as event_count,
  p.placement_score,
  p.placement_credit
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

-- Students who were already on the learning path before the tour existed
-- don't get it now; only accounts that haven't started anything do (#14).
update public.profiles p set onboarded_at = p.created_at
 where p.onboarded_at is null
   and exists (select 1 from public.module_progress mp where mp.user_id = p.id);

-- ------------------------------------------------------- making an admin --
-- After signing up on the site with your own email, run (once):
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
