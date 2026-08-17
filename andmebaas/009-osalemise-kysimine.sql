-- 009 — üritus võib küsida igalt liikmelt, kas ta osaleb.
--
-- „Osalen / Ei osale“ nupud olid iga ürituse juures juba olemas, aga
-- vastamine oli vabatahtlik ja keegi ei näinud, kellelt vastus puudub.
-- Talgute või väljasõidu puhul on just see kõige tähtsam number: mitu
-- inimest tuleb.
--
-- See on eri asi kui `kinnitus_vaja`, mis tähendab „olen läbi lugenud“.
-- Inimene võib info läbi lugeda ja mitte tulla — need kaks ei asenda
-- teineteist.
ALTER TABLE yritused
  ADD COLUMN IF NOT EXISTS osalemine_vaja boolean NOT NULL DEFAULT false;
