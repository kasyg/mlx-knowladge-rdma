import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { orientationMatrix } from '../client/src/three/external.ts';

const dir = (v: [number, number, number], m: THREE.Matrix4) => new THREE.Vector3(...v).transformDirection(m);

describe('external model orientation', () => {
  it('is the identity for a file already in the atlas frame (up +y, facing -x)', () => {
    const m = orientationMatrix('+y', '-x');
    expect(dir([0, 1, 0], m).y).toBeCloseTo(1);
    expect(dir([-1, 0, 0], m).x).toBeCloseTo(-1);
    expect(dir([0, 0, 1], m).z).toBeCloseTo(1);
  });
  it('turns a z-up file that faces +y into the atlas frame', () => {
    const m = orientationMatrix('+z', '+y');
    expect(dir([0, 0, 1], m).y).toBeCloseTo(1); // file up → atlas up
    expect(dir([0, 1, 0], m).x).toBeCloseTo(-1); // file forward → cranial (-x)
  });
  it('turns a y-up file that faces +z into the atlas frame and keeps handedness', () => {
    const m = orientationMatrix('+y', '+z');
    expect(dir([0, 0, 1], m).x).toBeCloseTo(-1);
    expect(dir([0, 1, 0], m).y).toBeCloseTo(1);
    // the animal's left side: up × forward in the file is (+y × +z) = +x → must land on atlas +z
    expect(dir([1, 0, 0], m).z).toBeCloseTo(1);
    expect(m.determinant()).toBeCloseTo(1);
  });
});
