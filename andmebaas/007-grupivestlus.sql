-- 007 — grupivestlus: valid ise, kes seda vestlust näevad.
--
-- Seni oli kaks võimalust: teema (näevad kõik kaheksa) ja kiri (näete
-- kahekesi). Kolme või nelja inimese jutt ei mahtunud kummassegi —
-- kas rääkisid kõigi kuuldes või kirjutasid sama asja kolm korda.
--
-- Grupp on püsiv: annad talle nime („Torni tiim“) ja ta jääb alles.
-- Liikmed on eraldi tabelis, sest neid on rohkem kui kaks — a_id ja
-- b_id said otsa.
ALTER TABLE vestlused DROP CONSTRAINT IF EXISTS vestlused_liik_check;
ALTER TABLE vestlused ADD CONSTRAINT vestlused_liik_check
  CHECK (liik = ANY (ARRAY['teema','kiri','grupp']));

ALTER TABLE vestlused DROP CONSTRAINT IF EXISTS vestlused_check;
ALTER TABLE vestlused ADD CONSTRAINT vestlused_check CHECK (
      (liik = 'teema' AND pealkiri IS NOT NULL AND a_id IS NULL)
   OR (liik = 'kiri'  AND a_id IS NOT NULL AND b_id IS NOT NULL AND a_id < b_id)
   OR (liik = 'grupp' AND pealkiri IS NOT NULL AND a_id IS NULL)
);

CREATE TABLE IF NOT EXISTS vestluse_liikmed (
  vestlus_id uuid NOT NULL REFERENCES vestlused(id) ON DELETE CASCADE,
  liige_id   uuid NOT NULL REFERENCES liikmed(id)   ON DELETE CASCADE,
  lisatud    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vestlus_id, liige_id)
);

CREATE INDEX IF NOT EXISTS vestluse_liikmed_liige_idx
  ON vestluse_liikmed (liige_id);
