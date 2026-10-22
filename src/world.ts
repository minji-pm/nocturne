import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { WorldSettings, Mood } from './settings';

type Callbacks = { onRipple?: (strength: number, pan: number) => void; onFps?: (fps: number) => void };
const PAL = {
  moon: { top: '#06171e', horizon: '#406762', fog: '#294b49', water: '#12332e', moon: '#ecf4dc', light: '#94c5b9', fly: '#dbec83', exposure: 1.04 },
  dawn: { top: '#101f36', horizon: '#8a8786', fog: '#4d6370', water: '#233e53', moon: '#ffe7db', light: '#b9c7e0', fly: '#dceaf6', exposure: 1.12 },
  ember: { top: '#1e1520', horizon: '#956456', fog: '#635049', water: '#382c27', moon: '#ffbd80', light: '#e5a87a', fly: '#ffd479', exposure: 1.04 },
};
function random(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const noiseGLSL = `
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float f=0.;float a=.5;for(int i=0;i<5;i++){f+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p;a*=.5;}return f;}
`;
const shore = (z: number) => 12.5 + Math.sin(z * .072) * 3.5 + Math.sin(z * .23) * 1.1;

export class NocturneWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, .1, 500);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private settings: WorldSettings;
  private sky!: THREE.ShaderMaterial;
  private moonMaterial!: THREE.ShaderMaterial;
  private moonHalo!: THREE.Sprite;
  private water!: Water;
  private mistMaterials: THREE.ShaderMaterial[] = [];
  private fireflyMaterial!: THREE.ShaderMaterial;
  private fireflies!: THREE.Points;
  private hemisphere = new THREE.HemisphereLight('#9cbfbb', '#101b16', 1.5);
  private moonLight = new THREE.DirectionalLight('#bce4dd', 2.2);
  private ambient = new THREE.AmbientLight('#598b83', .6);
  private time = 0;
  private effectTime = 0;
  private last = 0;
  private frame = 0;
  private fpsStart = 0;
  private frames = 0;
  private destroyed = false;
  private exporting = false;
  private resizeObserver: ResizeObserver;
  private pointer = new THREE.Vector2();
  private pointerTarget = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private rippleIndex = 0;
  private ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0));
  private attraction = new THREE.Vector3(0, 1.5, -8);
  private attractionStrength = 0;
  private press = false;
  private lastRipple = 0;
  private windUniform = { value: .3 };
  private timeUniform = { value: 0 };
  private effectUniform = { value: 0 };
  private temporary = new THREE.Vector3();
  private aim = new THREE.Vector3(0, 5.0, -32);
  private viewPosition = new THREE.Vector3(0, 4.4, 25);
  private colorTarget = new THREE.Color();
  private resources: THREE.Texture[] = [];
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private visualDirty = true;
  private qualityRatio = 1;
  private slowWindows = 0;
  private colorBlend = 1;

  constructor(private canvas: HTMLCanvasElement, settings: WorldSettings, private callbacks: Callbacks = {}) {
    this.settings = { ...settings };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.setClearColor('#081b1e');
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = PAL[settings.mood].exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.qualityRatio = Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.35 : 1.65);
    this.renderer.setPixelRatio(this.qualityRatio);
    this.scene.fog = new THREE.FogExp2(PAL[settings.mood].fog, .009);
    this.scene.add(this.hemisphere, this.moonLight, this.ambient);
    this.moonLight.position.set(-15, 42, -55);
    this.camera.position.copy(this.viewPosition);
    this.camera.lookAt(this.aim);
    this.makeSky();
    this.makeMountains();
    this.makeWater();
    this.makeForest();
    this.makeGroundCover();
    this.makeFireflies();
    this.makeMist();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 600), .45, .5, .78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: this.effectUniform },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime;varying vec2 vUv;
        void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;vec2 d=(vUv-.5)*vec2(1.,.7);
        float vignette=1.-.56*dot(d,d);c*=vignette;
        float grain=fract(sin(dot(vUv,vec2(12.9898,78.233))+floor(uTime*18.))*43758.5453)-.5;
        c+=grain*.003;gl_FragColor=vec4(c,1.);}`,
    }));
    this.composer.addPass(new OutputPass());
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    this.resize();
    this.applyPalette(1);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerUp);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    document.addEventListener('visibilitychange', this.visibility);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    this.frame = requestAnimationFrame(this.tick);
  }

  private makeSky() {
    this.sky = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color(PAL.moon.top) }, uHorizon: { value: new THREE.Color(PAL.moon.horizon) }, uTime: this.timeUniform },
      vertexShader: 'varying vec3 vPosition;void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 vPosition;uniform vec3 uTop,uHorizon;uniform float uTime;${noiseGLSL}
      void main(){vec3 d=normalize(vPosition);float h=max(d.y,0.); vec3 c=mix(uHorizon,uTop,smoothstep(0.,.68,h));
      vec2 uv=d.xz/(d.y+.35)*1.4;float cloud=fbm(uv+vec2(uTime*.006,0.));
      c+=vec3(.10,.13,.12)*smoothstep(.53,.84,cloud)*smoothstep(.0,.15,h)*.35;
      gl_FragColor=vec4(c,1.); #include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    });
    // Preprocessor directives must start on their own line.
    this.sky.fragmentShader = this.sky.fragmentShader.replace('; #include', ';\n#include');
    const sky = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 20), this.sky);
    sky.renderOrder = -10;
    this.scene.add(sky);
    const rand = random(92);
    const positions: number[] = [], colors: number[] = [];
    for (let i = 0; i < 1800; i++) {
      const theta = rand() * Math.PI * 2, y = .1 + rand() * .84, r = Math.sqrt(1 - y * y);
      positions.push(Math.cos(theta) * r * 220, y * 220, Math.sin(theta) * r * 220);
      const brightness = .25 + rand() * .9;
      colors.push(brightness * .85, brightness * .94, brightness);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: .19, transparent: true, opacity: .7, vertexColors: true, depthWrite: false, fog: false }));
    this.scene.add(stars);
    this.moonMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(PAL.moon.moon) }, uBrightness: { value: 1.5 } },
      vertexShader: 'varying vec2 vUv;varying vec3 vNormal;void main(){vUv=uv;vNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;varying vec3 vNormal;uniform vec3 uColor;uniform float uBrightness;${noiseGLSL}
      void main(){float n=fbm(vUv*27.);float maria=fbm(vUv*8.+4.);float detail=.62+.22*n-.37*smoothstep(.40,.62,maria);
      float craters=fbm(vUv*90.);detail+=craters*.12;
      float light=.6+.4*max(0.,dot(normalize(vNormal),normalize(vec3(-.4,.4,1.))));
      gl_FragColor=vec4(uColor*detail*light*uBrightness,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(5.8, 64, 40), this.moonMaterial);
    moon.position.set(2, 30, -116);
    this.scene.add(moon);
    const haloMap = this.radialTexture();
    this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap, color: '#b9ddd1', transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.moonHalo.position.copy(moon.position);
    this.moonHalo.scale.set(53, 53, 1);
    this.scene.add(this.moonHalo);
  }

  private makeMountains() {
    const rand = random(73);
    for (let layer = 0; layer < 4; layer++) {
      const positions: number[] = [];
      const heights: number[] = [];
      for (let i = 0; i <= 100; i++) {
        const x = i * 3 - 150;
        heights.push(4 + Math.sin(x * .028 + layer * 2) * 3 + Math.sin(x * .092 + layer) * 2 + rand() * 1.9 + layer * 1.8);
      }
      for (let i = 0; i < 100; i++) {
        const x = i * 3 - 150, z = -70 - layer * 27;
        positions.push(x, -2, z, x + 3, heights[i + 1], z, x, heights[i], z, x, -2, z, x + 3, -2, z, x + 3, heights[i + 1], z);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.computeVertexNormals();
      this.scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(.035 + layer * .012, .085 + layer * .01, .078 + layer * .012), side: THREE.DoubleSide })));
    }
  }

  private makeWater() {
    const size = 256, data = new Uint8Array(size * size * 4);
    const periodicNoise = (x:number,y:number,grid:number) => {
      const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
      const hash=(a:number,b:number) => {const n=Math.sin(((a%grid+grid)%grid)*127.1+((b%grid+grid)%grid)*311.7)*43758.5453;return n-Math.floor(n);};
      const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),u),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),u),v);
    };
    const height=(x:number,y:number) => periodicNoise(x/size*12,y/size*12,12)*.6+periodicNoise(x/size*26,y/size*26,26)*.26+periodicNoise(x/size*52,y/size*52,52)*.1;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx=(height(x+1,y)-height(x-1,y))*3.2;
      const ny=(height(x,y+1)-height(x,y-1))*3.2;
      const i = (y * size + x) * 4;
      data[i] = (nx * .5 + .5) * 255; data[i + 1] = (ny * .5 + .5) * 255; data[i + 2] = 250; data[i + 3] = 255;
    }
    const normals = new THREE.DataTexture(data, size, size);
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    normals.magFilter = normals.minFilter = THREE.LinearFilter;
    normals.needsUpdate = true; this.resources.push(normals);
    this.water = new Water(new THREE.PlaneGeometry(450, 450), {
      textureWidth: window.innerWidth < 700 ? 512 : 1024, textureHeight: window.innerWidth < 700 ? 512 : 1024,
      waterNormals: normals, sunDirection: new THREE.Vector3(2, 30, -116).normalize(), sunColor: '#c9e2cc',
      waterColor: PAL.moon.water, distortionScale: 1.1, fog: true,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0;
    const mat = this.water.material as THREE.ShaderMaterial;
    mat.uniforms.size.value = 5;
    mat.uniforms.uRipples = { value: this.ripples };
    mat.uniforms.uEffectTime = this.effectUniform;
    mat.uniforms.uGlow = { value: new THREE.Color('#caeab5') };
    mat.fragmentShader = mat.fragmentShader.replace('uniform float alpha;', 'uniform float alpha;\nuniform vec4 uRipples[8];\nuniform float uEffectTime;\nuniform vec3 uGlow;');
    mat.fragmentShader = mat.fragmentShader.replace('vec3 diffuseLight = vec3(0.0);', `
      float rippleGlow=0.;
      for(int i=0;i<8;i++){
        vec2 delta=worldPosition.xz-uRipples[i].xy;
        float d=length(delta); float age=uEffectTime-uRipples[i].z;
        if(age>=0. && age<8.){
          float radius=age*2.5;float envelope=exp(-pow((d-radius)*1.5,2.))*exp(-age*.5)*uRipples[i].w;
          float wave=cos((d-radius)*12.)*envelope;
          surfaceNormal.xz+=normalize(delta+vec2(.001))*wave*.12;
          rippleGlow+=max(0.,wave)*.32;
        }
      }
      surfaceNormal=normalize(surfaceNormal);
      vec3 diffuseLight = vec3(0.0);`);
    mat.fragmentShader = mat.fragmentShader.replace('vec3 outgoingLight = albedo;', 'vec3 outgoingLight = albedo + uGlow*rippleGlow;');
    // Retain dark water at steep view angles rather than the addon's bright base reflection.
    mat.fragmentShader = mat.fragmentShader.replace('vec3( 0.1 ) + reflectionSample * 0.9', 'vec3( 0.009 ) + reflectionSample * 0.99');
    this.scene.add(this.water);
  }

  private foliageTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const ctx = c.getContext('2d')!; const rand = random(85);
    // A branch of tiny, individual leaf silhouettes, rendered once and instanced.
    for (let k = 0; k < 46; k++) {
      const angle = rand() * Math.PI * 2, reach = .3 + rand() * .65;
      const ex = 256 + Math.cos(angle) * 238 * reach, ey = 256 + Math.sin(angle) * 225 * reach;
      ctx.strokeStyle = '#9fada0'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(256, 270); ctx.quadraticCurveTo(ex, 250, ex, ey); ctx.stroke();
      for (let j = 0; j < 16; j++) {
        const t = j / 16, x = 256 + (ex - 256) * t + (rand() - .5) * 44, y = 265 + (ey - 265) * t + (rand() - .5) * 36;
        const shade = Math.floor(155 + rand() * 95);
        ctx.fillStyle = `rgb(${shade * .82},${shade},${shade * .84})`;
        ctx.beginPath(); ctx.ellipse(x, y, 3 + rand() * 3.2, 7 + rand() * 5, angle + rand(), 0, Math.PI * 2); ctx.fill();
      }
    }
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    this.resources.push(texture); return texture;
  }

  private windMaterial(material: THREE.MeshLambertMaterial, strength = .15) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.timeUniform; shader.uniforms.uWind = this.windUniform;
      shader.vertexShader = 'uniform float uTime;uniform float uWind;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wp=(instanceMatrix*vec4(position,1.)).xyz;
        transformed.x+=sin(uTime*.8+wp.x*.3+wp.z*.2)*${strength.toFixed(3)}*uWind*(.4+uv.y);
        transformed.z+=cos(uTime*.57+wp.z*.4)*${(strength * .5).toFixed(3)}*uWind;
      #endif`);
    };
    material.customProgramCacheKey = () => `nocturne-wind-${strength}`;
    return material;
  }

  private makeForest() {
    const rand = random(453);
    const dummy = new THREE.Object3D();
    const trunks: { a: THREE.Vector3; b: THREE.Vector3; r: number }[] = [];
    const leaves: { p: THREE.Vector3; scale: THREE.Vector3; rot: THREE.Euler; tint: THREE.Color }[] = [];
    const addBranch = (a: THREE.Vector3, b: THREE.Vector3, r: number) => trunks.push({ a, b, r });
    const tree = (x: number, z: number, h: number, broad = false) => {
      const lean = (rand() - .5) * 2.2;
      const base = new THREE.Vector3(x, .1, z), top = new THREE.Vector3(x + lean, h * .88, z + .4);
      addBranch(base, top, h * .033);
      // Cypress roots fan into the bank.
      for (let i = 0; i < 5; i++) {
        const a = rand() * Math.PI * 2;
        addBranch(new THREE.Vector3(x, h * .13, z), new THREE.Vector3(x + Math.cos(a) * h * .095, -.1, z + Math.sin(a) * h * .095), h * .025);
      }
      const tiers = broad ? 10 : 8;
      for (let i = 0; i < tiers; i++) {
        const t = .25 + i / tiers * .65, y = h * t;
        const reach = (broad ? 4.4 : 3.6) * (1 - t) * h / 9;
        for (let j = 0; j < 3; j++) {
          const angle = j / 3 * Math.PI * 2 + i * 1.73 + rand() * .8;
          const a = new THREE.Vector3(x + lean * t, y, z + .4 * t);
          const b = new THREE.Vector3(a.x + Math.cos(angle) * reach, y + .2 + rand() * .6, a.z + Math.sin(angle) * reach);
          addBranch(a, b, h * .011 * (1 - t));
          const s = (broad ? 1.6 : 1.3) + reach * .6;
          leaves.push({ p: b, scale: new THREE.Vector3(s * 1.3, s * .78, 1), rot: new THREE.Euler(-.15 + rand() * .4, angle + rand(), (rand() - .5) * .6), tint: new THREE.Color().setHSL(.36 + rand() * .07, .18, .26 + rand() * .16) });
          leaves.push({ p: b.clone().add(new THREE.Vector3(0, .3, 0)), scale: new THREE.Vector3(s * 1.1, s * .85, 1), rot: new THREE.Euler(-.2, angle + Math.PI / 2, .1), tint: new THREE.Color().setHSL(.39, .18, .3 + rand() * .14) });
        }
      }
    };
    for (let i = 0; i < 128; i++) {
      const z = -105 + rand() * 132;
      const side = rand() > .5 ? 1 : -1;
      const x = side * (shore(z) + 1 + rand() * 24);
      tree(x, z, 7 + rand() * 15);
    }
    // Deliberate foreground framing, instead of a uniformly random forest.
    tree(-13.5, 10, 20, true); tree(14.6, 1, 23, true); tree(-20, -15, 24, true);
    // A solitary island tree gives the eye a destination.
    tree(-6, -30, 11.5, true);
    const trunkGeo = new THREE.CylinderGeometry(.35, 1, 1, 6, 1);
    const barkCanvas=document.createElement('canvas');barkCanvas.width=128;barkCanvas.height=256;
    const bark=barkCanvas.getContext('2d')!;bark.fillStyle='#787c70';bark.fillRect(0,0,128,256);
    for(let i=0;i<130;i++){const x=rand()*128;const v=35+Math.floor(rand()*80);bark.strokeStyle=`rgba(${v},${v+5},${v},.6)`;bark.lineWidth=.5+rand()*2.5;bark.beginPath();bark.moveTo(x,0);for(let y=0;y<260;y+=12)bark.lineTo(x+Math.sin(y*.08+i)*1.6,y);bark.stroke();}
    const barkMap=new THREE.CanvasTexture(barkCanvas);barkMap.colorSpace=THREE.SRGBColorSpace;barkMap.wrapS=barkMap.wrapT=THREE.RepeatWrapping;this.resources.push(barkMap);
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#778f80', map:barkMap });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trunks.length);
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    trunks.forEach(({ a, b, r }, i) => {
      dummy.position.copy(a).add(b).multiplyScalar(.5); dir.copy(b).sub(a);
      dummy.quaternion.setFromUnitVectors(up, dir.clone().normalize()); dummy.scale.set(r, dir.length(), r); dummy.updateMatrix(); trunkMesh.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(trunkMesh);
    const leafMat = this.windMaterial(new THREE.MeshLambertMaterial({ map: this.foliageTexture(), color: '#b7c2b2', side: THREE.DoubleSide, alphaTest: .32, depthWrite: true }), .22);
    const leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), leafMat, leaves.length);
    leaves.forEach(({ p, scale, rot, tint }, i) => { dummy.position.copy(p); dummy.rotation.copy(rot); dummy.scale.copy(scale); dummy.updateMatrix(); leafMesh.setMatrixAt(i, dummy.matrix); leafMesh.setColorAt(i, tint); });
    this.scene.add(leafMesh);
    // Uneven banks fall into the water; no visible straight plane boundaries.
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(60, 180, 24, 90); g.rotateX(-Math.PI / 2);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i) - 48, t = (p.getX(i) + 30) / 60;
        p.setXYZ(i, side * (shore(z) + t * 60), -.22 + Math.min(t * 16, 1.3) + Math.sin(z * .5) * .13, z);
      }
      g.computeVertexNormals(); this.scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#233d2c', side: THREE.DoubleSide })));
    }
    const island = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshLambertMaterial({ color: '#2b3c2a' }));
    island.position.set(-6, -.5, -30); island.scale.set(4.2, 1.1, 3); this.scene.add(island);
  }

  private makeGroundCover() {
    const rand = random(1823), dummy = new THREE.Object3D();
    const grassGeo = new THREE.BufferGeometry();
    const ps = [-.045,0,0, .045,0,0, .09,.6,.03, -.045,0,0,.09,.6,.03,.18,1,.1];
    grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3));
    grassGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,1,.6,0,0,1,.6,.5,1], 2)); grassGeo.computeVertexNormals();
    const grassMat = this.windMaterial(new THREE.MeshLambertMaterial({ color: '#7d9871', side: THREE.DoubleSide }), .18);
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, 7800);
    for (let i = 0; i < grass.count; i++) {
      const z = rand() * 108 - 85, s = rand() > .5 ? 1 : -1;
      const x = s * (shore(z) - .55 + Math.pow(rand(), 2) * 6);
      dummy.position.set(x, -.08 + rand() * .25, z); dummy.rotation.set(0, rand() * Math.PI * 2, (rand() - .5) * .3);
      dummy.scale.setScalar(.5 + rand() * 1.45); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
      grass.setColorAt(i, new THREE.Color().setHSL(.28 + rand() * .10, .18 + rand() * .15, .22 + rand() * .3));
    }
    this.scene.add(grass);
    const stoneGeo = new THREE.IcosahedronGeometry(1, 1), stonePositions = stoneGeo.getAttribute('position');
    for (let i = 0; i < stonePositions.count; i++) { const x=stonePositions.getX(i),y=stonePositions.getY(i),z=stonePositions.getZ(i); const s = .92 + Math.sin(x*13+y*7+z*17)*.1; stonePositions.setXYZ(i, x*s, y*s, z*s); }
    stoneGeo.computeVertexNormals();
    const rocks = new THREE.InstancedMesh(stoneGeo, new THREE.MeshLambertMaterial({ color: '#4b655c' }), 260);
    for (let i = 0; i < rocks.count; i++) {
      const z = rand() * 105 - 75, x = (rand() > .5 ? 1 : -1) * (shore(z) + (rand() - .3) * 5);
      dummy.position.set(x, -.2, z); dummy.rotation.set(rand(), rand() * 6, rand()); const s = .25 + rand() * 1.8;
      dummy.scale.set(s * 1.4, s * .7, s); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(rocks);
    const leaf = new THREE.Shape(); leaf.moveTo(0, 0); leaf.absarc(0, 0, 1, .12, Math.PI * 2 - .12, false); leaf.lineTo(0, 0);
    const lilies = new THREE.InstancedMesh(new THREE.ShapeGeometry(leaf, 24), new THREE.MeshLambertMaterial({ color: '#6c8766', side: THREE.DoubleSide }), 150);
    for (let i = 0; i < lilies.count; i++) {
      const z = rand() * 52 - 24;
      const x = (rand() > .5 ? 1 : -1) * (shore(z) - 2 - rand() * 4);
      dummy.position.set(x, .025 + rand() * .018, z); dummy.rotation.set(-Math.PI / 2, 0, rand() * 6); const s = .13 + rand() * .38;
      dummy.scale.set(s, s * .82, s); dummy.updateMatrix(); lilies.setMatrixAt(i, dummy.matrix);
      lilies.setColorAt(i, new THREE.Color().setHSL(.29 + rand() * .08, .22, .2 + rand() * .22));
    }
    this.scene.add(lilies);
    // A few delicate ivory blossoms on the near shore.
    const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 5), new THREE.MeshLambertMaterial({ color: '#cfddbe', emissive: '#183a2b', emissiveIntensity: .2 }), 96);
    for (let i = 0; i < 12; i++) {
      const z = rand() * 31 - 10, x = (i % 2 ? -1 : 1) * (shore(z) - 2.3 - rand() * 2.5);
      for (let j = 0; j < 8; j++) {
        const a = j / 8 * Math.PI * 2; dummy.position.set(x + Math.cos(a) * .09, .1, z + Math.sin(a) * .09);
        dummy.rotation.set(0, -a, .25); dummy.scale.set(.2, .042, .07); dummy.updateMatrix(); petals.setMatrixAt(i * 8 + j, dummy.matrix);
      }
    }
    this.scene.add(petals);
  }

  private radialTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d')!, gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.12, 'rgba(255,255,255,.7)'); gradient.addColorStop(.4, 'rgba(255,255,255,.12)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    const map = new THREE.CanvasTexture(c); this.resources.push(map); return map;
  }

  private makeFireflies() {
    const rand = random(471), count = 700, pos = new Float32Array(count * 3), phases = new Float32Array(count), sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) { pos[i * 3] = (rand() - .5) * 34; pos[i * 3 + 1] = .3 + Math.pow(rand(), 2) * 6; pos[i * 3 + 2] = 19 - rand() * 84; phases[i] = rand() * Math.PI * 2; sizes[i] = .5 + rand() * 1.7; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.fireflyMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.timeUniform, uAttraction: { value: this.attraction }, uStrength: { value: 0 }, uColor: { value: new THREE.Color(PAL.moon.fly) }, uIntensity: { value: .65 }, uRatio: { value: this.qualityRatio } },
      vertexShader: `attribute float aPhase,aSize;uniform float uTime,uStrength,uRatio;uniform vec3 uAttraction;varying float vPulse,vDistance;
      void main(){vec3 p=position;float t=uTime*.35;
      p.x+=sin(t+aPhase)*1.1+cos(t*.63+aPhase*3.)*.45;p.y+=sin(t*1.3+aPhase)*.45;p.z+=cos(t*.8+aPhase)*1.2;
      float a=uStrength*exp(-length(position.xz-uAttraction.xz)*.035);
      vec3 target=uAttraction+vec3(cos(aPhase*3.+t)*2.,sin(aPhase*2.+t)*.9+1.2,sin(aPhase*3.+t)*2.);
      p=mix(p,target,a*.65);
      vec4 mv=modelViewMatrix*vec4(p,1.);vDistance=-mv.z;
      gl_Position=projectionMatrix*mv;gl_PointSize=min(25.,aSize*110.*uRatio/max(2.,-mv.z));
      vPulse=.32+.68*pow(.5+.5*sin(uTime*1.45+aPhase),2.);}`,
      fragmentShader: `uniform vec3 uColor;uniform float uIntensity;varying float vPulse,vDistance;
      void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;
      float glow=exp(-d*d*7.);float core=exp(-d*d*65.);
      float fade=exp(-vDistance*.008);gl_FragColor=vec4(uColor*(1.4+core*1.8),(glow*.65+core*.7)*vPulse*uIntensity*fade);}`,
    });
    this.fireflies = new THREE.Points(g, this.fireflyMaterial); this.fireflies.frustumCulled = false; this.scene.add(this.fireflies);
  }

  private makeMist() {
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uTime: this.timeUniform, uOpacity: { value: .15 }, uColor: { value: new THREE.Color(PAL.moon.fog) }, uSeed: { value: i * 13.4 } },
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec2 vUv;uniform float uTime,uOpacity,uSeed;uniform vec3 uColor;${noiseGLSL}
        void main(){vec2 p=vUv*vec2(8.,3.);float n=fbm(p+vec2(uTime*.019+uSeed,uTime*.009));
        float edge=sin(vUv.x*3.14159)*pow(sin(vUv.y*3.14159),2.);
        float a=smoothstep(.25,.72,n)*edge*uOpacity;gl_FragColor=vec4(uColor*1.25,a);}`,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(140, 9), mat);
      mesh.position.set(0, 1.8 + i * .35, -65 + i * 18); mesh.renderOrder = 2;
      this.scene.add(mesh); this.mistMaterials.push(mat);
    }
  }

  private applyPalette(alpha: number) {
    const p = PAL[this.settings.mood];
    const lerp = (c: THREE.Color, value: string) => c.lerp(this.colorTarget.set(value), alpha);
    lerp(this.sky.uniforms.uTop.value, p.top); lerp(this.sky.uniforms.uHorizon.value, p.horizon);
    lerp((this.scene.fog as THREE.FogExp2).color, p.fog);
    (this.scene.fog as THREE.FogExp2).density = .004 + this.settings.fog * .000155;
    const w = this.water.material as THREE.ShaderMaterial;
    lerp(w.uniforms.waterColor.value, p.water); lerp(w.uniforms.sunColor.value, p.moon);
    lerp(w.uniforms.uGlow.value, p.fly);
    lerp(this.moonMaterial.uniforms.uColor.value, p.moon);
    this.moonMaterial.uniforms.uBrightness.value = .8 + this.settings.moonlight * .009;
    const halo = this.moonHalo.material as THREE.SpriteMaterial;
    lerp(halo.color, p.moon); halo.opacity = .11 + this.settings.moonlight * .0015;
    lerp(this.fireflyMaterial.uniforms.uColor.value, p.fly);
    this.fireflyMaterial.uniforms.uIntensity.value = this.settings.fireflies * .018;
    this.fireflies.visible = this.settings.fireflies > 0;
    lerp(this.hemisphere.color, p.light); lerp(this.moonLight.color, p.light);
    this.moonLight.intensity = .7 + this.settings.moonlight * .025;
    this.hemisphere.intensity = this.settings.mood === 'dawn' ? 2 : 1.45;
    for (const mat of this.mistMaterials) { lerp(mat.uniforms.uColor.value, p.fog); mat.uniforms.uOpacity.value = .03 + this.settings.fog * .0038; }
    this.renderer.toneMappingExposure += (p.exposure - this.renderer.toneMappingExposure) * alpha;
    this.windUniform.value = this.settings.wind * .015;
    w.uniforms.distortionScale.value = .45 + this.settings.wind * .027;
  }

  update(partial: Partial<WorldSettings>) {
    Object.assign(this.settings, partial);
    this.visualDirty = true;
    this.colorBlend = 0;
    if (this.settings.paused || this.reducedMotion) this.applyPalette(1);
  }

  private resize = () => {
    if (this.exporting || this.destroyed) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.fov = w < 700 ? 58 : 48;
    this.camera.updateProjectionMatrix(); this.visualDirty = true;
  };

  private tick = (now: number) => {
    if (this.destroyed) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(.05, Math.max(0, (now - (this.last || now)) / 1000)); this.last = now;
    if (document.hidden || this.exporting) return;
    const animating = !this.settings.paused;
    if (animating) { this.time += dt; this.effectTime += dt; }
    if (animating || this.visualDirty) {
      this.timeUniform.value = this.time; this.effectUniform.value = this.effectTime;
      (this.water.material as THREE.ShaderMaterial).uniforms.time.value = this.time * (.16 + this.settings.wind * .003);
      this.attractionStrength *= Math.exp(-dt * .2);
      this.fireflyMaterial.uniforms.uStrength.value = this.attractionStrength;
      this.pointer.lerp(this.pointerTarget, 1 - Math.exp(-dt * 2));
      const desired = this.temporary;
      if (this.settings.camera === 'water') { desired.set(.8, 1.4, 16); }
      else if (this.settings.camera === 'orbit') {
        desired.set(Math.sin(this.time * .045) * 6, 4.2 + Math.sin(this.time * .027) * .7, 21 + Math.cos(this.time * .045) * 4);
      } else { desired.set(0, 4.4, 25); }
      if (!this.reducedMotion && animating && this.settings.camera !== 'orbit') { desired.x += this.pointer.x * .8; desired.y += this.pointer.y * .25; }
      this.viewPosition.lerp(desired, this.settings.paused ? 1 : 1 - Math.exp(-dt * 1.2));
      this.camera.position.copy(this.viewPosition);
      this.camera.lookAt(0, this.settings.camera === 'water' ? 3.2 : 5.0, -32);
      this.colorBlend += dt;
      this.applyPalette(this.settings.paused ? 1 : 1 - Math.exp(-dt * 2.4));
      this.composer.render(); this.visualDirty = false;
    }
    this.frames++;
    if (now - this.fpsStart > 1500) {
      const fps = Math.round(this.frames * 1000 / (now - this.fpsStart));
      if (this.fpsStart > 0) {
        this.callbacks.onFps?.(fps);
        if (animating && fps < 34) this.slowWindows++; else this.slowWindows = 0;
        if (this.slowWindows >= 3 && this.qualityRatio > .85) {
          this.qualityRatio = Math.max(.85, this.qualityRatio - .2);
          this.renderer.setPixelRatio(this.qualityRatio); this.composer.setPixelRatio(this.qualityRatio);
          this.fireflyMaterial.uniforms.uRatio.value = this.qualityRatio;
          this.resize(); this.slowWindows = 0;
        }
      }
      this.frames = 0; this.fpsStart = now;
    }
  };

  private pointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerTarget.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
    if (this.press && performance.now() - this.lastRipple > 160) this.castRipple(event, .6);
  };
  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.settings.paused) return;
    this.press = true; this.canvas.setPointerCapture(event.pointerId); this.castRipple(event, 1);
  };
  private pointerUp = (event: PointerEvent) => { this.press = false; if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); };
  private pointerLeave = () => { this.pointerTarget.set(0, 0); };
  private castRipple(event: PointerEvent, strength: number) {
    const r = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector2((event.clientX - r.left) / r.width * 2 - 1, -((event.clientY - r.top) / r.height * 2 - 1));
    this.ray.setFromCamera(p, this.camera); const point = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (!point || point.z < -110 || point.z > 40 || Math.abs(point.x) > shore(point.z)) return;
    this.emitRipple(point, strength); this.callbacks.onRipple?.(strength, Math.max(-1, Math.min(1, p.x)));
    this.lastRipple = performance.now();
  }
  private emitRipple(point: THREE.Vector3, strength: number) {
    this.ripples[this.rippleIndex].set(point.x, point.z, this.effectTime, strength);
    this.rippleIndex = (this.rippleIndex + 1) % this.ripples.length;
    this.attraction.set(point.x, .7, point.z); this.attractionStrength = 1; this.visualDirty = true;
  }
  summon() {
    if (this.settings.paused) return;
    this.emitRipple(new THREE.Vector3(0, 0, -3), 1.3); this.callbacks.onRipple?.(1, 0);
  }

  async snapshot(width = 3840, height = 2160): Promise<Blob> {
    if (this.destroyed) throw new Error('장면이 종료되었습니다.');
    if (this.exporting) throw new Error('이미 장면을 저장하고 있습니다.');
    this.exporting = true;
    const size = this.renderer.getSize(new THREE.Vector2()), ratio = this.renderer.getPixelRatio(), aspect = this.camera.aspect;
    try {
      this.renderer.setPixelRatio(1); this.renderer.setSize(width, height, false);
      this.composer.setPixelRatio(1); this.composer.setSize(width, height);
      this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
      this.fireflyMaterial.uniforms.uRatio.value = width / Math.max(1, size.x) * ratio;
      this.composer.render();
      // toBlob snapshots synchronously when called; renderer is restored in finally.
      return await new Promise<Blob>((resolve, reject) => this.canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지를 저장할 수 없습니다.')), 'image/png'));
    } finally {
      this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(ratio); this.renderer.setSize(size.x, size.y, false);
      this.composer.setPixelRatio(ratio); this.composer.setSize(size.x, size.y);
      this.fireflyMaterial.uniforms.uRatio.value = ratio;
      this.exporting = false; this.visualDirty = true; this.composer.render();
    }
  }

  private visibility = () => { this.last = 0; this.fpsStart = 0; this.frames = 0; this.visualDirty = true; };
  private contextLost = (event: Event) => { event.preventDefault(); this.canvas.dispatchEvent(new CustomEvent('nocturne-error', { detail: '그래픽 연결이 끊겼습니다. 새로고침해서 다시 열어주세요.' })); };
  destroy() {
    if (this.destroyed) return; this.destroyed = true; cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.pointerMove); this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointerup', this.pointerUp); this.canvas.removeEventListener('pointercancel', this.pointerUp);
    this.canvas.removeEventListener('pointerleave', this.pointerLeave); this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    document.removeEventListener('visibilitychange', this.visibility);
    const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
    this.scene.traverse(obj => { const m = obj as THREE.Mesh; if (m.geometry) geometries.add(m.geometry); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => materials.add(x)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.resources.forEach(t => t.dispose());
    this.composer.passes.forEach(p => p.dispose()); this.composer.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
