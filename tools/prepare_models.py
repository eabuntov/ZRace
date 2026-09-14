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

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GLTF = ['npx', '-y', '@gltf-transform/cli@4.5.0']

# Cabins are dropped by material rather than by node: eight authors use eight different
# naming schemes for their parts, but they all label the interior trim the same way.
INTERIOR = ('interior', 'int_', 'console', 'dash', 'seat', 'chair', 'neishi', 'carpet',
            'defrost', 'door_f_texture', 'door_r_texture', 'inner')

# out name -> (source, node names to drop, material fragments to drop, ratio, texture size)
MODELS = {
    'zeekr_x':        ('zeekr_x_2025.glb',
                       ['floor', 'IN', 'seat_high', 'seat_low',
                        'lungu001', 'lungu002', 'lungu003', 'lungu005'], (), 0.5, 2048),
    'zeekr_7x':       ('zeekr_7x_2025.glb',
                       ['carplane', 'INS', '19inch-kongqi', '20inch_duofu',
                        '19inch-duofuheiyao', '20inch_duofuheiyao'], (), 0.5, 2048),
    'byd_seal':       ('2024_byd_seal.glb', [], INTERIOR, 0.4, 1024),
    'yangwang_u9':    ('2024_byd_yangwang_u9.glb', [], INTERIOR, 0.85, 1024),
    'geely_gc9':      ('geely_gc9.glb', ['detach_bumper_B_6', 'detach_hood_45',
                                         'lights_position_front_and_back_glows.003'],
                       (), 1.0, 1024),
    'geely_monjaro':  ('geely.glb', [], (), 0.7, 1024),
    'chery_tiggo8':   ('2022_chery_tiggo_8_pro_e.glb', [], INTERIOR, 0.4, 1024),
    'haval_big_dog':  ('haval_ii_big_dog_2024.glb', [], INTERIOR, 0.45, 1024),
    'xiaomi_su7':     ('2025_xiaomi_su7_ultra_production_version.glb', [], INTERIOR, 0.4, 1024),
    'xiaomi_yu7':     ('2025_xiaomi_yu7.glb', [], INTERIOR, 0.45, 1024),
}

JSON_CHUNK, BIN_CHUNK = 0x4E4F534A, 0x004E4942


def strip(src, dst, drop, dropMats=()):
    """Unlink node subtrees by name, and drop primitives whose material matches. Only the
    JSON chunk is touched - the orphaned meshes and accessors are left for `prune`."""
    with open(src, 'rb') as f:
        _, version, length = struct.unpack('<III', f.read(12))
        chunks = []
        while f.tell() < length:
            clen, ctype = struct.unpack('<II', f.read(8))
            chunks.append([ctype, f.read(clen)])
    ji = next(i for i, c in enumerate(chunks) if c[0] == JSON_CHUNK)
    g = json.loads(chunks[ji][1].decode('utf-8'))
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
    return len(gone), cut


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
        if drop or dropMats:
            n, cut = strip(source, step, drop, dropMats)
            print(f'    stripped {n} nodes, {cut} primitives')
        else:
            step = source
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
