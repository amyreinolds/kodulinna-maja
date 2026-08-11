-- 006 — üldinfo all saab ka küsida.
--
-- Ürituse all sai juba küsida („kes toob koogi“, „mis kell alustame“).
-- Üldinfo — kodukord, ohutusjuhend, liikmemaks — tekitab täpselt samu
-- küsimusi, aga seni ei olnud neil kohta. Inimene luges, ei saanud aru
-- ja küsis siis kuskil mujal, kus vastust teised ei näinud.
--
-- Uut tabelit ei tee: küsimus on küsimus, ükskõik mille all ta seisab.
-- Kommentaar käib kas ürituse VÕI info kohta, mitte mõlema.
ALTER TABLE kommentaarid ALTER COLUMN yritus_id DROP NOT NULL;
ALTER TABLE kommentaarid ADD COLUMN IF NOT EXISTS info_id uuid
  REFERENCES info(id) ON DELETE CASCADE;

ALTER TABLE kommentaarid DROP CONSTRAINT IF EXISTS kommentaarid_yks_omanik;
ALTER TABLE kommentaarid ADD CONSTRAINT kommentaarid_yks_omanik
  CHECK ((yritus_id IS NULL) <> (info_id IS NULL));

CREATE INDEX IF NOT EXISTS kommentaarid_info_idx ON kommentaarid (info_id);
