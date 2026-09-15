# ZRace

An in-browser 3D racing game: ten Chinese cars — BYD, Chery, Geely, Great Wall, Xiaomi
and ZEEKR — five circuits from five countries, AI opponents, lap timing and a full race
weekend flow, all in plain JavaScript with [three.js](https://threejs.org/) and no build
step.

## Run it

ES modules need to be served over HTTP (opening `index.html` from disk will not work):

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>.

Three.js is loaded from a CDN via the import map in `index.html`, so the first load needs
an internet connection. Everything else — road surfaces, kerbs, barriers, crowds, car
paint, the sky — is generated in code at run time.

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake, then reverse |
| `A` `D` / `←` `→` | Steer |
| `Space` | Handbrake (drops rear grip — good for tight hairpins) |
| `C` | Camera: chase / close / bonnet |
| `R` | Rejoin the track |
| `P` or `Esc` | Pause |
| `M` | Mute |

A gamepad works too (right trigger accelerates, left brakes, left stick steers), and
on-screen pedals appear on touch devices.

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
js/cars.js          car specs and the procedural car models
js/physics.js       vehicle model, surfaces, barrier and car-to-car collisions
js/ai.js            racing line, speed profile and the opponent drivers
js/input.js         keyboard, gamepad and touch
js/audio.js         synthesised EV whine, tyre scrub, impacts (Web Audio, no samples)
js/ui.js            menus, speed dial, minimap, timing tower, results
js/textures.js      every texture, painted into a canvas at run time
tools/cars.html     dev page: model sheet (?view=side | front | rear, ?only=<id>)
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
