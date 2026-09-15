"""Turn reference car models into the showroom assets the car-select screen loads.

    python tools/prepare_models.py            # all of them
    python tools/prepare_models.py seal u9    # just these

Reference models are built for rendering stills, not for a browser: a quarter of a million
triangles, interiors nobody will see through tinted glass, four spare wheel sets, and
textures at 4K. The select screen shows one car standing still, so it can afford a scan -
but not that one. Each model is stripped of what the showroom cannot see, then welded,
simplified, resized and quantised.

Quantisation rather than Draco or meshopt is deliberate: KHR_mesh_quantization is read by
plain GLTFLoader, so nothing has to fetch a decoder at run time.

Needs node on PATH; the glTF-Transform CLI is fetched by npx on first use.
"""
import argparse
import json
import os
import struct
import subprocess
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from measure_model import accessor, node_matrix          # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GLTF = ['npx', '-y', '@gltf-transform/cli@4.5.0']

# Cabins are dropped by material rather than by node: eight authors use eight different
# naming schemes for their parts, but they all label the interior trim the same way.
INTERIOR = ('interior', 'int_', 'console', 'dash', 'seat', 'chair', 'neishi', 'carpet',
            'defrost', 'door_f_texture', 'door_r_texture', 'inner')

# out name -> (source, node names to drop, material fragments to drop, ratio, texture size)
MODELS = {
    # Circle001/002 are ~200-triangle construction primitives - the hinge axes the hood
    # and tailgate were modelled around - left in the export and shaded matte black. One
    # of them stands 230 mm above the roof.
    'zeekr_x':        ('zeekr_x_2025.glb',
                       ['floor', 'IN', 'seat_high', 'seat_low',
                        'Circle001', 'Circle002'], (), 0.5, 2048),
    'zeekr_7x':       ('zeekr_7x_2025.glb', ['carplane', 'INS'], (), 0.5, 2048),
    'byd_seal':       ('2024_byd_seal.glb', [], INTERIOR, 0.4, 1024),
    'yangwang_u9':    ('2024_byd_yangwang_u9.glb', [], INTERIOR, 0.85, 1024),
    # Only the light-flare billboard comes out of the GC9. The two `detach_` nodes are
    # the bonnet and the rear bumper - a game-ready export names the panels it can knock
    # off in a crash that way - and dropping them left voids at both ends of the car.
    # Every `lights_*` node in the GC9 is an additive glow volume - 1.87 x 0.86 x 0.78 m
    # of it around the tail lamps alone. glTF has no additive blend, so they export opaque
    # and render as black holes round the lights. The lamps themselves are painted into
    # the body texture and look right once the glows are gone. The number plate goes too:
    # it carries the watermark of the game this model was ripped out of.
    'geely_gc9':      ('geely_gc9.glb',
                       ['lights_brakes.003', 'lights_position_back.003',
                        'lights_position_front_and_back.003', 'lights_reverse.001',
                        'chassis_licenseplate'], (), 1.0, 1024),
    'geely_monjaro':  ('geely.glb', [], (), 0.7, 1024),
    'chery_tiggo8':   ('2022_chery_tiggo_8_pro_e.glb', [], INTERIOR, 0.4, 1024),
    'haval_big_dog':  ('haval_ii_big_dog_2024.glb', [], INTERIOR, 0.45, 1024),
    'xiaomi_su7':     ('2025_xiaomi_su7_ultra_production_version.glb', [], INTERIOR, 0.4, 1024),
    'xiaomi_yu7':     ('2025_xiaomi_yu7.glb', [], INTERIOR, 0.45, 1024),
}

# The X's reference model carries five alternate wheel sets and not one of them is
# complete: each holds a real wheel at one corner, two odd discs at two others, and
# nothing at the fourth. Keeping them all piles five part-sets into a black mass; keeping
# one leaves the car on a single wheel. So take the one good wheel and put it on all four
# corners here. `wheel` is the node to copy, `drop` goes once the copies are made.
WHEEL_FIX = {
    'zeekr_x': {'wheel': 't1', 'drop': 'Tire'},
}

# The X's wheels are already four separate corners once repair_wheels has copied them,
# and the Monjaro is one mesh for the entire car, where a split would cut the bodywork up
# along with everything else.
NO_SPLIT = {'zeekr_x', 'geely_monjaro'}

