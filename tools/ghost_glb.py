#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = ["numpy", "pillow", "fast-simplification"]
# ///
"""Make a glTF model light enough to haunt the house.

    uv run tools/ghost_glb.py model.glb art/ghosts/name.glb --height 1.7

Models from image-to-3D tools tend to arrive at several megabytes, with
2048² colour, normal and metal/roughness maps. The ghost shader needs only
the shape and, for a model listed with `shade` in GHOST_ART
(js/creatures/ghost.js), light and shade from the base colour. The copy
this writes:

- stands --height metres tall with its feet at y = 0; --center also moves
  it onto the vertical axis, and --turn spins it about that axis (degrees,
  anticlockwise seen from above) when it does not face +Z; --up and --face
  name the model's own axes for up and ahead when the tool laid it down
- keeps each part as its own mesh, under its node, mesh and material
  names, which GHOST_ART's slot rules match; --glow cuts the bright
  triangles inside a box (a lantern's glass, a candle's flame) into a part
  of their own named glow, which the game draws in its warm glow colour
- stores the geometry quantised (KHR_mesh_quantization, which three.js
  reads without a decoder): positions int16, normals int8, UVs uint16
- keeps each base colour texture as a greyscale JPEG at most --tex pixels
  across (0 drops textures), or in colour with --colour, its UV islands
  padded out into the empty atlas so smaller mip levels do not bleed black
  into the seams
- drops normal, metal/roughness, occlusion and emissive maps, tangents,
  vertex colours, skins, morph targets and animations
- with --tris, thins the model to about that many triangles, the texture
  still in place
- with --legs, finds a creature's legs and records them for the game to
  walk (art/creatures/spider.glb: --legs 8), bending any that stop short of
  the floor down to it

Without uv: pip install numpy pillow fast-simplification, then run it with
python3.
"""
import argparse
import heapq
import io
import json
import math
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


def fail(msg):
    sys.exit(f'ghost_glb: {msg}')


# --- reading ---------------------------------------------------------------


def read_glb(path):
    data = open(path, 'rb').read()
    if data[:4] != b'glTF' or struct.unpack_from('<I', data, 4)[0] != 2:
        fail(f'{path} is not a glTF 2.0 binary (.glb)')
    length = struct.unpack_from('<I', data, 8)[0]
    off, doc, blob = 12, None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == b'JSON':
            doc = json.loads(chunk)
        elif ctype == b'BIN\0':
            blob = chunk
        off += 8 + clen
    for ext in ('KHR_draco_mesh_compression', 'EXT_meshopt_compression'):
        if ext in doc.get('extensionsUsed', []):
            fail(f'the model is compressed with {ext}; export it again without compression')
    return doc, blob


def view(doc, blob, i):
    bv = doc['bufferViews'][i]
    if 'uri' in doc['buffers'][bv['buffer']]:
        fail('the model keeps its data in a separate file; export it as one .glb')
    o = bv.get('byteOffset', 0)
    return blob[o: o + bv['byteLength']], bv.get('byteStride', 0)


def accessor(doc, blob, i):
    a = doc['accessors'][i]
    if 'sparse' in a:
        fail('sparse accessors are not supported; export the model without them')
    dt = np.dtype(COMP[a['componentType']]).newbyteorder('<')
    n = NCOMP[a['type']]
    if 'bufferView' not in a:
        return np.zeros((a['count'], n))
    data, stride = view(doc, blob, a['bufferView'])
    out = np.ndarray((a['count'], n), dtype=dt, buffer=data, offset=a.get('byteOffset', 0), strides=(stride or dt.itemsize * n, dt.itemsize))
    if a.get('normalized'):
        return np.maximum(out / np.iinfo(dt).max, -1.0)
    return out.astype(np.float64)


def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=np.float64).reshape(4, 4).T
    x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    r = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])
    m = np.eye(4)
    m[:3, :3] = r * np.array(n.get('scale', [1, 1, 1]), dtype=np.float64)
    m[:3, 3] = n.get('translation', [0, 0, 0])
    return m


def base_image(doc, mat):
    """The image behind a material's base colour texture, and its UV set."""
    t = mat.get('pbrMetallicRoughness', {}).get('baseColorTexture')
    if t is None:
        return None, 0
    tex = doc['textures'][t['index']]
    src = tex.get('source')
    for ext in ('EXT_texture_webp', 'EXT_texture_avif', 'KHR_texture_basisu'):
        if src is None:
            src = tex.get('extensions', {}).get(ext, {}).get('source')
    return src, t.get('texCoord', 0)


UP = np.array([0.0, 1.0, 0.0])


def unit(N, instead):
    """Normals at unit length; the ones of no length taken from instead."""
    n = np.linalg.norm(N, axis=1, keepdims=True)
    return np.where(n > 1e-9, N / np.maximum(n, 1e-9), instead)


