-- Retain awarded XP and achievement history. Roll back only before any claim.
do $$
begin
  if exists (
    select 1 from public.user_achievements
    where achievement_id in (
      '10000000-0000-4000-8000-000000000009',
      '10000000-0000-4000-8000-000000000010',
      '10000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000012'
    )
  ) then
    raise exception 'Cannot remove achievements after XP has been awarded';
  end if;

  delete from public.achievements
  where id in (
    '10000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000012'
  );
end;
$$;
