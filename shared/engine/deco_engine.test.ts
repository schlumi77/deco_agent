import { describe, it, expect } from 'vitest';
import {
    DecoEngine,
    OxygenToxicityTracker,
    SURFACE_PRESSURE,
    WATER_VAPOR_PRESSURE,
    calculateGasDensity,
} from './deco_engine.js';
import {
    calculateMod,
    calculateMinOd,
    calculateEnd,
    getCcrMix,
} from './planner.js';

// These tests pin the physiological core against hand-computable reference
// values. They are independent of the planner's stop-generation heuristics and
// should only change if the underlying ZHL-16 / gas-physics math is changed
// deliberately.

describe('Oxygen toxicity (NOAA CNS + OTU)', () => {
    const ot = new OxygenToxicityTracker();

    it('computes CNS% from the NOAA single-exposure limit table', () => {
        // pO2 1.4 bar -> 150 min single-exposure limit; 20 min => 20/150 = 13.33%
        expect(ot.calculateCnsContribution(1.4, 20)).toBeCloseTo(13.333, 2);
    });

    it('interpolates CNS limits between table rows', () => {
        // pO2 1.25 sits halfway between 1.2 (210) and 1.3 (180) => limit 195
        // 19.5 min => exactly 10%
        expect(ot.calculateCnsContribution(1.25, 19.5)).toBeCloseTo(10.0, 5);
    });

    it('contributes no CNS below the 0.6 bar threshold', () => {
        expect(ot.calculateCnsContribution(0.5, 60)).toBe(0);
    });

    it('computes OTU via the pulmonary power law', () => {
        // OTU = t * ((pO2 - 0.5) / 0.5)^0.833 ; pO2 1.4, t 20 => 32.63
        expect(ot.calculateOtuContribution(1.4, 20)).toBeCloseTo(32.634, 2);
    });

    it('contributes no OTU at or below 0.5 bar', () => {
        expect(ot.calculateOtuContribution(0.5, 60)).toBe(0);
    });

    it('accumulates exposures additively', () => {
        const t = new OxygenToxicityTracker();
        t.addExposure(1.4, 10);
        t.addExposure(1.4, 10);
        expect(t.cns_percent).toBeCloseTo(13.333, 2);
        expect(t.otus).toBeCloseTo(32.634, 2);
    });
});

describe('Schreiner gas kinetics', () => {
    it('initialises every tissue to the surface nitrogen tension', () => {
        const e = new DecoEngine(SURFACE_PRESSURE, 'C');
        const expected = (SURFACE_PRESSURE - WATER_VAPOR_PRESSURE) * 0.7902;
        for (const p of e.p_n2) expect(p).toBeCloseTo(expected, 6);
        for (const p of e.p_he) expect(p).toBe(0);
    });

    it('saturates the fastest compartment toward the inspired tension', () => {
        const e = new DecoEngine(SURFACE_PRESSURE, 'C');
        e.updateTissues(30, 30, 120, 0.21, 0.0); // 2 h at 30 m on air
        const pAmb = SURFACE_PRESSURE + 30 / 10;
        const inspired = (pAmb - WATER_VAPOR_PRESSURE) * 0.7902;
        // 4 min half-time compartment after 120 min (~30 half-times) is all but fully loaded
        expect(e.p_n2[0]).toBeCloseTo(inspired, 2);
        // Slowest compartment (635 min) is nowhere near saturated yet
        expect(e.p_n2[15]).toBeLessThan(inspired);
    });

    it('leaves tissues unchanged for non-positive time', () => {
        const e = new DecoEngine(SURFACE_PRESSURE, 'C');
        const before = [...e.p_n2];
        e.updateTissues(0, 40, 0, 0.21, 0.0);
        expect(e.p_n2).toEqual(before);
    });
});

describe('Ceiling behaviour', () => {
    it('has a zero ceiling at the surface (no load to off-gas)', () => {
        const e = new DecoEngine(SURFACE_PRESSURE, 'C');
        expect(e.getCeiling(0.8)).toBe(0);
    });

    it('produces a non-zero ceiling after a saturating deep exposure', () => {
        const e = new DecoEngine(SURFACE_PRESSURE, 'C');
        e.updateTissues(50, 50, 30, 0.18, 0.45);
        expect(e.getCeiling(0.8)).toBeGreaterThan(0);
    });

    it('is more conservative (deeper) for a lower gradient factor', () => {
        const e = new DecoEngine(SURFACE_PRESSURE, 'C');
        e.updateTissues(50, 50, 30, 0.18, 0.45);
        expect(e.getCeiling(0.3)).toBeGreaterThan(e.getCeiling(0.9));
    });
});

describe('Gas-limit physics (sea-level surface pressure)', () => {
    it('MOD uses the shared surface pressure', () => {
        // (1.4 / 0.21 - 1.013) * 10
        expect(calculateMod(0.21, 1.4)).toBeCloseTo(56.537, 2);
        expect(calculateMod(1.0, 1.6)).toBeCloseTo(5.87, 2);
    });

    it('MinOD marks the hypoxic floor for a lean mix', () => {
        // Tx 10/80 at default 0.16 hypoxic limit: (0.16/0.10 - 1.013) * 10
        expect(calculateMinOd(0.10)).toBeCloseTo(5.87, 2);
    });

    it('END equals depth for a helium-free gas', () => {
        expect(calculateEnd(40, 0.0)).toBeCloseTo(40, 6);
    });

    it('END is shallower than depth once helium is added', () => {
        const end = calculateEnd(50, 0.45);
        expect(end).toBeCloseTo(22.942, 2);
        expect(end).toBeLessThan(50);
    });

    it('gas density scales with absolute pressure', () => {
        // Air density at surface ~ (0.21*1.429 + 0.79*1.251) * 1.013
        expect(calculateGasDensity(0.21, 0.0, 0)).toBeCloseTo(1.305, 2);
        // and ~6x denser around 50 m
        expect(calculateGasDensity(0.21, 0.0, 50)).toBeGreaterThan(7);
    });
});

describe('CCR loop mix (getCcrMix)', () => {
    it('blends diluent up to the setpoint pO2 at depth', () => {
        const [fo2, fhe] = getCcrMix(50, { name: 'Tx 18/45', fO2: 0.18, fHe: 0.45, type: 'bottom' }, 1.3);
        expect(fo2).toBeCloseTo(0.218, 2);
        expect(fhe).toBeCloseTo(0.429, 2);
    });

    it('never drops loop fO2 below the diluent fO2 (shallow / pure O2)', () => {
        const [fo2, fhe] = getCcrMix(6, { name: 'Oxygen', fO2: 1.0, fHe: 0.0, type: 'deco' }, 1.4);
        expect(fo2).toBe(1.0);
        expect(fhe).toBe(0.0);
    });
});