def unit_normals(P, I, fallback=None):
    """Unit vertex normals from the faces around each vertex, by area. Where
    those cancel out (a fold, a sliver) the normal comes from fallback(which
    vertices), or points straight up: one of no length lights as NaN, which
    the bloom spreads into a black square."""
    t = I.reshape(-1, 3)
    fn = np.cross(P[t[:, 1]] - P[t[:, 0]], P[t[:, 2]] - P[t[:, 0]])
    N, area = np.zeros_like(P), np.zeros(len(P))
    for k in range(3):
        np.add.at(N, t[:, k], fn)
        np.add.at(area, t[:, k], np.linalg.norm(fn, axis=1))
    n = np.linalg.norm(N, axis=1)
    bad = n <= 1e-6 * area + 1e-30
    N[~bad] /= n[~bad, None]
    if bad.any():
        N[bad] = fallback(np.nonzero(bad)[0]) if fallback else UP
    return N


def gather(doc, blob):
    """Every node that has a mesh, its triangles in world space."""
    parts = []

    def walk(ni, parent):
        n = doc['nodes'][ni]
        m = parent @ node_matrix(n)
        if 'mesh' in n:
            mesh = doc['meshes'][n['mesh']]
            prims = []
            for p in mesh['primitives']:
                if p.get('mode', 4) != 4:
                    continue  # points and lines have no place in a figure
                at = p['attributes']
                mat = doc['materials'][p['material']] if 'material' in p else {}
                img, uvset = base_image(doc, mat)
                P = accessor(doc, blob, at['POSITION'])
                I = accessor(doc, blob, p['indices']).astype(np.int64).ravel() if 'indices' in p else np.arange(len(P))
                N = accessor(doc, blob, at['NORMAL']) if 'NORMAL' in at else None
                uv = f'TEXCOORD_{uvset}'
                T = accessor(doc, blob, at[uv]) if img is not None and uv in at else None
                P = P @ m[:3, :3].T + m[:3, 3]
                N = unit_normals(P, I) if N is None else unit(N @ np.linalg.inv(m[:3, :3]), unit_normals(P, I))
                # only the vertices the triangles use
                used, I = np.unique(I, return_inverse=True)
                prims.append({
                    'P': P[used], 'N': N[used], 'T': None if T is None else T[used], 'I': I.ravel(),
                    'img': None if T is None else img,
                    'mat': mat.get('name'), 'double': mat.get('doubleSided', False),
                })
            if prims:
                parts.append({'node': n.get('name'), 'mesh': mesh.get('name'), 'prims': prims})
        for c in n.get('children', []):
            walk(c, m)

    if doc.get('scenes'):
        roots = doc['scenes'][doc.get('scene', 0)]['nodes']
    else:
        kids = {c for n in doc['nodes'] for c in n.get('children', [])}
        roots = [i for i in range(len(doc['nodes'])) if i not in kids]
    for ni in roots:
        walk(ni, np.eye(4))
    if not parts:
        fail('the model has no triangle meshes')
    return parts


# --- fitting and textures --------------------------------------------------


def axis(name):
    v = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}.get(name.lower().lstrip('+-'))
    if v is None:
        fail(f'{name} is not an axis: write x, y, z, -x, -y or -z')
    return np.array(v, dtype=np.float64) * (-1 if name.startswith('-') else 1)


def fit(parts, height, turn, center, up='y', face='z'):
    """Stand the model up, turn, scale and move every part so the whole
    stands on the origin."""
    u, f = axis(up), axis(face)
    if abs(u @ f) > 0.5:
        fail('--up and --face must name different axes')
    c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
    # rows: where the model's own axes go, so up becomes +Y and face +Z
    R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]) @ np.array([np.cross(u, f), u, f])
    prims = [p for part in parts for p in part['prims']]
    for p in prims:
        p['P'] = p['P'] @ R.T
        p['N'] = p['N'] @ R.T
    allP = np.concatenate([p['P'] for p in prims])
    lo, hi = allP.min(0), allP.max(0)
    tall = hi[1] - lo[1]
    k = height / tall
    shift = np.array([(lo[0] + hi[0]) / 2 if center else 0.0, lo[1], (lo[2] + hi[2]) / 2 if center else 0.0])
    for p in prims:
        p['P'] = (p['P'] - shift) * k
    return tall, k


def keep(p, tris):
    """A copy of primitive p with only the triangles given, and their vertices."""
    used, I = np.unique(tris.ravel(), return_inverse=True)
    return {**p, 'P': p['P'][used], 'N': p['N'][used], 'T': None if p['T'] is None else p['T'][used], 'I': I.ravel()}


