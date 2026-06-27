ALTER TABLE routers
    ADD COLUMN description  TEXT,
    ADD COLUMN api_port     INTEGER,
    ADD COLUMN api_protocol TEXT    NOT NULL DEFAULT 'https',
    ADD COLUMN api_key      TEXT,
    ADD COLUMN api_timeout  INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN ssh_username TEXT,
    ADD COLUMN ssh_password TEXT,
    ADD COLUMN ssh_port     INTEGER NOT NULL DEFAULT 22;
