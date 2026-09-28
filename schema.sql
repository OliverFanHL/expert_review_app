CREATE TABLE IF NOT EXISTS expert_annotations (
  protocol_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('rater_a', 'rater_b', 'adjudication')),
  pair_id text NOT NULL,
  grade smallint NOT NULL CHECK (grade BETWEEN 0 AND 3),
  evidence text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (protocol_hash, role, pair_id)
);
CREATE INDEX IF NOT EXISTS expert_annotations_role_idx
  ON expert_annotations (protocol_hash, role, updated_at);
