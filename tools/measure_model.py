"""Measure a car GLB and print the station table js/cars.js authors its hulls against.

    python tools/measure_model.py models/2024_byd_seal.glb 4.80 --rows 16

The length argument is the real car's overall length in metres; every reference arrives at
its own scale (one of these is 1/100, another 1/2.6) so the model is normalised against a
figure we trust rather than against whatever the exporter left behind.

Reference models come from half a dozen different authors and share no naming convention
at all, so parts are classified by material name instead - glass, tyre, interior and mirror
all read the same way across every file we have. Prints, in the order cars.js wants them:

    [ z, top, belt, hwR, tumble ]

plus the wheel radius, ride height and wheelbase measured off the tyres.
"""
import argparse
import json
import struct
import sys
import numpy as np

COMP = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2),
        5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

TYRE = ('tire', 'tyre', 'luntai', 'rubber')
GLASS = ('glass', 'boli', 'window', 'windshield')
INSIDE = ('interior', 'neishi', 'inner', 'chair', 'seat', 'carpet', 'dash')
MIRROR = ('mirror', 'houshijing')


def load(path):
    with open(path, 'rb') as f:
        _, _, length = struct.unpack('<III', f.read(12))
        chunks = {}
        while f.tell() < length:
            clen, ctype = struct.unpack('<II', f.read(8))
            data = f.read(clen)
            tag = ''.join(c for c in struct.pack('<I', ctype).decode('ascii') if c.isalnum())
            chunks.setdefault(tag, data)
    return json.loads(chunks['JSON'].decode('utf-8')), chunks.get('BIN', b'')


def accessor(g, blob, i):
    a = g['accessors'][i]
    n, (fmt, size) = NCOMP[a['type']], COMP[a['componentType']]
    bv = g['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride') or n * size
    raw = np.frombuffer(blob, dtype=np.uint8, count=stride * a['count'], offset=off)
    raw = raw.reshape(a['count'], stride)[:, :n * size]
    v = np.ascontiguousarray(raw).view(np.dtype('<' + fmt)).reshape(a['count'], n).astype(np.float64)
    if a.get('normalized'):                      # KHR_mesh_quantization
        v = v / (np.iinfo(np.dtype(fmt)).max if fmt in 'BH' else np.iinfo(np.dtype(fmt)).max)
    return v


def node_matrix(nd):
    if 'matrix' in nd:
        return np.array(nd['matrix'], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if 'scale' in nd:
        m = np.diag(list(nd['scale']) + [1.0]) @ m
    if 'rotation' in nd:
        x, y, z, w = nd['rotation']
        m = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1]]) @ m
    if 'translation' in nd:
        t = np.eye(4)
        t[:3, 3] = nd['translation']
        m = t @ m
    return m


def parts(path):
    """-> list of (name, material, world vertices), with every transform applied."""
    g, blob = load(path)
    names = [m.get('name', '') for m in g.get('materials', [])]
    out = []

    def walk(i, m, label):
        nd = g['nodes'][i]
        m = m @ node_matrix(nd)
        label = label + '/' + nd.get('name', '')
        if 'mesh' in nd:
            for pr in g['meshes'][nd['mesh']].get('primitives', []):
                v = accessor(g, blob, pr['attributes']['POSITION'])
                mat = names[pr['material']] if pr.get('material') is not None else ''
                out.append((label, mat, (m[:3, :3] @ v.T).T + m[:3, 3]))
        for c in nd.get('children', []):
            walk(c, m, label)

    kids = set()
    for n in g['nodes']:
        kids.update(n.get('children', []))
    for r in [i for i in range(len(g['nodes'])) if i not in kids]:
        walk(r, np.eye(4), '')
    return out


