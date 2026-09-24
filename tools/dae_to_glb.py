"""Turn a SketchUp Collada export of a car into a GLB that prepare_models.py can take.

    python tools/dae_to_glb.py models/GEELY+MONJARO+2024.zip models/geely_monjaro_2024.glb

Written for the Monjaro, the one car on the grid whose reference comes out of SketchUp
rather than off Sketchfab, and SketchUp exports are a different animal:

- Every face is written twice, once per side, because a SketchUp face has a front and a
  back material. The back is almost always the default and never seen, so where a piece
  of geometry carries the same triangles twice, the copy in a back material goes. That
  alone halves the file.
- Nothing is named. Parts are `group_0` and `SketchUp_Instance_0`, materials `Color_M01`.
  The runtime finds wheels, paint, glass and tail lamps by name (carRig.js, carModel.js),
  so names are given here, from where things are and what colour they are.
- Units are inches and up is Z; glTF wants metres and Y. The car's nose points down -Y in
  the export, which becomes +Z here - the way every other car in assets/cars faces.

The wheels arrive as four top-level groups, one per corner, which is exactly what the rig
needs: they are recognised by being wheel-sized and sitting at a corner, named by which
corner, and kept whole. Calipers and suspension live in the body group, and stay there -
they turn with the steering on a real car but never spin.

Needs pycollada (pip install pycollada) and numpy.
"""
import argparse
import json
import os
import struct
import sys
import tempfile
import zipfile

import numpy as np

try:
    import collada
except ImportError:
    raise SystemExit('needs pycollada: pip install pycollada')

INCH = 0.0254

# SketchUp's back-face materials: what a face shows from behind. Where a triangle is
# present in one of these and in something else, the something else is the real surface.
BACK = {'x3m_screen.011', '__auto_34'}

# source material -> (glTF name, pbr settings). `wheel` overrides apply to parts of the
# four wheel groups, where the same colours mean rubber and alloy rather than trim.
PAINT = {'name': 'car_paint', 'color': [0.02, 0.05, 0.36, 1], 'metal': 0.6, 'rough': 0.2,
         'clearcoat': True}
MATS = {
    'Color_I08': PAINT,
    'Color_M01': {'name': 'polished_alloy', 'color': [0.8, 0.8, 0.8, 1], 'metal': 1.0, 'rough': 0.22},
    'Color_M08': {'name': 'dark_trim', 'color': [0.013, 0.013, 0.013, 1], 'metal': 0.2, 'rough': 0.55},
    'Color_M02': {'name': 'chrome', 'color': [0.62, 0.62, 0.62, 1], 'metal': 1.0, 'rough': 0.12},
    'Color_M03': {'name': 'badge_chrome', 'color': [0.5, 0.5, 0.5, 1], 'metal': 1.0, 'rough': 0.1},
    'x3m_screen.011': {'name': 'gloss_black', 'color': [0.004, 0.004, 0.004, 1], 'metal': 0.1, 'rough': 0.4},
    '__auto_34': {'name': 'black_plastic', 'color': [0.006, 0.006, 0.006, 1], 'metal': 0.0, 'rough': 0.7},
    '__auto_163': {'name': 'black_plastic', 'color': [0.006, 0.006, 0.006, 1], 'metal': 0.0, 'rough': 0.7},
    'Color_B08': {'name': 'tail_light', 'color': [0.35, 0.02, 0.01, 1], 'metal': 0.0, 'rough': 0.3,
                  'emissive': [1.0, 0.1, 0.05]},
    'Translucent_Glass_Dark_Green': {'name': 'window_glass', 'color': [0.07, 0.09, 0.1, 0.62],
                                     'metal': 0.5, 'rough': 0.1, 'blend': True},
    'Translucent_Glass_Gray': {'name': 'headlight_glass', 'color': [0.85, 0.88, 0.92, 0.22],
                               'metal': 0.0, 'rough': 0.05, 'blend': True},
    'Geelypbm_inte': {'name': 'interior_dash', 'metal': 0.0, 'rough': 0.8, 'texture': True},
}
WHEEL_MATS = {
    '__auto_34': {'name': 'tyre_rubber', 'color': [0.018, 0.018, 0.02, 1], 'metal': 0.0, 'rough': 0.9},
    'Color_M08': {'name': 'rim_dark', 'color': [0.03, 0.03, 0.032, 1], 'metal': 0.6, 'rough': 0.35},
}
INTERIOR = {'name': 'interior_black', 'color': [0.01, 0.01, 0.01, 1], 'metal': 0.0, 'rough': 0.8}
FALLBACK = {'name': 'black_plastic', 'color': [0.006, 0.006, 0.006, 1], 'metal': 0.0, 'rough': 0.7}


def to_gltf(v):
    """Inches, Z up, nose to -Y  ->  metres, Y up, nose to +Z. A proper rotation, so the
    winding of every triangle survives it."""
    return np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)


