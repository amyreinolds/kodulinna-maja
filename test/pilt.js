/* Profiilipildi kontroll. Serverit ega andmebaasi siin vaja ei ole —
   pildiks() on puhas funktsioon ja seda saab läbi käia otse.

   Miks see test on: ekraan kahandab pildi 128×128 peale, aga see on
   kokkulepe brauseris. Server peab sama asja ise üle vaatama, muidu
   mahub pilt-välja kuni kaheksa megabaiti suvalist teksti. */
"use strict";
const { pildiks, PIIR } = require("../pilt");

let vigu = 0;
function on(mis, oodatud, saadud) {
  const ok = oodatud === saadud;
  if (!ok) { vigu++; console.log("  VIGA  " + mis + ": ootasin " + oodatud + ", sain " + saadud); }
  else console.log("  ok    " + mis);
}

/* Päris pilt, nagu ekraan ta teeb. */
const päris = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
on("jpeg läheb läbi", päris, pildiks(päris));
on("png läheb läbi",
   "data:image/png;base64,iVBORw0KGgo=", pildiks("data:image/png;base64,iVBORw0KGgo="));
on("webp läheb läbi",
   "data:image/webp;base64,UklGRg==", pildiks("data:image/webp;base64,UklGRg=="));
/* Sama pilt, mida test/inimesed.js kasutab — üks läbipaistev punkt. */
const gif = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
on("gif läheb läbi", gif, pildiks(gif));

/* Pildi puudumine on lubatud — alla jäävad initsiaalid. */
on("tühi on null", null, pildiks(""));
on("null on null", null, pildiks(null));
on("undefined on null", null, pildiks(undefined));
on("tühikud on null", null, pildiks("   "));

/* Kõik muu ei ole pilt. */
on("pelk tekst ei kõlba", null, pildiks("tere"));
on("võõras aadress ei kõlba", null, pildiks("https://kuskil.ee/pilt.jpg"));
on("svg ei kõlba", null, pildiks("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="));
on("html ei kõlba", null, pildiks("data:text/html;base64,PGgxPnRlcmU8L2gxPg=="));
on("javascript ei kõlba", null, pildiks("javascript:alert(1)"));
on("base64-ta ei kõlba", null, pildiks("data:image/jpeg,tere"));
on("vigane base64 ei kõlba", null, pildiks("data:image/jpeg;base64,tere maailm!"));

/* Suurus. Ekraani pilt jääb 5 kB kanti, seega piirini on ruumi küll —
   aga kaheksa megabaiti sinna ei mahu. */
const suur = "data:image/jpeg;base64," + "A".repeat(PIIR);
on("üle piiri ei kõlba", null, pildiks(suur));
const paras = "data:image/jpeg;base64," + "A".repeat(1000);
on("piiri sees läheb läbi", paras, pildiks(paras));

console.log(vigu ? "\nPildi kontroll: " + vigu + " viga" : "\nPildi kontroll: korras");
process.exit(vigu ? 1 : 0);
