#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = ["numpy", "pillow"]
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
  anticlockwise seen from above) when it does not face +Z
- keeps each part as its own mesh, under its node, mesh and material
  names, which GHOST_ART's slot rules match
- stores the geometry quantised (KHR_mesh_quantization, which three.js
  reads without a decoder): positions int16, normals int8, UVs uint16
- keeps each base colour texture as a greyscale JPEG at most --tex pixels
  across (0 drops textures), its UV islands padded out into the empty
  atlas so smaller mip levels do not bleed black into the seams
- drops normal, metal/roughness, occlusion and emissive maps, tangents,
  vertex colours, skins, morph targets and animations

Without uv: pip install numpy pillow, then run it with python3.
"""
import argparse
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


def vertex_normals(P, I):
    t = I.reshape(-1, 3)
    fn = np.cross(P[t[:, 1]] - P[t[:, 0]], P[t[:, 2]] - P[t[:, 0]])
    N = np.zeros_like(P)
    for k in range(3):
        np.add.at(N, t[:, k], fn)
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
                N = vertex_normals(P, I) if N is None else N @ np.linalg.inv(m[:3, :3])
                N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
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


def fit(parts, height, turn, center):
    """Turn, scale and move every part so the whole stands on the origin."""
    c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
    R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
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


def shade_texture(img, uvs, size, quality):
    """A base colour texture as a greyscale JPEG, its islands padded out."""
    grey = np.asarray(img.convert('L'), dtype=np.float32)
    H, W = grey.shape
    mask = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(mask)
    for T, I in uvs:
        px = T * [W, H]
        for t in I.reshape(-1, 3):
            d.polygon([tuple(px[k]) for k in t], fill=255, outline=255)
    out = Image.fromarray(np.clip(pad(grey, np.asarray(mask) > 0) + 0.5, 0, 255).astype(np.uint8))
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


def write_glb(path, parts, shades, jpegs):
    """shades maps a source image to its index in jpegs, the textures written."""
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
    ap.add_argument('--turn', type=float, default=0, help='degrees to spin it about the vertical, so it faces +Z')
    ap.add_argument('--center', action='store_true', help='stand it on the vertical axis (centre of its bounds)')
    ap.add_argument('--tex', type=int, default=1024, help='largest texture size in pixels; 0 drops textures')
    ap.add_argument('--quality', type=int, default=85, help='JPEG quality of the textures')
    ap.add_argument('--preview', help='also save the greyscale texture here, to look at')
    a = ap.parse_args()

    doc, blob = read_glb(a.src)
    parts = gather(doc, blob)
    tall, k = fit(parts, a.height, a.turn, a.center)

    # one greyscale texture per base colour image, padded over all its users
    shades, jpegs = {}, []
    if a.tex > 0:
        users = {}
        for part in parts:
            for p in part['prims']:
                if p['img'] is not None:
                    users.setdefault(p['img'], []).append((p['T'], p['I']))
        for img, uvs in users.items():
            if 'bufferView' not in doc['images'][img]:
                fail('the model keeps a texture in a separate file; export it as one .glb')
            try:
                pic = Image.open(io.BytesIO(view(doc, blob, doc['images'][img]['bufferView'])[0]))
                pic.load()
            except Exception as e:  # e.g. KTX2, which Pillow cannot read
                print(f'  texture {img} left out: {e}')
                continue
            jpg, shown = shade_texture(pic, uvs, a.tex, a.quality)
            shades[img] = len(jpegs)
            jpegs.append(jpg)
            if a.preview:
                stem, ext = os.path.splitext(a.preview)
                shown.save(a.preview if len(users) == 1 else f'{stem}_{len(jpegs) - 1}{ext}', quality=92)
    size = write_glb(a.dst, parts, shades, jpegs)

    verts = sum(len(p['P']) for part in parts for p in part['prims'])
    tris = sum(len(p['I']) // 3 for part in parts for p in part['prims'])
    print(f'{a.src}: {os.path.getsize(a.src):,} bytes, {tall:.3f} tall as supplied, scaled x{k:.4f}')
    for part in parts:
        for p in part['prims']:
            names = ' / '.join(x for x in (part['node'], part['mesh'], p['mat']) if x)
            tex = ', shaded' if p['img'] in shades else ''
            print(f'  {names}: {len(p["P"]):,} vertices, {len(p["I"]) // 3:,} triangles{tex}')
    allP = np.concatenate([p['P'] for part in parts for p in part['prims']])
    lo, hi = allP.min(0), allP.max(0)
    print(f'{a.dst}: {size:,} bytes; {verts:,} vertices, {tris:,} triangles, {len(jpegs)} texture(s) ({sum(map(len, jpegs)):,} bytes)')
    print(f'  x {lo[0]:.3f}..{hi[0]:.3f}  y {lo[1]:.3f}..{hi[1]:.3f}  z {lo[2]:.3f}..{hi[2]:.3f}')


if __name__ == '__main__':
    main()
