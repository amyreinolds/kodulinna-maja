/* Ametid ja see, mida nad näevad ning tohivad.

   Kaks eri asja, mida on kerge segamini ajada:
     kassa  — näeb kogu maja müüki, mitte ainult enda oma
     haldab — saab liikmeid lisada, ameteid muuta ja kutseid teha

   Raamatupidaja näeb kõike, aga ei halda liikmeid — see ei ole tema töö.
   Ülemus ja administraator teevad mõlemat. */
"use strict";

const AMETID = [
  { id: "liige",          nimi: "Liige",          kassa: false, haldab: false,
    selgitus: "Näeb ainult oma müüki" },
  { id: "raamatupidaja",  nimi: "Raamatupidaja",  kassa: true,  haldab: false,
    selgitus: "Näeb kogu maja kassat ja aruannet" },
  { id: "ulemus",         nimi: "Ülemus",         kassa: true,  haldab: true,
    selgitus: "Näeb kogu kassat, haldab liikmeid" },
  { id: "administraator", nimi: "Administraator", kassa: true,  haldab: true,
    selgitus: "Näeb kogu kassat, haldab liikmeid ja rakendust" }
];

const leia = a => AMETID.find(x => x.id === a) || AMETID[0];
const kehtiv = a => AMETID.some(x => x.id === a);

/* Neid kahte küsitakse kogu rakenduses — kunagi ei kontrollita ametit
   nime järgi, alati nende kaudu. Nii ei jää uue ameti lisamisel
   kuhugi vana kontrolli. */
const naebKassat = liige => !!liige && leia(liige.amet).kassa;
const haldabLiikmeid = liige => !!liige && leia(liige.amet).haldab;

module.exports = { AMETID, leia, kehtiv, naebKassat, haldabLiikmeid };
