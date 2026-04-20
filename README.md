# Robo Kart

Robo Kart is a Mario Kart-inspired browser racing game built with Phaser. You race against bot drivers across multiple tracks, collect items, and try to beat the field over several laps.

## Play Online

GitHub Pages:

[https://deepikar8.github.io/rohan-cart/](https://deepikar8.github.io/rohan-cart/)

## Features

- Multiple tracks with visible difficulty ratings
- Adjustable bot difficulty
- Item pickups including shells, bananas, and boosts
- Chase camera and driver POV toggle
- Local browser-based play with no build step

## Controls

- `Arrow keys` or `WASD`: drive
- `Z`: use item slot 1
- `X`: use item slot 2
- `C`: toggle camera view

## Run Locally

Because the game uses ES modules in the browser, run it through a local web server instead of opening `index.html` directly.

Example:

```bash
python3 -m http.server 3000
```

Then open:

```text
http://localhost:3000
```

## Tech Stack

- Phaser 3
- Plain JavaScript ES modules
- Static hosting via GitHub Pages

## Repository

GitHub:

[https://github.com/Deepikar8/rohan-cart](https://github.com/Deepikar8/rohan-cart)
