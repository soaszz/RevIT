-- Bound high-growth tables and calculate each leaderboard request once.
begin;

create index if not exists ai_request_usage_completed_at_idx
  on public.ai_request_usage (completed_at)
  where completed_at is not null;

create index if not exists ai_request_usage_pending_reserved_at_idx
  on public.ai_request_usage (reserved_at)
  where completed_at is null;

create index if not exists question_attempts_user_session_answered_idx
  on public.question_attempts (user_id, session_id, answered_at desc)
  where session_id is not null;

create or replace function public.cleanup_ai_request_usage()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted bigint;
begin
  delete from public.ai_request_usage
  where completed_at < now() - interval '24 hours'
     or (completed_at is null and reserved_at < now() - interval '1 hour');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_ai_request_usage() from public, anon, authenticated;
grant execute on function public.cleanup_ai_request_usage() to service_role;

select public.cleanup_ai_request_usage();

create or replace function public.get_leaderboard_snapshot(
  p_period text,
  p_metric text,
  p_subject_id text default null,
  p_book text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_minimum integer;
  v_result jsonb;
begin
  if v_owner is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  v_minimum := public.leaderboard_accuracy_minimum(p_period);

  with all_stats as materialized (
    select * from public.leaderboard_metric_rows(p_period, p_metric, p_subject_id, p_book)
  ), eligible_public as materialized (
    select stats.*
    from all_stats stats
    join public.user_preferences preference
      on preference.user_id = stats.participant_id
      and preference.leaderboard_opt_in
    join public.profiles profile on profile.id = stats.participant_id
    where case
      when p_metric = 'accuracy' then stats.answered_count >= v_minimum
      else stats.metric_value > 0
    end
  ), ranked as materialized (
    select
      eligible.*,
      row_number() over (
        order by eligible.metric_value desc, eligible.answered_count desc, eligible.participant_id
      ) as position
    from eligible_public eligible
  ), participant_total as (
    select count(*)::bigint as total from ranked
  ), mine as (
    select
      v_owner as participant_id,
      coalesce(stats.metric_value, 0)::numeric as metric_value,
      coalesce(stats.answered_count, 0)::bigint as answered_count
    from (select 1) seed
    left join all_stats stats on stats.participant_id = v_owner
  ), my_profile as (
    select
      profile.id,
      coalesce(nullif(btrim(profile.first_name), ''), profile.username, 'RevIT learner') as display_name,
      profile.avatar_url,
      coalesce(preference.leaderboard_opt_in, false) as opted_in
    from public.profiles profile
    left join public.user_preferences preference on preference.user_id = profile.id
    where profile.id = v_owner
  ), top_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'rank', ranked.position,
      'display_name', coalesce(nullif(btrim(profile.first_name), ''), profile.username, 'RevIT learner'),
      'avatar_url', profile.avatar_url,
      'metric_value', ranked.metric_value,
      'answered_count', ranked.answered_count,
      'is_current_user', ranked.participant_id = v_owner,
      'period_timezone', public.leaderboard_timezone()
    ) order by ranked.position), '[]'::jsonb) as rows
    from ranked
    join public.profiles profile on profile.id = ranked.participant_id
    where ranked.position <= 10
  ), current_position as (
    select jsonb_build_object(
      'rank', case
        when not my_profile.opted_in then null
        when p_metric = 'accuracy' and mine.answered_count < v_minimum then null
        when p_metric <> 'accuracy' and mine.metric_value <= 0 then null
        else ranked.position
      end,
      'display_name', my_profile.display_name,
      'avatar_url', my_profile.avatar_url,
      'metric_value', mine.metric_value,
      'answered_count', mine.answered_count,
      'minimum_required', v_minimum,
      'questions_needed', case
        when p_metric = 'accuracy' then greatest(0, v_minimum - mine.answered_count)::integer
        else 0
      end,
      'eligible', case
        when p_metric = 'accuracy' then mine.answered_count >= v_minimum
        else mine.metric_value > 0
      end,
      'opted_in', my_profile.opted_in,
      'percentile', case
        when ranked.position is null or participant_total.total = 0 then null
        else greatest(1, ceil((ranked.position::numeric / participant_total.total::numeric) * 100))::integer
      end,
      'participant_count', participant_total.total,
      'period_timezone', public.leaderboard_timezone()
    ) as position
    from my_profile
    cross join mine
    cross join participant_total
    left join ranked on ranked.participant_id = v_owner
  )
  select jsonb_build_object(
    'rows', top_rows.rows,
    'current_position', current_position.position
  ) into v_result
  from top_rows
  cross join current_position;

  return coalesce(v_result, jsonb_build_object('rows', '[]'::jsonb, 'current_position', null));
end;
$$;

revoke all on function public.get_leaderboard_snapshot(text,text,text,text) from public, anon;
grant execute on function public.get_leaderboard_snapshot(text,text,text,text) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $schedule$
      select cron.schedule(
        'revit-ai-request-usage-cleanup',
        '17 * * * *',
        'select public.cleanup_ai_request_usage()'
      )
    $schedule$;
  end if;
end;
$$;

commit;

-- If pg_cron is enabled after this migration, run once:
-- select cron.schedule(
--   'revit-ai-request-usage-cleanup',
--   '17 * * * *',
--   'select public.cleanup_ai_request_usage()'
-- );
