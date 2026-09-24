-- LeadPilot AI — initial schema
-- Run against a Supabase (Postgres) project via `supabase db push`, the
-- Supabase SQL editor, or `psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql`.
--
-- Design: one row per tenant business in `organizations`; every tenant
-- table carries `org_id` and is locked down with Row Level Security so a
-- signed-in user can only ever see rows belonging to their own org.
-- `profiles.id` = `auth.users.id`, so `auth.uid()` is how we look up the
-- caller's org in every policy below.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  industry text,
  country text,
  timezone text not null default 'UTC',
  currency text not null default 'USD',
  languages text[] not null default '{}',
  website text,
  description text,
  service_areas_note text,
  business_hours jsonb not null default '{}'::jsonb,
  booking_url text,
  contact_email text,
  contact_phone text,
  brand_tone text,
  ai_instructions text,
  automation_mode text not null default 'draft'
    check (automation_mode in ('draft', 'safe_autopilot', 'autopilot')),
  onboarding_completed boolean not null default false,
  plan text not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_slug_idx on organizations (slug);

-- ---------------------------------------------------------------------------
-- profiles (one per auth user, links a user to an org)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid references organizations (id) on delete set null,
  email text not null,
  role text not null default 'owner' check (role in ('owner', 'agent')),
  full_name text,
  created_at timestamptz not null default now()
);

create index profiles_org_id_idx on profiles (org_id);

-- Auto-create a profile row whenever a new Supabase Auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- business knowledge
-- ---------------------------------------------------------------------------
create table services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  description text,
  pricing_note text,
  created_at timestamptz not null default now()
);
create index services_org_id_idx on services (org_id);

create table service_areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  area text not null,
  created_at timestamptz not null default now()
);
create index service_areas_org_id_idx on service_areas (org_id);

create table faqs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);
create index faqs_org_id_idx on faqs (org_id);

create table qualification_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  question text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index qualification_questions_org_id_idx on qualification_questions (org_id);

create table pricing_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  rule text not null,
  created_at timestamptz not null default now()
);
create index pricing_rules_org_id_idx on pricing_rules (org_id);

create table followup_settings (
  org_id uuid primary key references organizations (id) on delete cascade,
  first_delay_hours int not null default 24,
  second_delay_hours int not null default 72,
  max_followups int not null default 2,
  allowed_start_hour int not null default 9,
  allowed_end_hour int not null default 18,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- leads / conversations / messages
-- ---------------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  source text not null default 'public_form',
  stage text not null default 'new' check (stage in (
    'new', 'contacted', 'needs_information', 'qualified',
    'quote_requested', 'booking_ready', 'won', 'lost', 'human_review'
  )),
  qualification_status text not null default 'new' check (qualification_status in (
    'new', 'needs_information', 'qualified', 'quote_requested', 'booking_ready', 'human_required'
  )),
  language text,
  intent text,
  requested_service text,
  urgency text check (urgency in ('low', 'medium', 'high')),
  sentiment text,
  opted_out boolean not null default false,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_org_id_idx on leads (org_id);
create index leads_org_stage_idx on leads (org_id, stage);
create unique index leads_org_idempotency_idx on leads (org_id, idempotency_key)
  where idempotency_key is not null;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'human_takeover', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_org_id_idx on conversations (org_id);
create index conversations_lead_id_idx on conversations (lead_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender text not null check (sender in ('customer', 'ai', 'human')),
  content text not null,
  language text,
  pending_approval boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_org_id_idx on messages (org_id);
create index messages_conversation_id_idx on messages (conversation_id);

-- ---------------------------------------------------------------------------
-- follow-ups
-- ---------------------------------------------------------------------------
create table followup_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  attempt_number int not null default 1,
  run_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'cancelled', 'failed')),
  cancel_reason text,
  created_at timestamptz not null default now()
);
create index followup_jobs_org_id_idx on followup_jobs (org_id);
create index followup_jobs_due_idx on followup_jobs (status, run_at);
create index followup_jobs_lead_id_idx on followup_jobs (lead_id);

-- ---------------------------------------------------------------------------
-- activity log / audit trail
-- ---------------------------------------------------------------------------
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid references leads (id) on delete set null,
  actor text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_org_id_idx on activity_log (org_id);
create index activity_log_created_at_idx on activity_log (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- approvals (DRAFT / SAFE_AUTOPILOT pending replies)
-- ---------------------------------------------------------------------------
create table approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  message_id uuid not null references messages (id) on delete cascade,
  draft_content text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'edited')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index approvals_org_id_idx on approvals (org_id);
create index approvals_status_idx on approvals (org_id, status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table services enable row level security;
alter table service_areas enable row level security;
alter table faqs enable row level security;
alter table qualification_questions enable row level security;
alter table pricing_rules enable row level security;
alter table followup_settings enable row level security;
alter table leads enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table followup_jobs enable row level security;
alter table activity_log enable row level security;
alter table approvals enable row level security;

-- profiles: a user can read/update only their own row.
create policy profiles_select_own on profiles for select
  using (id = auth.uid());
create policy profiles_update_own on profiles for update
  using (id = auth.uid());

-- organizations: visible/editable only to profiles belonging to that org.
create policy organizations_select on organizations for select
  using (id = (select org_id from profiles where id = auth.uid()));
create policy organizations_update on organizations for update
  using (id = (select org_id from profiles where id = auth.uid()));
-- Insert is allowed for any authenticated user completing onboarding for
-- themselves; the app then links profiles.org_id to the new row via a
-- server action running as that same user.
create policy organizations_insert on organizations for insert
  with check (auth.uid() is not null);

-- Generic tenant policy, repeated per table: full access iff org_id matches
-- the caller's own org.
create policy services_all on services for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy service_areas_all on service_areas for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy faqs_all on faqs for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy qualification_questions_all on qualification_questions for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy pricing_rules_all on pricing_rules for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy followup_settings_all on followup_settings for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy leads_all on leads for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy conversations_all on conversations for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy messages_all on messages for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy followup_jobs_all on followup_jobs for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy activity_log_select on activity_log for select
  using (org_id = (select org_id from profiles where id = auth.uid()));
-- activity_log rows are written by the server (service role) or via
-- definer functions only; no direct client insert policy.

create policy approvals_all on approvals for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

-- Deliberately NO anon/public SELECT policy on `organizations`. RLS is
-- row-level, not column-level — an "anyone can read" policy here would
-- also expose contact_email, ai_instructions, etc. to any visitor, which
-- violates tenant settings isolation. Instead, the public /contact/[slug]
-- page is rendered server-side using the service-role client and selects
-- only the specific public-safe columns (slug, name, description,
-- languages, brand_tone, booking_url) — see app/contact/[slug]/page.tsx.
