import * as THREE from 'three';

export type CameraMode = 'follow' | 'overview' | 'intro';

/** Critically damped spring (Game Programming Gems 4 "SmoothDamp"), per scalar. */
export class Damped {
  value: number;
  velocity = 0;
  constructor(v: number, public smoothTime: number) {
    this.value = v;
  }
  step(target: number, dt: number): number {
    const omega = 2 / Math.max(1e-4, this.smoothTime);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.value - target;
    const temp = (this.velocity + omega * change) * dt;
    this.velocity = (this.velocity - omega * temp) * exp;
    this.value = target + (change + temp) * exp;
    return this.value;
  }
  snap(v: number): void {
    this.value = v;
    this.velocity = 0;
  }
}

/**
 * Three-quarter isometric camera rig: narrow FOV perspective, fixed yaw (45° steps from the level hints plus
 * a small visual bias so walls show depth), critically damped follow with movement lead, mouse-wheel zoom,
 * a puzzle overview mode that frames the whole chamber, and a level-intro fly-in.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'follow';
  /** Yaw in 45° steps, clockwise seen from above (input contract: InputSampler.yawStep; step 1 = screen-up is north-east). */
  yawStep = 0;
  /** Extra visual yaw (radians) that does not affect controls. */
  yawBias = THREE.MathUtils.degToRad(14);
  pitch = THREE.MathUtils.degToRad(43);
  baseDistance = 26;
  zoom = 1;
  /**
   * Fraction of the viewport height the framing is lifted by (screen-space, via a projection view offset) so the
   * subject sits centred in the area left above the docked timeline. The app sets it from the timeline state.
   */
  viewLift = 0;
  /** Horizontal framing shift as a fraction of the viewport width (positive moves the subject right). */
  viewShift = 0;
  /** Framing distance multiplier set by the app (e.g. a wider main-menu shot); multiplies the user's wheel zoom. */
  framingZoom = 1;

  private readonly tx = new Damped(0, 0.32);
  private readonly ty = new Damped(0, 0.4);
  private readonly tz = new Damped(0, 0.32);
  private readonly dist = new Damped(26, 0.45);
  private readonly yawD = new Damped(0, 0.5);
  private readonly pitchD = new Damped(0, 0.5);
  private readonly liftD = new Damped(0, 0.35);
  private readonly shiftD = new Damped(0, 0.35);
  private readonly levelCentre = new THREE.Vector3();
  private levelRadius = 10;
  private introT = 1;
  private introDuration = 3.4;
  private readonly lead = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private onWheel: ((e: WheelEvent) => void) | null = null;
  private wheelEl: HTMLElement | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.3, 2500);
  }

  attachWheel(el: HTMLElement): void {
    this.detachWheel();
    this.onWheel = (e: WheelEvent) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(e.deltaY * 0.0012), 0.55, 1.9);
    };
    el.addEventListener('wheel', this.onWheel, { passive: true });
    this.wheelEl = el;
  }

  detachWheel(): void {
    if (this.wheelEl && this.onWheel) this.wheelEl.removeEventListener('wheel', this.onWheel);
    this.wheelEl = null;
    this.onWheel = null;
  }

  get yaw(): number {
    return this.yawStep * (Math.PI / 4) + this.yawBias;
  }

  setLevel(centre: THREE.Vector3, radius: number, opts: { yawStep?: number; zoom?: number }): void {
    this.levelCentre.copy(centre);
    this.levelRadius = radius;
    this.yawStep = opts.yawStep ?? 0;
    // Close enough that the 1.8 m characters read as silhouettes (concept framing); wheel zoom widens it.
    this.baseDistance = THREE.MathUtils.clamp(radius * 1.0, 15, 25) * (opts.zoom ?? 1);
    this.tx.snap(centre.x);
    this.ty.snap(centre.y);
    this.tz.snap(centre.z);
    this.dist.snap(this.baseDistance);
    this.yawD.snap(this.yaw);
    this.pitchD.snap(this.pitch);
  }

  /** Overview distance that fits the whole chamber in view. */
  private overviewDistance(): number {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    // The chamber is a flat footprint seen from above at `pitch`: its screen height is foreshortened by sin(pitch)
    // (plus wall height). The lifted framing leaves (1 - 2·lift) of the height free above the docked timeline.
    const free = Math.max(0.5, 1 - 2 * this.viewLift);
    const pitch = this.pitch + THREE.MathUtils.degToRad(8);
    const vertical = (this.levelRadius * Math.sin(pitch) + 2) / Math.sin((vfov * free) / 2);
    const horizontal = this.levelRadius / Math.sin(hfov / 2);
    return Math.max(vertical, horizontal) * 1.06;
  }

  playIntro(): void {
    this.introT = 0;
    this.mode = 'intro';
  }

  update(dt: number, focus: THREE.Vector3 | null, focusVelocity: THREE.Vector3 | null): void {
    let target = this.tmp;
    let distance: number;
    let yaw = this.yaw;
    let pitch = this.pitch;
    if (this.mode === 'intro') {
      this.introT = Math.min(1, this.introT + dt / this.introDuration);
      const k = this.introT;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const end = focus ? this.blendFocus(focus) : this.levelCentre;
      target = this.tmp.copy(this.levelCentre).lerp(end, e);
      target.y += (1 - e) * 6;
      distance = THREE.MathUtils.lerp(this.overviewDistance() * 1.9, this.baseDistance * this.zoom, e);
      yaw = this.yaw + (1 - e) * 1.1;
      pitch = this.pitch + (1 - e) * 0.22;
      // intro drives the springs directly so the hand-off to follow is seamless
      this.tx.snap(target.x);
      this.ty.snap(target.y);
      this.tz.snap(target.z);
      this.dist.snap(distance);
      this.yawD.snap(yaw);
      this.pitchD.snap(pitch);
      if (this.introT >= 1) this.mode = 'follow';
    } else if (this.mode === 'overview') {
      target.copy(this.levelCentre);
      distance = this.overviewDistance() * this.zoom;
      pitch = this.pitch + THREE.MathUtils.degToRad(8);
    } else {
      if (focus) {
        target.copy(this.blendFocus(focus));
        if (focusVelocity) {
          this.lead.lerp(this.tmp.set(focusVelocity.x, 0, focusVelocity.z).multiplyScalar(0.28), 1 - Math.exp(-3 * dt));
          target = this.tmp.copy(this.blendFocus(focus)).add(this.lead);
        }
      } else target.copy(this.levelCentre);
      distance = this.baseDistance * this.zoom * this.framingZoom;
    }
    const x = this.tx.step(target.x, dt);
    const y = this.ty.step(target.y, dt);
    const z = this.tz.step(target.z, dt);
    const d = this.dist.step(distance, dt);
    const yw = this.yawD.step(yaw, dt);
    const pt = this.pitchD.step(pitch, dt);
    const cp = Math.cos(pt);
    this.camera.position.set(x - Math.sin(yw) * cp * d, y + Math.sin(pt) * d, z + Math.cos(yw) * cp * d);
    this.camera.lookAt(x, y, z);
    const lift = this.liftD.step(this.viewLift, dt);
    const shift = this.shiftD.step(this.viewShift, dt);
    if (Math.abs(lift) > 1e-4 || Math.abs(shift) > 1e-4) {
      const fh = 1000;
      const fw = fh * this.camera.aspect;
      this.camera.setViewOffset(fw, fh, -shift * fw, lift * fh, fw, fh);
    } else if (this.camera.view?.enabled) this.camera.clearViewOffset();
    // keep near/far tight-ish for depth precision
    this.camera.near = Math.max(0.3, d * 0.04);
    this.camera.updateProjectionMatrix();
  }

  /** Follow target: mostly the player, pulled slightly toward the chamber centre for puzzle context. */
  private blendFocus(focus: THREE.Vector3): THREE.Vector3 {
    const out = new THREE.Vector3().copy(focus).lerp(this.levelCentre, 0.14);
    out.y = focus.y * 0.75 + this.levelCentre.y * 0.25 + 0.8;
    return out;
  }

  dispose(): void {
    this.detachWheel();
  }
}