JSON_CHUNK, BIN_CHUNK = 0x4E4F534A, 0x004E4942

# Glass on most of these models uses KHR_materials_transmission, and three.js pays for
# that by rendering the whole scene a second time into a transmission buffer - every
# frame, for window glass. On one car that took a race frame from 412 draw calls to 790.
# Ordinary tinted alpha glass is worth far more than the refraction is at racing speed.
GLASS = {'alphaMode': 'BLEND',
         'baseColorFactor': [0.07, 0.09, 0.11, 0.62],
         'metallicFactor': 0.5, 'roughnessFactor': 0.12}


def plain_glass(g):
    """Turn transmissive materials into plain tinted glass. Returns how many changed."""
    gone = 0
    for mat in g.get('materials', []):
        ext = mat.get('extensions') or {}
        if 'KHR_materials_transmission' not in ext:
            continue
        ext.pop('KHR_materials_transmission', None)
        ext.pop('KHR_materials_volume', None)          # meaningless without transmission
        ext.pop('KHR_materials_ior', None)
        if not ext:
            mat.pop('extensions', None)
        mat['alphaMode'] = GLASS['alphaMode']
        pbr = mat.setdefault('pbrMetallicRoughness', {})
        pbr['baseColorFactor'] = list(GLASS['baseColorFactor'])
        pbr['metallicFactor'] = GLASS['metallicFactor']
        pbr['roughnessFactor'] = GLASS['roughnessFactor']
        gone += 1
    dead = ('KHR_materials_transmission', 'KHR_materials_volume')
    for key in ('extensionsUsed', 'extensionsRequired'):
        if key in g:
            g[key] = [e for e in g[key] if e not in dead]
            if not g[key]:
                del g[key]
    return gone


def world_matrices(g):
    """-> {node index: 4x4 world matrix}, walking every scene root."""
    out = {}

    def walk(i, m):
        m = m @ node_matrix(g['nodes'][i])
        out[i] = m
        for c in g['nodes'][i].get('children', []):
            walk(c, m)

    kids = set()
    for n in g['nodes']:
        kids.update(n.get('children', []))
    for r in [i for i in range(len(g['nodes'])) if i not in kids]:
        walk(r, np.eye(4))
    return out


def subtree_points(g, blob, i, world, skip=()):
    """World-space vertices of a node and everything under it."""
    pts = []

    def walk(j):
        nd = g['nodes'][j]
        if any(w.lower() in nd.get('name', '').lower() for w in skip):
            return
        if 'mesh' in nd:
            m = world[j]
            for pr in g['meshes'][nd['mesh']].get('primitives', []):
                v = accessor(g, blob, pr['attributes']['POSITION'])
                pts.append((m[:3, :3] @ v.T).T + m[:3, 3])
        for c in nd.get('children', []):
            walk(c)

    walk(i)
    return np.vstack(pts) if pts else np.zeros((0, 3))


def clone_subtree(g, i):
    """Duplicate a node and its descendants. Meshes are referenced, not copied."""
    src = g['nodes'][i]
    new = {k: v for k, v in src.items() if k != 'children'}
    idx = len(g['nodes'])
    g['nodes'].append(new)
    if 'children' in src:
        new['children'] = [clone_subtree(g, c) for c in src['children']]
    return idx


