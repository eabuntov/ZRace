# ZRace

An in-browser 3D racing game: ten Chinese cars — BYD, Chery, Geely, Great Wall, Xiaomi
and ZEEKR — five circuits from five countries, AI opponents, lap timing and a full race
weekend flow, all in plain JavaScript with [three.js](https://threejs.org/) and no build
step.

## Run it

ES modules need to be served over HTTP (opening `index.html` from disk will not work):

```bash
python tools/serve.py
```

Then open <http://localhost:8000/>. `python -m http.server` works too, but it sends no
cache headers, so a browser will happily keep serving the module or stylesheet it fetched
before your last edit - and a fresh `main.js` against a stale `carModel.js` fails in a way
that reads like a code error. `tools/serve.py` is the same server with caching turned off.

Three.js is loaded from a CDN via the import map in `index.html`, so the first load needs
an internet connection. Everything else — road surfaces, kerbs, barriers, crowds, car
paint, the sky — is generated in code at run time.

## Deploy it

On a fresh Ubuntu machine, with the repo cloned:

```bash
sudo tools/deploy.sh
```

That installs nginx, publishes `index.html`, `css/`, `js/` and `assets/` to `/var/www/zrace`
and writes the site config. For a host name and a certificate:

```bash
sudo tools/deploy.sh -d zrace.example.com --tls -e you@example.com
```

`--repo https://github.com/eabuntov/ZRace.git` makes the script clone the game itself, so it
can be copied to a server on its own; `--help` lists the rest.

Re-run it to publish a change - anything deleted here is deleted there. The config it writes
gzips the car models at deploy time (the fleet's 15 MB goes over the wire as 11.5 MB), gives
`.glb` the media type Ubuntu's `mime.types` has never heard of, and marks every file to
revalidate, for the same reason `tools/serve.py` sends no-cache: nothing here carries a
content hash in its name, and a cached `main.js` against a fresh `carModel.js` fails with
"does not provide an export named ...".

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake, then reverse |
| `A` `D` / `←` `→` | Steer |
| `Shift` | Boost — a few seconds of overboost, then it refills |
| `Space` | Handbrake (drops rear grip, and switches stability control off) |
| `C` | Camera: chase / close / bonnet |
| `R` | Rejoin the track |
| `P` or `Esc` | Pause |
| `M` | Mute |

A gamepad works too (right trigger accelerates, left brakes, left stick steers, B or a
shoulder button boosts), and on-screen pedals appear on touch devices.

### Boost

A tank worth about four and a half seconds, spent by holding `Shift`. It lifts the power
ceiling and the limiter by a third, so it is worth real time down a straight — but it
cannot buy grip, and stability control still gives the corner first call on the tyres, so
there is nothing to be gained by holding it through a hairpin. It does nothing with the
throttle shut, so it neither lights nor drains while you are coasting. The tank refills on
its own and refills faster under braking, off the same regenerated energy the power ring
shows.

You can see it: a plume out of each side of the diffuser, the tail lamps up, streaks
rushing past the edge of the frame and the camera falling back a few degrees of field of
view. The plume is ion blue rather than flame orange because nothing on this grid burns
anything — `JET_COLOUR` in `js/cars.js` is one line if you would rather have fire.

### Stability control

Grip is one budget shared between turning and driving, and these cars have the electronics
to police it: the drive force is capped by whatever the corner is not already using. Without
that a 1.1 MW car answers a held throttle by spending its whole contact patch on
acceleration, which on a keyboard — where the throttle is only ever 0 or 1 — meant the quick
cars understeered into the barriers while the slow ones drove fine. Pull the handbrake and
the assistance goes away, which is how you hold a slide on purpose.

## Records

Lap times are kept per circuit under the name on the title screen, one row per driver per
car. The Records screen has two boards behind one toggle.

**This browser** is always there: twelve rows a circuit in `localStorage`, no account, no
network, shared by whoever races on the same machine. Deploy the game as a folder of static
files and this is all you get, which is a complete answer for most people.

**Global** appears when the deployment is running the record board — `server/scores.py`, a
standard-library Python service over one SQLite file, behind `/api/` on the same host.
Install it with `sudo tools/deploy.sh --scores`. Everything about it fails soft: if it is
missing, slow or down, the game falls back to the local board and says so, and a lap set
meanwhile still lands in `localStorage`.

SQLite rather than a cache server because the whole board is about twenty kilobytes and
this way it is durable on the first write with nothing to configure, backed up by copying
one file, and reached through the HTTP service you had to write anyway.

### Keeping the global board honest

There is no login, so nothing can prove a lap was driven. What *can* be proved is that one
was not. `tools/lap_floors.mjs` runs each car round each circuit at the limit everywhere —
cornering, braking and accelerating as hard as its grip and motor allow — and writes the
resulting lap times to `server/floors.json`. Nobody beats that number, so anything quicker
is refused. Submissions are also rate limited per address, names are cleaned, and the
service binds to loopback with nginx in front. Re-run the generator after changing a car's
figures or a circuit's layout:

```
node tools/lap_floors.mjs
```

To develop against it, run the board alongside the dev server — `tools/serve.py` forwards
`/api/` to it exactly as nginx does:

```
python tools/serve.py 8010
python server/scores.py --port 8011 --db zrace.db
```

## Languages

The game ships in English, Chinese, Japanese, Russian, German, French, Spanish and
Italian. On first run it takes the first of those that the browser asks for — `zh-CN`
finds Chinese, `de-AT` finds German — and falls back to English if it recognises none of
them. **Options** on the title screen overrides that, and the choice is remembered in
this browser; **AUTO** hands it back to the browser and shows which language that is.

Menus, HUD, messages, results and the record board are all translated, as are car types,
taglines, paint names, circuit blurbs and the countries. Model and circuit names are not:
`XIAOMI SU7 ULTRA` and `Mount Panorama` read the same everywhere. Numbers and dates
follow the language too, so a circuit is 4.40 km in English and 4,40 км in Russian.

### Adding a language

1. Copy `js/lang/en.js` to `js/lang/<code>.js` and translate the values. English is the
   fallback for anything you leave out, so a partial catalogue is safe to commit.
2. Add `{ code, name }` to `LANGUAGES` in `js/i18n.js`. That list is also the allow-list
   — a code that is not on it is never imported.
3. Keep the `{name}` placeholders. Plural keys (`track.corners.*`) end in a CLDR
   category; supply the ones your language uses and `.other` for the rest.

Static markup is translated through `data-i18n` attributes on the element; anything built
at run time calls `t()`. Both are re-run on a language change, so switching never needs a
reload.

## The cars

| Model | Body | Character |
| --- | --- | --- |
| Xiaomi SU7 Ultra | Electric super saloon | The quickest thing here, by a distance |
| Yangwang U9 | Electric hypercar | Four motors, lowest and widest of the field |
| Xiaomi YU7 | Electric crossover | SU7 underneath, far taller on top |
| BYD Seal | Electric sedan | Battery low in the floor, and it corners like it |
| ZEEKR 7X | Mid-size SUV | Heavy, stable, forgiving |
| ZEEKR X | Compact crossover | Lightest and most agile, but down on power |
| Chery Tiggo 8 Pro e+ | Three-row SUV | Seven seats and a plug |
| Geely Monjaro | Large SUV | High and heavy, hangs on longer than it looks |
| Geely GC9 | Large sedan | Long bonnet, long boot, big grille |
| Haval Big Dog | Boxy compact SUV | Square, round-eyed, no interest in aerodynamics |

Every car on the list has a scanned reference model behind it; that is now the entry price
for being in the game, so the six-strong ZEEKR line-up is down to the two that do.

Each body is a lofted hull. A model carries a table of cross-sections along its length -
roof line, window line, width and tumblehome at each station - which are interpolated with a
monotone spline, turned into rounded sections and stitched into a surface. Faces are then
split between paint, glass and black trim by where they sit, which is what gives every car
its own glasshouse, blacked-out pillars and light signature. The hulls are built by
mirroring one half, so the cars are exactly symmetric left to right.

Light signatures are swept along the nose and tail rather than bolted on flat: the body's
own width at the height of each bar says where the bodywork actually is, so a full-width
bar wraps the corners instead of hanging off them. The 007, 001 and 7X wear a Stargate
panel - a lit matrix across the whole nose - the X and 7X get split lamps under a slim
strip, and the 009 gets the upright chrome grille.

Opponents are picked from the models closest in performance to yours, so the field stays
competitive whatever you drive.

Performance figures are tuned for racing, not taken from the manufacturer.

Most of the cars are shaped against measurements taken off scanned reference models, so
their rooflines, beltlines, wheel sizes and ride heights are the real cars' rather than an
approximation. `tools/measure_model.py` does the reading: it normalises a model against the
real car's length, finds the tyres, glass and interior by material name — eight authors,
eight naming schemes, but everyone labels glass "glass" — and prints the station table to
paste into `js/cars.js`. `tools/model.html` stands any model on a metre grid so its scale
and facing can be checked first. The full-resolution reference files are not in the
repository.

The car-select screen goes one better and puts the scan itself on the turntable. It only
ever shows one car, standing still, so it can afford what a race cannot: the grid stays
code-built, and six cars on track come to about 33,000 triangles between them.
`tools/prepare_models.py` builds the showroom copies in `assets/cars/` - interiors and
spare wheel sets come out, then dedup, join, weld, simplify, a texture resize to WebP and
meshopt compression. They load only when you open the screen, the code-built car is on the
turntable until one arrives, and a download that fails just leaves it there.

Picking a paint recolours the car where it stands, in a fraction of a millisecond - the
colour is one material away and the scan never reloads. Which material carries the paint is
up to whoever built the model (`car_paint_bai`, `Car_Paint`, `CarPaint`, or just `body`), so
it is matched by name, with `spec.paintMat` to name it outright where the name gives nothing
away. The Geely Monjaro is the exception: it arrived as a single mesh with one material
covering glass and wheels as well as bodywork, so it cannot be repainted without tinting the
whole car, and the chips leave it alone.

On track the player's car races its scan too, where the model allows it; the opponents stay
code-built, which is what keeps the cost down. A six-car Monza grid goes from 304 draw calls
and 256k triangles to 406 and 478k - the one car you look at for the whole race, for about a
third more draw calls.

Whether a scan can race depends on whether its wheels come apart. `js/carRig.js` finds them
by name, sorts them into corners, re-parents them under pivots of its own and then checks
the result against the car it is supposed to be: four wheels of roughly the right radius,
evenly spaced about the centreline, the right wheelbase apart.

Half the models used to fail that, because they merge all four wheels into one mesh apiece,
and a merged wheel cannot be turned without turning the other three with it. So the build
cuts them apart first: each triangle of a wheel mesh that spans more than one corner goes to
the corner its centroid falls in, and each corner gets its own index buffer pointing into
the same vertex arrays. No vertex data is copied, so a car's worth of splitting costs a few
kilobytes. Nine of the ten pass now, with every wheelbase landing within 30 mm of the real
car's. The Geely Monjaro is the one that does not: it is a single mesh for the entire car,
so there is nothing to cut that would not cut the bodywork with it, and it races the
code-built car and says so in the console.

Glass is the other thing that made this affordable. Most of these models tint their windows
with `KHR_materials_transmission`, and three.js pays for that by drawing the whole scene a
second time into a transmission buffer, every frame. On one car that alone was the
difference between 412 draw calls and 790. `tools/prepare_models.py` turns those materials
into ordinary tinted alpha glass, which at racing speed looks the same and costs nothing.

The reference models are third-party assets. The two ZEEKRs are CC-BY-4.0 and their credit
is below; **the other six still need their sources and licences recorded here** before this
is published anywhere.

> This work is based on "Zeekr X 2025"
> (https://sketchfab.com/3d-models/zeekr-x-2025-3be1c6c3848e4148995b9b7cc22cd480) and
> "Zeekr 7X 2025"
> (https://sketchfab.com/3d-models/zeekr-7x-2025-665a30d4c74048e4aec4749411844062)
> by ItsDiyor (https://sketchfab.com/ItsDiyor) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)

## The circuits

| Circuit | Country | Length | Character |
| --- | --- | --- | --- |
| Shanghai International Circuit | China 🇨🇳 | 4.4 km | Snail turn 1, huge back straight, dusk lighting |
| Circuit de Monaco | Monaco 🇲🇨 | 2.75 km | Walls, a 40 m climb, the hairpin and the sea tunnel |
| Suzuka Circuit | Japan 🇯🇵 | 4.5 km | Figure-of-eight — the back straight crosses on a bridge |
| Autodromo Nazionale Monza | Italy 🇮🇹 | 4.4 km | Fastest lap of the five: long straights through a park |
| Mount Panorama | Australia 🇦🇺 | 4.8 km | 175 m of climb, concrete walls over the mountain |

Layouts are simplified interpretations drawn as control points (see `js/tracks.js`), not
survey-accurate copies.

## How it is put together

```
index.html          markup, HUD and menu screens
css/style.css       all styling
js/main.js          renderer, showroom, race loop and race rules
js/trackPath.js     centreline maths: spline, elevation, projection (pure, testable in Node)
js/tracks.js        the five circuits and their themes
js/trackBuild.js    3D world: road, kerbs, barriers, terrain, water, scenery, sky
js/cars.js          car specs, the procedural car models and the boost plume
js/physics.js       vehicle model, surfaces, barrier and car-to-car collisions
js/ai.js            racing line, speed profile and the opponent drivers
js/input.js         keyboard, gamepad and touch
js/audio.js         synthesised EV whine, tyre scrub, impacts (Web Audio, no samples)
js/ui.js            menus, speed dial, minimap, timing tower, results, record board
js/records.js       nicknames, the local record table, and the global board client
js/i18n.js          language detection, catalogue loading and t()
js/lang/*.js        one translation catalogue per language (en is the source and fallback)
server/scores.py    optional global record board: SQLite behind /api/ (no dependencies)
server/floors.json  fastest physically possible lap per car per circuit, for validation
js/textures.js      every texture, painted into a canvas at run time
tools/cars.html     dev page: model sheet (?view=side | front | rear, ?only=<id>)
tools/lap_floors.mjs generates server/floors.json from the cars and circuits
```

### Handy while developing

The page accepts query parameters so you can jump straight into a race:

```
?track=suzuka&car=su7&laps=1&opp=3&diff=hard&go=1
```

`auto=1` hands your car to the AI, which is useful for watching a lap or testing a track.
`tools/cars.html` renders the whole model line-up: `?view=side`, `?view=front`, `?view=rear`,
and `?only=x` for a single car.

`js/trackPath.js` has no three.js dependency, so track geometry can be checked from Node:

```js
import { TrackPath } from './js/trackPath.js';
import { TRACKS } from './js/tracks.js';
const p = new TrackPath(TRACKS[0]);
console.log(p.length, p.cornerCount(), p.bounds());
```

## Notes

Unofficial fan-made game. Not affiliated with, or endorsed by, BYD, Chery, Geely, Great
Wall or ZEEKR. The cars raced on track are original low-poly interpretations; performance
figures are tuned for racing rather than taken from manufacturer data.
