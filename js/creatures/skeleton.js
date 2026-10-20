import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { damp } from '../core/util.js';
import { patiently } from '../core/models.js';

// The skeleton in the cellar's coffin: a rigged model whose bones
// (tools/ghost_glb.py keeps them) are posed here, from lying with its arms
// at its sides to sitting bolt upright, reaching out, its head turned to
// whoever opened the coffin and its jaw working. If the model cannot be had,
// a picture of it lying there takes its place, and does not move.

const ART = {
  src: 'art/creatures/skeleton.glb',
  // drawn from the model, lying, seen from straight above; what it covers,
  // in metres, standing (the model faces +z)
  picture: { src: 'art/creatures/skeleton.webp', left: -0.25, right: 0.25, bottom: -0.02, top: 1.72 },
  // its rig numbers its bones; these are the ones posed
  hips: 'bone_0',
  thighs: ['bone_44', 'bone_48'],
  spine: ['bone_1', 'bone_2', 'bone_3'],
  neck: 'bone_4',
  head: 'bone_5',
  arms: [
    ['bone_7', 'bone_8', 1], // its left: upper arm, forearm, side (+x)
    ['bone_26', 'bone_27', -1],
  ],
  // The rig leaves the lower jaw to the head; it is cut free here: in front,
  // everything below the teeth, and at the sides, up to the hinges by the
  // ears (metres, standing; the model faces +z).
  jaw: { hinge: [0, 1.535, 0.005], teeth: 1.503, front: 0.035, back: -0.015, top: 1.545, side: 0.035 },
};

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;
const rotX = (deg) => new THREE.Quaternion().setFromAxisAngle(X, deg * DEG);
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

// The model, or else its picture; null if neither can be had.
export function fetchSkeleton() {
  return patiently(() => new GLTFLoader().loadAsync(ART.src))
    .then((gltf) => gltf && new CoffinSkeleton(gltf.scene))
    .catch((e) => {
      console.warn('skeleton model:', e);
      return null;
    })
    .then((sk) => sk || patiently(() => new THREE.TextureLoader().loadAsync(ART.picture.src)).then((tex) => tex && new StillSkeleton(tex)))
    .catch(() => null);
}

// The picture, laid where the model would lie: flat across the middle of
// the body, facing up out of the coffin.
class StillSkeleton {
  constructor(tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    const { left, right, bottom, top } = ART.picture;
    const plane = new THREE.PlaneGeometry(right - left, top - bottom).translate((left + right) / 2, (bottom + top) / 2, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.8 });
    this.root = new THREE.Group();
    this.root.add(new THREE.Mesh(plane, mat));
  }

  pose() {}
}

class CoffinSkeleton {
  constructor(scene) {
    this.root = scene;
    scene.updateMatrixWorld(true);
    // every node's rest rotation, its own and in the model's space
    this.rest = new Map();
    scene.traverse((o) => this.rest.set(o, { local: o.quaternion.clone(), world: o.getWorldQuaternion(new THREE.Quaternion()) }));
    const bone = (name) => scene.getObjectByName(name);
    const at = (o) => o.getWorldPosition(new THREE.Vector3());
    const towards = (from, to) => to.clone().sub(from).normalize();
    this.spine = ART.spine.map(bone);
    this.neck = bone(ART.neck);
    this.head = bone(ART.head);
    this.yaw = 0;
    this.mesh = null;
    scene.traverse((o) => {
      if (o.isSkinnedMesh) this.mesh = o;
      if (o.isMesh) {
        o.castShadow = true;
        // the pose changes its bounds too much for a culling sphere fixed at rest
        o.frustumCulled = false;
        o.material.roughness = 0.75;
      }
    });

    // the arms: lying, laid along its sides, drawn in to fit the coffin;
    // sitting, reaching out ahead of the body
    const lie = new Map();
    const sit = new Map();
    const up = rotX(85);
    this.arms = [];
    for (const [u, f, s] of ART.arms) {
      const upper = bone(u);
      const fore = bone(f);
      const restU = towards(at(upper), at(fore));
      const restF = towards(at(fore), at(fore.children.find((c) => c.isBone)));
      const aim = (rest, x, y, z) => new THREE.Quaternion().setFromUnitVectors(rest, new THREE.Vector3(x, y, z).normalize());
      lie.set(upper, aim(restU, -0.04 * s, -1, 0.05));
      lie.set(fore, aim(restF, -0.03 * s, -1, 0.1));
      // reaching up a little, to clear the sides of the coffin
      sit.set(upper, aim(restU, ..._v.set(0.1 * s, 0.3, 1).applyQuaternion(up).toArray()));
      sit.set(fore, aim(restF, ..._v.set(0.04 * s, 0.15, 1).applyQuaternion(up).toArray()));
      this.arms.push(upper, fore);
    }
    // It sits up as a body does, bending at the hips: the pelvis tips up
    // with the spine while the thighs stay down, and the spine curls the
    // rest of the way; the head holds a little back.
    for (const [b, deg] of [
      [bone(ART.hips), 55],
      [this.spine[0], 68],
      [this.spine[1], 78],
      [this.spine[2], 85],
      [this.neck, 80],
      [this.head, 70],
      ...ART.thighs.map((t) => [bone(t), 0]),
    ]) {
      lie.set(b, new THREE.Quaternion());
      sit.set(b, rotX(deg));
    }
    this.lie = lie;
    this.sit = sit;
    this._jaw();
  }

