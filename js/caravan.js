// Три верблюда. A caravan ambling along the circuit, and the coins you take off it.
//
// This exists because someone asked, in the traditional manner, whether they might also
// грабить корованы. It is opt-in from the options screen and it is kept deliberately at
// arm's length from the race: a camel is not a Vehicle and is never in `cars`, so nothing
// it does can reach lap counting, the standings, the results table or the physics. The
// only thing that crosses between the two is a number of coins.
//
// The caravan walks in the run-off rather than on the road. That is what makes robbing it
// a decision: the coins are off the racing line, over the grass, and the grass is slow.
import * as THREE from 'three';

const CAMELS = 3;
const WALK = 2.4;          // m/s, which is about a camel's amble
const SPACING = 5.2;       // nose to tail
const PURSE = 5;           // coins a camel is carrying
const REFILL = 20;         // seconds before it is worth robbing again
const REACH = 6.0;         // how close the car has to come
const SWAY = 0.9;          // how far the line wanders across the run-off

// A camel, in the same faceted idiom as the trees: a handful of primitives, flat-shaded,
// nose towards +Z so the group can be turned with the track tangent the way the cars are.
function buildCamel(tint) {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.95, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#8a6b47', roughness: 0.95, flatShading: true });
  const rug = new THREE.MeshStandardMaterial({ color: '#b5443a', roughness: 0.85, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: '#e8b53a', roughness: 0.35, metalness: 0.8 });

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hide);
  body.scale.set(0.36, 0.38, 0.92);
  body.position.y = 1.28;
  g.add(body);

  for (const z of [0.30, -0.26]) {                 // two humps, as advertised
    const hump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.30, 0), hide);
    hump.scale.set(0.92, 0.95, 1.0);
    hump.position.set(0, 1.62, z);
    g.add(hump);
  }

  // Neck and head hang off one pivot at the shoulder, so the head cannot drift off the
  // end of the neck however the neck is angled.
  const neck = new THREE.Group();
  neck.position.set(0, 1.44, 0.62);
  neck.rotation.x = 0.42;                          // leaning forward, the way they walk
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.16, 0.86, 6), hide);
  stalk.position.y = 0.43;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.23, 0.42), hide);
  head.position.set(0, 0.90, 0.10);
  head.rotation.x = -0.62;                         // muzzle back down towards level
  const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), dark);
  ear.position.set(0, 1.02, -0.02);
  neck.add(stalk, head, ear);
  g.add(neck);

  const legs = [];
  for (const [x, z] of [[0.24, 0.52], [-0.24, 0.52], [0.24, -0.50], [-0.24, -0.50]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.088, 1.16, 5), dark);
    leg.geometry.translate(0, -0.58, 0);          // pivot at the shoulder, not the middle
    leg.position.set(x, 1.16, z);
    g.add(leg);
    legs.push(leg);
  }

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.46, 4), dark);
  tail.position.set(0, 1.34, -0.88);
  tail.rotation.x = 0.8;
  g.add(tail);

  // The load, which is the entire point: a rug slung between the humps and a strongbox
  // on top of it, narrow enough to leave both humps showing.
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.10, 0.56), rug);
  blanket.position.set(0, 1.62, 0.02);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.46), gold);
  chest.position.set(0, 1.79, 0.02);
  g.add(blanket, chest);
  g.userData.chest = chest;

  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return { group: g, legs };
}

export class Caravan {
  constructor(scene, path, world) {
    this.scene = scene;
    this.path = path;
    this.world = world;
    this.camels = [];
    this.phase = 0;
    // Somewhere on the lap, on whichever side has the more room to walk in.
    this.s = Math.random() * path.length;
    const i = path.wrapI(Math.round(this.s / path.spacing));
    this.side = path.wallL[i] > path.wallR[i] ? 1 : -1;

    const tints = ['#c9a274', '#bd9466', '#d2ae80'];
    for (let k = 0; k < CAMELS; k++) {
      const { group, legs } = buildCamel(tints[k % tints.length]);
      scene.add(group);
      this.camels.push({ group, legs, purse: PURSE, cooling: 0, gait: k * 1.9 });
    }
  }

  // Where camel `k` stands: strung out behind the leader, wandering a little as it goes.
  place(k, camel) {
    const p = this.path;
    const s = p.wrapS(this.s - k * SPACING);
    const f = p.sampleAt(s);
    // out in the run-off, clear of the road, between the track edge and the barrier
    const wall = this.side > 0 ? p.wallL[f.i] : p.wallR[f.i];
    const room = Math.max(0, wall - p.halfW - 1.6);
    const u = this.side * (p.halfW + 1.2 + Math.min(room, 2.2)
      + Math.sin(s * 0.012 + k) * SWAY);
    const x = f.x + f.lx * u, z = f.z + f.lz * u;
    const ground = this.world ? this.world.terrainHeight(x, z) : f.y;
    camel.group.position.set(x, Math.max(ground, f.y - 1.2), z);
    camel.group.rotation.y = Math.atan2(f.tx, f.tz);
    return camel.group.position;
  }

  // Returns how many coins the player took off the caravan this frame.
  update(dt, player, racing) {
    this.s = this.path.wrapS(this.s + (racing ? WALK * dt : 0));
    this.phase += dt * 5.2;
    let taken = 0;

    this.camels.forEach((camel, k) => {
      const pos = this.place(k, camel);
      // a plodding four-beat walk: diagonal pairs together
      camel.legs.forEach((leg, j) => {
        const swing = Math.sin(this.phase + camel.gait + (j === 0 || j === 3 ? 0 : Math.PI));
        leg.rotation.x = swing * 0.34;
      });
      const chest = camel.group.userData.chest;

      if (camel.cooling > 0) {
        camel.cooling -= dt;
        if (camel.cooling <= 0) camel.purse = PURSE;
        chest.visible = camel.cooling <= 0;
        return;
      }
      chest.visible = true;
      if (!racing || !player || !camel.purse) return;
      const dx = player.x - pos.x, dz = player.z - pos.z;
      if (dx * dx + dz * dz > REACH * REACH) return;
      taken += camel.purse;
      camel.purse = 0;
      camel.cooling = REFILL;
      chest.visible = false;                       // you took the strongbox
    });

    return taken;
  }

  dispose() {
    for (const c of this.camels) {
      this.scene.remove(c.group);
      c.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.camels = [];
  }
}
