/* Sisselogimine e-kirjale saadetava lingiga. Parooli ei ole — vanem inimene
   ei pea midagi meeles pidama ja unustatud parooli ei saa varastada.

   Käik:
     1. kirjutad oma e-posti          -> tekib ühekordne märk (token)
     2. saad kirja lingiga            -> praegu ilmub link serveri aknasse
     3. lingile vajutades             -> märk vahetatakse küpsise vastu
     4. küpsis kehtib 60 päeva        -> allkirjastatud, seega võltsida ei saa
*/
"use strict";
const crypto = require("crypto");
const { q, yks } = require("./db");
const post = require("./post");

const SALADUS = process.env.SESSIOONI_SALADUS || "arendus";
/* Sellega allkirjastatakse sisselogimise küpsis. Kui ta on nõrk või teada,
   saab keegi teise inimese küpsise ise kokku panna. */
if (SALADUS.length < 32) {
  console.warn("\n  TÄHELEPANU: SESSIOONI_SALADUS on liiga lühike või puudub.");
  console.warn("  Enne kui rakendust kellegagi jagad, pane .env faili pikk juhuslik sõne.\n");
}
const KUPSIS = "km_sessioon";
const KEHTIB_PAEVA = 60;
const MARGI_MINUTIT = 30;

const allkiri = v => crypto.createHmac("sha256", SALADUS).update(v).digest("base64url");

/* Küpsis on „liikme id . allkiri“. Allkirja ilma saladuseta teha ei saa,
   seega keegi ei saa end teiseks inimeseks kirjutada. */
function tee(id) {
  return id + "." + allkiri(id);
}
function loe(vaartus) {
  if (!vaartus) return null;
  const i = vaartus.lastIndexOf(".");
  if (i < 0) return null;
  const id = vaartus.slice(0, i), a = vaartus.slice(i + 1);
  const oige = allkiri(id);
  /* Ajakindel võrdlus: pikkuse või sisu järgi ei tohi vastust aimata. */
  if (a.length !== oige.length) return null;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(oige)) ? id : null;
}

/* Kes on selle päringu taga? Tagastab liikme või null. */
async function kesOn(req) {
  const kupsised = Object.fromEntries((req.headers.cookie || "").split(";")
    .map(x => x.trim().split("="))
    .filter(x => x.length === 2).map(([k, v]) => [k, decodeURIComponent(v)]));
  const id = loe(kupsised[KUPSIS]);
  if (!id) return null;
  /* NB: amet peab siin kaasa tulema — kogu õiguste kontroll käib selle
     järgi. Ilma selleta paistab iga sisselogija tavalise liikmena. */
  return await yks(
    "SELECT id, nimi, roll, epost, amet, administraator FROM liikmed WHERE id = $1", [id]);
}

/* Märgi loomine.

   Tundmatu aadressi puhul ütleme otse välja, et teda ei ole. See on
   sisemine tööriist, kus liikmete nimekiri on rakenduse sees niikuinii
   nähtav — vaikimine ei kaitseks midagi, aga jätaks inimese hätta,
   kes ei saa aru, miks midagi ei juhtu. */
async function kysiLink(epost, alus) {
  const e = String(epost || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { viga: "Kirjuta korrektne e-posti aadress." };

  let liige = await yks("SELECT id, nimi FROM liikmed WHERE lower(epost) = $1", [e]);

  /* Esimene sisselogija saab administraatori konto. Nii ei pea kuskil
     parooli ega esimest kasutajat käsitsi tekitama.

     Majutuses on see VÄLJAS. Avalikul aadressil tähendaks see, et
     juhuslik möödakäija võib esimesena end administraatoriks kirjutada.
     Kui on vaja, lülita sisse .env failis ESIMENE_SISSELOGIJA=lubatud. */
  const bootstrapLubatud = process.env.NODE_ENV !== "production"
    || process.env.ESIMENE_SISSELOGIJA === "lubatud";
  if (!liige && bootstrapLubatud) {
    const keegi = await yks("SELECT count(*)::int AS n FROM liikmed WHERE epost IS NOT NULL AND epost <> ''");
    if (keegi.n === 0) {
      liige = await yks(
        `UPDATE liikmed SET epost = $1, administraator = true
         WHERE id = (SELECT id FROM liikmed ORDER BY loodud LIMIT 1)
         RETURNING id, nimi`, [e]);
    }
  }
  if (!liige) return {
    viga: "Seda aadressi ei ole majas kirjas. Palu administraatoril see lisada."
  };

  const mark = crypto.randomBytes(32).toString("base64url");
  await q(
    `INSERT INTO sisselogimise_margid (mark, liige_id, aegub)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [mark, liige.id, String(MARGI_MINUTIT)]);

  const link = alus + "/sisene?mark=" + mark;
  console.log("\n  SISSELOGIMISE LINK (" + liige.nimi + " <" + e + ">)\n  " + link + "\n");

  const saatmine = await post.saadaLink(e, liige.nimi, link);

  /* Lingi ekraanile andmine on arenduse mugavus ja MITTE avalikus
     internetis. Seal tähendaks see, et igaüks, kes teab mõne liikme
     e-posti, saab tema nimel sisse — parooli asemel piisaks aadressist.
     Majutuses käib sisenemine kas e-kirjaga või administraatori
     tehtud kutselingiga. */
  const tohibNaidata = process.env.NODE_ENV !== "production";
  return {
    ok: true,
    kiriSaadetud: saatmine.saadetud,
    link: (!saatmine.saadetud && tohibNaidata) ? link : null,
    postitaTa: !saatmine.saadetud && !tohibNaidata
  };
}

/* Kutse: administraator teeb liikmele sisselogimislingi ja annab selle ise
   kätte. Nii ei ole postiteenust üldse vaja — kaheksa inimese majas on see
   lihtsam ja usaldusväärsem kui kolmas osapool vahel.
   Kutse kehtib kauem kui tavaline link, sest ta liigub inimeselt inimesele. */
const KUTSE_PAEVI = 7;

async function teeKutse(liigeId, alus) {
  const liige = await yks("SELECT id, nimi FROM liikmed WHERE id = $1", [liigeId]);
  if (!liige) return null;
  const mark = crypto.randomBytes(32).toString("base64url");
  await q(
    `INSERT INTO sisselogimise_margid (mark, liige_id, aegub)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [mark, liige.id, String(KUTSE_PAEVI)]);
  return { nimi: liige.nimi, link: alus + "/sisene?mark=" + mark, paevi: KUTSE_PAEVI };
}

/* Märgi vahetamine küpsise vastu. Märk kehtib üks kord. */
async function sisene(mark) {
  const r = await yks(
    `DELETE FROM sisselogimise_margid
     WHERE mark = $1 AND aegub > now()
     RETURNING liige_id`, [mark]);
  if (!r) return null;
  return {
    id: r.liige_id,
    kupsis: KUPSIS + "=" + encodeURIComponent(tee(r.liige_id))
      + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (KEHTIB_PAEVA * 86400)
  };
}

const valjaKupsis = KUPSIS + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";

module.exports = { kesOn, kysiLink, sisene, teeKutse, valjaKupsis };
