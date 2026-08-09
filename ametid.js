/* Ametid ja õigused.

   Maja põhimõte: kõikidel on võrdsed õigused. Üks erand — ühiskassa.

     kassa   näeb kogu maja müüki ja aruannet
             raamatupidaja, ülemus, administraator

     haldab  lisab liikmeid, muudab nimesid, teeb sisselogimislinke,
             haldab infot, üritusi, kalendrit, graafikut
             KÕIK sisselogitud liikmed

     annab   muudab ameteid ehk otsustab, kes kassat näeb
             AINULT administraator

   Miks „annab“ eraldi: kui igaüks saab ameteid muuta, siis saab igaüks
   endale ka kassaõiguse anda ja lukk ei loe midagi. Ka ülemus seda ei
   tee — õiguste jagamine on ühe inimese, administraatori asi. */
"use strict";

const AMETID = [
  { id: "liige",          nimi: "Liige",          kassa: false, annab: false, graafik: false,
    selgitus: "Haldab kõike peale ühiskassa; graafikus enda ridu" },
  { id: "raamatupidaja",  nimi: "Raamatupidaja",  kassa: true,  annab: false, graafik: false,
    selgitus: "Näeb ka kogu kassat ja aruannet" },
  { id: "ulemus",         nimi: "Ülemus",         kassa: true,  annab: false, graafik: true,
    selgitus: "Näeb kassat; muudab kõigi graafikut" },
  { id: "administraator", nimi: "Administraator", kassa: true,  annab: true,  graafik: true,
    selgitus: "Näeb kassat, muudab graafikut, jagab ameteid" }
];

const leia = a => AMETID.find(x => x.id === a) || AMETID[0];
const kehtiv = a => AMETID.some(x => x.id === a);

const naebKassat = liige => !!liige && leia(liige.amet).kassa;
const annabOigusi = liige => !!liige && leia(liige.amet).annab;
/* Töögraafik ja puudumised: oma read on igaühe enda teha, teiste omad
   ülemuse ja administraatori teha. Tööaeg on kokkulepe kahe vahel —
   keegi ei tohi kolmandat inimest vaikselt tööle panna ega maha võtta. */
const haldabGraafikut = liige => !!liige && leia(liige.amet).graafik;
/* Kõik muu on kõigi oma — sisselogimisest piisab. */
const haldabLiikmeid = liige => !!liige;

module.exports = { AMETID, leia, kehtiv, naebKassat, annabOigusi,
  haldabGraafikut, haldabLiikmeid };
