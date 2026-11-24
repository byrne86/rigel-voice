-- Rigel Voice schema. Run this once in the Supabase SQL editor.
create extension if not exists pgcrypto;

-- ---------- Organisations and users ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  -- New companies cannot place calls until you switch this on (stops strangers running up your Twilio bill).
  calling_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  full_name text,
  email text,
  role text not null default 'agent' check (role in ('owner', 'manager', 'agent')),
  created_at timestamptz not null default now()
);

create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'manager'))
$$;

-- ---------- Scorecard templates ----------
create table public.scorecard_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations on delete cascade,
  name text not null,
  description text,
  -- [{ "id": "greeting", "name": "...", "description": "...", "max_points": 10 }]
  criteria jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Campaigns and contacts ----------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations on delete cascade,
  name text not null,
  mode text not null default 'agent' check (mode in ('agent', 'broadcast')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  caller_id text,
  script text,
  voicemail_message text,
  broadcast_message text,
  tts_voice text not null default 'Polly.Amy-Neural',
  max_attempts int not null default 3,
  retry_minutes int not null default 240,
  record_calls boolean not null default true,
  default_country text not null default 'IE',
  scorecard_template_id uuid references public.scorecard_templates on delete set null,
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  first_name text,
  last_name text,
  company text,
  phone text not null,
  email text,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'retry', 'completed', 'dnc', 'failed')),
  attempts int not null default 0,
  last_disposition text,
  assigned_to uuid references public.profiles on delete set null,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, phone)
);
create index contacts_queue_idx on public.contacts (campaign_id, status, next_attempt_at);

create table public.dnc_numbers (
  org_id uuid not null default public.current_org_id() references public.organizations on delete cascade,
  phone text not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (org_id, phone)
);

-- ---------- Calls, transcripts, scorecards ----------
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations on delete cascade,
  campaign_id uuid references public.campaigns on delete set null,
  contact_id uuid references public.contacts on delete set null,
  agent_id uuid references public.profiles on delete set null,
  kind text not null default 'agent' check (kind in ('agent', 'broadcast')),
  to_number text not null,
  from_number text,
  twilio_call_sid text,
  twilio_child_sid text,
  status text not null default 'initiated',
  answered_by text,
  duration_seconds int,
  recording_sid text,
  recording_url text,
  recording_duration int,
  disposition text,
  notes text,
  processing_status text not null default 'none'
    check (processing_status in ('none', 'pending', 'transcribing', 'scoring', 'done', 'skipped', 'failed')),
  processing_error text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index calls_org_created_idx on public.calls (org_id, created_at desc);
create index calls_campaign_idx on public.calls (campaign_id);

create table public.transcripts (
  call_id uuid primary key references public.calls on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  text text not null,
  -- [{ "speaker": "Agent" | "Customer", "start": 1.2, "end": 3.4, "text": "..." }]
  utterances jsonb not null default '[]'::jsonb,
  provider text,
  created_at timestamptz not null default now()
);

create table public.scorecards (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  template_id uuid references public.scorecard_templates on delete set null,
  total_score numeric not null default 0,
  max_score numeric not null default 0,
  percent numeric not null default 0,
  summary text,
  sentiment text,
  -- [{ "criterion_id", "name", "score", "max_points", "evidence", "comment" }]
  results jsonb not null default '[]'::jsonb,
  coaching jsonb not null default '[]'::jsonb,
  compliance_flags jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);

-- ---------- New user signup: create or join an organisation ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_role text := 'agent';
  v_code text := nullif(trim(new.raw_user_meta_data->>'join_code'), '');
