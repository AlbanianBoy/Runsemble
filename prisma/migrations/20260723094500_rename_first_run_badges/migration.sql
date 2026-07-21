-- Put the badge names the right way round.
--
-- "First Run" was granted for tapping Join, so you could hold it having never
-- run a step; the badge that does require a tracked run was called "On the
-- Board". UserBadge stores title/description/icon per row, so changing the
-- specs in code only affects badges granted from now on — these two updates
-- bring the ones already earned into line.
--
-- badgeType is untouched: it's the stable key behind the unique constraint, so
-- nobody loses a badge or is granted a duplicate.
UPDATE "UserBadge"
SET "title"       = 'First Signup',
    "description" = 'Joined your very first run',
    "icon"        = '🙋'
WHERE "badgeType" = 'first_run';

UPDATE "UserBadge"
SET "title"       = 'First Run',
    "description" = 'Tracked your first run from start to finish',
    "icon"        = '🎉'
WHERE "badgeType" = 'first_track';
