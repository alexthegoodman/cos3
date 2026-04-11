/**
 * A critically-damped spring that smoothly chases a target value.
 * Call `update(target, dt)` each frame; read `.value`.
 */
export class Spring {
  value:    number;
  private velocity = 0;

  constructor(
    initial    = 0,
    readonly stiffness = 300,
    readonly damping   =  28,
  ) {
    this.value = initial;
  }

  static snappy(initial = 0) { return new Spring(initial, 480, 36); }
  static gentle(initial = 0) { return new Spring(initial, 180, 22); }

  /**
   * Advance by `dt` seconds toward `target`.
   * Returns `true` while still animating.
   */
  update(target: number, dt: number): boolean {
    dt = Math.min(dt, 0.05); // guard against tab-restore spikes
    const error = target - this.value;
    const force = error * this.stiffness - this.velocity * this.damping;
    this.velocity += force * dt;
    this.value    += this.velocity * dt;

    if (Math.abs(error) < 0.001 && Math.abs(this.velocity) < 0.001) {
      this.value    = target;
      this.velocity = 0;
      return false;
    }
    return true;
  }

  /** Teleport immediately with no animation. */
  snap(target: number) {
    this.value    = target;
    this.velocity = 0;
  }
}

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3),
  inOut:    (t: number) => {
    t = Math.max(0, Math.min(1, t));
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  },
};