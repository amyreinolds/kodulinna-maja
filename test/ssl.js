/* Kontroll: kas andmebaasiühendus on krüpteeritud ja sertifikaat kontrollitud.

   Kaks asja, mis vahepeal eksitasid ja mille pärast on siin nii, nagu on:

   1. „Vale hostinime“ katse ei tõesta midagi — Neoni sertifikaat on
      metamärgiga (*.c-4.us-east-2.aws.neon.tech), seega naaberaadress
      mahub selle alla ja läheb õigustatult läbi.

   2. pg_stat_ssl näitab siin ssl=false, sest me käime ühenduste jagaja
      (pooler) kaudu. See vaade räägib jagaja ja Postgresi vahelisest
      lõigust, mitte meie omast.

   Seepärast küsime vastust sealt, kus tõde on: TLS-ühenduse enda käest. */
"use strict";
require("../db");                      /* loeb .env sisse */
const { Client } = require("pg");

(async () => {
  let vigu = 0;
  const kontrolli = (nimi, tingimus, lisa) => {
    console.log((tingimus ? "  OK   " : "  VIGA ") + nimi + (lisa ? "  " + lisa : ""));
    if (!tingimus) vigu++;
  };

  const url = process.env.DATABASE_URL;
  kontrolli("sslmode on verify-full", /sslmode=verify-full/.test(url),
    (url.match(/sslmode=[^&]*/) || ["puudub"])[0]);

  const c = new Client({ connectionString: url });
  await c.connect();
  const s = c.connection.stream;               /* TLS-pesa */

  kontrolli("ühendus on TLS", typeof s.getPeerCertificate === "function");
  kontrolli("sertifikaat on kontrollitud ja kehtiv", s.authorized === true,
    s.authorized ? "" : "põhjus: " + s.authorizationError);

  const cert = s.getPeerCertificate();
  const nimed = (cert.subjectaltname || "").replace(/DNS:/g, "");
  kontrolli("sertifikaat kehtib selle serveri kohta",
    !!cert.subject, "kellele: " + (cert.subject && cert.subject.CN));
  console.log("         kehtib kuni: " + cert.valid_to);
  console.log("         välja andnud: " + (cert.issuer && cert.issuer.O));
  console.log("         katab: " + nimed.slice(0, 70));

  await c.end();
  console.log(vigu ? "\n" + vigu + " viga." : "\nKõik korras.");
  process.exit(vigu ? 1 : 0);
})();