begin
  if v_code is not null then
    select id into v_org from public.organizations where join_code = lower(v_code);
    if v_org is null then
      raise exception 'Invalid team join code';
    end if;
  else
    insert into public.organizations (name)
    values (coalesce(nullif(trim(new.raw_user_meta_data->>'org_name'), ''), 'My organisation'))
    returning id into v_org;
    v_role := 'owner';

    insert into public.scorecard_templates (org_id, name, description, criteria)
    values (v_org, 'Standard sales call', 'Default quality scorecard for outbound sales calls', '[
      {"id":"greeting","name":"Greeting and introduction","description":"Agent greets politely, gives their name and company, and states the reason for the call.","max_points":10},
      {"id":"compliance","name":"Compliance","description":"Agent tells the customer the call is recorded and respects any request not to be contacted.","max_points":15,"critical":true},
      {"id":"discovery","name":"Needs discovery","description":"Agent asks relevant open questions and listens to understand the customer''s situation.","max_points":20},
      {"id":"product","name":"Product knowledge","description":"Agent explains the offer accurately and clearly, matched to the customer''s needs.","max_points":20},
      {"id":"objections","name":"Objection handling","description":"Agent acknowledges objections and responds calmly and credibly without pressure.","max_points":15},
      {"id":"close","name":"Close and next steps","description":"Agent asks for a commitment or agrees a clear next step, and confirms details.","max_points":10},
      {"id":"tone","name":"Tone and professionalism","description":"Agent is courteous, clear and confident throughout; no interrupting or talking over.","max_points":10}
    ]'::jsonb);
  end if;

  insert into public.profiles (id, org_id, full_name, email, role)
  values (new.id, v_org, new.raw_user_meta_data->>'full_name', new.email, v_role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Dialer queue ----------
-- Hands the calling agent the next contact to dial. Safe with many agents on one campaign.
create or replace function public.claim_next_contact(p_campaign uuid) returns setof public.contacts
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null then
    raise exception 'Not signed in';
  end if;
  return query
  update public.contacts set
    status = 'in_progress',
    assigned_to = auth.uid(),
    attempts = attempts + 1,
    last_attempt_at = now()
  where id = (
    select c.id
    from public.contacts c
    join public.campaigns ca on ca.id = c.campaign_id
    where c.campaign_id = p_campaign
      and c.org_id = v_org
      and ca.status = 'active'
      and c.attempts < ca.max_attempts
      and (
        (c.status in ('pending', 'retry') and (c.next_attempt_at is null or c.next_attempt_at <= now()))
        -- contacts abandoned mid-call (browser closed) go back in the queue after 30 minutes
        or (c.status = 'in_progress' and c.last_attempt_at < now() - interval '30 minutes')
      )
      and not exists (select 1 from public.dnc_numbers d where d.org_id = c.org_id and d.phone = c.phone)
    order by c.next_attempt_at nulls last, c.created_at
    limit 1
    for update of c skip locked
  )
  returning *;
end;
$$;

-- Server-only: claims a batch for AI voice broadcast campaigns.
create or replace function public.claim_contacts_batch(p_campaign uuid, p_org uuid, p_limit int)
returns setof public.contacts
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.contacts set
    status = 'in_progress',
    attempts = attempts + 1,
    last_attempt_at = now()
  where id in (
    select c.id
    from public.contacts c
    join public.campaigns ca on ca.id = c.campaign_id
    where c.campaign_id = p_campaign
      and c.org_id = p_org
      and c.attempts < ca.max_attempts
      and c.status in ('pending', 'retry')
      and (c.next_attempt_at is null or c.next_attempt_at <= now())
      and not exists (select 1 from public.dnc_numbers d where d.org_id = c.org_id and d.phone = c.phone)
    order by c.next_attempt_at nulls last, c.created_at
    limit greatest(1, least(p_limit, 50))
    for update of c skip locked
  )
  returning *;
end;
$$;
revoke execute on function public.claim_contacts_batch(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.claim_next_contact(uuid) from public, anon;
grant execute on function public.claim_next_contact(uuid) to authenticated;
grant execute on function public.claim_contacts_batch(uuid, uuid, int) to service_role;

-- ---------- Row level security: every row is private to its organisation ----------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.scorecard_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.contacts enable row level security;
alter table public.dnc_numbers enable row level security;
alter table public.calls enable row level security;
alter table public.transcripts enable row level security;
alter table public.scorecards enable row level security;

create policy org_read on public.organizations for select using (id = public.current_org_id());
-- No update policy: organisation settings (incl. calling_enabled) are changed by the platform owner only.

create policy profiles_read on public.profiles for select using (org_id = public.current_org_id());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and org_id = public.current_org_id());

create policy templates_read on public.scorecard_templates for select using (org_id = public.current_org_id());
create policy templates_write on public.scorecard_templates for all
  using (org_id = public.current_org_id() and public.is_manager())
  with check (org_id = public.current_org_id() and public.is_manager());

create policy campaigns_read on public.campaigns for select using (org_id = public.current_org_id());
create policy campaigns_write on public.campaigns for all
  using (org_id = public.current_org_id() and public.is_manager())
  with check (org_id = public.current_org_id() and public.is_manager());

create policy contacts_read on public.contacts for select using (org_id = public.current_org_id());
create policy contacts_insert on public.contacts for insert
  with check (org_id = public.current_org_id() and public.is_manager());
create policy contacts_update on public.contacts for update
  using (org_id = public.current_org_id() and public.is_manager())
  with check (org_id = public.current_org_id() and public.is_manager());
create policy contacts_delete on public.contacts for delete
  using (org_id = public.current_org_id() and public.is_manager());

create policy dnc_read on public.dnc_numbers for select using (org_id = public.current_org_id());
create policy dnc_insert on public.dnc_numbers for insert with check (org_id = public.current_org_id());
create policy dnc_delete on public.dnc_numbers for delete
  using (org_id = public.current_org_id() and public.is_manager());

-- Calls are created and changed by the server only, after it has checked the user is allowed.
-- This stops anyone dialling arbitrary numbers or pointing a call at a fake recording URL.
create policy calls_read on public.calls for select using (org_id = public.current_org_id());

-- Transcripts and scorecards are written by the server only (service role bypasses RLS).
create policy transcripts_read on public.transcripts for select using (org_id = public.current_org_id());
create policy scorecards_read on public.scorecards for select using (org_id = public.current_org_id());

-- A user must not be able to promote themselves: role and org are locked for normal users.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_my_role text;
begin
  new.org_id := old.org_id;
  new.id := old.id;
  if auth.uid() is null then
    return new; -- server / SQL editor
  end if;
  select role into v_my_role from public.profiles where id = auth.uid();
  -- Only you can change your own name and email.
  if auth.uid() <> old.id then
    new.full_name := old.full_name;
    new.email := old.email;
  end if;
  -- Agents cannot change roles; managers cannot touch the owner or make anyone owner;
  -- nobody can change their own role.
  if v_my_role = 'agent'
     or auth.uid() = old.id
     or (v_my_role = 'manager' and (old.role = 'owner' or new.role = 'owner')) then
    new.role := old.role;
  end if;
  return new;
end;
$$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

create policy profiles_manage on public.profiles for update
  using (org_id = public.current_org_id() and public.is_manager())
  with check (org_id = public.current_org_id());

-- To let a customer start calling, run (with their organisation id):
--   update public.organizations set calling_enabled = true where id = '...';
alter table public.scorecard_templates add column if not exists pass_mark int not null default 70;
alter table public.scorecards add column if not exists passed boolean;
alter table public.scorecards add column if not exists objections jsonb not null default '[]'::jsonb;
alter table public.scorecards add column if not exists agent_talk_ratio numeric;
create index if not exists scorecards_org_created_idx on public.scorecards (org_id, created_at desc);

create table if not exists public.voicemail_drops (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations on delete cascade,
  name text not null,
  kind text not null default 'tts' check (kind in ('tts', 'audio')),
  message text,
  tts_voice text not null default 'Polly.Amy-Neural',
  audio_path text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  check (kind = 'audio' or message is not null),
  check (kind = 'tts' or audio_path is not null)
);
create unique index if not exists voicemail_drops_one_default on public.voicemail_drops (org_id) where is_default;

alter table public.voicemail_drops enable row level security;
drop policy if exists voicemail_drops_read on public.voicemail_drops;
create policy voicemail_drops_read on public.voicemail_drops for select using (org_id = public.current_org_id());
drop policy if exists voicemail_drops_write on public.voicemail_drops;
create policy voicemail_drops_write on public.voicemail_drops for all
  using (org_id = public.current_org_id() and public.is_manager())
  with check (org_id = public.current_org_id() and public.is_manager());

alter table public.campaigns add column if not exists voicemail_drop_id uuid references public.voicemail_drops on delete set null;
alter table public.calls add column if not exists voicemail_drop_id uuid references public.voicemail_drops on delete set null;

-- Storage for recorded voicemails. Files live under <org id>/..., readable by link (Twilio plays them).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voicemails', 'voicemails', true, 5242880, array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'])
on conflict (id) do nothing;