def tri_keys(pos):
    """One key per triangle that ignores which way round it is wound: the rounded corners,
    sorted. Two sides of one SketchUp face give the same key."""
    # thousandths of an inch, each axis packed into 21 bits of one integer per corner
    q = np.round(pos * 1000).astype(np.int64) + (1 << 20)
    corner = (q[:, 0] << 42) | (q[:, 1] << 21) | q[:, 2]
    t = np.sort(corner.reshape(-1, 3), axis=1)
    return {row.tobytes() for row in t}


def pieces(doc):
    """(geometry id, material name, positions, normals, uvs) for every triangle set in the
    scene, in world space. Each bound geometry is one SketchUp piece, deduplicated on its
    own. Walked from the scene rather than node by node: pycollada binds a node's back-face
    material only from the scene walk, and without it the two sides never meet to be paired."""
    for bg in doc.scene.objects('geometry'):
        prims = []
        for p in bg.primitives():
            if not isinstance(p, collada.triangleset.BoundTriangleSet) or not len(p.vertex_index):
                continue
            pos = p.vertex[p.vertex_index].reshape(-1, 3)
            nrm = p.normal[p.normal_index].reshape(-1, 3) if p.normal is not None else None
            uv = None
            if p.texcoordset and p.texcoord_indexset:
                uv = p.texcoordset[0][p.texcoord_indexset[0]].reshape(-1, 2)
            name = p.material.name if p.material is not None else None
            prims.append([name, pos, nrm, uv])
        # drop the back side of a two-sided face, keeping whichever side is not the default
        keys = [tri_keys(p[1]) for p in prims]
        dead = set()
        for i in range(len(prims)):
            for j in range(len(prims)):
                if i == j or i in dead or j in dead or len(prims[i][1]) != len(prims[j][1]):
                    continue
                if prims[j][0] in BACK and prims[i][0] not in BACK and keys[i] == keys[j]:
                    dead.add(j)
        for i, p in enumerate(prims):
            if i not in dead:
                yield [bg.original.id] + p


def geometry_ids(node):
    """Every geometry a node instances, however deep."""
    out = set()
    for c in getattr(node, 'children', []):
        if isinstance(c, collada.scene.GeometryNode):
            out.add(c.geometry.id)
        elif isinstance(c, collada.scene.Node):
            out |= geometry_ids(c)
        elif isinstance(c, collada.scene.NodeNode):
            out |= geometry_ids(c.node)
    return out


# Black parts arrive with hard edges on every face, and the simplifier in prepare_models.py
# cannot merge vertices whose normals differ - on these that was all of them, and 411k
# triangles came out as 390k. So they are welded here and given smooth normals, but only
# across edges gentler than CREASE: smoothing the grille and the arch cladding straight
# through their corners bent the normals so far that they mirrored the sky like chrome.
# The cabin is only ever seen as shapes through dark glass, and is smoothed outright.
WELD = {'gloss_black', 'interior_black', 'black_plastic'}
CREASE = {'gloss_black': 40, 'black_plastic': 40}


def in_cabin(p, lo, hi):
    """Wholly inside the passenger compartment: seats, console, trim - seen only as dark
    shapes through tinted glass."""
    size = hi - lo
    a, b = p.min(0), p.max(0)
    return (a[0] > lo[0] + size[0] * 0.12 and b[0] < hi[0] - size[0] * 0.12
            and a[1] > lo[1] + size[1] * 0.15 and b[1] < lo[1] + size[1] * 0.87
            and a[2] > lo[2] + size[2] * 0.14 and b[2] < hi[2] - size[2] * 0.24)


def weld(pos, crease=None):
    """-> (positions, indices, normals) for a triangle soup. Corners at one position share
    a normal with every face there within `crease` degrees of their own (all of them, if
    None), and corners that end up with the same position and normal become one vertex."""
    q = np.round(pos * 1e4).astype(np.int64)
    _, pid = np.unique(q, axis=0, return_inverse=True)
    pid = pid.reshape(-1)
    # Both sides of a face again, this time in one material, so the back-face pass could
    # not tell them apart. Left in, a face and its reverse cancel each other's normal out
    # to nothing, and the vertices round to noise instead of welding.
    _, keep = np.unique(np.sort(pid.reshape(-1, 3), axis=1), axis=0, return_index=True)
    keep = np.sort(keep)
    pos = pos.reshape(-1, 3, 3)[keep].reshape(-1, 3)
    pid = pid.reshape(-1, 3)[keep].reshape(-1)
    t = pos.reshape(-1, 3, 3)
    fw = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])            # area-weighted
    fu = fw / np.maximum(np.linalg.norm(fw, axis=1, keepdims=True), 1e-12)
    cw, cu = np.repeat(fw, 3, axis=0), np.repeat(fu, 3, axis=0)     # per corner
    limit = -2.0 if crease is None else np.cos(np.radians(crease))

    # Corners sorted by position, so everything sharing one sits in a contiguous run; then
    # compare each corner with the one d places on, for d = 1, 2, ... until no run is that
    # long. Vectorised over the whole mesh at every step.
    order = np.argsort(pid, kind='stable')
    P, W, U = pid[order], cw[order], cu[order]
    acc = W.copy()
    d = 1
    while d < len(P):
        i = np.nonzero(P[:-d] == P[d:])[0]
        if not len(i):
            break
        j = i + d
        ok = np.einsum('ij,ij->i', U[i], U[j]) > limit
        np.add.at(acc, i[ok], W[j[ok]])
        np.add.at(acc, j[ok], W[i[ok]])
        d += 1
    nrm = np.empty_like(acc)
    nrm[order] = acc
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)

    key = np.concatenate([pid[:, None], np.round(nrm * 100).astype(np.int64)], axis=1)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return pos[first], inv.reshape(-1).astype(np.uint32), nrm[first]


