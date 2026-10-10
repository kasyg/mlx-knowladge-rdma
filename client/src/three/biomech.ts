/**
 * Hill-type muscle model in normalised units (after Zajac 1989 / Thelen 2003),
 * used to drive what the student sees: how long the fibres are, how active the
 * muscle is, how much force it develops and how far its tendon is stretched.
 *
 *   fibre length  l = fibre length / optimal fibre length (1 = rest)
 *   velocity      v = dl/dt / vmax (negative = shortening)
 *   force         F = a · fL(l) · fV(v) + fP(l)   (1 = maximal isometric force)
 *   tendon strain ε = εT0 · F^0.8                  (toe region at low loads)
 */

export const HILL = {
  /** width of the active force–length curve */
  width: 0.45,
  /** maximal shortening velocity (optimal fibre lengths per second) */
  vmax: 10,
  /** curvature of the force–velocity hyperbola */
  af: 0.25,
  /** maximal eccentric force (× isometric) */
  fEcc: 1.5,
  /** passive stiffness and strain at which the passive force reaches F0 */
  kPE: 4,
  epsM0: 0.6,
  /** tendon strain at maximal isometric force */
  epsT0: 0.04,
  /** activation and deactivation time constants (s) */
  tauAct: 0.03,
  tauDeact: 0.08,
};

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** active force–length relation (Gaussian, peak 1 at l = 1) */
export function forceLength(l: number): number {
  return Math.exp(-(((l - 1) / HILL.width) ** 2));
}

/** passive (parallel elastic) force, zero below the optimal length */
export function passiveForce(l: number): number {
  if (l <= 1) return 0;
  return (Math.exp((HILL.kPE * (l - 1)) / HILL.epsM0) - 1) / (Math.exp(HILL.kPE) - 1);
}

/** force–velocity relation: v in vmax units, negative = shortening */
export function forceVelocity(v: number): number {
  if (v <= 0) return Math.max(0, (1 + v) / (1 - v / HILL.af));
  return 1 + ((HILL.fEcc - 1) * v) / (v + 0.06);
}

export function muscleForce(a: number, l: number, v: number): number {
  return clamp(a * forceLength(l) * forceVelocity(v) + passiveForce(l), 0, 2.5);
}

export function tendonStrain(force: number): number {
  return force <= 0 ? 0 : HILL.epsT0 * Math.pow(force, 0.8);
}

/** first-order activation dynamics towards the neural excitation u */
export function stepActivation(a: number, u: number, dt: number): number {
  const tau = u > a ? HILL.tauAct * (0.5 + 1.5 * a) : HILL.tauDeact / (0.5 + 1.5 * a);
  return clamp(a + ((u - a) * Math.min(1, dt / Math.max(1e-3, tau))), 0, 1);
}

export type ContractionState = 'concentric' | 'eccentric' | 'isometric' | 'stretched' | 'relaxed';

export function classify(a: number, l: number, v: number): ContractionState {
  if (a > 0.15) {
    if (v < -0.012) return 'concentric';
    if (v > 0.012) return 'eccentric';
    return 'isometric';
  }
  return l > 1.035 ? 'stretched' : 'relaxed';
}

/**
 * Belly thickness factor: fibres keep their volume, so a shorter muscle gets
 * thicker (area ∝ 1/length) and an active one a little firmer and rounder.
 */
export function bellyThickness(l: number, a: number): number {
  return clamp(Math.pow(1 / Math.max(0.4, l), 0.7) * (1 + 0.16 * a), 0.7, 1.5);
}

export interface MtuParams {
  /** rest length of the muscle-tendon unit (m) */
  L0: number;
  /** tendon share of the unit at rest */
  tendonFraction: number;
  /** optimal fibre length as a share of the muscle belly (pennate muscles have short fibres) */
  fibreRatio?: number;
}

/** fibre length / belly length by architecture */
export const FIBRE_RATIO: Record<string, number> = { parallel: 0.9, fusiform: 0.8, sheet: 0.9, circular: 0.9, pennate: 0.45, bipennate: 0.35, multipennate: 0.28, tendinous: 0.15 };

export interface MtuState {
  /** current muscle-tendon length (m) */
  L: number;
  /** normalised fibre length */
  l: number;
  /** normalised fibre velocity */
  v: number;
  a: number;
  F: number;
  eps: number;
  state: ContractionState;
}

export function initialState(p: MtuParams): MtuState {
  return { L: p.L0, l: 1, v: 0, a: 0.02, F: 0, eps: 0, state: 'relaxed' };
}

/**
 * Advance one MTU by dt for a new total length L and neural excitation u.
 * The tendon takes its strain from the previous force (one fixed-point step
 * per frame is plenty at display rates). Purely tendinous units (tendon
 * fraction ≈ 1, e.g. the equine fibularis tertius) behave as a passive strap.
 */
export function stepMtu(p: MtuParams, s: MtuState, L: number, u: number, dt: number): MtuState {
  const tf = clamp(p.tendonFraction, 0, 1);
  if (tf > 0.97) {
    const eps = Math.max(0, L / p.L0 - 1);
    const F = clamp(eps / HILL.epsT0, 0, 2.5);
    return { L, l: 1, v: 0, a: 0, F, eps, state: eps > 0.004 ? 'stretched' : 'relaxed' };
  }
  const a = stepActivation(s.a, u, dt);
  // the fibres take up the change of the unit's length minus what the tendon stretches
  const Lfo = Math.max(1e-3, (1 - tf) * p.L0 * (p.fibreRatio ?? 0.8));
  const l = clamp(1 + (L - p.L0 - tf * p.L0 * s.eps) / Lfo, 0.3, 1.9);
  const v = dt > 0 ? clamp((l - s.l) / dt / HILL.vmax, -1, 1) : 0;
  // smooth the velocity: frame-to-frame noise must not flip the displayed state
  const vs = s.v + (v - s.v) * Math.min(1, dt * 12);
  const F = muscleForce(a, l, vs);
  const eps = tendonStrain(F);
  return { L, l, v: vs, a, F, eps, state: classify(a, l, vs) };
}