def cut_glow(parts, box, least, greys):
    """Move the triangles inside box (and at least this bright, where there
    is a texture) into a part of their own named glow."""
    lo, hi = np.array(box[:3]), np.array(box[3:])
    glow = []
    for part in parts:
        prims = []
        for p in part['prims']:
            t = p['I'].reshape(-1, 3)
            c = p['P'][t].mean(1)
            sel = np.all((c >= lo) & (c <= hi), axis=1)
            grey = greys.get(p['img']) if p['T'] is not None else None
            if grey is not None:
                H, W = grey.shape
                uv = np.clip(p['T'][t].mean(1), 0, 1)
                inbox = sel
                sel = inbox & (grey[np.minimum((uv[:, 1] * H).astype(int), H - 1), np.minimum((uv[:, 0] * W).astype(int), W - 1)] >= least)
                # a streak in the paint should not leave holes and spikes:
                # each triangle follows most of its neighbours
                _, weld = np.unique(np.round(p['P'] / 1e-4).astype(np.int64), axis=0, return_inverse=True)
                wt = weld.ravel()[t]
                for _ in range(3):
                    on = np.zeros(weld.max() + 1)
                    all_ = np.zeros(weld.max() + 1)
                    np.add.at(on, wt.ravel(), np.repeat(sel, 3))
                    np.add.at(all_, wt.ravel(), 1)
                    sel = inbox & ((on / all_)[wt].mean(1) > 0.5)
            if sel.any():
                glow.append(keep(p, t[sel]))
            if not sel.all():
                prims.append(keep(p, t[~sel]) if sel.any() else p)
        part['prims'] = prims
    parts[:] = [part for part in parts if part['prims']]
    if glow:
        parts.append({'node': 'glow', 'mesh': 'glow', 'prims': glow})
    return sum(len(p['I']) // 3 for p in glow)


# --- thinning --------------------------------------------------------------


def pieces(I, n):
    """Label each of n vertices with the lowest vertex of its connected piece."""
    t = I.reshape(-1, 3)
    lab = np.arange(n)
    while True:
        low = lab[t].min(1)
        new = lab.copy()
        for k in range(3):
            np.minimum.at(new, t[:, k], low)
        new = new[new]
        if np.array_equal(new, lab):
            return lab
        lab = new


def nearest_on(p, a, b, c):
    """Barycentric weights of the point of each triangle (a, b, c) nearest p,
    and its squared distance (Ericson, Real-Time Collision Detection 5.1.5)."""
    def dot(u, v):
        return (u * v).sum(-1)

    ab, ac = b - a, c - a
    d1, d2 = dot(ab, p - a), dot(ac, p - a)
    d3, d4 = dot(ab, p - b), dot(ac, p - b)
    d5, d6 = dot(ab, p - c), dot(ac, p - c)
    va, vb, vc = d3 * d6 - d5 * d4, d5 * d2 - d1 * d6, d1 * d4 - d3 * d2
    den = va + vb + vc
    v = vb / np.where(den == 0, 1e-30, den)
    w = vc / np.where(den == 0, 1e-30, den)
    out = np.stack([1 - v - w, v, w], -1)
    z, one = np.zeros_like(d1), np.ones_like(d1)

    def ratio(num, den):
        return num / np.where(den == 0, 1e-30, den)

    t_bc, t_ac, t_ab = ratio(d4 - d3, (d4 - d3) + (d5 - d6)), ratio(d2, d2 - d6), ratio(d1, d1 - d3)
    # the regions outside the face, the first in Ericson's order last, so it wins
    for mask, weights in (
        ((va <= 0) & (d4 >= d3) & (d5 >= d6), (z, 1 - t_bc, t_bc)),
        ((vb <= 0) & (d2 >= 0) & (d6 <= 0), (1 - t_ac, z, t_ac)),
        ((d6 >= 0) & (d5 <= d6), (z, z, one)),
        ((vc <= 0) & (d1 >= 0) & (d3 <= 0), (1 - t_ab, t_ab, z)),
        ((d3 >= 0) & (d4 <= d3), (z, one, z)),
        ((d1 <= 0) & (d2 <= 0), (one, z, z)),
    ):
        out[mask] = np.stack(weights, -1)[mask]
    q = out[..., :1] * a + out[..., 1:2] * b + out[..., 2:] * c
    return out, dot(q - p, q - p)


def nearest_triangle(points, tris, P, normals=None, facing=None, k=12, chunk=256):
    """For each point, the triangle among tris (indices into P) whose surface
    is nearest, looked for among the k with the nearest centres; with
    normals and facing, triangles facing away from the point's own normal
    are passed over where any other will do. Returns the triangle (position
    in tris) and the barycentric weights of the nearest point on it."""
    cen = P[tris].mean(1)
    k = min(k, len(tris))
    best = np.empty(len(points), np.int64)
    bary = np.empty((len(points), 3))
    for s in range(0, len(points), chunk):
        q = points[s: s + chunk]
        d = ((q[:, None, :] - cen[None, :, :]) ** 2).sum(-1)
        cand = np.argpartition(d, k - 1, axis=1)[:, :k]
        t = tris[cand]
        w, dist = nearest_on(q[:, None, :], P[t[..., 0]], P[t[..., 1]], P[t[..., 2]])
        if normals is not None:
            dist = dist + 1e9 * ((normals[cand] * facing[s: s + chunk, None, :]).sum(-1) < 0)
        pick = dist.argmin(1)
        rows = np.arange(len(q))
        best[s: s + chunk] = cand[rows, pick]
        bary[s: s + chunk] = w[rows, pick]
    return best, bary


def thin(p, target, agg=7.0):
    """A copy of primitive p cut down to about target triangles. The shape is
    simplified as one welded surface (fast-simplification), and the corners
    then find their texture coordinates again on the original: each new
    triangle keeps to the UV island of the old triangle nearest its centre,
    and each corner takes the UV of the nearest point of that island."""
    try:
        import fast_simplification
    except ImportError:
        fail('--tris needs fast-simplification: run this with uv, or pip install fast-simplification')
    P, T, I = p['P'], p['T'], p['I'].reshape(-1, 3)
    if len(I) <= target:
        return p
    # weld the copies of each vertex that the UV seams split, so the surface is whole
    span = max(np.ptp(P, 0).max(), 1e-9)
    _, weld = np.unique(np.round(P / (span * 1e-6)).astype(np.int64), axis=0, return_inverse=True)
    weld = weld.ravel()
    W = np.zeros((weld.max() + 1, 3))
    W[weld] = P
    tw = weld[I]
    whole = (tw[:, 0] != tw[:, 1]) & (tw[:, 1] != tw[:, 2]) & (tw[:, 2] != tw[:, 0])
    Q, F = fast_simplification.simplify(W.astype(np.float32), tw[whole].astype(np.int32), target_count=min(int(target), int(whole.sum()) - 1), agg=agg)
    Q, F = Q.astype(np.float64), F.astype(np.int64)
    used, F = np.unique(F.ravel(), return_inverse=True)
    Q, F = Q[used], F.reshape(-1, 3)

    def near_normal(which):
        t, w = nearest_triangle(Q[which], I, P)
        return unit((w[:, :, None] * p['N'][I[t]]).sum(1), UP)

    NQ = unit_normals(Q, F.ravel(), near_normal)
    if T is None:
        return {**p, 'P': Q, 'N': NQ, 'T': None, 'I': F.ravel()}
    # the old triangles' islands: pieces of the unwelded mesh
    _, island = np.unique(pieces(I, len(P))[I[:, 0]], return_inverse=True)
    island = island.ravel()
    old_n = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
    new_n = np.cross(Q[F[:, 1]] - Q[F[:, 0]], Q[F[:, 2]] - Q[F[:, 0]])
    near, _ = nearest_triangle(Q[F].mean(1), I, P, old_n, new_n)
    face_island = island[near]
    # one vertex per (new vertex, island) pair its triangles need
    key = F * (island.max() + 1) + face_island[:, None]
    keys, inv = np.unique(key.ravel(), return_inverse=True)
    vert, isl = keys // (island.max() + 1), keys % (island.max() + 1)
    uv = np.empty((len(keys), 2))
    for i in np.unique(isl):
        sel = np.nonzero(isl == i)[0]
        tris = I[island == i]
        t, w = nearest_triangle(Q[vert[sel]], tris, P)
        uv[sel] = (w[:, :, None] * T[tris[t]]).sum(1)
    return {**p, 'P': Q[vert], 'N': NQ[vert], 'T': uv, 'I': inv.ravel()}


# --- legs ------------------------------------------------------------------


def surface_distance(nbrs, n, src):
    """Shortest distances from vertex src to every vertex, along the edges."""
    d = np.full(n, np.inf)
    d[src] = 0.0
    heap = [(0.0, src)]
    while heap:
        dv, v = heapq.heappop(heap)
        if dv > d[v]:
            continue
        for u, length in nbrs[v]:
            if dv + length < d[u]:
                d[u] = dv + length
                heapq.heappush(heap, (d[u], u))
    return d


def depth_inside(P, N, T):
    """How far each vertex is from the surface behind it, straight in along
    its normal (Moller-Trumbore): small on a leg, large on a body."""
    a = P[T[:, 0]]
    e1, e2 = P[T[:, 1]] - a, P[T[:, 2]] - a
    span = np.ptp(P, 0).max()
    out = np.full(len(P), np.inf)
    chunk = max(4, 300_000 // len(T))
    for s in range(0, len(P), chunk):
        d = -N[s: s + chunk, None, :]
        pv = np.cross(d, e2[None])
        det = (e1[None] * pv).sum(-1)
        ok = np.abs(det) > 1e-14
        inv = ok / np.where(ok, det, 1.0)
        tv = P[s: s + chunk, None, :] - a[None]
        u = (tv * pv).sum(-1) * inv
        qv = np.cross(tv, e1[None])
        v = (d * qv).sum(-1) * inv
        t = (e2[None] * qv).sum(-1) * inv
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > span * 1e-3)
        out[s: s + chunk] = np.where(hit, t, np.inf).min(1)
    return out


def rig_legs(parts, count):
    """Find a creature's legs, for the game to walk them: their tips are the
    points farthest out from the middle, and each leg runs in along the
    surface from its tip until the surface around it turns thick (the body).
    Each vertex gets the leg it belongs to and how much it follows that leg's
    swing (0 at the hip, 1 most of the way out), and legs whose tips do not
    reach the ground are bent down to it, keeping where their feet stand.
    Returns each leg's hip, side (the sign of its x) and place on that side
    (0 at the front)."""
    prims = [p for part in parts for p in part['prims']]
    starts = np.cumsum([0] + [len(p['P']) for p in prims])
    P = np.concatenate([p['P'] for p in prims])
    span = max(np.ptp(P[:, 0]), np.ptp(P[:, 2]))
    # one vertex for each place on the surface, however the UV seams split it
    _, weld = np.unique(np.round(P / (span * 1e-6)).astype(np.int64), axis=0, return_inverse=True)
    weld = weld.ravel()
    W = np.zeros((weld.max() + 1, 3))
    W[weld] = P
    T = np.concatenate([weld[p['I'].reshape(-1, 3) + starts[i]] for i, p in enumerate(prims)])
    T = T[(T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 2] != T[:, 0])]
    given = np.zeros((len(W), 3))
    np.add.at(given, weld, np.concatenate([p['N'] for p in prims]))

    def given_normal(which):
        return unit(given[which], UP)

    WN = unit_normals(W, T.ravel(), given_normal)
    edges = np.unique(np.sort(np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]), axis=1), axis=0)
    lengths = np.linalg.norm(W[edges[:, 0]] - W[edges[:, 1]], axis=1)
    nbrs = [[] for _ in range(len(W))]
    for (i, j), length in zip(edges.tolist(), lengths.tolist()):
        nbrs[i].append((j, length))
        nbrs[j].append((i, length))

    # the tips: the farthest out from the middle, each a long way round the
    # surface from the others (two points on one leg are close that way)
    mid = (W.min(0) + W.max(0)) / 2
    out = np.hypot(W[:, 0] - mid[0], W[:, 2] - mid[2])
    tips, D = [], []
    for v in np.argsort(-out):
        if len(tips) == count or out[v] < 0.45 * out.max():
            break
        if all(dist[v] > 0.4 * span for dist in D):
            tips.append(v)
            D.append(surface_distance(nbrs, len(W), v))
    if len(tips) < count:
        print(f'  found only {len(tips)} of {count} legs')
    D = np.array(D)
    centre = D.max(0).argmin()  # the point of the body nearest all the tips
    own, d = D.argmin(0), D.min(0)
    depth = depth_inside(W, WN, T)
    w = np.zeros(len(W))
    legs = []
    step = 0.03 * span
    for k, tip in enumerate(tips):
        mine = own == k
        reach = D[k, centre]

        def depth_at(b):
            ring = mine & (d >= b) & (d < b + step)
            return np.median(depth[ring]) if ring.any() else None

        # where the leg meets the body: the first stretch in from the tip
        # (which reads thick too, end-on) that is thick, with no thin one
        # just beyond it
        meet = reach - 0.08 * span
        for b in np.arange(0.25 * reach, meet, step):
            here, beyond = depth_at(b), depth_at(b + step)
            if here is not None and here > 0.07 * span and (beyond is None or beyond > 0.07 * span):
                meet = b
                break
        x = np.clip((meet - d[mine]) / (0.25 * meet), 0, 1)
        w[mine] = x * x * (3 - 2 * x)
        near = np.nonzero(mine)[0][np.argsort(np.abs(d[mine] - meet))[:6]]
        legs.append({'hip': W[near].mean(0), 'tip': W[tip].copy(), 'side': 1 if W[tip, 0] > mid[0] else -1})
    floor = W[:, 1].min()
    for k, leg in enumerate(legs):
        drop = leg['tip'][1] - floor
        if drop < 0.02 * span:
            continue
        # lower the leg more the farther out it is, in an arch
        along = (leg['tip'] - leg['hip'])[[0, 2]]
        sel = (own == k) & (w > 0)
        f = np.clip((W[sel][:, [0, 2]] - leg['hip'][[0, 2]]) @ along / (along @ along), 0, 1)
        W[sel, 1] -= f ** 1.8 * drop * w[sel]
    for side in (-1, 1):
        mine = sorted((leg for leg in legs if leg['side'] == side), key=lambda leg: -leg['tip'][2])
        for i, leg in enumerate(mine):
            leg['order'] = i
    WN = unit_normals(W, T.ravel(), given_normal)
    which = np.where(w > 0, own, 255)
    for i, p in enumerate(prims):
        at = weld[starts[i]: starts[i + 1]]
        p['P'], p['N'] = W[at], WN[at]
        p['leg'] = np.zeros((len(at), 4), np.uint8)
        p['leg'][:, 0] = which[at]
        p['leg'][:, 1] = np.round(w[at] * 255)
    return [{'hip': [round(float(v), 5) for v in leg['hip']], 'side': leg['side'], 'order': leg['order']} for leg in legs]


