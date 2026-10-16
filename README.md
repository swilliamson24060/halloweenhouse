# Ravenmoor House

A first-person haunted-house walkthrough built with Three.js (r170). Everything is generated in code: geometry, textures and sound. There are no image or audio files to host.

## Run it locally

ES modules need a web server (opening `index.html` from the file system will not work):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Put it online

Upload the whole folder (`index.html`, `manifest.webmanifest`, `icons/`, `art/` and `js/`) to any static host: GitHub Pages, Netlify, Cloudflare Pages, or your own server. Three.js and the fonts load from public CDNs, so visitors need an internet connection. Serve it over HTTPS: phones only allow full screen, screen wake lock and vibration on secure pages.

## Controls

- WASD or arrow keys: walk. Shift: hurry.
- Mouse: look (click the page to capture the mouse).
- E or click: open doors, read notes, use things.
- C (or middle click): look straight ahead again, level with the floor.
- F: torch on or off. M: sound on or off. Esc: pause and settings.
- Gamepads work too; click the right stick to look straight ahead.
- Missed an apparition? The pause menu has a hint: each press tells you where one you have not seen yet is waiting, nearest first. The ending card offers the same if any are left.

## Phones and tablets

- Walk (bottom left): hold it to walk forward. Keep holding while you drag to look with the other thumb, or slide the same thumb to steer; pressing it against the side of the screen keeps turning that way.
- Left side: slide a thumb anywhere else on the left to move in any direction (a stick appears under it).
- Right side: drag to look. Tap anything (a door, a note) to use it, or press Use, which lights up when something is in reach.
- Run and Torch sit beside Use (Run with Walk held runs), with Centre between them to look straight ahead again; Menu and Sound are at the top left.
- Phones start on the Low detail level. The picture sharpens itself when the phone has power to spare and softens when frames slow down (desktop browsers only soften).
- Android and iPad switch to full screen when you enter the house. iPhone Safari cannot do that for web pages, so the title card suggests Share, then Add to Home Screen, which opens the house full screen from its own icon.
- Sound plays even with an iPhone's silent switch on (the in-game Sound button still mutes it). The house pauses when you switch apps or lock the phone, and keeps the screen awake while you play.
- Android phones vibrate on the biggest frights; turn this off under Vibration in the menu.

## Where things live

- `js/world/house.js`: walls, floors, stairs, roofs, porch and turret.
- `js/world/rooms_*.js`: furniture and the scripted scares for each floor.
- `js/world/exterior.js`: grounds, fence, graveyard, garden and trees.
- `js/creatures/`: ghosts, spiders, snakes, bats, crows and rats.
- `js/creatures/cast.js`: who each apparition was in life (clothes, hair, pose, face); `figure.js` sculpts the bodies and `ghostfaces.js` paints the faces.
- `js/gfx/portraits.js`: the family portraits, painted in oils at load time with the brushes in `brush.js` and the heads in `face.js`.
- `art/portraits/`: paintings supplied as images (775×1024 JPEG, no frame or lettering). Each one listed in `ART` in `portraits.js` replaces the drawn portrait of the same name and gets its name lettered on; if a file is missing, the drawn one stays.
- `art/ghosts/`: apparitions supplied as glTF models (`.glb`, metres, Y up, feet at the origin, facing +Z). Each one listed in `GHOST_ART` in `js/creatures/ghost.js` replaces the built figure of the same person; its meshes are sorted into the ghost shader's material slots by name. With `shade`, the model's base colour texture is kept and read as light and shade, so a painted face, hair and gown show through the glow (a 1024² greyscale JPEG is plenty). If a file is missing, the built figure stays.
- `tools/ghost_glb.py`: makes a model as it comes from a 3D tool fit for `art/ghosts`: sized and standing on the floor, its parts and their names kept, geometry compressed, the base colour turned into a small greyscale texture and everything the ghost shader ignores left out (the banshee went from 5.1 MB to 0.7 MB). Run it from this folder with [uv](https://docs.astral.sh/uv/), which fetches numpy and Pillow for it, e.g. `uv run tools/ghost_glb.py new_ghosts/walter_hale_ghost.glb art/ghosts/walter.glb --height 1.74`, then list the result in `GHOST_ART`. `--help` lists the rest (turning it to face +Z, centring, texture size).
- `js/audio/audio.js`: the sound synthesiser.
- `js/story.js`: the notes found in the house.
