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
- F: torch on or off. M: sound on or off, as does the Sound button at the top left whenever the mouse is free (on the title card, or paused). Esc: pause and settings.
- Gamepads work too; click the right stick to look straight ahead.
- Apparitions count only when you walk right up to one, close enough to touch; a glimpse, even through a window, is not enough. Each waits where it stands until you do.
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
- `art/ghosts/`: apparitions supplied as glTF models (`.glb`, metres, Y up, feet at the origin, facing +Z). Each one listed in `GHOST_ART` in `js/creatures/ghost.js` replaces the built figure of the same person (one seen only in a mirror, like Josiah, can be a picture instead: a figure on a transparent background, shown as a cut-out that always faces the glass); its meshes are sorted into the ghost shader's material slots by name. With `shade`, the model's base colour texture is kept and read as light and shade, so a painted face, hair and gown show through the glow (a 1024² greyscale JPEG is plenty). Until a ghost's model arrives that ghost is not there at all, and it appears the first moment it is out of sight (a slow connection); a failed download is tried again, and only a model that cannot be had at all leaves the built figure in its place. The models' greyscale textures go to the graphics card as one channel and their vertices stay shared, to spare phones' memory.
- `art/creatures/spider.glb`: the model every spider is drawn from, crawling or hanging. The game sizes each spider itself (6 to 16 cm across the legs for the crawlers, 22 to 29 cm for the three that drop), and walks its legs on the graphics card, using the legs `tools/ghost_glb.py --legs 8` found and recorded in the file. Only the spiders near you and in view are drawn, all together. Until the model arrives no spiders are drawn; a failed download is tried again, and only if it cannot be had at all do built spiders stand in.
- `art/creatures/skeleton.glb`: the skeleton in the cellar's coffin, a rigged model. `js/creatures/skeleton.js` poses its bones: lying with its arms at its sides, then sitting bolt upright, its head turning to whoever opened the coffin and its arms reaching for them. The rig had no jaw, so one is cut free from the skull when the model loads, to drop open and chatter. A failed download is tried again; if the model cannot be had at all, `art/creatures/skeleton.webp` lies in the coffin instead: a picture of it lying there, drawn from the model, which does not move.
- `tools/ghost_glb.py`: makes a model as it comes from a 3D tool fit for `art/ghosts`: sized and standing on the floor, its parts and their names kept, geometry compressed, the base colour turned into a small greyscale texture and everything the ghost shader ignores left out (the banshee went from 5.1 MB to 0.7 MB). Run it from this folder with [uv](https://docs.astral.sh/uv/), which fetches numpy, Pillow and fast-simplification for it, e.g. `uv run tools/ghost_glb.py new_ghosts/walter_hale_ghost.glb art/ghosts/walter.glb --height 1.74 --glow=-0.30,1.08,0.13,-0.15,1.26,0.29`, then list the result in `GHOST_ART`. `--glow` cuts the bright triangles inside a box (metres, after sizing) into a part named glow, which burns in the ghost's glow colour: Walter's lantern glass. For a creature, `--colour` keeps the texture in colour, `--tris` thins the model to about that many triangles with its texture still in place, `--legs` rigs its legs for walking and bends any that stop short of the floor down to it, and `--up` and `--face` stand it up when the 3D tool laid it down. The spider, made from a photo taken from above, lay on its back facing right: `uv run tools/ghost_glb.py spider_20k.glb art/creatures/spider.glb --height 0.05 --up z --face x --center --colour --tex 512 --tris 3000 --legs 8` (2.5 MB to 0.13 MB). A rigged model keeps its bones; `--tidy-rig` mends what auto-rigging does to limbs that touch in the rest pose (the skeleton's hands hung against its thighs, which then followed its fingers): `uv run tools/ghost_glb.py skeleton_20k_rigged.glb art/creatures/skeleton.glb --height 1.7 --center --colour --tex 1024 --tidy-rig` (4.8 MB to 0.83 MB). `--help` lists the rest (turning it to face +Z, centring, texture size).
- `js/audio/audio.js`: the sound synthesiser.
- `js/story.js`: the notes found in the house.