  // Give the lower jaw a bone of its own, hinged below the ears.
  _jaw() {
    const J = ART.jaw;
    const mesh = this.mesh;
    const sk = mesh.skeleton;
    const headIndex = sk.bones.indexOf(this.head);
    const jaw = new THREE.Bone();
    jaw.name = 'jaw';
    this.head.add(jaw);
    jaw.position.copy(this.head.worldToLocal(new THREE.Vector3(...J.hinge)));
    jaw.updateMatrixWorld(true);
    // from the stored (quantised) positions to the model's space at rest
    const rest = this.head.matrixWorld.clone().multiply(sk.boneInverses[headIndex]);
    const jawIndex = sk.bones.length;
    const pos = mesh.geometry.attributes.position;
    const idx = mesh.geometry.attributes.skinIndex;
    const wt = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      const p = _v.fromBufferAttribute(pos, i).applyMatrix4(rest);
      const front = p.z > J.front && p.y < J.teeth;
      const side = p.z > J.back && p.z <= J.front && p.y < J.top && Math.abs(p.x) > J.side;
      if (!front && !side) continue;
      let w = 0;
      for (let k = 0; k < 4; k++) if (idx.getComponent(i, k) === headIndex) w += wt.getComponent(i, k);
      if (w < 0.5) continue;
      for (let k = 0; k < 4; k++) if (idx.getComponent(i, k) === headIndex) idx.setComponent(i, k, jawIndex);
    }
    idx.needsUpdate = true;
    const inverses = [...sk.boneInverses, jaw.matrixWorld.clone().invert().multiply(rest)];
    mesh.bind(new THREE.Skeleton([...sk.bones, jaw], inverses), mesh.bindMatrix);
    this.jaw = jaw;
    // how the head rests, to hinge the jaw across it (the model's x)
    this.headRest = this.rest.get(this.head).world;
  }

  // sit: 0 lying to 1 sitting up; jaw: 0 shut to 1 working; eye: where the
  // one looking in is, in the house
  pose(sit, jaw, t, dt, eye) {
    const turn = new Map();
    for (const [b, q] of this.lie) turn.set(b, q.clone().slerp(this.sit.get(b), sit));
    // once up, the head turns to the eye as far as a neck will, and the
    // hands reach a third of the way round after it
    let yaw = 0;
    if (sit > 0.05 && eye) {
      const e = this.root.worldToLocal(_v.copy(eye)).sub(this.root.worldToLocal(this.head.getWorldPosition(_p)));
      e.applyQuaternion(_q.copy(turn.get(this.neck)).invert());
      yaw = THREE.MathUtils.clamp(Math.atan2(e.x, e.z), -1.2, 1.2);
    }
    this.yaw = damp(this.yaw, yaw * sit, 5, dt);
    turn.get(this.neck).multiply(_q.setFromAxisAngle(Y, this.yaw * 0.35));
    turn.get(this.head).multiply(_q.setFromAxisAngle(Y, this.yaw * 0.65));
    const reach = _q.setFromAxisAngle(_p.copy(Y).applyQuaternion(turn.get(this.spine[2])), this.yaw * 0.35);
    for (const b of this.arms) turn.get(b).premultiply(reach);
    this._apply(turn);
    // the jaw drops open and chatters
    const a = jaw * (0.32 + 0.12 * Math.sin(t * 22));
    this.jaw.quaternion.copy(this.headRest).invert().multiply(_q.setFromAxisAngle(X, a)).multiply(this.headRest);
  }

  // Turn the bones given (each by a rotation in the model's own space, away
  // from how it rests); every other bone follows its parent.
  _apply(turn) {
    const now = new Map();
    const world = (o) => {
      let w = now.get(o);
      if (w) return w;
      const r = this.rest.get(o);
      const d = turn.get(o);
      if (d) w = d.clone().multiply(r.world);
      else if (o === this.root || !this.rest.has(o.parent)) w = r.world;
      else w = world(o.parent).clone().multiply(r.local);
      now.set(o, w);
      return w;
    };
    for (const [b] of turn) b.quaternion.copy(world(b.parent)).invert().multiply(world(b));
  }
}
