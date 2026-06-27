ALTER TABLE users ADD COLUMN name  TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN email TEXT;

CREATE TABLE user_site_access (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    site_id    UUID        NOT NULL REFERENCES sites(id)  ON DELETE CASCADE,
    role       TEXT        NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, site_id)
);

CREATE INDEX user_site_access_user_idx ON user_site_access(user_id);