drop policy if exists voicemails_upload on storage.objects;
create policy voicemails_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'voicemails' and (storage.foldername(name))[1] = public.current_org_id()::text and public.is_manager());
drop policy if exists voicemails_delete on storage.objects;
create policy voicemails_delete on storage.objects for delete to authenticated
  using (bucket_id = 'voicemails' and (storage.foldername(name))[1] = public.current_org_id()::text and public.is_manager());

-- Rigel Voice: call-coach workflow (lists, script approval, personal voicemails,
-- agent access levels, invites, inbound calls, retention, activity log).
-- Safe to run more than once.

-- ---------- Campaign settings ----------
alter table public.campaigns
  add column if not exists ai_context text,
  add column if not exists call_language text not null default 'en',
  add column if not exists feedback_language text not null default 'en',
  add column if not exists recording_disclosure text default 'Just so you know, calls are recorded for training and quality purposes. Is that OK with you?',
  add column if not exists allow_voicemail_drops boolean not null default true,
  add column if not exists crm_note boolean not null default true,
  add column if not exists crm_match_field text,
  add column if not exists crm_match_value text,
  add column if not exists is_default_inbound boolean not null default false,
  add column if not exists ring_agents_on_callback boolean not null default false,
  add column if not exists inbound_fallback text not null default 'voicemail',
  add column if not exists forward_to text,
  add column if not exists ring_seconds int not null default 20,
  add column if not exists script_status text not null default 'draft',
  add column if not exists script_flow jsonb not null default '[]'::jsonb,
  add column if not exists script_objections jsonb not null default '[]'::jsonb,
  add column if not exists script_approved_at timestamptz,
  add column if not exists script_approved_by uuid references public.profiles on delete set null;

