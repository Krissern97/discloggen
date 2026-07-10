// All lagring: localStorage med disc_-prefiks. Nøkkelnavn og datastruktur er
// hellige etter første deploy — aldri rename uten migreringskode.
//
// disc_discs    : [{id, navn, type, sp, gl, tu, fa, ci, img, ark, ts}]
// disc_sessions : [{id, ts, end, sm, rounds:[{ts, start, aim, pend:[...], throws:[...]}]}]
//                 sm: "L" (lengdeøkt) | "P" (presisjonsøkt — aim er målet)
//                 runde = ett kast+hent-slag fra ett kastested. ts = når runden startet.
//                 start/aim: {la, lo, acc} | null
//                 pend:   {id, discId, kt, ts}                  (kastet, ikke hentet)
//                 throws: {id, discId, kt, dist, side, frem, acc, ts, pos:{la,lo},
//                          td?}  — td = avstand kastested→mål (kun presisjonskast)
//                 kt: "BH" | "FH" — side: meter (+høyre/−venstre) | null uten siktepunkt
// disc_current  : pågående økt (samme form), lagres fortløpende
// disc_settings : {theme, lyd, kt, demo, seeded}
//                 seeded: true når startdiscer er forsøkt sådd (kun fersk install)

const PREFIX = "disc_";

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export function save(key, val) {
  if (val === null || val === undefined) localStorage.removeItem(PREFIX + key);
  else localStorage.setItem(PREFIX + key, JSON.stringify(val));
}

export const S = {
  discs:    load("discs", []),
  sessions: load("sessions", []),
  cur:      load("current", null),
  set:      Object.assign({ theme: "auto", lyd: true, kt: "BH", demo: false, seeded: false }, load("settings", {})),
  mode: "kast",          // "kast" | "hent" — kun i minnet
};

export const saveDiscs    = () => save("discs", S.discs);
export const saveSessions = () => save("sessions", S.sessions);
export const saveCur      = () => save("current", S.cur);
export const saveSet      = () => save("settings", S.set);

/* ---------- undo: snapshot av pågående økt per handling ---------- */
const UNDO = [];
export function snapshot() {
  UNDO.push(JSON.stringify(S.cur));
  if (UNDO.length > 200) UNDO.shift();
}
export function undo() {
  if (!UNDO.length) return false;
  S.cur = JSON.parse(UNDO.pop());
  saveCur();
  return true;
}
export const canUndo = () => UNDO.length > 0;
export const clearUndo = () => { UNDO.length = 0; };

/* ---------- oppslag ---------- */
export const discById = id => S.discs.find(d => d.id === id);
export const activeDiscs = () => S.discs.filter(d => !d.ark);
export const curRound = () => S.cur ? S.cur.rounds[S.cur.rounds.length - 1] : null;

/* Alle fullførte kast på tvers av lagrede økter + pågående, valgfritt filtrert
   på kasttype. Hvert kast får med øktmodusen (sm = "L"/"P") og en referanse til
   økten det kom fra (sessId, sessTs) — brukes til å gruppere trendgrafer per
   økt kronologisk uten å lagre dette redundant i selve kast-objektet. */
export function allThrows(kt) {
  const sessions = [...S.sessions, ...(S.cur ? [S.cur] : [])];
  const out = [];
  for (const s of sessions)
    for (const r of s.rounds)
      for (const t of r.throws)
        if (!kt || kt === "ALL" || t.kt === kt) out.push({ ...t, sm: s.sm ?? "L", sessId: s.id, sessTs: s.ts });
  return out;
}

/* bom-avstand fra målet for presisjonskast (krever td = avstand kastested→mål) */
export const missOf = t => Math.hypot(t.side, t.frem - t.td);

/* ---------- eksport / import / slett alt ---------- */
export function exportJSON() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
  }
  return JSON.stringify({ app: "discloggen", ver: 1, dato: new Date().toISOString(), data }, null, 1);
}

export function importJSON(text) {
  const obj = JSON.parse(text);
  if (obj.app !== "discloggen" || !obj.data) throw new Error("Ikke en Discloggen-backup");
  for (const [k, v] of Object.entries(obj.data))
    if (k.startsWith(PREFIX)) localStorage.setItem(k, v);
}

export function wipeAll() {
  for (const k of Object.keys(localStorage))
    if (k.startsWith(PREFIX)) localStorage.removeItem(k);
}
