/* Varukoopia: kogu maja andmed ühte faili — ja tagasi.

   Miks see olemas on: andmed elavad ühes kohas, Neoni andmebaasis. Ühine
   andmebaas kaitseb selle vastu, et ühe inimese arvuti läheb katki. Ta ei
   kaitse millegi muu vastu: kogemata kustutamine, konto sulgemine, teenuse
   tingimuste muutumine. Ilma koopiata tähendab iga selline asi, et kassa,
   kontaktid, vestlused ja kogu ajalugu on lõplikult läinud.

   `pg_dump` selles arvutis ei ole, seepärast teeme koopia ise: iga tabel
   loetakse välja ja kirjutatakse ühte JSON-faili. Fail on tavaline tekst
   — teda saab avada, lugeda ja vajadusel käsitsi parandada.

   Kasutamine:
     node tools/varukoopia.js                    → koopia kausta varukoopiad/
     node tools/varukoopia.js C:\kuhugi\mujale   → koopia sinna
     node tools/varukoopia.js --taasta fail.json → paneb andmed tagasi

   Taastamine KIRJUTAB PRAEGUSE SISU ÜLE. Ta küsib enne kinnitust ja
   teeb igaks juhuks praegusest seisust omaette koopia.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { q } = require("../db");

/* Järjekord loeb: viide ei saa osutada reale, mida veel ei ole.
   Vanemad tabelid ette, lapsed järele. */
const TABELID = [
  "grupp", "majad", "liikmed", "myyk_osad", "tooted", "hinnakiri", "myygid",
  "yritused", "osalemine", "kinnitused", "kommentaarid", "ulesanded",
  "info", "failid", "vestlused", "vestluse_liikmed", "sonumid",
  "sonumi_margid", "graafik", "puudumised", "tood", "too_paevad",
  "too_tehtud", "too_vahele", "loetud", "sisselogimise_margid",
  "migratsioonid"
];

const p2 = n => String(n).padStart(2, "0");
const nimi = () => {
  const d = new Date();
  return "kodulinna-maja-" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate())
    + "-" + p2(d.getHours()) + p2(d.getMinutes()) + ".json";
};

async function tee(kuhu) {
  const olemas = new Set((await q(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE'`)).map(x => x.table_name));

  /* Kui andmebaasi on tulnud tabel, mida see nimekiri ei tea, võtame ta
     ikkagi kaasa — koopia, millest osa puudu on, ei ole koopia. */
  const koik = TABELID.filter(t => olemas.has(t))
    .concat([...olemas].filter(t => !TABELID.includes(t)).sort());

  const seis = { tehtud: new Date().toISOString(), tabelid: {} };
  let ridu = 0;
  for (const t of koik) {
    const r = await q("SELECT * FROM " + t);
    seis.tabelid[t] = r;
    ridu += r.length;
  }

  fs.mkdirSync(kuhu, { recursive: true });
  const fail = path.join(kuhu, nimi());
  fs.writeFileSync(fail, JSON.stringify(seis, null, 1), "utf8");
  const mb = (fs.statSync(fail).size / 1048576).toFixed(2);
  return { fail, ridu, tabeleid: koik.length, mb };
}

async function taasta(fail) {
  const seis = JSON.parse(fs.readFileSync(fail, "utf8"));
  if (!seis.tabelid) throw new Error("See ei ole selle rakenduse varukoopia.");

  const nimed = Object.keys(seis.tabelid);
  const ridu = nimed.reduce((a, t) => a + seis.tabelid[t].length, 0);
  console.log("\n  Fail:    " + fail);
  console.log("  Tehtud:  " + new Date(seis.tehtud).toLocaleString("et-EE"));
  console.log("  Sisu:    " + nimed.length + " tabelit, " + ridu + " rida\n");

  const enne = await q("SELECT count(*)::int AS n FROM liikmed");
  console.log("  Praeguses andmebaasis on " + enne[0].n + " liiget.");
  console.log("  TAASTAMINE KIRJUTAB PRAEGUSE SISU ÜLE.\n");

  const vastus = await kysi("  Kirjuta TAASTA ja vajuta Enter (muu katkestab): ");
  if (vastus.trim() !== "TAASTA") { console.log("\n  Katkestatud, midagi ei muudetud.\n"); return; }

  /* Enne ülekirjutamist teeme praegusest seisust koopia — kui taastati
     vale fail, ei ole eelmine seis kadunud. */
  const enneKoopia = await tee(path.join(__dirname, "..", "varukoopiad"));
  console.log("\n  Praegusest seisust tehtud koopia: " + enneKoopia.fail);

  const jrk = TABELID.filter(t => nimed.includes(t))
    .concat(nimed.filter(t => !TABELID.includes(t)));

  /* Tuletatud veerge (nagu müügirea `summa`, mis on kogus × hind) ei saa
     ega tohi tagasi kirjutada — andmebaas arvutab nad ise. Koopias nad
     on, sest nad on koopia lugemisel olemas; tagasi pannes tuleb nad
     vahele jätta. */
  const tuletatud = new Map();
  for (const r of await q(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema='public' AND is_generated='ALWAYS'`)) {
    if (!tuletatud.has(r.table_name)) tuletatud.set(r.table_name, new Set());
    tuletatud.get(r.table_name).add(r.column_name);
  }

  await q("BEGIN");
  try {
    /* Tühjaks vastupidises järjekorras: lapsed enne vanemaid. */
    for (const t of [...jrk].reverse()) await q("DELETE FROM " + t);
    for (const t of jrk) {
      const read = seis.tabelid[t];
      if (!read.length) continue;
      const jata = tuletatud.get(t) || new Set();
      const veerud = Object.keys(read[0]).filter(v => !jata.has(v));
      const kohad = veerud.map((_, i) => "$" + (i + 1)).join(",");
      for (const r of read)
        await q("INSERT INTO " + t + " (" + veerud.join(",") + ") VALUES (" + kohad + ")",
          veerud.map(v => r[v]));
      console.log("    " + t + ": " + read.length);
    }
    await q("COMMIT");
    console.log("\n  Taastatud.\n");
  } catch (e) {
    await q("ROLLBACK").catch(() => { });
    console.error("\n  KATKI: " + e.message);
    console.error("  Midagi ei muudetud — andmebaas on endises seisus.\n");
    process.exitCode = 1;
  }
}

const kysi = k => new Promise(res => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(k, v => { rl.close(); res(v); });
});

(async () => {
  const a = process.argv.slice(2);
  if (a[0] === "--taasta") {
    if (!a[1]) { console.error("\n  Ütle, millist faili taastada.\n"); process.exit(1); }
    await taasta(a[1]);
    process.exit(process.exitCode || 0);
  }
  const kuhu = a[0] || path.join(__dirname, "..", "varukoopiad");
  const r = await tee(kuhu);
  console.log("\n  Varukoopia tehtud.");
  console.log("  " + r.fail);
  console.log("  " + r.tabeleid + " tabelit, " + r.ridu + " rida, " + r.mb + " MB\n");
  console.log("  Hoia seda faili ka mujal kui selles arvutis — pilves,");
  console.log("  mälupulgal või e-kirjas iseendale.\n");
  process.exit(0);
})();
