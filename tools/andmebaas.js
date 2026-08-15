/* Andmebaasi muudatuste jooksutaja.

   Seni käisid failid kaustas andmebaas/ käsitsi: keegi pidi mäletama,
   millised on juba tehtud. Mäletamine on halb koht, kus andmebaasi kuju
   hoida — eriti siis, kui majutatud baas ja proovibaas lähevad lahku.

   Nüüd peab andmebaas ise arvet. Tabel `migratsioonid` ütleb, mis on
   tehtud; jooksutaja teeb ainult puuduva, õiges järjekorras, ja iga fail
   käib ühe tehinguna — pooleli jäänud muudatust ei jää alles.

   Kasutamine:
     node tools/andmebaas.js          teeb puuduvad
     node tools/andmebaas.js --vaata  näitab ainult, mis on tegemata
     node tools/andmebaas.js --tehtud märgib kõik tehtuks, midagi tegemata
                                      (olemasoleva baasi jaoks, kus kuju
                                       on juba käsitsi peale pandud)
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { q } = require("../db");

const KAUST = path.join(__dirname, "..", "andmebaas");

(async () => {
  const vaid = process.argv.includes("--vaata");
  const margi = process.argv.includes("--tehtud");

  await q(`CREATE TABLE IF NOT EXISTS migratsioonid (
             fail text PRIMARY KEY,
             tehtud timestamptz NOT NULL DEFAULT now()
           )`);

  const failid = fs.readdirSync(KAUST).filter(f => /^\d+.*\.sql$/.test(f)).sort();
  const tehtud = new Set((await q("SELECT fail FROM migratsioonid")).map(x => x.fail));
  const puudu = failid.filter(f => !tehtud.has(f));

  console.log("\n  andmebaasi muudatused: " + failid.length + " faili, "
    + tehtud.size + " tehtud, " + puudu.length + " tegemata");

  if (!puudu.length) { console.log("  kõik on tehtud.\n"); process.exit(0); }
  for (const f of puudu) console.log("    tegemata: " + f);

  if (vaid) { console.log(""); process.exit(0); }

  if (margi) {
    for (const f of puudu)
      await q("INSERT INTO migratsioonid (fail) VALUES ($1) ON CONFLICT DO NOTHING", [f]);
    console.log("\n  märgitud tehtuks, andmebaasi ei puudutatud.\n");
    process.exit(0);
  }

  for (const f of puudu) {
    const sql = fs.readFileSync(path.join(KAUST, f), "utf8");
    try {
      /* Üks fail = üks tehing. Kui keskel läheb midagi katki, ei jää
         pool muudatust alles. */
      await q("BEGIN");
      await q(sql);
      await q("INSERT INTO migratsioonid (fail) VALUES ($1)", [f]);
      await q("COMMIT");
      console.log("    tehtud: " + f);
    } catch (e) {
      await q("ROLLBACK").catch(() => { });
      console.error("\n  KATKI: " + f + "\n  " + e.message + "\n");
      process.exit(1);
    }
  }
  console.log("\n  valmis.\n");
  process.exit(0);
})();
