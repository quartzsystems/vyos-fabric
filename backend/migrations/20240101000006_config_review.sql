-- Config review & commit system.
--
-- Staged (pending) config changes are diffed against a device's live config and held here
-- until an operator reviews and commits them. The VyOS HTTP API auto-commits every
-- /configure call, so "review" is implemented by staging the intended set/delete commands
-- ourselves and firing them as one batch at commit time.

CREATE TABLE config_commits (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id     UUID        NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
    committed_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    committed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status        TEXT        NOT NULL,              -- 'success' | 'failed'
    change_count  INTEGER     NOT NULL DEFAULT 0,
    saved         BOOLEAN     NOT NULL DEFAULT false, -- persisted to boot config via /save
    error         TEXT,
    vyos_response JSONB
);

CREATE INDEX config_commits_router_idx ON config_commits(router_id, committed_at DESC);

CREATE TABLE config_changes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id   UUID        NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
    op          TEXT        NOT NULL,                       -- 'set' | 'delete'
    path        TEXT[]      NOT NULL,                       -- {system,host-name,vyos-core-01}
    summary     TEXT        NOT NULL,                       -- human-readable, e.g. "Hostname → vyos-core-01"
    section     TEXT        NOT NULL DEFAULT 'system',      -- which page produced it
    created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status      TEXT        NOT NULL DEFAULT 'pending',     -- 'pending' | 'committed' | 'failed'
    commit_id   UUID        REFERENCES config_commits(id) ON DELETE SET NULL
);

CREATE INDEX config_changes_router_status_idx ON config_changes(router_id, status);
CREATE INDEX config_changes_commit_idx ON config_changes(commit_id);

-- The old singleton tables modelled a single global config in the app DB, which has nothing
-- to do with any actual device. Per-device config is now read live from the device and staged
-- through config_changes, so these are obsolete.
DROP TABLE IF EXISTS ntp_servers;
DROP TABLE IF EXISTS system_config;