def flat_normals(pos):
    t = pos.reshape(-1, 3, 3)
    n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return np.repeat(n, 3, axis=0)


class Writer:
    def __init__(self):
        self.g = {'asset': {'version': '2.0', 'generator': 'zrace dae_to_glb'},
                  'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
                  'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': []}
        self.blob = bytearray()
        self.mats = {}

    def view(self, data, target=None):
        self.blob += b'\x00' * ((-len(self.blob)) % 4)
        v = {'buffer': 0, 'byteOffset': len(self.blob), 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.blob += data
        self.g['bufferViews'].append(v)
        return len(self.g['bufferViews']) - 1

    def accessor(self, arr, kind):
        arr = np.ascontiguousarray(arr, dtype='<f4')
        a = {'bufferView': self.view(arr.tobytes(), 34962), 'componentType': 5126,
             'count': len(arr), 'type': kind}
        if kind == 'VEC3' and len(arr):
            a['min'] = arr.min(0).tolist()
            a['max'] = arr.max(0).tolist()
        self.g['accessors'].append(a)
        return len(self.g['accessors']) - 1

    def material(self, spec, image_path=None):
        if spec['name'] in self.mats:
            return self.mats[spec['name']]
        m = {'name': spec['name'], 'doubleSided': True,
             'pbrMetallicRoughness': {'metallicFactor': spec['metal'], 'roughnessFactor': spec['rough']}}
        if 'color' in spec:
            m['pbrMetallicRoughness']['baseColorFactor'] = spec['color']
        if spec.get('blend'):
            m['alphaMode'] = 'BLEND'
        if spec.get('emissive'):
            m['emissiveFactor'] = spec['emissive']
        if spec.get('clearcoat'):
            m['extensions'] = {'KHR_materials_clearcoat': {'clearcoatFactor': 1.0,
                                                           'clearcoatRoughnessFactor': 0.04}}
            self.g.setdefault('extensionsUsed', [])
            if 'KHR_materials_clearcoat' not in self.g['extensionsUsed']:
                self.g['extensionsUsed'].append('KHR_materials_clearcoat')
        if spec.get('texture') and image_path:
            with open(image_path, 'rb') as f:
                bv = self.view(f.read())
            self.g.setdefault('images', []).append({'bufferView': bv, 'mimeType': 'image/png'})
            self.g.setdefault('samplers', [{'magFilter': 9729, 'minFilter': 9987,
                                            'wrapS': 10497, 'wrapT': 10497}])
            self.g.setdefault('textures', []).append({'sampler': 0, 'source': len(self.g['images']) - 1})
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(self.g['textures']) - 1}
        self.g['materials'].append(m)
        self.mats[spec['name']] = len(self.g['materials']) - 1
        return self.mats[spec['name']]

    def mesh(self, name, pos, nrm, uv, mat, index=None):
        attrs = {'POSITION': self.accessor(pos, 'VEC3'), 'NORMAL': self.accessor(nrm, 'VEC3')}
        if uv is not None:
            attrs['TEXCOORD_0'] = self.accessor(uv, 'VEC2')
        prim = {'attributes': attrs, 'material': mat}
        if index is not None:
            data = np.ascontiguousarray(index, dtype='<u4')
            self.g['accessors'].append({'bufferView': self.view(data.tobytes(), 34963),
                                        'componentType': 5125, 'count': len(data), 'type': 'SCALAR'})
            prim['indices'] = len(self.g['accessors']) - 1
        self.g['meshes'].append({'name': name, 'primitives': [prim]})
        self.g['nodes'].append({'name': name, 'mesh': len(self.g['meshes']) - 1})
        self.g['scenes'][0]['nodes'].append(len(self.g['nodes']) - 1)

    def save(self, path):
        self.g['buffers'] = [{'byteLength': len(self.blob)}]
        js = json.dumps(self.g, separators=(',', ':')).encode()
        js += b' ' * ((-len(js)) % 4)
        self.blob += b'\x00' * ((-len(self.blob)) % 4)
        body = (struct.pack('<II', len(js), 0x4E4F534A) + js
                + struct.pack('<II', len(self.blob), 0x004E4942) + bytes(self.blob))
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, 12 + len(body)))
            f.write(body)


