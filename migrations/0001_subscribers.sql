CREATE TABLE IF NOT EXISTS subscribers (
	email TEXT PRIMARY KEY NOT NULL,
	confirmation_token TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS subscribers_status_idx ON subscribers(status);
