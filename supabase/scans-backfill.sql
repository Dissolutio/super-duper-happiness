-- Run once in the Supabase SQL Editor, AFTER scans.sql. Fills the scans table from the spy reports we already saved.
-- add_intel() kept each pasted-page report's parsed summary (including the ships and defence values) in intel_reports, so nothing is
-- looked up anywhere and no one is asked for anything. Reports added by ID never had those numbers and are skipped.
-- Safe to run again: a place is only overwritten by a newer report.
-- Caveat: the summary does not say whether the target was a moon unless the buildings were visible, so a moon scan may land on the planet's row.
with parsed as materialized (
  select
    split_part(summary ->> 'coords', ':', 1)::int as galaxy,
    split_part(summary ->> 'coords', ':', 2)::int as system,
    split_part(summary ->> 'coords', ':', 3)::int as position,
    (summary -> 'moon') is not null and jsonb_typeof(summary -> 'moon') = 'object' as moon,
    (summary ->> 'player_id')::bigint as player_id,
    round((summary ->> 'fleet_value')::numeric) as fleet_value,
    round((summary ->> 'defense_value')::numeric) as defense_value,
    added_by, observed_at
  from public.intel_reports
  where kind = 'spy'
    and coalesce(summary ->> 'via', 'html') = 'html'
    and summary ->> 'coords' ~ '^[1-7]:[0-9]{1,3}:[0-9]{1,2}$'
    and summary ->> 'player_id' ~ '^[0-9]{1,18}$'
    and summary ->> 'fleet_value' ~ '^[0-9]{1,16}(\.[0-9]+)?$'
    and summary ->> 'defense_value' ~ '^[0-9]{1,16}(\.[0-9]+)?$'
)
insert into public.scans (galaxy, system, position, moon, player_id, fleet_value, defense_value, updated_by, observed_at)
select distinct on (galaxy, system, position, moon) galaxy, system, position, moon, player_id, fleet_value::bigint, defense_value::bigint, added_by, observed_at
from parsed
where galaxy between 1 and 7 and system between 1 and 499 and position between 1 and 15
  and player_id > 0 and fleet_value + defense_value > 0 and fleet_value <= 1000000000000000 and defense_value <= 1000000000000000
order by galaxy, system, position, moon, observed_at desc
on conflict (galaxy, system, position, moon) do update
  set player_id = excluded.player_id, fleet_value = excluded.fleet_value, defense_value = excluded.defense_value,
      updated_by = excluded.updated_by, observed_at = excluded.observed_at
  where public.scans.observed_at < excluded.observed_at;

select count(*) as scans_now from public.scans;