def pad(a, covered):
    """Fill the texels outside the islands from the island texels nearby (push-pull)."""
    c = a * covered
    w = covered.astype(np.float32)
    levels = []
    while w.shape[0] > 1 or w.shape[1] > 1:
        fy, fx = (2 if w.shape[0] > 1 else 1), (2 if w.shape[1] > 1 else 1)
        levels.append((c, w, fy, fx))
        h2, w2 = w.shape[0] // fy, w.shape[1] // fx
        c = c[: h2 * fy, : w2 * fx].reshape(h2, fy, w2, fx).sum((1, 3))
        w = w[: h2 * fy, : w2 * fx].reshape(h2, fy, w2, fx).sum((1, 3))
    fill = c / np.maximum(w, 1e-9)
    for c, w, fy, fx in reversed(levels):
        up = np.repeat(np.repeat(fill, fy, 0), fx, 1)
        up = np.pad(up, ((0, w.shape[0] - up.shape[0]), (0, w.shape[1] - up.shape[1])), mode='edge')
        fill = np.where(w > 0, c / np.maximum(w, 1e-9), up)
    return fill


def texture(img, uvs, size, quality, colour=False):
    """A base colour texture as a JPEG, greyscale unless colour, its islands
    padded out."""
    px = np.asarray(img.convert('RGB' if colour else 'L'), dtype=np.float32)
    H, W = px.shape[:2]
    mask = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(mask)
    for T, I in uvs:
        at = T * [W, H]
        for t in I.reshape(-1, 3):
            d.polygon([tuple(at[k]) for k in t], fill=255, outline=255)
    covered = np.asarray(mask) > 0
    if colour:
        px = np.stack([pad(px[..., c], covered) for c in range(3)], -1)
    else:
        px = pad(px, covered)
    out = Image.fromarray(np.clip(px + 0.5, 0, 255).astype(np.uint8))
    k = min(1.0, size / max(W, H))
    if k < 1:
        out = out.resize((max(1, round(W * k)), max(1, round(H * k))), Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, 'JPEG', quality=quality, optimize=True)
    return buf.getvalue(), out