-- ---------- Call lists ----------
create table if not exists public.call_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations on delete cascade,
  campaign_id uuid not null references public.campaigns on delete cascade,
  agent_id uuid references public.profiles on delete set null,
  name text not null,
  source text not null default 'upload',
  source_ref text,
  created_at timestamptz not null default now()
);
alter table public.call_lists enable row level security;
drop policy if exists call_lists_read on public.call_lists;
create policy call_lists_read on public.call_lists for select using (org_id = public.current_org_id());
drop policy if exists call_lists_write on public.call_lists;
create policy call_lists_write on public.call_lists for all
  using (org_id = public.current_org_id() and public.is_manager())
  with check (org_id = public.current_org_id() and public.is_manager());

alter table public.contacts add column if not exists list_id uuid references public.call_lists on delete cascade;
create index if not exists contacts_list_idx on public.contacts (list_id, status, next_attempt_at);

-- Power dialling: the next contact in a list for this agent.
create or replace function public.claim_next_from_list(p_list uuid) returns setof public.contacts
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null then raise exception 'Not signed in'; end if;
  return query
  update public.contacts set
    status = 'in_progress', assigned_to = auth.uid(), attempts = attempts + 1, last_attempt_at = now()
  where id = (
    select c.id
    from public.contacts c
    join public.call_lists l on l.id = c.list_id
    join public.campaigns ca on ca.id = c.campaign_id
    where c.list_id = p_list
      and c.org_id = v_org
      and (l.agent_id is null or l.agent_id = auth.uid() or public.is_manager())
      and ca.status = 'active'
      and c.attempts < ca.max_attempts
      and (
        (c.status in ('pending', 'retry') and (c.next_attempt_at is null or c.next_attempt_at <= now()))
        or (c.status = 'in_progress' and c.last_attempt_at < now() - interval '30 minutes')
      )
      and not exists (select 1 from public.dnc_numbers d where d.org_id = c.org_id and d.phone = c.phone)
    order by (c.last_disposition = 'callback') desc nulls last, c.next_attempt_at nulls last, c.created_at
    limit 1
    for update of c skip locked
  )
  returning *;