def repair_wheels(g, blob, cfg):
    """Copy one good wheel onto all four corners, mirroring its position about the centre
    of the car. The right-hand copies are turned through 180 degrees rather than scaled by
    -1: a negative scale flips the winding and lights the wheel inside out."""
    names = {n.get('name', ''): i for i, n in enumerate(g['nodes'])}
    wi = names.get(cfg['wheel'])
    if wi is None:
        print(f"    warning: no node named {cfg['wheel']}, wheels left alone")
        return 0
    world = world_matrices(g)
    # the car's own centre, taken off every mesh that is not the ground plane
    allp = []
    for i, nd in enumerate(g['nodes']):
        if 'mesh' not in nd or any(w in nd.get('name', '').lower() for w in ('floor', 'carplane')):
            continue
        m = world[i]
        for pr in g['meshes'][nd['mesh']].get('primitives', []):
            v = accessor(g, blob, pr['attributes']['POSITION'])
            allp.append((m[:3, :3] @ v.T).T + m[:3, 3])
    car = np.vstack(allp)
    C = (car.min(0) + car.max(0)) / 2

    wp = subtree_points(g, blob, wi, world)
    W = (wp.min(0) + wp.max(0)) / 2
    M = world[wi]
    flip = np.diag([-1.0, 1.0, -1.0, 1.0])        # 180 degrees about Y

    made = []
    for sx in (1, -1):
        for sz in (1, -1):
            T = np.array([C[0] + sx * (W[0] - C[0]), W[1], C[2] + sz * (W[2] - C[2])])
            R = flip if sx < 0 else np.eye(4)
            Mn = np.eye(4)
            Mn[:3, 3] = T - (R[:3, :3] @ W)
            Mn = Mn @ R @ M
            holder = {'name': f'{cfg["wheel"]}_corner_{sx}_{sz}',
                      'matrix': list(Mn.T.flatten()),
                      'children': [clone_subtree(g, c) for c in g['nodes'][wi].get('children', [])]}
            g['nodes'].append(holder)
            made.append(len(g['nodes']) - 1)
    g['scenes'][0]['nodes'].extend(made)
    return len(made)


WHEEL_WORDS = ('tire', 'tyre', 'luntai', 'lungu', 'rim', 'wheel', 'caliper',
                'brake', 'disk', 'disc', 'hub')
NOT_WHEEL_WORDS = ('house', 'arch', 'liner', 'fender', 'trim', 'window', 'glass',
                   'logo', 'badge', 'shell', 'body', 'door', 'glow', 'light')


def _add_indices(g, blob, idx):
    """Append an index array to the binary chunk and return the new accessor's number."""
    pad = (-len(blob)) % 4
    blob += b'\x00' * pad
    data = np.asarray(idx, dtype='<u4').tobytes()
    g['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob),
                             'byteLength': len(data), 'target': 34963})
    blob += data
    g['accessors'].append({'bufferView': len(g['bufferViews']) - 1, 'componentType': 5125,
                           'count': len(idx), 'type': 'SCALAR'})
    g['buffers'][0]['byteLength'] = len(blob)
    return blob, len(g['accessors']) - 1


