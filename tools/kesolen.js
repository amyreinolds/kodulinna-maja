/* Kes ma proovides olen — vahetab .env failis rea KOHE_SISSE.

   Proovimise ajal on tüütu iga kord uuesti sisse logida ja veel tüütum
   on kahe konto vahel käia. See vahetab ühe reaga: kelle nime all sa
   oma arvutis rakendust avades sees oled.

   Kasutamine:
     node tools/kesolen.js                    → näitab valikuid
     node tools/kesolen.js proovija@...       → tavaline liige
     node tools/kesolen.js ailexica@proton.me → administraator
     node tools/kesolen.js valja              → võtab proovirežiimi maha
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { q } = require("../db");

const ENV = path.join(__dirname, "..", ".env");

(async () => {
  const soov = (process.argv[2] || "").trim().toLowerCase();

  const read = await q(
    `SELECT nimi, epost, amet FROM liikmed WHERE epost IS NOT NULL ORDER BY amet, nimi`);

  if (!soov) {
    const praegu = (fs.readFileSync(ENV, "latin1")
      .match(/KOHE_SISSE=([^\r\n]*)/) || [, "—"])[1].trim();
    console.log("\n  Praegu avaneb rakendus kui: " + (praegu || "— (proovirežiim maas)"));
    console.log("\n  Vali üks:");
    for (const r of read)
      console.log("    node tools/kesolen.js " + r.epost.padEnd(30) + r.nimi + " (" + r.amet + ")");
    console.log("    node tools/kesolen.js valja" + " ".repeat(24) + "proovirežiim maha\n");
    process.exit(0);
  }

  if (soov !== "valja" && !read.some(r => r.epost.toLowerCase() === soov)) {
    console.log("\n  Sellise e-postiga liiget ei ole: " + soov);
    console.log("  Käivita ilma aadressita, et näha valikuid.\n");
    process.exit(1);
  }

  /* .env on osalt Windowsi kodeeringus — loeme baitidena ja puutume
     ainult seda ühte rida, et täpitähed mujal katki ei läheks. */
  const b = fs.readFileSync(ENV);
  const uus = Buffer.from("KOHE_SISSE=" + (soov === "valja" ? "" : soov), "utf8");
  const tekst = b.toString("latin1");
  if (!/KOHE_SISSE=/.test(tekst)) {
    fs.appendFileSync(ENV, "\nKOHE_SISSE=" + (soov === "valja" ? "" : soov) + "\n");
  } else {
    const välja = Buffer.from(
      tekst.replace(/KOHE_SISSE=[^\r\n]*/, uus.toString("latin1")), "latin1");
    fs.writeFileSync(ENV, välja);
  }

  const kes = read.find(r => r.epost.toLowerCase() === soov);
  console.log(soov === "valja"
    ? "\n  Proovirežiim maas — nüüd küsib rakendus sisselogimist.\n"
    : "\n  Rakendus avaneb nüüd kui " + kes.nimi + " (" + kes.amet + ").\n"
      + "  Käivita server uuesti, et muudatus kehtiks.\n");
  process.exit(0);
})();