end;
$$;
revoke execute on function public.claim_next_from_list(uuid) from public, anon;
grant execute on function public.claim_next_from_list(uuid) to authenticated;

-- ---------- Calls ----------
alter table public.calls alter column to_number drop not null;
alter table public.calls
  add column if not exists direction text not null default 'outbound',
  add column if not exists reached_dm boolean not null default false,
  add column if not exists list_id uuid references public.call_lists on delete set null,
  add column if not exists source text not null default 'twilio',
  add column if not exists recording_storage_path text,
  add column if not exists recording_deleted_at timestamptz;

-- Agents see only their own calls; managers see the whole company.
drop policy if exists calls_read on public.calls;
create policy calls_read on public.calls for select
  using (org_id = public.current_org_id() and (public.is_manager() or agent_id = auth.uid()));
drop policy if exists transcripts_read on public.transcripts;
create policy transcripts_read on public.transcripts for select using (
  org_id = public.current_org_id()
  and exists (select 1 from public.calls c where c.id = call_id and (public.is_manager() or c.agent_id = auth.uid())));
drop policy if exists scorecards_read on public.scorecards;
create policy scorecards_read on public.scorecards for select using (
  org_id = public.current_org_id()
  and exists (select 1 from public.calls c where c.id = call_id and (public.is_manager() or c.agent_id = auth.uid())));

-- ---------- Voicemail drops: personal or shared, per campaign ----------
alter table public.voicemail_drops
  add column if not exists owner_id uuid references public.profiles on delete cascade default auth.uid(),
  add column if not exists campaign_id uuid references public.campaigns on delete cascade,
  add column if not exists shared boolean not null default true,
  add column if not exists duration_seconds numeric;

drop policy if exists voicemail_drops_read on public.voicemail_drops;
create policy voicemail_drops_read on public.voicemail_drops for select
  using (org_id = public.current_org_id() and (shared or owner_id = auth.uid() or public.is_manager()));
drop policy if exists voicemail_drops_write on public.voicemail_drops;
create policy voicemail_drops_write on public.voicemail_drops for all
  using (org_id = public.current_org_id() and (public.is_manager() or owner_id = auth.uid()))
  with check (org_id = public.current_org_id() and (public.is_manager() or owner_id = auth.uid()));

-- Agents record their own voicemails into <org>/<user>/...
drop policy if exists voicemails_upload on storage.objects;
create policy voicemails_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'voicemails' and (storage.foldername(name))[1] = public.current_org_id()::text
    and (public.is_manager() or (storage.foldername(name))[2] = auth.uid()::text));
drop policy if exists voicemails_delete on storage.objects;
create policy voicemails_delete on storage.objects for delete to authenticated
  using (bucket_id = 'voicemails' and (storage.foldername(name))[1] = public.current_org_id()::text
    and (public.is_manager() or (storage.foldername(name))[2] = auth.uid()::text));

