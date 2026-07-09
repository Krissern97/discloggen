# 🥏 Discloggen

Treningsapp (PWA) for disc golf: logg kast med GPS og se statistikk på **lengde og
retning** — per disc og totalt. Lagd for felttrening: still deg på en fotballbane,
kast discene dine, gå og registrer hvor de landet.

## Funksjoner

- **Lengdeøkter med GPS**: merk kastested og siktepunkt, trykk på discen når du
  kaster (backhand/forehand), og trykk på den igjen der den landet.
- **Lengde og retning**: hvert kast får meter + sideavvik fra siktelinja
  (f.eks. «74 m · 5 m venstre»).
- **Presisjonsøkter** 🎯: velg et mål (f.eks. midtsirkelen), kast mot det og logg
  hvor nærme du lander — snitt bom, beste og «innenfor 10 m»-prosent. Fint for puttere.
- **Spredningskart**: alle kast plottet rundt siktelinja, farget per disc.
- **Disc-bibliotek**: ta bilde av discene med kameraet (beskjæres kvadratisk),
  type og flight numbers.
- **Statistikk**: snitt, maks, venstre/høyre-tendens og spredning per disc,
  filtrert på backhand/forehand. Konfetti ved ny rekord 🎉
- **Offline-first**: fungerer uten dekning, all data lagres på telefonen.
  Backup via eksport/import (JSON).
- **Testmodus** med simulert GPS for å prøve appen innendørs.

## Bruk

Åpne appen på telefonen og installer den:

- **Android/Chrome**: ⋮ → «Installer app»
- **iPhone/Safari**: Del → «Legg til på Hjem-skjerm»

GPS krever HTTPS — appen kjøres fra GitHub Pages.

## Utvikling

Ingen byggesteg, ingen avhengigheter — vanilla JS med ES-moduler.

```bash
npx http-server -p 8080   # eller hvilken som helst statisk server
```

Ved deploy: **bump `CACHE`-versjonen i `sw.js`**, ellers ser installerte apper
gammel versjon. Se `CLAUDE.md` for arkitektur og datamodell.
