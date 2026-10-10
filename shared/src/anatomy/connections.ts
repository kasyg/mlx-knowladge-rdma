/**
 * Anatomical connection graph of a species: which bones a muscle starts and ends
 * on, its tendons, nerve and artery, its synergists and antagonists (shared or
 * opposite actions on the same joint), the bones a tendon or ligament holds,
 * the bones that articulate with a bone, and the reverse links (a bone lists the
 * muscles attaching to it, a nerve the muscles it supplies …).
 */
import type { MotionRole, StructureDef } from '../types.ts';
import { MECHANICS, TENDON_BONES, JOINTS, type MuscleMech } from './mechanics.ts';

export type ConnectionRole =
  | 'origin'
  | 'insertion'
  | 'tendon'
  | 'nerve'
  | 'artery'
  | 'synergist'
  | 'antagonist'
  | 'muscle'
  | 'bone'
  | 'articulates'
  | 'originHere'
  | 'insertsHere'
  | 'attached'
  | 'innervates'
  | 'supplies';

export interface Connection {
  /** structure id of the connected structure */
  id: string;
  role: ConnectionRole;
  /** joint id (synergists, antagonists, articulating bones) */
  joint?: string;
}

export interface JointLink {
  id: string;
  action: MotionRole['action'];
}

export interface ConnectionGraph {
  /** structure id → connections */
  links: Map<string, Connection[]>;
  /** muscle id → joints it moves (with the action) */
  joints: Map<string, JointLink[]>;
  /** muscle id → mechanics (only muscles present in the species) */
  mech: Map<string, MuscleMech>;
}

const MOTION_JOINT: Record<MotionRole['joint'], string> = {
  shoulder: 'art_humeri',
  elbow: 'art_cubiti',
  carpus: 'art_carpi',
  fetlock_fl: 'art_metacarpophalangea',
  hip: 'art_coxae',
  stifle: 'art_genus',
  hock: 'art_tarsi',
  fetlock_hl: 'art_metatarsophalangea',
};

/** first candidate id present in the species */
export function pickPresent(candidates: string[] | undefined, present: Set<string>): string | null {
  for (const c of candidates ?? []) if (present.has(c)) return c;
  return null;
}

export function buildConnections(structures: StructureDef[]): ConnectionGraph {
  const present = new Set(structures.map((s) => s.id));
  const links = new Map<string, Connection[]>();
  const joints = new Map<string, JointLink[]>();
  const mech = new Map<string, MuscleMech>();
  const add = (from: string, c: Connection) => {
    if (from === c.id) return;
    const arr = links.get(from) ?? [];
    if (!arr.some((x) => x.id === c.id && x.role === c.role && x.joint === c.joint)) arr.push(c);
    links.set(from, arr);
  };
  const byId = new Map(structures.map((s) => [s.id, s]));

  for (const s of structures) {
    if (s.kind !== 'muscle') continue;
    const m = MECHANICS[s.id];
    if (m) {
      mech.set(s.id, m);
      for (const site of m.origin) {
        const b = pickPresent(site.bone, present);
        if (b) {
          add(s.id, { id: b, role: 'origin' });
          add(b, { id: s.id, role: 'originHere' });
        }
      }
      for (const site of m.insertion) {
        const b = pickPresent(site.bone, present);
        if (b) {
          add(s.id, { id: b, role: 'insertion' });
          add(b, { id: s.id, role: 'insertsHere' });
        }
      }
      for (const t of m.tendons ?? []) {
        if (!present.has(t)) continue;
        add(s.id, { id: t, role: 'tendon' });
        add(t, { id: s.id, role: 'muscle' });
      }
      for (const n of m.nerve ?? []) {
        if (!present.has(n)) continue;
        add(s.id, { id: n, role: 'nerve' });
        add(n, { id: s.id, role: 'innervates' });
      }
      for (const a of m.artery ?? []) {
        if (!present.has(a)) continue;
        add(s.id, { id: a, role: 'artery' });
        add(a, { id: s.id, role: 'supplies' });
      }
    }
    if (s.motion?.length) joints.set(s.id, s.motion.map((r) => ({ id: MOTION_JOINT[r.joint], action: r.action })));
  }

  // synergists share an action on a joint, antagonists act oppositely on it
  const movers = [...joints.entries()];
  for (let i = 0; i < movers.length; i++) {
    for (let k = i + 1; k < movers.length; k++) {
      const [a, ja] = movers[i];
      const [b, jb] = movers[k];
      for (const x of ja) {
        for (const y of jb) {
          if (x.id !== y.id) continue;
          const role = x.action === y.action ? 'synergist' : 'antagonist';
          add(a, { id: b, role, joint: x.id });
          add(b, { id: a, role, joint: x.id });
        }
      }
    }
  }

  // tendons and ligaments → bones they hold
  for (const [tid, bones] of Object.entries(TENDON_BONES)) {
    if (!present.has(tid)) continue;
    for (const b of bones) {
      if (!present.has(b)) continue;
      add(tid, { id: b, role: 'bone' });
      add(b, { id: tid, role: 'attached' });
    }
  }

  // bones that meet in a joint
  for (const j of JOINTS) {
    const bones = j.bones.filter((b) => present.has(b) && byId.get(b)?.group !== undefined);
    for (const a of bones) for (const b of bones) if (a !== b) add(a, { id: b, role: 'articulates', joint: j.id });
  }

  return { links, joints, mech };
}

export const JOINT_NAMES = new Map(JOINTS.map((j) => [j.id, j.names]));
