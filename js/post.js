// ZRace - the frame after the scene is drawn: bloom, then tone mapping.
//
// Brake lights, headlamps, the start lights, the sun and the glints it leaves on wet-look
// paint all run brighter than white, and without this the screen simply clips them to a
// flat colour. The scene is drawn into a floating-point target, the bloom pass picks out
// whatever is over the threshold and blurs it back on top, and the output pass does the
// tone mapping and sRGB encode the renderer would otherwise have done itself - so every
// material, the sky included, goes through one curve whichever way the frame is drawn.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Bloom picks on the brightest channel rather than on luminance. Luminance barely
// counts red, so a brake light at four times white scored lower than a white roof in the
// sun, and there was no threshold that lit one without the other.
//
// And what it picks is capped. A clearcoat is a near-mirror, so a spotlight caught in one is
// a highlight a few pixels across at over a thousand times white, and blurred out that
// much light became a glare the size of the car. Capped, it still glows as a highlight
// should; the pixels themselves keep their full value and are only tone mapped.
const BRIGHTEST = 'texel.rgb = min( texel.rgb, vec3( 3.0 ) ); float v = max( max( texel.r, texel.g ), texel.b );';

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    // the canvas's own antialiasing does not reach an offscreen target, so ask for it here
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(null, null);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.4, 1.6);
    this.bloom.highPassUniforms.smoothWidth.value = 1.2;
    const hp = this.bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace('float v = luminance( texel.xyz );', BRIGHTEST);
    hp.needsUpdate = true;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(w, h) {
    // A hidden or minimised page can report a size of nothing, and a target of zero size
    // is an incomplete framebuffer - every draw into it fails until the next resize.
    if (!w || !h) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(scene, camera) {
    if (!this.enabled) { this.renderer.render(scene, camera); return; }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }
}
