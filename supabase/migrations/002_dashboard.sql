-- Rigel Voice: data for the dashboard (pass rate, objections, talk time, critical criteria).
-- Safe to run more than once.
alter table public.scorecard_templates add column if not exists pass_mark int not null default 70;
alter table public.scorecards add column if not exists passed boolean;
alter table public.scorecards add column if not exists objections jsonb not null default '[]'::jsonb;
alter table public.scorecards add column if not exists agent_talk_ratio numeric;
create index if not exists scorecards_org_created_idx on public.scorecards (org_id, created_at desc);

-- Mark compliance as critical on the default scorecard.
update public.scorecard_templates t
set criteria = (
  select jsonb_agg(case when e->>'id' = 'compliance' then e || '{"critical": true}'::jsonb else e end)
  from jsonb_array_elements(t.criteria) e
)
where t.name = 'Standard sales call' and t.criteria @> '[{"id": "compliance"}]'::jsonb;
