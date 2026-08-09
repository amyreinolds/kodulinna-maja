-- 002 — kalendri tööd: kellaajata tööd, tehtud-märge ja üksik ärajäetud kord.
--
-- Miks nii:
--   * Osa töid ei ole kellaajaga („lilled tuleb kasta“ — ükskõik millal
--     päeva jooksul). Seepärast tohib algus olla tühi.
--   * Töö tehtud-märge käib PÄEVA kohta, mitte inimese kohta: tööd teeb
--     see, kes parajasti majas on, ja tähtis on, kas töö on tehtud.
--     Sellepärast eraldi tabel, mitte kinnitused (seal on kinnitus
--     inimese kohta — info ja ürituste jaoks on see õige).
--   * Korduva töö saab kustutada ühe korra kaupa: siis jääb sellest
--     päevast vahelejätmise rida, töö ise jääb alles.

ALTER TABLE tood ALTER COLUMN algus DROP NOT NULL;

CREATE TABLE IF NOT EXISTS too_tehtud (
  too_id  uuid        NOT NULL REFERENCES tood(id) ON DELETE CASCADE,
  kuup    date        NOT NULL,
  kes_id  uuid        REFERENCES liikmed(id) ON DELETE SET NULL,
  aeg     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (too_id, kuup)
);

CREATE TABLE IF NOT EXISTS too_vahele (
  too_id  uuid NOT NULL REFERENCES tood(id) ON DELETE CASCADE,
  kuup    date NOT NULL,
  PRIMARY KEY (too_id, kuup)
);

-- Töögraafikus võib ühel päeval olla kaks inimest (hommik ja õhtu),
-- aga praegune võti lubab ühte rida inimese ja päeva kohta.
ALTER TABLE graafik DROP CONSTRAINT IF EXISTS graafik_pkey;
ALTER TABLE graafik ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE graafik ADD PRIMARY KEY (id);
