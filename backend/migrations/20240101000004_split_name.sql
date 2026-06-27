ALTER TABLE users
    ADD COLUMN first_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN last_name  TEXT NOT NULL DEFAULT '';

-- Migrate existing name data
UPDATE users SET
    first_name = CASE WHEN trim(name) = '' THEN '' ELSE split_part(trim(name), ' ', 1) END,
    last_name  = CASE
        WHEN position(' ' IN trim(name)) > 0
        THEN trim(substring(trim(name) FROM position(' ' IN trim(name)) + 1))
        ELSE ''
    END;

ALTER TABLE users DROP COLUMN name;
