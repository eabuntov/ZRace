// English - the source text, and the fallback for every other catalogue.
//
// Keys are dotted and flat. `{name}` placeholders are filled by t(); plural keys end in
// a CLDR category (.one / .other here) and are reached through tn().
//
// Car and circuit entries are keyed by the id in cars.js / tracks.js. Model names stay
// as they are in every language - they are badges on a boot lid, not words.

export default {
  'app.title': 'ZRace — Chinese circuit racing',

  // ------------------------------------------------------------------ title
  'title.tagline': 'Ten Chinese machines. Five circuits.',
  'title.driver': 'DRIVER',
  'title.namePlaceholder': 'Your name',
  'title.nameAria': 'Driver name',
  'title.start': 'START A RACE',
  'title.timeTrial': 'TIME TRIAL',
  'title.records': 'RECORDS',
  'title.controls': 'CONTROLS',
  'title.options': 'OPTIONS',
  'title.disclaimer': 'Unofficial fan-made game. Not affiliated with, or endorsed by BYD, '
    + 'Chery, Geely, Great Wall, Xiaomi or ZEEKR. Circuit layouts and performance figures '
    + 'are simplified for racing.',

  // -------------------------------------------------------------------- nav
  'nav.back': '‹ Back',

  // ------------------------------------------------------------- car select
  'car.heading': 'Choose your car',
  'car.next': 'NEXT: CIRCUIT ›',
  'stats.power': 'POWER',
  'stats.accel': '0–100 KM/H',
  'stats.top': 'TOP SPEED',
  'stats.grip': 'GRIP',
  'stats.weight': 'WEIGHT',
  'stats.agility': 'AGILITY',
  'stats.braking': 'BRAKING',

  // ----------------------------------------------------------- track select
  'track.heading': 'Choose a circuit',
  'track.start': 'START RACE ›',
  'track.meta': '{country} · {km} km · {corners}',
  'track.corners.one': '{n} corner',
  'track.corners.other': '{n} corners',
  'opt.laps': 'LAPS',
  'opt.opponents': 'OPPONENTS',
  'opt.difficulty': 'DIFFICULTY',
  'diff.easy': 'EASY',
  'diff.normal': 'NORMAL',
  'diff.hard': 'HARD',

  // ---------------------------------------------------------------- controls
  'controls.heading': 'Controls',
  'controls.accel': 'Accelerate',
  'controls.brake': 'Brake / reverse',
  'controls.steer': 'Steer',
  'controls.boost': 'Boost — a few seconds of overboost, then it refills',
  'controls.handbrake': 'Handbrake — stability control off, get the tail out',
  'controls.camera': 'Camera: chase / close / bonnet',
  'controls.rejoin': 'Rejoin the track',
  'controls.pause': 'Pause',
  'controls.mute': 'Mute',
  'controls.gamepad': 'A gamepad works too: right trigger accelerates, left brakes, left '
    + 'stick steers, B or a shoulder button boosts. On a touch screen, on-screen pedals '
    + 'appear automatically.',

  // ----------------------------------------------------------------- options
  'options.heading': 'Options',
  'options.language': 'LANGUAGE',
  'options.auto': 'AUTO',
  'options.caravans': 'CARAVANS',
  'options.caravansNote': 'Three camels amble around the circuit carrying a strongbox each. Pass close to one in the run-off and the coins are yours. They do not take part in the race.',
  'opt.on': 'ON',
  'opt.off': 'OFF',
  'msg.robbed': 'CARAVAN ROBBED<small>+{n} COINS</small>',
  'hud.coins': 'COINS',
  'title.purse': 'PURSE',
  'options.languageNote': 'AUTO follows the language your browser asks for. Anything else '
    + 'is remembered on this machine. Car and circuit names stay as they are everywhere.',

  // ----------------------------------------------------------------- records
  'records.heading': 'Records',
  'records.global': 'GLOBAL',
  'records.local': 'THIS BROWSER',
  'records.fetching': 'Fetching the shared board…',
  'records.noServer': 'No shared board on this server — the times below are the ones on this machine.',
  'records.empty': 'No laps here yet. Set one and you are the record.',
  'records.noteGlobal': 'Best lap per driver per car, from everyone racing this server. '
    + 'Laps quicker than the car can physically go are refused, but a name is only a name '
    + '— take it in that spirit.',
  'records.noteLocal': 'Best lap per driver per car, kept in this browser. Change the name '
    + 'on the title screen to share a board with whoever else races on this machine.',

  // --------------------------------------------------------------------- HUD
  'hud.lap': 'LAP',
  'hud.current': 'CURRENT',
  'hud.last': 'LAST',
  'hud.best': 'BEST',
  'hud.boost': 'BOOST',
  'hud.leader': 'LEADER',
  'touch.brake': 'BRAKE',
  'touch.go': 'GO',
  'touch.steerLeft': 'steer left',
  'touch.steerRight': 'steer right',
  'touch.brakeAria': 'brake',
  'touch.boostAria': 'boost',
  'touch.accelAria': 'accelerate',

  // ---------------------------------------------------------------- messages
  'msg.go': 'GO',
  'msg.muted': 'MUTED',
  'msg.soundOn': 'SOUND ON',
  'msg.wrongWay': 'WRONG WAY',
  'msg.worldRecord': 'WORLD RECORD',
  'msg.circuitRecord': 'CIRCUIT RECORD',
  'msg.newBest': 'NEW BEST LAP',
  'msg.boardPos': 'P{n} ON THE BOARD',
  'msg.finalLap': 'FINAL LAP',
  'msg.winner': 'WINNER',
  'msg.finishedP': 'FINISHED P{n}',

  // ----------------------------------------------------------------- results
  'results.heading': 'Race result',
  'results.won': 'You won',
  'results.finishedP': 'Finished P{n}',
  'results.timeTrial': 'Time trial — best lap {time}',
  'results.again': 'RACE AGAIN',
  'results.change': 'CHANGE CIRCUIT',
  'results.menu': 'MAIN MENU',

  // ------------------------------------------------------------------- pause
  'pause.heading': 'Paused',
  'pause.resume': 'RESUME',
  'pause.restart': 'RESTART RACE',
  'pause.quit': 'QUIT TO MENU',

  // ----------------------------------------------------------------- loading
  'loading.circuit': 'Building circuit…',

  // ------------------------------------------------------------------- fatal
  'fatal.title': 'Could not start',
  'fatal.webgl': 'If this mentions WebGL, try a different browser or enable hardware acceleration.',

  // ------------------------------------------------------------------- units
  'unit.kw': 'kW',
  'unit.kmh': 'km/h',
  'unit.s': 's',
  'unit.g': 'g',
  'unit.kg': 'kg',

  // ------------------------------------------------------------------ paints
  'paint.mist': 'Mist Grey',
  'paint.glacier': 'Glacier White',
  'paint.obsidian': 'Obsidian',
  'paint.electric': 'Electric Blue',
  'paint.aurora': 'Aurora Green',
  'paint.solar': 'Solar Orange',
  'paint.crimson': 'Crimson',
  'paint.dune': 'Dune',

  // -------------------------------------------------------------------- cars
  'car.x.type': 'Compact crossover',
  'car.x.tagline': 'Short, light and eager to change direction.',
  'car.7x.type': 'Mid-size SUV',
  'car.7x.tagline': 'Heavier, but it hides the weight well.',
  'car.seal.type': 'Electric sedan',
  'car.seal.tagline': 'Blade battery low in the floor, and it corners like it.',
  'car.u9.type': 'Electric hypercar',
  'car.u9.tagline': 'Four motors, a metre and a bit tall, and quicker than anything here.',
  'car.gc9.type': 'Large sedan',
  'car.gc9.tagline': 'Long bonnet, long boot, and a grille you can see coming.',
  'car.monjaro.type': 'Large SUV',
  'car.monjaro.tagline': 'Heavy and high, but it hangs on longer than it looks.',
  'car.tiggo8.type': 'Three-row SUV',
  'car.tiggo8.tagline': 'Seven seats and a plug: the heaviest thing here that still hurries.',
  'car.bigdog.type': 'Boxy compact SUV',
  'car.bigdog.tagline': 'Square as a brick, round headlamps, and no interest in aerodynamics.',
  'car.su7.type': 'Electric super saloon',
  'car.su7.tagline': 'Three motors and eleven hundred kilowatts. Nothing here goes with it.',
  'car.yu7.type': 'Electric crossover',
  'car.yu7.tagline': 'The SU7 grown tall - same wheelbase, far more room over your head.',

  // ---------------------------------------------------------------- circuits
  'track.shanghai.name': 'Shanghai International Circuit',
  'track.shanghai.city': 'Shanghai',
  'track.shanghai.country': 'China',
  'track.shanghai.blurb': 'ZEEKR home soil: a tightening snail into turn 1, a back straight '
    + 'over a kilometre long and a hairpin built for late braking.',
  'track.monaco.name': 'Circuit de Monaco',
  'track.monaco.city': 'Monte Carlo',
  'track.monaco.country': 'Monaco',
  'track.monaco.blurb': 'Barriers inches away, a climb to Casino Square, the slowest hairpin '
    + 'in racing and a tunnel along the sea.',
  'track.suzuka.name': 'Suzuka Circuit',
  'track.suzuka.city': 'Suzuka',
  'track.suzuka.country': 'Japan',
  'track.suzuka.blurb': 'The figure-of-eight: flowing S-curves, Degner, the hairpin, Spoon '
    + 'and flat-out 130R back over the bridge.',
  'track.monza.name': 'Autodromo Nazionale Monza',
  'track.monza.city': 'Monza',
  'track.monza.country': 'Italy',
  'track.monza.blurb': 'The Temple of Speed: long straights through the royal park, the '
    + 'Lesmos, Ascari and the endless Parabolica.',
  'track.bathurst.name': 'Mount Panorama',
  'track.bathurst.city': 'Bathurst',
  'track.bathurst.country': 'Australia',
  'track.bathurst.blurb': 'A public road up a mountain: 175 metres of climb, walls at the '
    + 'Cutting, the Dipper plunge and a flat-out Conrod Straight.',
};