-- Private bucket for call recordings uploaded by managers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 104857600,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/ogg', 'audio/webm'])
on conflict (id) do nothing;
drop policy if exists recordings_upload on storage.objects;
create policy recordings_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = public.current_org_id()::text and public.is_manager());

-- ---------- Organisation settings ----------
alter table public.organizations add column if not exists recording_retention_days int;

-- ---------- Invites: admins add agents by email ----------
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'agent' check (role in ('owner', 'manager', 'agent')),
  invited_by uuid references public.profiles on delete set null default auth.uid(),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists invites_org_email on public.invites (org_id, lower(email));
alter table public.invites enable row level security;
drop policy if exists invites_manage on public.invites;
create policy invites_manage on public.invites for all
  using (org_id = public.current_org_id() and public.is_manager())
  with check (org_id = public.current_org_id() and public.is_manager() and role <> 'owner');

-- New sign-ups: join code, then a pending invite for their email, else a new company.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_role text := 'agent';
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name');
  v_code text := nullif(trim(new.raw_user_meta_data->>'join_code'), '');
  v_invite public.invites;
begin
  if v_code is not null then
    select id into v_org from public.organizations where join_code = lower(v_code);
    if v_org is null then raise exception 'Invalid team join code'; end if;
  else
    select * into v_invite from public.invites
      where lower(email) = lower(new.email) and accepted_at is null
      order by created_at desc limit 1;
    if v_invite.id is not null then
      v_org := v_invite.org_id;
      v_role := v_invite.role;
      v_name := coalesce(v_name, v_invite.full_name);
      update public.invites set accepted_at = now() where id = v_invite.id;
    else
      insert into public.organizations (name)
      values (coalesce(nullif(trim(new.raw_user_meta_data->>'org_name'), ''), 'My organisation'))
      returning id into v_org;
      v_role := 'owner';
      insert into public.scorecard_templates (org_id, name, description, criteria)
      values (v_org, 'Standard sales call', 'Default quality scorecard for outbound sales calls', '[
        {"id":"greeting","name":"Greeting and introduction","description":"Agent greets politely, gives their name and company, and states the reason for the call.","max_points":10},
        {"id":"compliance","name":"Compliance","description":"Agent tells the customer the call is recorded and respects any request not to be contacted.","max_points":15,"critical":true},
        {"id":"discovery","name":"Needs discovery","description":"Agent asks relevant open questions and listens to understand the customer''s situation.","max_points":20},
        {"id":"product","name":"Product knowledge","description":"Agent explains the offer accurately and clearly, matched to the customer''s needs.","max_points":20},
        {"id":"objections","name":"Objection handling","description":"Agent acknowledges objections and responds calmly and credibly without pressure.","max_points":15},
        {"id":"close","name":"Close and next steps","description":"Agent asks for a commitment or agrees a clear next step, and confirms details.","max_points":10},
        {"id":"tone","name":"Tone and professionalism","description":"Agent is courteous, clear and confident throughout; no interrupting or talking over.","max_points":10}
      ]'::jsonb);
    end if;
  end if;

  insert into public.profiles (id, org_id, full_name, email, role)
  values (new.id, v_org, v_name, new.email, v_role);
  return new;
end;
$$;

-- ---------- Activity log ----------
create table if not exists public.activity_log (
  id bigserial primary key,
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid references public.profiles on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_org_idx on public.activity_log (org_id, created_at desc);
alter table public.activity_log enable row level security;
drop policy if exists activity_read on public.activity_log;
create policy activity_read on public.activity_log for select
  using (org_id = public.current_org_id() and public.is_manager());

-- Sign every member of the company out (managers only). Access tokens expire within the hour.
create or replace function public.sign_out_org() returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  delete from auth.sessions where user_id in (select id from public.profiles where org_id = public.current_org_id());
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.sign_out_org() from public, anon;
grant execute on function public.sign_out_org() to authenticated;
