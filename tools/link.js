/* Teeb sisselogimislingi ja trükib selle välja.

   Milleks: majutatud lehel ei näidata linki ekraanil (see oleks auk) ja
   postiteenust ei pruugi olla. Esimene sisselogimine käib siis siit —
   sinu arvutist, sama andmebaasi vastu, mida majutatud leht kasutab.

   Kasutamine:
     node tools/link.js sinu@epost.ee https://kodulinna-maja.onrender.com
     node tools/link.js sinu@epost.ee                (kohalik aadress)
*/
"use strict";
const crypto = require("crypto");
const { q, yks } = require("../db");

(async () => {
  const epost = (process.argv[2] || "").trim().toLowerCase();
  const alus = (process.argv[3] || "http://localhost:" + (process.env.PORT || 3000))
    .replace(/\/+$/, "");

  if (!epost) {
    console.log("\n  Kasutamine: node tools/link.js <e-post> [aadress]\n");
    const read = await q(
      "SELECT nimi, epost, administraator FROM liikmed ORDER BY nimi");
    console.log("  Liikmed:");
    for (const r of read)
      console.log("    " + r.nimi.padEnd(16)
        + (r.epost || "— e-post puudub —").padEnd(28)
        + (r.administraator ? "administraator" : ""));
    console.log("");
    process.exit(1);
  }

  const liige = await yks(
    "SELECT id, nimi FROM liikmed WHERE lower(epost) = $1", [epost]);
  if (!liige) {
    console.log("\n  Sellise e-postiga liiget ei ole: " + epost);
    console.log("  Jäta e-post ära, et näha nimekirja.\n");
    process.exit(1);
  }

  const mark = crypto.randomBytes(32).toString("base64url");
  await q(
    `INSERT INTO sisselogimise_margid (mark, liige_id, aegub)
     VALUES ($1, $2, now() + interval '7 days')`, [mark, liige.id]);

  console.log("\n  Sisselogimise link — " + liige.nimi);
  console.log("  Kehtib 7 päeva ja ühe korra.\n");
  console.log("  " + alus + "/sisene?mark=" + mark + "\n");
  process.exit(0);
})();