def split_wheels(g, blob):
    """Cut wheel meshes that span more than one corner of the car into one mesh per corner.

    Several of these models merge all four wheels into a single mesh - one tyre mesh, one
    rim mesh - and a merged wheel cannot be turned, because turning it turns the other
    three with it. Splitting is done on triangles: each triangle goes to the corner its
    centroid falls in, and each corner gets its own index buffer pointing into the same
    vertex arrays. No vertex data is copied, so the whole thing costs a few kilobytes.

    Returns (blob, number of corner meshes made).
    """
    world = world_matrices(g)
    mats = [m.get('name', '') for m in g.get('materials', [])]

    allpts = []
    for i, nd in enumerate(g['nodes']):
        if 'mesh' not in nd or any(w in nd.get('name', '').lower() for w in ('floor', 'carplane')):
            continue
        m = world[i]
        for pr in g['meshes'][nd['mesh']].get('primitives', []):
            if 'POSITION' not in pr.get('attributes', {}):
                continue
            v = accessor(g, blob, pr['attributes']['POSITION'])
            allpts.append((m[:3, :3] @ v.T).T + m[:3, 3])
    if not allpts:
        return blob, 0
    car = np.vstack(allpts)
    lo, hi = car.min(0), car.max(0)
    mid, size = (lo + hi) / 2, hi - lo

    # Only nodes the scene can actually reach. Dropping a node unlinks it but leaves it in
    # the array, and splitting an orphan puts its pieces back at the scene root - which
    # resurrected the very glow volumes the GC9's drop list exists to remove.
    live = set()

    def reach(i):
        if i in live:
            return
        live.add(i)
        for c in g['nodes'][i].get('children', []):
            reach(c)

    for sc in g.get('scenes', []):
        for r in sc.get('nodes', []):
            reach(r)

    made = 0
    for ni in [i for i in sorted(live) if 'mesh' in g['nodes'][i]]:
        nd = g['nodes'][ni]
        mesh = g['meshes'][nd['mesh']]
        keep = []
        for pr in mesh.get('primitives', []):
            attrs = pr.get('attributes', {})
            tag = (nd.get('name', '') + ' '
                   + (mats[pr['material']] if pr.get('material') is not None else '')).lower()
            wheelish = (any(w in tag for w in WHEEL_WORDS)
                        and not any(w in tag for w in NOT_WHEEL_WORDS))
            if not wheelish or pr.get('mode', 4) != 4 or 'POSITION' not in attrs:
                keep.append(pr)
                continue
            M = world[ni]
            v = accessor(g, blob, attrs['POSITION'])
            wv = (M[:3, :3] @ v.T).T + M[:3, 3]
            span = wv.max(0) - wv.min(0)
            if span[0] < size[0] * 0.4 and span[2] < size[2] * 0.25:
                keep.append(pr)                       # already one corner's worth
                continue
            idx = (accessor(g, blob, pr['indices'])[:, 0].astype(np.int64)
                   if 'indices' in pr else np.arange(len(v), dtype=np.int64))
            tri = idx[:len(idx) // 3 * 3].reshape(-1, 3)
            cen = wv[tri].mean(axis=1)
            side = np.where(cen[:, 0] > mid[0], 'R', 'L')
            end = np.where(cen[:, 2] > mid[2], 'F', 'B')
            parts = {}
            for key in ('LF', 'RF', 'LB', 'RB'):
                sel = (side == key[0]) & (end == key[1])
                if sel.sum() >= 4:
                    parts[key] = tri[sel].reshape(-1)
            if len(parts) < 2:
                keep.append(pr)                       # nothing worth splitting
                continue
            for key, flat in parts.items():
                blob, acc = _add_indices(g, blob, flat)
                g['meshes'].append({'primitives': [dict(pr, indices=acc)]})
                g['nodes'].append({'name': f"{nd.get('name', 'wheel')}_{key}",
                                   'matrix': list(M.T.flatten()),
                                   'mesh': len(g['meshes']) - 1})
                g['scenes'][0]['nodes'].append(len(g['nodes']) - 1)
                made += 1
        mesh['primitives'] = keep
        if not keep:
            mesh['primitives'] = [{'attributes': {}}]   # placeholder; prune sweeps it
            nd.pop('mesh', None)
    return blob, made


def strip(src, dst, drop, dropMats=(), wheelFix=None, splitWheels=False):
    """Unlink node subtrees by name, and drop primitives whose material matches. Only the
    JSON chunk is touched - the orphaned meshes and accessors are left for `prune`."""
    with open(src, 'rb') as f:
        _, version, length = struct.unpack('<III', f.read(12))
        chunks = []
        while f.tell() < length:
            clen, ctype = struct.unpack('<II', f.read(8))
            chunks.append([ctype, f.read(clen)])
    ji = next(i for i, c in enumerate(chunks) if c[0] == JSON_CHUNK)
    blob = next((c[1] for c in chunks if c[0] == BIN_CHUNK), b'')
    g = json.loads(chunks[ji][1].decode('utf-8'))
    wheels = 0
    if wheelFix:
        wheels = repair_wheels(g, blob, wheelFix)
        drop = list(drop) + [wheelFix['drop']]
    gone = {i for i, n in enumerate(g['nodes'])
            if any(d.lower() == n.get('name', '').lower() for d in drop)}
    missing = [d for d in drop
               if not any(d.lower() == n.get('name', '').lower() for n in g['nodes'])]
    if missing:
        print(f'    warning: no node named {missing}')
    for n in g['nodes']:
        if 'children' in n:
            n['children'] = [c for c in n['children'] if c not in gone]
            if not n['children']:
                del n['children']
    for sc in g.get('scenes', []):
        sc['nodes'] = [c for c in sc.get('nodes', []) if c not in gone]
    for i in gone:
        g['nodes'][i].pop('mesh', None)
        g['nodes'][i].pop('children', None)
    glass = plain_glass(g)
    split = 0
    if splitWheels:
        blob, split = split_wheels(g, blob)
        for c in chunks:
            if c[0] == BIN_CHUNK:
                c[1] = blob
    cut = 0
    if dropMats:
        names = [m.get('name', '') for m in g.get('materials', [])]
        bad = {i for i, nm in enumerate(names)
               if any(w in nm.lower() for w in dropMats)}
        for mesh in g.get('meshes', []):
            keep = [pr for pr in mesh.get('primitives', []) if pr.get('material') not in bad]
            cut += len(mesh.get('primitives', [])) - len(keep)
            mesh['primitives'] = keep
        # a mesh with nothing left in it cannot be written out, so unlink those nodes too
        empty = {i for i, m in enumerate(g.get('meshes', [])) if not m['primitives']}
        for n in g['nodes']:
            if n.get('mesh') in empty:
                n.pop('mesh', None)
        for i, m in enumerate(g.get('meshes', [])):
            if i in empty:
                m['primitives'] = [{'attributes': {}}]     # placeholder; prune removes it
    chunks[ji][1] = json.dumps(g, separators=(',', ':')).encode('utf-8')

    body = b''
    for ctype, data in chunks:
        pad = (-len(data)) % 4
        data += (b' ' if ctype == JSON_CHUNK else b'\x00') * pad
        body += struct.pack('<II', len(data), ctype) + data
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, version, 12 + len(body)))
        f.write(body)
    return len(gone), cut, wheels, glass, split


