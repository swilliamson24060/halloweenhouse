import * as THREE from 'three';

// Dim environment map so metal, glass and lacquer catch a little light.
export function makeEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 top = vec3(0.05, 0.06, 0.08);
        vec3 hor = vec3(0.13, 0.13, 0.15);
        vec3 bot = vec3(0.02, 0.02, 0.02);
        vec3 c = d.y > 0.0 ? mix(hor, top, pow(abs(d.y), 0.6)) : mix(hor, bot, pow(abs(d.y), 0.4));
        float moon = pow(max(dot(d, normalize(vec3(-0.45, 0.55, -0.7))), 0.0), 120.0);
        float pane = smoothstep(0.85, 0.9, max(dot(d, vec3(1.0, 0.25, 0.0)), dot(d, vec3(-0.2, 0.2, 1.0))));
        c += vec3(1.0, 0.95, 0.85) * moon * 4.0 + vec3(0.35, 0.38, 0.45) * pane;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  return rt.texture;
}

export function buildMaterials(T, env) {
  const M = {};
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  const surf = (t, o = {}) =>
    std({
      map: t.map,
      bumpMap: t.bump || null,
      bumpScale: o.bumpScale ?? 1.2,
      ...o,
    });

  // exterior
  M.siding = surf(T.siding, { roughness: 0.93, bumpScale: 1.6 });
  M.trim = surf(T.trim, { roughness: 0.85, color: 0xc9c6bd });
  M.trimDark = surf(T.trim, { roughness: 0.85, color: 0x6f6c66 });
  M.shingle = surf(T.shingle, { roughness: 0.88, bumpScale: 1.6 });
  M.shingleRect = surf(T.shingleRect, { roughness: 0.88, bumpScale: 1.4 });
  M.stone = surf(T.stone, { roughness: 0.95, bumpScale: 2 });
  M.flag = surf(T.flag, { roughness: 0.92, bumpScale: 1.6 });
  M.concrete = surf(T.concrete, { roughness: 0.94, bumpScale: 1.2 });
  M.ground = surf(T.ground, { roughness: 0.97, bumpScale: 1.4 });
  M.asphalt = std({ map: T.asphalt.map, roughnessMap: T.asphalt.rough, roughness: 1, envMap: env, envMapIntensity: 0.45 });
  M.bark = surf(T.bark, { roughness: 0.95, bumpScale: 2.2 });
  M.hedge = std({ map: T.hedge.map, roughness: 0.95 });
  M.iron = std({ map: T.rust.map, roughness: 0.7, metalness: 0.45, envMap: env, envMapIntensity: 0.5 });
  M.ironBlack = std({ color: 0x141414, roughness: 0.55, metalness: 0.6, envMap: env, envMapIntensity: 0.6 });
  M.brick = surf(T.brick, { roughness: 0.93, bumpScale: 1.5 });
  M.marble = std({ map: T.marble.map, roughness: 0.35, envMap: env, envMapIntensity: 0.5 });

  // walls & floors
  for (const [k, t] of Object.entries(T.wp)) M[`wp_${k}`] = surf(t, { roughness: 0.92, bumpScale: 0.6 });
  for (const [k, t] of Object.entries(T.floor)) M[`fl_${k}`] = surf(t, { roughness: k === 'oak' || k === 'dark' ? 0.6 : 0.88, bumpScale: 0.9, envMap: env, envMapIntensity: 0.25 });
  M.tileChecker = surf(T.tileChecker, { roughness: 0.45, envMap: env, envMapIntensity: 0.4 });
  M.tileHex = surf(T.tileHex, { roughness: 0.4, envMap: env, envMapIntensity: 0.4 });
  M.tileFoyer = surf(T.tileFoyer, { roughness: 0.5, envMap: env, envMapIntensity: 0.35 });
  M.plaster = surf(T.plaster, { roughness: 0.96, bumpScale: 0.8 });
  M.fieldstone = surf(T.fieldstone, { roughness: 0.95, bumpScale: 2.4 });
  M.dirt = surf(T.dirt, { roughness: 0.98, bumpScale: 1.2 });

  // furniture & fabric
  M.woodDark = std({ map: T.woodDark.map, roughness: 0.55, envMap: env, envMapIntensity: 0.35 });
  M.woodLight = std({ map: T.woodLight.map, roughness: 0.7, envMap: env, envMapIntensity: 0.2 });
  M.woodRough = surf(T.floor.pine, { roughness: 0.95 });
  M.wainscot = std({ map: T.wainscot.map, roughness: 0.6, envMap: env, envMapIntensity: 0.25 });
  M.door = std({ map: T.door.map, bumpMap: T.door.bump, bumpScale: 2, roughness: 0.6, envMap: env, envMapIntensity: 0.3 });
  M.doorRed = std({ map: T.doorRed.map, bumpMap: T.doorRed.bump, bumpScale: 2, roughness: 0.5, envMap: env, envMapIntensity: 0.3 });
  M.doorBlue = std({ map: T.door.map, bumpMap: T.door.bump, bumpScale: 2, color: 0x6a7c9c, roughness: 0.45, envMap: env, envMapIntensity: 0.4 });
  M.sheet = std({ map: T.sheet.map, roughness: 1, side: THREE.DoubleSide });
  M.velvet = std({ map: T.velvet.map, roughness: 0.9, side: THREE.DoubleSide });
  M.velvetGreen = std({ map: T.velvetGreen.map, roughness: 0.9, side: THREE.DoubleSide });
  M.linen = std({ map: T.linen.map, roughness: 1, side: THREE.DoubleSide });
  M.uphRed = surf(T.uphRed, { roughness: 0.85, bumpScale: 1.5 });
  M.uphGreen = surf(T.uphGreen, { roughness: 0.85, bumpScale: 1.5 });
  T.rugs.forEach((r, i) => (M[`rug${i}`] = std({ map: r.map, roughness: 1 })));
  M.books = std({ map: T.books.map, roughness: 0.8 });
  M.keys = std({ map: T.keys.map, roughness: 0.4, envMap: env, envMapIntensity: 0.4 });
  M.parchment = std({ map: T.parchment.map, roughness: 0.95, side: THREE.DoubleSide });
  M.note = std({ map: T.note, roughness: 0.95, side: THREE.DoubleSide, emissive: 0x2a2418 });
  M.clock = std({ map: T.clock, roughness: 0.6 });
  M.ouija = std({ map: T.ouija, roughness: 0.6, envMap: env, envMapIntensity: 0.3 });

  // metals & glass
  M.brass = std({ color: 0x8a6a34, roughness: 0.4, metalness: 0.9, envMap: env, envMapIntensity: 1.2 });
  M.gilt = std({ color: 0x7a5a28, roughness: 0.5, metalness: 0.85, envMap: env, envMapIntensity: 1.0 });
  M.silver = std({ color: 0x8c8c90, roughness: 0.35, metalness: 0.9, envMap: env, envMapIntensity: 1.2 });
  M.porcelain = std({ color: 0xd8d4c8, roughness: 0.25, envMap: env, envMapIntensity: 0.7 });
  M.lacquer = std({ color: 0x0b0909, roughness: 0.22, envMap: env, envMapIntensity: 0.9 });
  M.blackMatte = std({ color: 0x111010, roughness: 0.85 });
  M.castIron = std({ color: 0x1c1b1a, roughness: 0.6, metalness: 0.5, envMap: env, envMapIntensity: 0.6 });
  M.glass = std({
    color: 0x1a2028,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    envMap: env,
    envMapIntensity: 1.4,
    side: THREE.DoubleSide,
  });
  M.glass.userData.noCast = true;
  M.glassLit = std({ color: 0x080604, emissive: 0xffb060, emissiveIntensity: 0.0, roughness: 0.2, envMap: env });
  M.glassDark = std({ color: 0x0a0c10, roughness: 0.05, metalness: 0.6, envMap: env, envMapIntensity: 1.6 });
  M.jarGreen = std({ color: 0x1c2a18, roughness: 0.15, envMap: env, envMapIntensity: 1.2, transparent: true, opacity: 0.85 });
  M.jarAmber = std({ color: 0x3a2008, roughness: 0.15, envMap: env, envMapIntensity: 1.2, transparent: true, opacity: 0.85 });
  M.jarDark = std({ color: 0x0b0d08, roughness: 0.12, envMap: env, envMapIntensity: 1.4 });
  M.water = std({ color: 0x050607, roughness: 0.04, envMap: env, envMapIntensity: 1.5 });
  M.water.userData.noCast = true;
  M.candle = std({ color: 0xd8cdb0, roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.4 });
  M.ember = std({ color: 0x220800, emissive: 0xff4a10, emissiveIntensity: 1.6, roughness: 1 });
  M.redGlow = std({ color: 0x100000, emissive: 0xff1a10, emissiveIntensity: 3, roughness: 1 });
  M.redGlow.userData.noCast = true;
  M.bone = std({ color: 0x8c826c, roughness: 0.85 });
  M.coal = std({ color: 0x0c0c0d, roughness: 0.75, metalness: 0.2 });
  M.dressForm = std({ color: 0x4a4038, roughness: 0.95 });
  M.blackCloth = std({ color: 0x0d0c0e, roughness: 0.95, side: THREE.DoubleSide });
  M.straw = std({ color: 0x6b5a34, roughness: 1 });
  M.paperWhite = std({ color: 0xc9c2b0, roughness: 0.95, side: THREE.DoubleSide });

  // cutouts and decals
  const cut = (map, o = {}) => std({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, ...o });
  M.webCorner = cut(T.webCorner, { opacity: 0.85 });
  M.webRound = cut(T.webRound, { opacity: 0.85 });
  M.webCorner.userData.noCast = M.webRound.userData.noCast = true;
  M.webCorner.userData.renderOrder = M.webRound.userData.renderOrder = 2;
  M.leaf = std({ map: T.leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  M.footprint = cut(T.footprint, { polygonOffset: true, polygonOffsetFactor: -2 });
  M.footprint.userData.noCast = true;

  // portraits
  for (const [k, t] of Object.entries(T.portraits)) M[`portrait_${k}`] = std({ map: t, roughness: 0.55, envMap: env, envMapIntensity: 0.25 });

  return M;
}
