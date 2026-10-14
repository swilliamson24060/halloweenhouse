# Ravenmoor House

A first-person haunted-house walkthrough built with Three.js (r170). Everything is generated in code: geometry, textures and sound. There are no image or audio files to host.

## Run it locally

ES modules need a web server (opening `index.html` from the file system will not work):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Put it online

Upload the whole folder (`index.html` and `js/`) to any static host: GitHub Pages, Netlify, Cloudflare Pages, or your own server. Three.js and the fonts load from public CDNs, so visitors need an internet connection.

## Controls

- WASD or arrow keys: walk. Shift: hurry.
- Mouse: look (click the page to capture the mouse).
- E or click: open doors, read notes, use things.
- F: torch on or off. M: sound on or off. Esc: pause and settings.
- Phones and tablets get an on-screen stick and buttons. Gamepads work too.

## Where things live

- `js/world/house.js`: walls, floors, stairs, roofs, porch and turret.
- `js/world/rooms_*.js`: furniture and the scripted scares for each floor.
- `js/world/exterior.js`: grounds, fence, graveyard, garden and trees.
- `js/creatures/`: ghosts, spiders, snakes, bats, crows and rats.
- `js/audio/audio.js`: the sound synthesiser.
- `js/story.js`: the notes found in the house.
