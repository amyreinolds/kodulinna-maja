/* Kirjutab praeguse andmebaasi kuju faili andmebaas/001-alus.sql.

   Miks seda vaja on: kaustas olid ainult muudatused (002…008), aga mitte
   seda, mida nad muudavad. Kui andmebaas kaob või kui keegi tahab teha
   proovibaasi, ei olnud millegi pealt alustada.

   pg_dump'i siin arvutis ei ole, seepärast loeme kuju andmebaasi enda
   kataloogist. Tulemus kontrollitakse üle päris tühja andmebaasi peal —
   vt tools/andmebaas.js ja LOE.md.

   Kasutamine:  node tools/skeem.js
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { q } = require("../db");

const VALJA = path.join(__dirname, "..", "andmebaas", "001-alus.sql");

/* Veeru kuju: tüüp, vaikeväärtus, kas tohib tühi olla. */
function veerg(c) {
  let t = c.data_type;
  if (t === "character varying") t = c.character_maximum_length
    ? "varchar(" + c.character_maximum_length + ")" : "text";
  else if (t === "timestamp with time zone") t = "timestamptz";
  else if (t === "timestamp without time zone") t = "timestamp";
  else if (t === "time without time zone") t = "time";
  else if (t === "double precision") t = "double precision";
  else if (t === "numeric" && c.numeric_precision)
    t = "numeric(" + c.numeric_precision + "," + (c.numeric_scale || 0) + ")";
  else if (t === "USER-DEFINED") t = c.udt_name;
  else if (t === "ARRAY") t = c.udt_name.replace(/^_/, "") + "[]";

  let r = "  " + c.column_name + " " + t;
  if (c.is_generated === "ALWAYS" && c.generation_expression)
    r += " GENERATED ALWAYS AS (" + c.generation_expression + ") STORED";
  else if (c.column_default) r += " DEFAULT " + c.column_default;
  if (c.is_nullable === "NO" && c.is_generated !== "ALWAYS") r += " NOT NULL";
  return r;
}

(async () => {
  const tabelid = (await q(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`)).map(x => x.table_name);

  const veerud = await q(
    `SELECT table_name, column_name, data_type, udt_name, column_default,
            is_nullable, character_maximum_length, numeric_precision,
            numeric_scale, is_generated, generation_expression, ordinal_position
     FROM information_schema.columns WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`);

  /* Piirangud: võti, viide, kontroll. NOT NULL tuleb juba veeru juurest,
     seepärast jätame need siit välja. */
  const piirangud = await q(
    `SELECT c.conrelid::regclass::text AS tabel, c.conname, c.contype,
            pg_get_constraintdef(c.oid) AS kirjeldus
     FROM pg_constraint c
     JOIN pg_namespace n ON n.oid = c.connamespace AND n.nspname = 'public'
     WHERE c.contype IN ('p','f','u','c')
       AND c.conname NOT LIKE '%\\_not\\_null'
     /* Järjekord on tähtis ja käib üle kõigi tabelite korraga: viide
        nõuab, et see, millele ta osutab, oleks juba võtmega. Tabelite
        kaupa sorteerides jõuaks failid → liikmed viide enne liikmete
        primaarvõtit ja andmebaas ütleks ära. */
     ORDER BY CASE c.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2
                             WHEN 'c' THEN 3 ELSE 4 END,
              c.conrelid::regclass::text, c.conname`);

  /* Indeksid, mis ei tule võtme ega unikaalsuse pealt. */
  const indeksid = await q(
    `SELECT i.indexname, i.indexdef FROM pg_indexes i
     WHERE i.schemaname = 'public'
       AND NOT EXISTS (SELECT 1 FROM pg_constraint c
                       WHERE c.conname = i.indexname)
     ORDER BY i.indexname`);

  const laiendid = await q(
    `SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY extname`);

  const read = [];
  read.push("-- 001 — andmebaasi alus.");
  read.push("--");
  read.push("-- Terve kuju ühes failis: nii saab tühjast andmebaasist maja üles");
  read.push("-- seada. Fail on masina kirjutatud (node tools/skeem.js) ja");
  read.push("-- kirjeldab seda, mis andmebaasis päriselt on — mitte seda, mida");
  read.push("-- keegi mäletab. Käsitsi siia midagi juurde ei kirjutata: uus");
  read.push("-- muudatus tuleb uue nummerdatud failina.");
  read.push("--");
  read.push("-- Ridu ei kustuta ega täida see fail — ainult kuju.");
  read.push("");
  for (const e of laiendid)
    read.push('CREATE EXTENSION IF NOT EXISTS "' + e.extname + '";');
  if (laiendid.length) read.push("");

  for (const t of tabelid) {
    const v = veerud.filter(x => x.table_name === t);
    read.push("CREATE TABLE IF NOT EXISTS " + t + " (");
    read.push(v.map(veerg).join(",\n"));
    read.push(");");
    read.push("");
  }

  /* Piirangud tulevad tabelite järel, sest viited käivad risti-rästi. */
  read.push("-- Võtmed, viited ja kontrollid");
  for (const p of piirangud) {
    read.push("ALTER TABLE " + p.tabel + " DROP CONSTRAINT IF EXISTS " + p.conname + ";");
    read.push("ALTER TABLE " + p.tabel + " ADD CONSTRAINT " + p.conname
      + " " + p.kirjeldus + ";");
  }
  read.push("");

  if (indeksid.length) {
    read.push("-- Indeksid");
    for (const i of indeksid)
      read.push(i.indexdef.replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
        .replace(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ") + ";");
    read.push("");
  }

  fs.writeFileSync(VALJA, read.join("\n"), "utf8");
  console.log("\n  kirjutatud: andmebaas/001-alus.sql");
  console.log("  " + tabelid.length + " tabelit, " + piirangud.length
    + " piirangut, " + indeksid.length + " indeksit\n");
  process.exit(0);
})();
