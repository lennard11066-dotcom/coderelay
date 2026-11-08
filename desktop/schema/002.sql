CREATE TABLE checkpoints(action TEXT PRIMARY KEY REFERENCES actions(id), files TEXT NOT NULL);
PRAGMA user_version=2;
