# x86sim (simx86.com)

Browser-based 8086 assembly + hardware simulator used for the undergraduate
Microprocessors lab at Haliç University (instructor: Dr. Murat Adnan Tamer).
Students do their x86 hardware and assembly lab work on the site; the
instructor follows their progress and takes reports from the admin panel.

The repo owner talks in Turkish. Answer in Turkish; keep code, comments,
commit messages and the site's UI text in English (matches the existing code).

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build -- run before every commit/PR
```

There is no test runner or lint config yet; `npm run build` (type check +
bundle) is the gate. For UI changes, run `npm run dev` and check the page.

## Architecture

- Static Vite + React 18 + TypeScript site, deployed to GitHub Pages
  (custom domain via `public/CNAME`) by `.github/workflows/deploy.yml` on every
  push to `main`. **Merging to `main` publishes to students immediately.**
- `src/core/`: assembler, CPU, cycle counts, grader (pure, no React).
- `src/components/`: views; `src/App.tsx` is the top-level layout and flow.
- `src/curriculum.ts`: staged lab assignments with grader test cases.
  `src/hardwareReference.ts`, `src/instructionReference.ts`,
  `src/numberingSystems.ts`: Learn-tab content.
- Accounts / tracking / admin (branch `student-accounts`, PR #8):
  `src/backend/` (Supabase client, auth context, activity tracker),
  `src/components/AccountDialog.tsx`, `src/components/AdminView.tsx`,
  `supabase/schema.sql` (tables, RLS, report views). Setup guide:
  `docs/accounts-setup.md`.

## Rules

- **The repo is public.** Never commit secrets. The site may only use
  Supabase's public anon key, injected at build time from the GitHub repo
  Variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Never use or ask
  for the `service_role` key in frontend code. `.env.local` is git-ignored.
- Every new table gets row-level security: students see only their own rows,
  `public.is_admin()` sees all. Keep `supabase/schema.sql` idempotent
  (re-runnable) and note in the PR that it must be re-run in the Supabase SQL editor.
- Without the Supabase variables the site must keep working with no accounts
  (`backendEnabled === false`).
- Work on a branch, open a PR, merge only after `npm run build` passes and the
  owner agrees; don't push straight to `main`.
- Comments explain *why*, matching the existing density; don't narrate code.

## Where work comes from

Teaching-side planning (what students should learn, lab content, exercise
design, reports the instructor wants) is done in a separate Claude project and
handed over as **GitHub issues labelled `plan`** in this repo. Each issue is a
self-contained spec. Use `/devam` to see the state of things and
`/uygula <issue-no>` to implement one. The owner's own older notes are in
`adminNotes/notes`.