def run(args):
    r = subprocess.run(args, capture_output=True, text=True, shell=(os.name == 'nt'))
    if r.returncode != 0:
        print(r.stdout[-1500:], r.stderr[-1500:])
        raise SystemExit(f'failed: {" ".join(args[-4:])}')
    return r.stdout


def prepare(name, src, drop, dropMats, ratio, tex, outdir, srcdir):
    source = os.path.join(srcdir, src)
    if not os.path.exists(source):
        print(f'  {name}: no {src}, skipping')
        return
    out = os.path.join(outdir, name + '.glb')
    print(f'  {name}  <- {src} ({os.path.getsize(source) / 1e6:.1f} MB)')
    with tempfile.TemporaryDirectory() as tmp:
        step = os.path.join(tmp, 'a.glb')
        fix = WHEEL_FIX.get(name)
        n, cut, wheels, glass, split = strip(source, step, drop, dropMats, fix,
                                             splitWheels=name not in NO_SPLIT)
        print(f'    stripped {n} nodes, {cut} primitives'
              + (f', rebuilt {wheels} wheels' if wheels else '')
              + (f', {glass} glass materials made plain' if glass else '')
              + (f', split {split} wheel parts' if split else ''))
        # No `join` here, however tempting: it collapses these scenes to a handful of
        # meshes and bakes the wrapper transforms wrongly on at least the ZEEKR X, which
        # came back 3.7 m tall. Meshopt does the size work instead.
        chain = [('prune', []), ('dedup', []), ('weld', [])]
        if ratio < 1.0:
            chain.append(('simplify', ['--ratio', str(ratio), '--error', '0.01']))
        # PNG dominates these files - a Seal is 6 MB of it after resizing - and WebP is
        # read by plain GLTFLoader through EXT_texture_webp, so no decoder is needed.
        # These meshes arrive with every vertex split, so `weld` (which merges only
        # bitwise-identical vertices) cannot help the simplifier much - a Seal stays at
        # 121k triangles however hard it is asked to reduce. Meshopt compresses the buffer
        # itself instead, and its decoder is one self-contained module from three/addons.
        chain += [('resize', ['--width', str(tex), '--height', str(tex)]),
                  ('webp', ['--quality', '82']),
                  ('prune', []), ('meshopt', ['--level', 'high'])]
        for i, (cmd, extra) in enumerate(chain):
            nxt = os.path.join(tmp, f'{i}.glb')
            run(GLTF + [cmd, step, nxt] + extra)
            step = nxt
        os.makedirs(outdir, exist_ok=True)
        with open(step, 'rb') as a, open(out, 'wb') as b:
            b.write(a.read())
    print(f'    -> {out} ({os.path.getsize(out) / 1e6:.2f} MB)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('only', nargs='*', help='names to build (default: all)')
    ap.add_argument('--src', default=os.path.join(ROOT, 'models'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets', 'cars'))
    a = ap.parse_args()
    names = a.only or list(MODELS)
    for n in names:
        if n not in MODELS:
            raise SystemExit(f'unknown model {n}; known: {", ".join(MODELS)}')
        prepare(n, *MODELS[n], outdir=a.out, srcdir=a.src)


if __name__ == '__main__':
    main()
