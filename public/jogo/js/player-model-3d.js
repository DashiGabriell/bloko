import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const MODEL_PATH = '/models/base/base.fbx';
const ANIM_PATH = '/models/base/animations/';
const ANIM_NAMES = ['idle', 'walk', 'run'];
const SCALE = 0.01;

export class PlayerModel3D {
  constructor() {
    this.group = new THREE.Group();
    this.mixer = null;
    this.actions = {};
    this.currentState = 'idle';
    this.ready = false;
    this._pendingState = null;

    this._load();
  }

  async _load() {
    const loader = new FBXLoader();

    try {
      const model = await loader.loadAsync(MODEL_PATH);
      model.scale.set(SCALE, SCALE, SCALE);

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false;
        }
      });

      this.group.add(model);
      this.mixer = new THREE.AnimationMixer(model);

      const animResults = await Promise.allSettled(
        ANIM_NAMES.map(name => loader.loadAsync(`${ANIM_PATH}${name}.fbx`))
      );

      animResults.forEach((result, i) => {
        const name = ANIM_NAMES[i];
        if (result.status === 'fulfilled' && result.value.animations?.length > 0) {
          const clip = result.value.animations[0];
          const action = this.mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat);
          action.clampWhenFinished = false;
          this.actions[name] = action;
        } else {
          console.warn(`Animação ${name} falhou, nome alternativo...`);
          // Try alternative names from the loaded model
          if (result.status === 'fulfilled' && result.value.animations) {
            for (const altClip of result.value.animations) {
              const altName = altClip.name.toLowerCase();
              if (altName.includes(name) || name.includes(altName)) {
                const action = this.mixer.clipAction(altClip);
                action.setLoop(THREE.LoopRepeat);
                this.actions[name] = action;
                break;
              }
            }
          }
        }
      });

      // Ensure all states have a fallback to idle
      if (!this.actions['idle']) {
        const firstAction = Object.values(this.actions)[0];
        if (firstAction) this.actions['idle'] = firstAction;
      }
      for (const name of ANIM_NAMES) {
        if (!this.actions[name]) this.actions[name] = this.actions['idle'];
      }

      if (this.actions['idle']) {
        this.actions['idle'].play();
      }

      this.ready = true;
      console.log('Modelo 3D carregado com animações!');

      if (this._pendingState && this.actions[this._pendingState]) {
        this.changeState(this._pendingState);
        this._pendingState = null;
      }
    } catch (err) {
      console.error('Erro ao carregar modelo 3D:', err);
    }
  }

  changeState(newState) {
    if (!this.ready) {
      this._pendingState = newState;
      return;
    }
    if (newState === this.currentState) return;
    if (!this.actions[newState]) return;

    const prev = this.actions[this.currentState];
    const next = this.actions[newState];

    if (prev && prev !== next) {
      prev.fadeOut(0.2);
    }
    if (prev !== next) {
      next.reset();
      next.fadeIn(0.2);
      next.play();
    }

    this.currentState = newState;
  }

  updateAnimation(dt) {
    if (this.mixer) {
      this.mixer.update(dt);
    }
  }

  get position() {
    return this.group.position;
  }

  set position(v) {
    this.group.position.copy(v);
  }

  get rotation() {
    return this.group.rotation;
  }

  set rotation(v) {
    this.group.rotation.copy(v);
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    while (this.group.children.length) {
      this.group.remove(this.group.children[0]);
    }
  }
}
