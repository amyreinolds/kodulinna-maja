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
  { id: "liige",          nimi: "Liige",          kassa: false, annab: false, teised: false,
    selgitus: "Haldab kõike peale ühiskassa; enda kohta käivat infot" },
  { id: "raamatupidaja",  nimi: "Raamatupidaja",  kassa: true,  annab: false, teised: false,
    selgitus: "Näeb ka kogu kassat ja aruannet" },
  { id: "ulemus",         nimi: "Ülemus",         kassa: true,  annab: false, teised: true,
    selgitus: "Näeb kassat; muudab teiste kohta käivat infot" },
  { id: "administraator", nimi: "Administraator", kassa: true,  annab: true,  teised: true,
    selgitus: "Näeb kassat, muudab teiste infot, jagab ameteid" }
];

const leia = a => AMETID.find(x => x.id === a) || AMETID[0];
const kehtiv = a => AMETID.some(x => x.id === a);

const naebKassat = liige => !!liige && leia(liige.amet).kassa;
const annabOigusi = liige => !!liige && leia(liige.amet).annab;
/* Teiste inimeste kohta käiv info: tööaeg, puudumised, kontaktandmed,
   osalemine, kinnitused, kes töö ära tegi. Oma kohta paneb igaüks ise
   kirja; teiste eest ülemus ja administraator. Nii ei saa keegi kolmandat
   inimest vaikselt tööle panna, tema eest üritusele lubada ega tema
   nimel kinnitada. */
const haldabTeisi = liige => !!liige && leia(liige.amet).teised;
/* Kõik muu on kõigi oma — sisselogimisest piisab. */
const haldabLiikmeid = liige => !!liige;

module.exports = { AMETID, leia, kehtiv, naebKassat, annabOigusi,
  haldabTeisi, haldabLiikmeid };
