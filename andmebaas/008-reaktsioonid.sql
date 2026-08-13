-- 008 — märgid sõnumite juurde („emotsioonid“).
--
-- Kaheksa inimese majas ei ole vaja igale sõnumile vastata „selge“ või
-- „aitäh“. Pöidlaga saab sama asja öelda, ilma et vestlus täis jookseks.
-- Ja saatja näeb ka päriselt, et keegi luges — enne pidi ta selle ise
-- kokku arvama.
--
-- Üks inimene võib panna mitu erinevat märki, aga sama märgi ainult
-- korra — seda hoiab primaarvõti.
CREATE TABLE IF NOT EXISTS sonumi_margid (
  sonum_id uuid NOT NULL REFERENCES sonumid(id) ON DELETE CASCADE,
  liige_id uuid NOT NULL REFERENCES liikmed(id) ON DELETE CASCADE,
  marge    text NOT NULL,
  aeg      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sonum_id, liige_id, marge),
  CONSTRAINT sonumi_margid_luhike CHECK (length(marge) BETWEEN 1 AND 8)
);

CREATE INDEX IF NOT EXISTS sonumi_margid_sonum_idx ON sonumi_margid (sonum_id);