def convert(src, dst):
    with tempfile.TemporaryDirectory() as tmp:
        if src.lower().endswith('.zip'):
            zipfile.ZipFile(src).extractall(tmp)
            dae = next(os.path.join(r, f) for r, _, fs in os.walk(tmp) for f in fs if f.lower().endswith('.dae'))
        else:
            dae = src
        base = os.path.dirname(dae)
        doc = collada.Collada(dae, ignore=[collada.common.DaeUnsupportedError,
                                           collada.common.DaeBrokenRefError])
        images = {im.id: os.path.join(base, im.path) for im in doc.images}

        parts = list(pieces(doc))
        allp = np.vstack([to_gltf(p[2]) for p in parts]) * INCH
        lo, hi = allp.min(0), allp.max(0)
        mid, size = (lo + hi) / 2, hi - lo

        # The wheels are whichever top-level groups are wheel-sized and out at a corner.
        # Their geometry ids say which pieces are wheel; each piece's own position says
        # which corner, so it does not matter if the four share one set of geometry.
        wheel_ids = set()
        for root in doc.scene.nodes:
            for child in getattr(root, 'children', []):
                if not isinstance(child, collada.scene.Node):
                    continue
                ids = geometry_ids(child)
                own = [to_gltf(p[2]) * INCH for p in parts if p[0] in ids]
                if not own:
                    continue
                pts = np.vstack(own)
                glo, ghi = pts.min(0), pts.max(0)
                c = (glo + ghi) / 2
                if ((ghi - glo).max() < 0.95 and ghi[1] < lo[1] + size[1] * 0.5
                        and abs(c[0] - mid[0]) > size[0] * 0.3 and abs(c[2] - mid[2]) > size[2] * 0.2):
                    wheel_ids |= ids

        buckets = {}
        specs = {}
        corners = set()
        for gid, name, pos, nrm, uv in parts:
            is_wheel = gid in wheel_ids
            p = to_gltf(pos) * INCH
            if is_wheel:
                c = (p.min(0) + p.max(0)) / 2
                key = 'wheel_' + ('L' if c[0] > mid[0] else 'R') + ('F' if c[2] > mid[2] else 'B')
                corners.add(key)
            else:
                key = 'body'
            spec = (WHEEL_MATS.get(name) if is_wheel else None) or MATS.get(name) or FALLBACK
            if spec['name'] == 'gloss_black' and in_cabin(p, lo, hi):
                spec = INTERIOR
            n = to_gltf(nrm) if nrm is not None else flat_normals(p)
            n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
            t = None
            if spec.get('texture'):
                t = uv.copy() if uv is not None else np.zeros((len(p), 2))
                t[:, 1] = 1 - t[:, 1]
            b = buckets.setdefault((key, spec['name']), [[], [], []])
            b[0].append(p); b[1].append(n)
            if t is not None:
                b[2].append(t)
            specs[spec['name']] = spec
        wheels = len(corners)

        # the texture this export carries, for the one material that uses it
        tex = next(iter(images.values()), None)
        w = Writer()
        tris = 0
        for (key, mname), (ps, ns, ts) in sorted(buckets.items()):
            pos = np.vstack(ps)
            mat = w.material(specs[mname], tex)
            part = 'tyre' if mname == 'tyre_rubber' else 'rim' if key != 'body' else mname
            name = f'{key}_{part}' if key != 'body' else f'body_{mname}'
            if mname in WELD and not ts:
                verts, index, nrm = weld(pos, CREASE.get(mname))
                w.mesh(name, verts, nrm, None, mat, index)
                tris += len(index) // 3
            else:
                w.mesh(name, pos, np.vstack(ns), np.vstack(ts) if ts else None, mat)
                tris += len(pos) // 3
        w.save(dst)
    print(f'{os.path.basename(src)} -> {dst}: {tris} triangles, {wheels} wheels, '
          f'{len(buckets)} meshes, {(hi - lo).round(2).tolist()} m, '
          f'{os.path.getsize(dst) / 1e6:.1f} MB')
    if wheels != 4:
        print('  warning: expected four wheel groups; the rig will race the built car')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src', help='.dae, or a .zip holding one')
    ap.add_argument('dst', help='.glb to write')
    a = ap.parse_args()
    convert(a.src, a.dst)


if __name__ == '__main__':
    main()