# --- writing ---------------------------------------------------------------


def quantise(a, dtype):
    info = np.iinfo(dtype)
    lo = -info.max if info.min < 0 else 0
    return np.clip(np.round(a * info.max), lo, info.max).astype(dtype)


class Writer:
    def __init__(self):
        self.blob = bytearray()
        self.views = []
        self.accessors = []

    def view(self, data, target=None, stride=None):
        while len(self.blob) % 4:
            self.blob += b'\0'
        v = {'buffer': 0, 'byteOffset': len(self.blob), 'byteLength': len(data)}
        if target:
            v['target'] = target
        if stride:
            v['byteStride'] = stride
        self.views.append(v)
        self.blob += data
        return len(self.views) - 1

    def accessor(self, data, ctype, count, kind, target=None, stride=None, **extra):
        a = {'bufferView': self.view(data, target, stride), 'componentType': ctype, 'count': count, 'type': kind}
        a.update(extra)
        self.accessors.append(a)
        return len(self.accessors) - 1


def write_glb(path, parts, shades, jpegs, legs=None):
    """shades maps a source image to its index in jpegs, the textures written;
    legs, from rig_legs, goes in the extras of each mesh."""
    allP = np.concatenate([p['P'] for part in parts for p in part['prims']])
    lo, hi = allP.min(0), allP.max(0)
    mid = (lo + hi) / 2
    half = max((hi - lo).max() / 2, 1e-6)
    W = Writer()
    materials, mat_index, meshes, nodes = [], {}, [], []
    for part in parts:
        prims = []
        for p in part['prims']:
            n = len(p['P'])
            q = quantise((p['P'] - mid) / half, np.int16)
            pos = np.zeros((n, 4), '<i2')
            pos[:, :3] = q
            nor = np.zeros((n, 4), np.int8)
            nor[:, :3] = quantise(p['N'], np.int8)
            # bounds are the raw stored values, whatever `normalized` says
            attrs = {
                'POSITION': W.accessor(pos.tobytes(), 5122, n, 'VEC3', ARRAY_BUFFER, 8, normalized=True, min=q.min(0).tolist(), max=q.max(0).tolist()),
                'NORMAL': W.accessor(nor.tobytes(), 5120, n, 'VEC3', ARRAY_BUFFER, 4, normalized=True),
            }
            tex = shades.get(p['img']) if p['T'] is not None else None
            if tex is not None:
                T = p['T']
                if T.min() >= 0 and T.max() <= 1:
                    attrs['TEXCOORD_0'] = W.accessor(quantise(T, np.uint16).astype('<u2').tobytes(), 5123, n, 'VEC2', ARRAY_BUFFER, normalized=True)
                else:
                    attrs['TEXCOORD_0'] = W.accessor(T.astype('<f4').tobytes(), 5126, n, 'VEC2', ARRAY_BUFFER)
            if 'leg' in p:
                # which leg (255 for none) and how much it follows it
                attrs['_LEG'] = W.accessor(p['leg'].tobytes(), 5121, n, 'VEC4', ARRAY_BUFFER)
            big = n > 65535
            idx = p['I'].astype('<u4' if big else '<u2')
            key = (p['mat'], p['double'], tex)
            if key not in mat_index:
                m = {'doubleSided': p['double'], 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1}}
                if p['mat'] is not None:
                    m['name'] = p['mat']
                if tex is not None:
                    m['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex}
                mat_index[key] = len(materials)
                materials.append(m)
            prims.append({
                'attributes': attrs,
                'indices': W.accessor(idx.tobytes(), 5125 if big else 5123, len(idx), 'SCALAR', ELEMENT_ARRAY_BUFFER),
                'material': mat_index[key],
            })
        mesh = {'primitives': prims}
        if part['mesh'] is not None:
            mesh['name'] = part['mesh']
        if legs:
            mesh['extras'] = {'legs': legs}
        node = {'mesh': len(meshes), 'translation': mid.tolist(), 'scale': [half] * 3}
        if part['node'] is not None:
            node['name'] = part['node']
        meshes.append(mesh)
        nodes.append(node)
    images = [{'bufferView': W.view(jpg), 'mimeType': 'image/jpeg', 'name': f'shade{i}'} for i, jpg in enumerate(jpegs)]
    while len(W.blob) % 4:
        W.blob += b'\0'
    doc = {
        'asset': {'version': '2.0', 'generator': 'Ravenmoor House tools/ghost_glb.py'},
        'extensionsUsed': ['KHR_mesh_quantization'],
        'extensionsRequired': ['KHR_mesh_quantization'],
        'scene': 0,
        'scenes': [{'nodes': list(range(len(nodes)))}],
        'nodes': nodes,
        'meshes': meshes,
        'materials': materials,
        'accessors': W.accessors,
        'bufferViews': W.views,
        'buffers': [{'byteLength': len(W.blob)}],
    }
    if images:
        doc['images'] = images
        doc['textures'] = [{'sampler': 0, 'source': i} for i in range(len(images))]
        doc['samplers'] = [{'magFilter': 9729, 'minFilter': 9987}]
    js = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode()
    while len(js) % 4:
        js += b' '
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(W.blob))
    out += struct.pack('<I4s', len(js), b'JSON') + js
    out += struct.pack('<I4s', len(W.blob), b'BIN\0') + bytes(W.blob)
    with open(path, 'wb') as f:
        f.write(out)
    return len(out)


