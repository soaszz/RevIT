-- ==============================================================================
-- Migration: 202610060020_universal_gradebook.sql
-- Description: Universal Gradebook schema supporting multi-subject custom weighted
--              percentage grading alongside existing NU MOA MTAP 1 presets.
-- Backward-compatibility: Leaves public.grades completely untouched.
-- ==============================================================================

-- 1. Gradebooks Table (Subjects / Gradebooks)
create table if not exists public.gradebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject_code text,
  template_type text not null default 'custom' check (template_type in ('nu_moa_mtap1', 'custom')),
  passing_grade numeric(5,2) not null default 75.00 check (passing_grade > 0 and passing_grade <= 100),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Grade Categories Table (e.g. Quizzes, Midterm, Lab, Final)
create table if not exists public.grade_categories (
  id uuid primary key default gen_random_uuid(),
  gradebook_id uuid not null references public.gradebooks(id) on delete cascade,
  name text not null,
  weight numeric(5,2) not null check (weight > 0 and weight <= 100),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Grade Assessments Table (Individual scores under each category)
create table if not exists public.grade_assessments (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.grade_categories(id) on delete cascade,
  name text not null,
  score numeric(7,2) check (score is null or (score >= 0 and (max_score is null or score <= max_score))),
  max_score numeric(7,2) not null check (max_score > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient queries and joins
create index if not exists idx_gradebooks_user_id on public.gradebooks(user_id);
create index if not exists idx_grade_categories_gradebook_id on public.grade_categories(gradebook_id);
create index if not exists idx_grade_assessments_category_id on public.grade_assessments(category_id);

-- Set updated_at trigger helper if function exists
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists gradebooks_set_updated_at on public.gradebooks;
    create trigger gradebooks_set_updated_at before update on public.gradebooks for each row execute function public.set_updated_at();

    drop trigger if exists grade_categories_set_updated_at on public.grade_categories;
    create trigger grade_categories_set_updated_at before update on public.grade_categories for each row execute function public.set_updated_at();

    drop trigger if exists grade_assessments_set_updated_at on public.grade_assessments;
    create trigger grade_assessments_set_updated_at before update on public.grade_assessments for each row execute function public.set_updated_at();
  end if;
end $$;

-- Enable Row Level Security (RLS)
alter table public.gradebooks enable row level security;
alter table public.grade_categories enable row level security;
alter table public.grade_assessments enable row level security;

-- Policies for public.gradebooks (User owns their gradebooks)
drop policy if exists "gradebooks_select_own" on public.gradebooks;
create policy "gradebooks_select_own" on public.gradebooks
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "gradebooks_insert_own" on public.gradebooks;
create policy "gradebooks_insert_own" on public.gradebooks
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "gradebooks_update_own" on public.gradebooks;
create policy "gradebooks_update_own" on public.gradebooks
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "gradebooks_delete_own" on public.gradebooks;
create policy "gradebooks_delete_own" on public.gradebooks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Policies for public.grade_categories (Accessible only if parent gradebook belongs to user)
drop policy if exists "grade_categories_select_own" on public.grade_categories;
create policy "grade_categories_select_own" on public.grade_categories
  for select to authenticated using (
    exists (
      select 1 from public.gradebooks g
      where g.id = grade_categories.gradebook_id and g.user_id = (select auth.uid())
    )
  );

drop policy if exists "grade_categories_insert_own" on public.grade_categories;
create policy "grade_categories_insert_own" on public.grade_categories
  for insert to authenticated with check (
    exists (
      select 1 from public.gradebooks g
      where g.id = grade_categories.gradebook_id and g.user_id = (select auth.uid())
    )
  );

drop policy if exists "grade_categories_update_own" on public.grade_categories;
create policy "grade_categories_update_own" on public.grade_categories
  for update to authenticated using (
    exists (
      select 1 from public.gradebooks g
      where g.id = grade_categories.gradebook_id and g.user_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.gradebooks g
      where g.id = grade_categories.gradebook_id and g.user_id = (select auth.uid())
    )
  );

drop policy if exists "grade_categories_delete_own" on public.grade_categories;
create policy "grade_categories_delete_own" on public.grade_categories
  for delete to authenticated using (
    exists (
      select 1 from public.gradebooks g
      where g.id = grade_categories.gradebook_id and g.user_id = (select auth.uid())
    )
  );

-- Policies for public.grade_assessments (Accessible only if parent category's gradebook belongs to user)
drop policy if exists "grade_assessments_select_own" on public.grade_assessments;
create policy "grade_assessments_select_own" on public.grade_assessments
  for select to authenticated using (
    exists (
      select 1 from public.grade_categories c
      join public.gradebooks g on g.id = c.gradebook_id
      where c.id = grade_assessments.category_id and g.user_id = (select auth.uid())
    )
  );

drop policy if exists "grade_assessments_insert_own" on public.grade_assessments;
create policy "grade_assessments_insert_own" on public.grade_assessments
  for insert to authenticated with check (
    exists (
      select 1 from public.grade_categories c
      join public.gradebooks g on g.id = c.gradebook_id
      where c.id = grade_assessments.category_id and g.user_id = (select auth.uid())
    )
  );

drop policy if exists "grade_assessments_update_own" on public.grade_assessments;
create policy "grade_assessments_update_own" on public.grade_assessments
  for update to authenticated using (
    exists (
      select 1 from public.grade_categories c
      join public.gradebooks g on g.id = c.gradebook_id
      where c.id = grade_assessments.category_id and g.user_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.grade_categories c
      join public.gradebooks g on g.id = c.gradebook_id
      where c.id = grade_assessments.category_id and g.user_id = (select auth.uid())
    )
  );

drop policy if exists "grade_assessments_delete_own" on public.grade_assessments;
create policy "grade_assessments_delete_own" on public.grade_assessments
  for delete to authenticated using (
    exists (
      select 1 from public.grade_categories c
      join public.gradebooks g on g.id = c.gradebook_id
      where c.id = grade_assessments.category_id and g.user_id = (select auth.uid())
    )
  );

-- Permissions
grant select, insert, update, delete on public.gradebooks, public.grade_categories, public.grade_assessments to authenticated;
revoke all on public.gradebooks, public.grade_categories, public.grade_assessments from anon;
