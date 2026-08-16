/* Ühendus Neoni andmebaasiga.
   Üks ühenduste kogum kogu rakenduse peale — iga päring ei ava uut ühendust. */
"use strict";
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

/* Väike .env lugeja. Eraldi teeki selle jaoks ei ole vaja. */
function loeEnv() {
  const f = path.join(__dirname, ".env");
  if (!fs.existsSync(f)) return;
  for (const rida of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const t = rida.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim();
  }
}
loeEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL puudub. Vaata .env faili.");
  process.exit(1);
}

/* Ühendus on krüpteeritud ja serveri sertifikaat kontrollitakse üle
   (sslmode=verify-full .env failis). Ilma kontrollita võiks keegi end
   vahele panna ja andmebaasi liiklust lugeda. */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});

/* Tehing: kas kõik või mitte midagi.

   Seisu salvestamine puudutab kaht tosinat tabelit. Ilma tehinguta
   tähendas keskel katkenud salvestus, et osa muudatustest jäi sisse ja
   osa mitte. Kõige ohtlikum koht oli graafik: seal kustutatakse vanad
   read enne uute kirjutamist, nii et katkestus nende vahel jättis terve
   maja nädalagraafiku tühjaks — ilma ühegi teateta ja ilma tagasiteeta.

   Iga päring `q()` sees leiab AsyncLocalStorage kaudu ise üles, kas ta
   on mõne tehingu sees. Nii ei pea sadat kutsumiskohta ümber kirjutama
   ega ühendust käest kätte andma. */
const { AsyncLocalStorage } = require("async_hooks");
const tehingus = new AsyncLocalStorage();

/* Kõik päringud käivad siit läbi, et parameetrid oleksid alati eraldi —
   nii ei saa keegi SQL-i sisse kirjutada. */
async function q(sql, params) {
  const klient = tehingus.getStore();
  const r = await (klient || pool).query(sql, params || []);
  return r.rows;
}
const yks = async (sql, params) => (await q(sql, params))[0] || null;

async function tehing(fn) {
  /* Pesastatud tehingut ei ava: kui oleme juba ühe sees, jookseb töö
     samas tehingus edasi. */
  if (tehingus.getStore()) return fn();
  const klient = await pool.connect();
  try {
    await klient.query("BEGIN");
    const tulem = await tehingus.run(klient, fn);
    await klient.query("COMMIT");
    return tulem;
  } catch (e) {
    try { await klient.query("ROLLBACK"); } catch { }
    throw e;
  } finally {
    klient.release();
  }
}

module.exports = { q, yks, tehing };
