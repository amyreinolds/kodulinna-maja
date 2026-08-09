-- 004 — väljad, mida prototüübi ekraan kasutab, aga andmebaasis veel ei olnud.
--
-- Rakendus kasutab nüüd prototüübi enda ekraani. Selleks peab andmebaas
-- kandma täpselt sama infot, mida see ekraan näitab.

ALTER TABLE grupp ADD COLUMN IF NOT EXISTS aadress  text;
ALTER TABLE grupp ADD COLUMN IF NOT EXISTS aadress2 text;
ALTER TABLE grupp ADD COLUMN IF NOT EXISTS telefon  text;
ALTER TABLE grupp ADD COLUMN IF NOT EXISTS epost    text;
ALTER TABLE grupp ADD COLUMN IF NOT EXISTS lahti    text;

-- Kas töö küsib „Tegin ära“ kinnitust.
ALTER TABLE tood ADD COLUMN IF NOT EXISTS kinnita boolean NOT NULL DEFAULT true;

-- Kes on töö eest vastutav (võib olla tühi: teeb see, kes majas on).
-- kes_id on juba olemas.

-- Faili märkus on prototüübis „note“; meil on kirjeldus. Sama asi.
