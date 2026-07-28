# ADR-001 — Mobile : Expo plutôt que React Native bare

- **Statut :** Accepté
- **Date :** 2026-07-27
- **Décideurs :** Christian BEYEME

## Contexte

Le cahier §3.2 laisse ouvert le choix **Expo** vs **React Native bare**. La décision doit être actée en Phase 1 avant le code mobile (M1/M2/M4 offline-first).

## Options envisagées

1. **Expo (managed / Expo Router)** — outillage OTA, `expo-sqlite`, build EAS, cycle de dev plus court.
2. **React Native bare (CLI)** — contrôle natif maximal, config Android/iOS manuelle, plus de friction au démarrage.

## Décision

**Option 1 — Expo**, pour le MVP (validé 2026-07-27) :

- Offline-first couvert via `expo-sqlite` + file de sync (cahier §3.2).
- Priorité Android terrain (§2.2) : Expo gère bien Android ; iOS en confirmation ultérieure.
- Sobriété (§3.1) : moins de configuration native à maintenir pendant M1–M7.
- Point d'échappement : un « prebuild » / module natif reste possible si un besoin terrain l'exige (sans migration totale).

## Conséquences

- Positives : démarrage mobile plus rapide ; alignement avec stack documentée ; sync locale standard.
- Négatives / dettes : certaines libs natives exotiques hors Expo peuvent demander un development build ; pas de garantie iOS complète dans le MVP.
- Impact cahier (`cdc-mvp-pigap.md`) : précise §3.2 (Expo retenu) — pas de déviation de stack.

## Liens

- Modules concernés : M1 (écrans), M2 (GPS), M4 (offline)
- Entrée journal : Phase 1 (2026-07-27)
