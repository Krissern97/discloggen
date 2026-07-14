// Live værdata under trening — Open-Meteo (gratis, ingen API-nøkkel/konto,
// samme filosofi som satellittkartet). Rent visningsformål: IKKE lagret i
// statistikken og påvirker aldri vind-flagget, som forblir brukerens egen
// subjektive vurdering (se «Vind» i CLAUDE.md). Oppdateres periodisk mens en
// økt pågår (se startWeather()/stopWeather() i session.js).

import { $ } from "./util.js";

let cache = null; // {temp, code, windSpeed, windDeg, ts}

const WCODE_ICON = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌦️", 56: "🌦️", 57: "🌦️",
  61: "🌧️", 63: "🌧️", 65: "🌧️", 66: "🌧️", 67: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️", 77: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "🌧️", 85: "🌨️", 86: "🌨️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};
const COMPASS = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];

export async function fetchWeather(la, lo) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
      `&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    const c = j.current;
    cache = {
      temp: Math.round(c.temperature_2m),
      code: c.weather_code,
      windSpeed: c.wind_speed_10m,
      windDeg: c.wind_direction_10m,
      precip: c.precipitation,
      ts: Date.now(),
    };
    return cache;
  } catch {
    return null;
  }
}

export function clearWeather() { cache = null; }
export function cachedWeather() { return cache; }

export function weatherChipHTML() {
  if (!cache) return `<span class="chip" id="weather-chip">☁️ …</span>`;
  const icon = WCODE_ICON[cache.code] ?? "☁️";
  const dir = COMPASS[Math.round(cache.windDeg / 45) % 8];
  return `<span class="chip" id="weather-chip">${icon} ${cache.temp}° · ${dir} ${Math.round(cache.windSpeed)} m/s</span>`;
}
