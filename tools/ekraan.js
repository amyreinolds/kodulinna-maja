/* Ekraanipilt igast vaatest, mõlemas teemas.

   Miks see olemas on: testid vaatavad andmeid ja õigusi, aga paigutust
   nad ei näe. Prototüübis leidis nimekonflikti ja ekraanilt kadunud
   välja ainult pilt — kumbki test ei öelnud midagi. Seega: pärast
   ekraani puudutavat muudatust tee pilt ja vaata seda.

   Kasutamine:
     node tools/ekraan.js              → kõik vaated, mõlemad teemad
     node tools/ekraan.js myyk         → ainult Müük
     node tools/ekraan.js myyk tume    → ainult Müük tumedas

   Pildid lähevad kausta pildid/ ja kirjutatakse iga korraga üle, et neid
   ei kuhjuks. Kaust on .gitignore-is. */
"use strict";
const fs = require("fs");
const path = require("path");
const { ava, teema, vaade } = require("./brauser");

const KAUST = path.join(__dirname, "..", "pildid");

(async () => {
  const soovVaade = (process.argv[2] || "").trim();
  const soovTeema = (process.argv[3] || "").trim();

  fs.mkdirSync(KAUST, { recursive: true });
  const b = await ava({ port: 3457 });

  const vaated = soovVaade ? [soovVaade] : b.vaated;
  const teemad = soovTeema ? [soovTeema] : b.teemad;

  for (const v of vaated)
    if (!b.vaated.includes(v)) { console.log("Sellist vaadet ei ole: " + v); await b.sulge(); process.exit(1); }
  for (const t of teemad)
    if (!b.teemad.includes(t)) { console.log("Sellist teemat ei ole: " + t); await b.sulge(); process.exit(1); }

  let n = 0;
  for (const t of teemad) {
    await teema(b.leht, t);
    for (const v of vaated) {
      await vaade(b.leht, v);
      const fail = path.join(KAUST, t + "-" + v + ".png");
      await b.leht.screenshot({ path: fail });
      console.log("  " + path.relative(path.join(__dirname, ".."), fail));
      n++;
    }
  }

  await b.sulge();
  console.log("\n" + n + " pilti kaustas pildid/");
  process.exit(0);
})().catch(e => { console.error("\nEkraanipilt ei õnnestunud: " + e.message); process.exit(1); });
