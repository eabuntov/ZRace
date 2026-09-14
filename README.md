# ZEEKR CIRCUIT

An in-browser 3D racing game: six ZEEKR-inspired electric cars, five circuits from five
countries, AI opponents, lap timing and a full race weekend flow — all in plain JavaScript
with [three.js](https://threejs.org/), no build step and no asset files.

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
| ZEEKR X | Compact crossover | Lightest and most agile, but down on power |
| ZEEKR 007 | Fastback sedan | Quick off the line, strong grip |
| ZEEKR 001 | Shooting brake | Long and fast in a straight line |
| ZEEKR 001 FR | Four-motor flagship | The fast one: 930 kW, lowered, with a wing |
| ZEEKR 7X | Mid-size SUV | Heavy, stable, forgiving |
| ZEEKR 009 | Luxury MPV | Nearly three tonnes — a challenge to race |

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
?track=suzuka&car=001fr&laps=1&opp=3&diff=hard&go=1
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

Unofficial fan-made game. Not affiliated with, or endorsed by, ZEEKR; the car models are
original low-poly interpretations rather than manufacturer data.
