# Database updates (migrations)

Each file here changes an EXISTING War Room database to a newer version. A new install runs only `../setup.sql`, which is always the latest version.

1. Find your version in the SQL Editor: `select version from public.schema_version;`
   (If that says the table does not exist, you made your database with the old loose files: run `0001`.)
2. Run every file with a HIGHER number than your version, in order, once each.
3. Each file sets the new version at its end, so step 1 shows where you are.

When you update your copy of the code (sync your fork), check this folder for new files before or right after deploying.

For people writing a migration: number it next, make it safe to run twice where possible, wrap it in `begin; ... commit;`,
end with `delete from public.schema_version; insert into public.schema_version (version) values (N);`, and make the same change in `../setup.sql` (bumping its version too) so fresh installs match.