def tagged(pieces, words):
    return [p for p in pieces if any(w in (p[0] + ' ' + p[1]).lower() for w in words)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('glb')
    ap.add_argument('length', type=float, help='real overall length in metres')
    ap.add_argument('--rows', type=int, default=14)
    ap.add_argument('--flip', action='store_true', help='model faces -Z; turn it round')
    ap.add_argument('--exclude', default='', help='comma-separated name fragments to drop, '
                    'e.g. the spare parts some game-ready exports park beside the car')
    a = ap.parse_args()

    pieces = parts(a.glb)
    if a.exclude:
        drop = [w.strip().lower() for w in a.exclude.split(',') if w.strip()]
        pieces = [p for p in pieces if not any(w in p[0].lower() for w in drop)]
    tyres = tagged(pieces, TYRE)
    body = [p for p in pieces if p not in tagged(pieces, INSIDE + MIRROR)]
    glass = tagged(pieces, GLASS)

    allv = np.vstack([p[2] for p in pieces])
    span = allv.max(0) - allv.min(0)
    axis = int(np.argmax([span[0], 0, span[2]]))          # length runs along X or Z
    k = a.length / span[axis]

    def frame(v):
        w = v * k
        if axis == 0:                                     # stand it nose-along-Z
            w = w[:, [2, 1, 0]]
        if a.flip:
            w[:, 2] = -w[:, 2]
        return w

    B = frame(np.vstack([p[2] for p in body]))
    ground = B[:, 1].min()
    B[:, 1] -= ground
    B[:, 0] -= (B[:, 0].min() + B[:, 0].max()) / 2

    wheelR = ride = wb = None
    if tyres:
        T = frame(np.vstack([p[2] for p in tyres]))
        T[:, 1] -= ground
        zc = (T[:, 2].min() + T[:, 2].max()) / 2
        fr, re = T[T[:, 2] > zc], T[T[:, 2] <= zc]
        wheelR = (T[:, 1].max() - T[:, 1].min()) / 2
        wb = abs(fr[:, 2].mean() - re[:, 2].mean())
        mid = (fr[:, 2].mean() + re[:, 2].mean()) / 2
        B[:, 2] -= mid
    else:
        B[:, 2] -= (B[:, 2].min() + B[:, 2].max()) / 2

    halfW = np.percentile(np.abs(B[:, 0]), 99.5)
    G = None
    if glass:
        G = frame(np.vstack([p[2] for p in glass]))
        G[:, 1] -= ground
        G[:, 0] -= (G[:, 0].min() + G[:, 0].max()) / 2
        G[:, 2] -= (mid if tyres else 0)

    zmin, zmax = B[:, 2].min(), B[:, 2].max()
    rock = B[(np.abs(B[:, 2]) < (wb or 2.6) / 2 - 0.55) & (np.abs(B[:, 0]) > halfW * 0.8)]
    ride = np.percentile(rock[:, 1], 1) if len(rock) else None

    print(f'--- {a.glb}')
    print(f'    L {zmax - zmin:.3f}   W {halfW * 2:.3f}   H {B[:, 1].max():.3f}'
          + (f'   wb {wb:.3f}   wheelR {wheelR:.3f}' if wb else '   (no tyre material found)')
          + (f'   rocker {ride:.3f}' if ride is not None else ''))
    print(f'    nose z {zmax:.2f}   tail z {zmin:.2f}')

    edges = np.linspace(zmax, zmin, a.rows + 1)
    print('    hull: [')
    for i in range(a.rows):
        hi, lo = edges[i], edges[i + 1]
        sl = B[(B[:, 2] >= lo) & (B[:, 2] < hi)]
        if len(sl) < 30:
            continue
        top = np.percentile(sl[:, 1], 99.8)
        hw = min(np.percentile(np.abs(sl[:, 0]), 99.5), halfW)
        belt = None
        if G is not None:
            gl = G[(G[:, 2] >= lo) & (G[:, 2] < hi)]
            if len(gl) >= 4:
                belt = np.percentile(gl[:, 1], 2.0) if len(gl) > 30 else gl[:, 1].min()
        ref = belt if belt is not None else top - 0.30
        band = sl[np.abs(sl[:, 1] - (ref + 0.65 * (top - ref))) < 0.06]
        tum = min(0.99, np.percentile(np.abs(band[:, 0]), 96) / hw) if len(band) > 30 else 0.99
        b = f'{belt:.2f}' if belt is not None else ' -  '
        print(f'      [{(lo + hi) / 2:5.2f}, {top:5.2f}, {b}, {hw / halfW:4.2f}, {tum:4.2f}],')
    print('    ],')


if __name__ == '__main__':
    main()
