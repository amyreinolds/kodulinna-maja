-- 005 — üritus võib olla mujal; „muu“ päeval võib olla kellaaeg.
--
-- 1) Üritus ei pea olema Kodulinna Majas ega Tornis. Kui koht on tühi,
--    tähendab see „mujal“ ja päris asukoht kirjutatakse asukoha väljale
--    („Aegviidu rongijaam“). Töögraafik jääb kahe maja peale — seal on
--    kolmas maja mõttetu.
ALTER TABLE yritused ALTER COLUMN koht_id DROP NOT NULL;

-- 2) Puudumine on tavaliselt terve päev, aga „muu“ võib olla ka paar
--    tundi — koolitus, arsti juures. Ilma kellaajata tähendab tervet päeva.
ALTER TABLE puudumised ADD COLUMN IF NOT EXISTS kellast time;
ALTER TABLE puudumised ADD COLUMN IF NOT EXISTS kellani time;
ALTER TABLE puudumised DROP CONSTRAINT IF EXISTS puudumised_kell_check;
ALTER TABLE puudumised ADD CONSTRAINT puudumised_kell_check
  CHECK (kellani IS NULL OR kellast IS NOT NULL);
