-- Rigel Voice: voicemail drop library (typed AI-voice messages or uploaded recordings).
-- Safe to run more than once.
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

-- Move any per-campaign voicemail messages into the library.
do $$
declare r record; v_id uuid;
begin
  for r in select id, org_id, name, voicemail_message, tts_voice from public.campaigns
           where voicemail_message is not null and voicemail_drop_id is null loop
    insert into public.voicemail_drops (org_id, name, kind, message, tts_voice)
    values (r.org_id, r.name || ' voicemail', 'tts', r.voicemail_message, r.tts_voice)
    returning id into v_id;
    update public.campaigns set voicemail_drop_id = v_id where id = r.id;
  end loop;
end $$;

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
