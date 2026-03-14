# Whoop Analytics

Real-time biometrics dashboard for Whoop 4.0 and other BLE heart rate monitors.

**Live demo:** https://abhinavgupta621.github.io/whoop-analytics/

## Features

- **Heart Rate** — live BPM with zone classification (Rest, Fat Burn, Cardio, Hard, Peak)
- **HRV** — RMSSD and SDNN computed from RR intervals
- **Stress Index** — Baevsky stress index derived from HRV
- **SpO2** — estimated blood oxygen from PPG signal
- **Skin Temperature** — real-time skin temp readout
- **Accelerometer** — 3-axis motion data (Whoop only)
- **Heart Rate Zones** — time-in-zone tracking with visual breakdown
- **Live Charts** — scrollable time-series plots (30s to 30m windows)
- **Light & Dark Mode** — system-aware with manual toggle

## Supported Devices

| Device | HR | HRV | SpO2 | Temp | Accel |
|--------|:--:|:---:|:----:|:----:|:-----:|
| Whoop 4.0 | Yes | Yes | Yes | Yes | Yes |
| Garmin HRM | Yes | Yes | — | — | — |
| Polar H10 | Yes | Yes | — | — | — |
| Any BLE HR strap | Yes | Partial | — | — | — |

Whoop uses a custom BLE protocol for extended metrics. Standard BLE heart rate monitors will show HR and derived HRV.

## Tech Stack

- React 19 + TypeScript 5.9
- Vite 7
- Tailwind CSS v4 + shadcn/ui
- Zustand (state management)
- uPlot (charts)
- Web Bluetooth API

## Getting Started

```bash
npm install
npm run dev
```

Open in Chrome or Edge (Web Bluetooth required). Click **Connect Device** and select your heart rate monitor.

## Deploy

```bash
npm run deploy
```

Builds and publishes to GitHub Pages via `gh-pages`.

## Requirements

- Chrome or Edge (Web Bluetooth is not supported in Firefox or Safari)
- A BLE heart rate monitor with broadcasting enabled
