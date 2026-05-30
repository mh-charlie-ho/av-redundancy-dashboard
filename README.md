# AV Redundancy Dashboard

Published app: https://av-redundancy-dashboard-ms0e5bs91-charlie-ho-s-projects.vercel.app/

## Vibe Coding Notes

**This project was built heavily through vibe coding.** The goal was not to manually shape every line of code, but to iterate from the user side: test the app, observe what felt wrong, report that feedback to AI, and let AI make the next round of changes.

The main workflow was:

1. Use v0 by Vercel for the initial prototype
2. Push to GitHub
3. Use Claude Code for development
4. Deploy and host on Vercel

⚠️ 📌 👉 Key notes are here:

https://app.notion.com/p/Web-Dev-370da30fd17e80f8912bee33311f274f?source=copy_link

Interactive dashboard for visualizing autonomous vehicle sensor redundancy and coverage. The app lets you configure LiDAR, camera, and radar positions, ranges, fields of view, and active status on a vehicle-centered coordinate map.

## Features

- Visualize sensor positions, labels, and FOV coverage on an interactive SVG map.
- Add, delete, reorder, enable, and disable sensors.
- Edit sensor type, position, yaw angle, range, and FOV.
- Configure vehicle dimensions and baselink offset.
- Pan, zoom, center, and reset the visualization.
- Toggle global and per-sensor display options.
- Import and export dashboard configuration as JSON.
- Persist local configuration in browser `localStorage`.
- Switch between light and dark themes.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Open the app at:

```text
http://localhost:3000
```

## Configuration Data

Dashboard state is saved automatically in the browser under the key:

```text
av-dashboard-config
```

The exported JSON includes:

- Sensors and sensor active status
- Vehicle dimensions
- Car model offset from baselink
- Global display settings
- View state
- Ring max range
- Save timestamp

## Coordinate System

Sensor and vehicle positions are defined relative to `baselink` at `(0, 0)`.

- `+X` points forward.
- `+Y` points left.
- `yaw = 0` faces forward.
- `yaw = 90` faces left.
- `yaw = -90` faces right.
