/* Ava rakendus — teeb sisselogimislingi ja avab selle kohe brauseris.

   Miks: majutuses ei tohi linki ekraanile panna ja postiteenust ei ole,
   nii et sisenemine käis käsitsi lingi kopeerimisega. See on tüütu ja
   kopeerimisel läheb pikk link kergesti katki. Nüüd on üks topeltklõps.

   Kasutamine:
     node tools/ava.js                      → majutatud leht, esimene
                                              administraator
     node tools/ava.js sinu@epost.ee
     node tools/ava.js sinu@epost.ee http://localhost:3000
*/
"use strict";
const crypto = require("crypto");
const { spawn } = require("child_process");
const { q, yks } = require("../db");

const VAIKE_ALUS = "https://kodulinna-maja.onrender.com";

(async () => {
  const epost = (process.argv[2] || "").trim().toLowerCase();
  const alus = (process.argv[3] || VAIKE_ALUS).replace(/\/+$/, "");

  /* Ilma aadressita võtame selle liikme, kes maja eest vastutab — enamasti
     on see seesama inimene, kes seda käsku käivitab. */
  const liige = epost
    ? await yks("SELECT id, nimi FROM liikmed WHERE lower(epost) = $1", [epost])
    : await yks(
        `SELECT id, nimi FROM liikmed WHERE epost IS NOT NULL
         ORDER BY (amet = 'administraator') DESC, nimi LIMIT 1`);

  if (!liige) {
    console.log("\n  Sellise e-postiga liiget ei ole: " + (epost || "—"));
    const read = await q(
      "SELECT nimi, epost FROM liikmed WHERE epost IS NOT NULL ORDER BY nimi");
    if (read.length) {
      console.log("\n  Kellel on aadress:");
      for (const r of read) console.log("    " + r.nimi.padEnd(16) + r.epost);
    }
    console.log("");
    process.exit(1);
  }

  const mark = crypto.randomBytes(32).toString("base64url");
  await q(
    `INSERT INTO sisselogimise_margid (mark, liige_id, aegub)
     VALUES ($1, $2, now() + interval '7 days')`, [mark, liige.id]);
  const link = alus + "/sisene?mark=" + mark;

  console.log("\n  Avan rakenduse — " + liige.nimi);
  console.log("  " + alus);
  console.log("\n  Kui brauser ise ei avanenud, kopeeri see rida:");
  console.log("  " + link + "\n");

  /* Windowsi „start“ vajab tühja pealkirja, muidu võtab ta esimese
     jutumärkides argumendi akna nimeks ega ava midagi.
     Testis brauserit ei avata — muidu hüppaks iga proovi peale aken üles. */
  if (!process.env.AVA_EI_AVA) {
    if (process.platform === "win32")
      spawn("cmd", ["/c", "start", "", link], { detached: true });
    else spawn(process.platform === "darwin" ? "open" : "xdg-open", [link], { detached: true });
  }

  setTimeout(() => process.exit(0), 400);
})();
