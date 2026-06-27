CREATE TABLE sites (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE routers (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    hostname    TEXT        NOT NULL,
    role        TEXT        NOT NULL,
    mgmt_ip     TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'off',
    version     TEXT        NOT NULL DEFAULT '',
    uptime_secs BIGINT      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX routers_site_id_idx ON routers(site_id);

CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL DEFAULT 'operator',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE system_config (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname    TEXT        NOT NULL DEFAULT 'vyos-fabric',
    domain_name TEXT        NOT NULL DEFAULT 'fabric.quartz.internal',
    timezone    TEXT        NOT NULL DEFAULT 'UTC',
    ntp_enabled BOOLEAN     NOT NULL DEFAULT true,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ntp_servers (
    id     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    server TEXT    NOT NULL,
    ref_id TEXT,
    pull   INTEGER
);

-- Seed a default system config row (singleton pattern)
INSERT INTO system_config (hostname, domain_name, timezone, ntp_enabled)
VALUES ('vyos-fabric', 'fabric.quartz.internal', 'UTC', true);

INSERT INTO ntp_servers (server, ref_id, pull) VALUES
    ('0.pool.ntp.org', '.POOL.', 64),
    ('1.pool.ntp.org', '.POOL.', 64),
    ('2.pool.ntp.org', '.POOL.', 64);