def main():
    ap = argparse.ArgumentParser(description='Make a glTF model light enough to haunt the house.')
    ap.add_argument('src', help='the model as supplied (.glb)')
    ap.add_argument('dst', help='where to write the game copy, e.g. art/ghosts/name.glb')
    ap.add_argument('--height', type=float, required=True, help='height in metres, feet to crown')
    ap.add_argument('--up', default='y', help="the model's axis that points up: x, y, z, -x, -y or -z, written --up=-z for a minus (a model made from a photo taken from above often lies with its back toward z)")
    ap.add_argument('--face', default='z', help="the model's axis it faces, e.g. x when it faces right in a viewer looking down -z")
    ap.add_argument('--turn', type=float, default=0, help='degrees to spin it about the vertical, so it faces +Z')
    ap.add_argument('--center', action='store_true', help='stand it on the vertical axis (centre of its bounds)')
    ap.add_argument('--tex', type=int, default=1024, help='largest texture size in pixels; 0 drops textures')
    ap.add_argument('--quality', type=int, default=85, help='JPEG quality of the textures')
    ap.add_argument('--colour', '--color', action='store_true', help='keep the textures in colour (a creature, not a ghost)')
    ap.add_argument('--tris', type=int, help='thin the model to about this many triangles')
    ap.add_argument('--legs', type=int, help='find this many legs and rig them for the game to walk (a spider: 8)')
    ap.add_argument('--preview', help='also save the texture here, to look at')
    ap.add_argument('--glow', help='x0,y0,z0,x1,y1,z1: a box in metres (after sizing) whose bright triangles become the part named glow; write --glow=-0.3,... when it starts with a minus')
    ap.add_argument('--glow-min', type=float, default=0.5, help='how bright (0 to 1, in the base colour) a triangle in the box must be to glow')
    a = ap.parse_args()

    doc, blob = read_glb(a.src)
    parts = gather(doc, blob)
    tall, k = fit(parts, a.height, a.turn, a.center, a.up, a.face)

    # the base colour images, read once
    pics = {}
    for img in sorted({p['img'] for part in parts for p in part['prims'] if p['img'] is not None}):
        if 'bufferView' not in doc['images'][img]:
            fail('the model keeps a texture in a separate file; export it as one .glb')
        try:
            pics[img] = Image.open(io.BytesIO(view(doc, blob, doc['images'][img]['bufferView'])[0]))
            pics[img].load()
        except Exception as e:  # e.g. KTX2, which Pillow cannot read
            print(f'  texture {img} left out: {e}')

    if a.glow:
        box = [float(v) for v in a.glow.split(',')]
        if len(box) != 6:
            fail('--glow takes six numbers: x0,y0,z0,x1,y1,z1')
        greys = {img: np.asarray(pic.convert('L'), dtype=np.float32) / 255 for img, pic in pics.items()}
        if not cut_glow(parts, box, a.glow_min, greys):
            fail('nothing bright enough to glow inside that box')

    # one texture per base colour image, padded over all its users
    shades, jpegs = {}, []
    if a.tex > 0:
        users = {}
        for part in parts:
            for p in part['prims']:
                if p['img'] in pics:
                    users.setdefault(p['img'], []).append((p['T'], p['I']))
        for img, uvs in users.items():
            jpg, shown = texture(pics[img], uvs, a.tex, a.quality, a.colour)
            shades[img] = len(jpegs)
            jpegs.append(jpg)
            if a.preview:
                stem, ext = os.path.splitext(a.preview)
                shown.save(a.preview if len(users) == 1 else f'{stem}_{len(jpegs) - 1}{ext}', quality=92)

    # thinned after the textures, whose islands come from the full model
    if a.tris:
        total = sum(len(p['I']) // 3 for part in parts for p in part['prims'])
        for part in parts:
            part['prims'] = [thin(p, max(a.tris * (len(p['I']) // 3) / total, min(len(p['I']) // 3, 50))) for p in part['prims']]
    legs = rig_legs(parts, a.legs) if a.legs else None
    size = write_glb(a.dst, parts, shades, jpegs, legs)

    verts = sum(len(p['P']) for part in parts for p in part['prims'])
    tris = sum(len(p['I']) // 3 for part in parts for p in part['prims'])
    print(f'{a.src}: {os.path.getsize(a.src):,} bytes, {tall:.3f} tall as supplied, scaled x{k:.4f}')
    for part in parts:
        for p in part['prims']:
            names = ' / '.join(x for x in (part['node'], part['mesh'], p['mat']) if x)
            tex = (', coloured' if a.colour else ', shaded') if p['img'] in shades else ''
            print(f'  {names}: {len(p["P"]):,} vertices, {len(p["I"]) // 3:,} triangles{tex}')
    allP = np.concatenate([p['P'] for part in parts for p in part['prims']])
    lo, hi = allP.min(0), allP.max(0)
    print(f'{a.dst}: {size:,} bytes; {verts:,} vertices, {tris:,} triangles, {len(jpegs)} texture(s) ({sum(map(len, jpegs)):,} bytes)')
    print(f'  x {lo[0]:.3f}..{hi[0]:.3f}  y {lo[1]:.3f}..{hi[1]:.3f}  z {lo[2]:.3f}..{hi[2]:.3f}')
    for leg in legs or []:
        moving = sum(int((p['leg'][:, 0] == i).sum()) for part in parts for p in part['prims'] for i in [legs.index(leg)])
        print(f"  leg {legs.index(leg)}: {'-x' if leg['side'] < 0 else '+x'} side, {leg['order'] + 1} from the front, hip {leg['hip']}, {moving:,} vertices")


if __name__ == '__main__':
    main()
