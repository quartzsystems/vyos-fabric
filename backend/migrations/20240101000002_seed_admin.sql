INSERT INTO users (username, password_hash, role)
VALUES ('admin', 'admin', 'admin')
ON CONFLICT (username) DO NOTHING;
