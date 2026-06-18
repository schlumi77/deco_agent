import { describe, it, expect } from 'vitest';
import { planDive } from './planner.js';
import type { DivePlanResponse } from '../types.js';

const DECO_GASES = ['Oxygen', 'Tx 50/15'];

function totalStopTime(res: DivePlanResponse): number {
    return res.schedule.slice(1).reduce((sum, s) => sum + s.time, 0);
}

describe('CCR Gas Display', () => {
    it('should include the calculated gas mixture in brackets for CCR dives', () => {
        // Depth 50m, Tx 18/45 diluent, SP 1.3
        // Ambient pressure at 50m is 6.0 bar.
        // P_dry = 6.0 - 0.0627 = 5.9373
        // fO2 = 1.3 / 5.9373 = 0.2189... (approx 22%)
        // fHe = 0.45 * (1 - 0.22) / (1 - 0.18) = 0.45 * 0.78 / 0.82 = 0.428... (approx 43%)
        
        const result = planDive(50, 20, "Tx 18/45", ["Tx 50/15", "Oxygen"], 0.5, 0.8, true, 1.3);
        
        // Check bottom segment
        const bottomSegment = result.schedule[0];
        expect(bottomSegment.depth).toBe(50);
        expect(bottomSegment.gas).toContain('[22/43]');
        expect(bottomSegment.gas).toContain('CCR SP 1.3');
    });

    it('should use deco gas setpoint for deco stops', () => {
        // At 6m, Oxygen SP 1.4
        // P_amb = 1.6 bar. P_dry = 1.5373
        // fO2 = 1.4 / 1.5373 = 0.91... But loop fO2 is Math.max(dil.fO2, sp/P_dry). 
        // For Oxygen diluent, fO2 is 1.0.
        // So loop fO2 should be 1.0.
        // fHe should be 0.
        
        const result = planDive(50, 20, "Tx 18/45", ["Tx 50/15", "Oxygen"], 0.5, 0.8, true, 1.3);
        
        const oxygenStop = result.schedule.find(s => s.depth === 6);
        if (oxygenStop) {
            expect(oxygenStop.gas).toContain('CCR Oxygen SP 1.4');
            expect(oxygenStop.gas).toContain('[100/0]');
        }
    });

    it('should NOT include brackets for OC dives', () => {
        const result = planDive(50, 20, "Tx 18/45", ["Tx 50/15", "Oxygen"], 0.5, 0.8, false);
        
        const bottomSegment = result.schedule[0];
        expect(bottomSegment.gas).toBe("Tx 18/45");
        expect(bottomSegment.gas).not.toContain('[');
    });
});

describe('Canonical dive schedules (regression goldens)', () => {
    // These pin the planner's full output for known dives. If a deliberate
    // change to the engine or stop logic shifts these numbers, update the
    // goldens together with a note in the PR explaining the expected change.

    it('30 m / 20 min on air is effectively a no-stop dive', () => {
        const res = planDive(30, 20, 'Air', DECO_GASES, 0.5, 0.8, false);
        expect(res.schedule[0]).toMatchObject({ depth: 30, time: 20 });
        // Only the enforced 6 m floor stop, ~1 min
        expect(totalStopTime(res)).toBeLessThanOrEqual(2);
        expect(res.surface_gf).toBeCloseTo(74.0, 0);
        expect(res.warnings).toHaveLength(0);
    });

    it('50 m / 20 min on Tx 18/45 produces the expected stops', () => {
        const res = planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false);
        const stops = res.schedule.slice(1).map(s => [s.depth, s.time]);
        expect(stops).toEqual([
            [18, 1],
            [15, 1],
            [12, 2],
            [9, 4],
            [6, 13],
        ]);
        expect(res.schedule[res.schedule.length - 1].run_time).toBe(52);
        expect(res.surface_gf).toBeCloseTo(84.6, 0);
        expect(res.cns_percent).toBeCloseTo(46.5, 0);
        expect(res.otus).toBeCloseTo(74.1, 0);
        expect(res.warnings).toHaveLength(0);
    });

    it('ZHL-16B and ZHL-16C diverge for the same dive', () => {
        const c = planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false, 1.2, null, null, 20, 10, true, 'C');
        const b = planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false, 1.2, null, null, 20, 10, true, 'B');
        expect(b.schedule).not.toEqual(c.schedule);
    });
});

describe('Planner invariants', () => {
    const base = () => planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false);

    it('more bottom time never reduces total decompression', () => {
        const short = planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false);
        const long = planDive(50, 30, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false);
        expect(totalStopTime(long)).toBeGreaterThan(totalStopTime(short));
    });

    it('more depth never reduces total decompression', () => {
        const shallow = planDive(40, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false);
        const deep = planDive(60, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false);
        expect(totalStopTime(deep)).toBeGreaterThan(totalStopTime(shallow));
    });

    it('enforces the 6 m decompression floor (no 3 m stops) by default', () => {
        const res = base();
        expect(res.schedule.some(s => s.depth === 3)).toBe(false);
        expect(res.schedule.some(s => s.depth === 6)).toBe(true);
    });

    it('permits 3 m stops when the 6 m floor is disabled', () => {
        const res = planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false, 1.2, null, null, 20, 10, false);
        expect(res.schedule.some(s => s.depth === 3)).toBe(true);
    });

    it('surfaces without a tissue-overload violation', () => {
        const res = base();
        expect(res.surface_gf).toBeLessThanOrEqual(100);
        expect(res.warnings).toHaveLength(0);
    });

    it('produces a profile that starts and ends at the surface, with finite tissue loads', () => {
        const res = base();
        expect(res.profile[0]).toMatchObject({ time: 0, depth: 0 });
        expect(res.profile[res.profile.length - 1].depth).toBe(0);
        expect(res.tissue_loads).toHaveLength(16);
        for (const t of res.tissue_loads) {
            expect(Number.isFinite(t.load_percent)).toBe(true);
            expect(t.load_percent).toBeGreaterThanOrEqual(0);
        }
    });

    it('does not get stuck in the ascent loop for a deep, long dive', () => {
        const res = planDive(90, 30, 'Tx 12/65', DECO_GASES, 0.4, 0.7, false);
        expect(res.warnings).not.toContain('Deco stuck: Infinite loop detected');
    });

    it('throws on an unknown bottom gas', () => {
        expect(() => planDive(40, 20, 'Nonexistent Mix', DECO_GASES)).toThrow();
    });
});
