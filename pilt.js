/* Profiilipildi kontroll.

   Miks eraldi fail: pilt kirjutatakse andmebaasi kahest kohast —
   server.js (/api/liikmed PUT) ja seis.js (/api/seis PUT). Kui kontroll
   oleks ainult ühes neist, saaks teisest mööda minna. Sama mure nagu
   õigustega: brauseri kokkuleppest ei piisa, otsustada tuleb serveris.

   Ekraan kahandab pildi 128×128 ruuduks ja teeb JPEG-i (~5 kB). Server
   ei usu seda, vaid kontrollib üle: ainult päris pildivorming ja mõistlik
   suurus. Ilma selleta mahub pilt-välja kuni kaheksa megabaiti suvalist
   teksti — nii palju, kui kere piir lubab — ja see läheks igale liikmele
   ekraanile laadida. */
"use strict";

/* Lubatud on ekraani enda JPEG ning kolm ülejäänud tavalist rastervormingut
   juhuks, kui keegi hiljem ekraani muudab. SVG on meelega välja jäetud:
   see on tekstivorming ja temaga tuleks kaasa hulk asju, mida pilt ei vaja. */
const ALGUS = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

/* 32 kB. Ekraani tehtud pilt jääb 5 kB kanti, seega ruumi on kuuekordselt.
   Piir on stringi pikkuses, sest just seda andmebaasi kirjutatakse. */
const PIIR = 32768;

/* Vigane pilt ei ole viga, vaid lihtsalt pildi puudumine: alla jäävad
   initsiaalid, nagu ka siis, kui keegi pole pilti valinudki. Nii ei jää
   üksainus paha väli terve salvestuse ette risuks. */
function pildiks(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > PIIR) return null;
  if (!ALGUS.test(s)) return null;
  return s;
}

module.exports = { pildiks, PIIR };
