# SkyWatch Command Center

Build a dark-themed military counter-drone monitoring dashboard web app called “SkyWatch” using React + TypeScript + Tailwind CSS.

Color scheme: Pure black background (#0a0a0a), with electric green (#00ff41) as primary accent for safe zones, amber (#f59e0b) for warnings, red (#ef4444) for threats. Military HUD aesthetic throughout.

Page 1 — Main Dashboard (default view):

Full-screen dark layout with a radar/map canvas in the center showing a top-down grid view of airspace zones

8-10 animated drone blips moving across the map in real time (simulated with setInterval, random trajectories)

Each drone has: ID (DRONE-001 etc), speed, altitude, coordinates, threat level (LOW/MEDIUM/HIGH/CRITICAL)

Threat level auto-calculated: speed >80 + entering restricted zone = CRITICAL, color coded

Left sidebar: live drone list with status badges

Right sidebar: active alerts feed, newest on top, with timestamp

Top bar: system status, total drones tracked, threat count, current time

Page 2 — Drone Detail View (click any drone):

Full profile of selected drone

Trajectory prediction: “Estimated to reach Zone Alpha in 2m 30s”

Vitals: speed chart (last 60 seconds), altitude graph

Action buttons: Flag as Threat, Mark Safe, Dispatch Alert

Page 3 — Intelligence Report:

AI-generated threat summary (placeholder OpenAI call — just show a realistic hardcoded response for now)

Table of all drone incidents in current session

Export as PDF button (just UI, no function needed)

Technical:

All drone movement is simulated with JavaScript — no real API needed

Use Supabase to log threat events to a database table called drone_alerts (id, drone_id, threat_level, timestamp, coordinates)

Framer Motion for smooth drone position transitions

Recharts for the speed/altitude graphs

React Router for the 3 pages

Mobile responsive

Fonts: Space Mono or JetBrains Mono for the HUD feel

Make it look like a real military operations center. No placeholder lorem ipsum anywhere.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/96befd81-06ba-4b12-a42c-bbe4a6b063c2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
