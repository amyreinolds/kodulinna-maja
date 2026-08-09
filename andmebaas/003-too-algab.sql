-- 003 — korduv töö algab sellest päevast, kust ta lisati.
--
-- Ilma selleta ilmus „lillede kastmine“ ka möödunud kolmapäevadesse,
-- kus teda tegelikult ei olnud. Kalender näitaks siis tegemata töid,
-- mida keegi kunagi teha ei saanud.

ALTER TABLE tood ADD COLUMN IF NOT EXISTS algab date;
UPDATE tood SET algab = coalesce(kuup, current_date) WHERE algab IS NULL;
