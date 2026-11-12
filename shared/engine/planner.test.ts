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
        expect(res.surface_gf).toBeCloseTo(43.0, 0);
        expect(res.warnings).toHaveLength(0);
    });

    it('50 m / 20 min on Tx 18/45 produces the expected stops', () => {
        const res = planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false);
        const stops = res.schedule.slice(1).map(s => [s.depth, s.time]);
        expect(stops).toEqual([
            [21, 1],
            [18, 1],
            [15, 2],
            [12, 2],
            [9, 4],
            [6, 12],
        ]);
        expect(res.schedule[res.schedule.length - 1].run_time).toBe(53);
        expect(res.surface_gf).toBeCloseTo(59.9, 0);
        expect(res.cns_percent).toBeCloseTo(46.1, 0);
        expect(res.otus).toBeCloseTo(75.5, 0);
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

describe('Per-segment toxicity accounting', () => {
    // Regression: generateResult() used to read the toxicity tracker for the
    // bottom row *after* the whole dive had been simulated, so that row showed
    // the end-of-dive total while the deco rows below it showed live running
    // values. The CNS/OTU columns therefore appeared to run backwards.

    it('reports CNS and OTU per segment, never decreasing down the schedule', () => {
        const res = planDive(50, 20, 'Air', DECO_GASES, 0.5, 0.8, false);
        expect(res.schedule.length).toBeGreaterThan(1);

        for (let i = 1; i < res.schedule.length; i++) {
            const prev = res.schedule[i - 1];
            const curr = res.schedule[i];
            expect(curr.cns).toBeGreaterThanOrEqual(prev.cns);
            expect(curr.otu).toBeGreaterThanOrEqual(prev.otu);
        }
    });

    it('shows bottom-segment loading on the bottom row, not the whole-dive total', () => {
        const res = planDive(50, 20, 'Air', DECO_GASES, 0.5, 0.8, false);
        const bottom = res.schedule[0];

        // The deco that follows adds meaningful O2 exposure, so the bottom row
        // must be strictly below the dive totals rather than equal to them.
        expect(bottom.cns).toBeLessThan(res.cns_percent);
        expect(bottom.otu).toBeLessThan(res.otus);
        expect(bottom.cns).toBeGreaterThan(0);
        expect(bottom.otu).toBeGreaterThan(0);
    });

    it('keeps every schedule row within the reported dive totals', () => {
        const res = planDive(50, 20, 'Air', DECO_GASES, 0.5, 0.8, false);

        for (const entry of res.schedule) {
            expect(entry.cns).toBeLessThanOrEqual(res.cns_percent);
            expect(entry.otu).toBeLessThanOrEqual(res.otus);
        }
    });

    it('holds for CCR schedules as well', () => {
        const res = planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, true, 1.3);

        for (let i = 1; i < res.schedule.length; i++) {
            expect(res.schedule[i].cns).toBeGreaterThanOrEqual(res.schedule[i - 1].cns);
            expect(res.schedule[i].otu).toBeGreaterThanOrEqual(res.schedule[i - 1].otu);
        }
        expect(res.schedule[0].cns).toBeLessThan(res.cns_percent);
    });
});

describe('Gradient factor handling', () => {
    // Regression: the GF slope used to be anchored at the maximum depth, so
    // the first stop was governed by a blend of GF Low and GF High instead of
    // GF Low alone, and `surface_gf` reported tissue tension as a share of the
    // M-value rather than a gradient factor.

    it('lets GF Low alone decide the first stop', () => {
        const gf80 = planDive(50, 20, 'Air', DECO_GASES, 0.5, 0.8, false);
        const gf95 = planDive(50, 20, 'Air', DECO_GASES, 0.5, 0.95, false);
        expect(gf80.schedule[1].depth).toBe(18);
        expect(gf95.schedule[1].depth).toBe(gf80.schedule[1].depth);
    });

    it('starts stops deeper when GF Low is reduced', () => {
        const gf50 = planDive(50, 20, 'Air', DECO_GASES, 0.5, 0.8, false);
        const gf30 = planDive(50, 20, 'Air', DECO_GASES, 0.3, 0.8, false);
        expect(gf30.schedule[1].depth).toBeGreaterThan(gf50.schedule[1].depth);
    });

    it('surfaces at or below GF High', () => {
        const dives: [number, number, string, number, number, boolean, boolean][] = [
            [40, 25, 'Air', 0.5, 0.8, false, true],
            [60, 25, 'Tx 18/45', 0.3, 0.7, false, true],
            [90, 30, 'Tx 12/65', 0.4, 0.7, false, true],
            [50, 20, 'Tx 18/45', 0.5, 0.8, true, true],
            [45, 30, 'Air', 0.5, 0.8, false, false],
            [70, 20, 'Tx 15/55', 0.2, 0.85, false, true],
        ];
        for (const [depth, time, gas, gfLow, gfHigh, isCcr, force6m] of dives) {
            const res = planDive(depth, time, gas, DECO_GASES, gfLow, gfHigh, isCcr, 1.3, null, null, 20, 10, force6m);
            expect(res.surface_gf).toBeGreaterThan(0);
            expect(res.surface_gf).toBeLessThanOrEqual(gfHigh * 100);
        }
    });
});

describe('Input validation', () => {
    // planDive(depth, bottomTime, bottomGas, decoGases, gfLow, gfHigh, isCcr,
    //          setpoint, decoSetpoint, decoGasSetpoint, descentRate, ascentRate, force6m, model)

    it('rejects a non-positive or non-numeric depth and bottom time', () => {
        expect(() => planDive(-40, 20, 'Air', DECO_GASES)).toThrow(/Depth/);
        expect(() => planDive(0, 20, 'Air', DECO_GASES)).toThrow(/Depth/);
        expect(() => planDive(NaN, 20, 'Air', DECO_GASES)).toThrow(/Depth/);
        expect(() => planDive('40' as unknown as number, 20, 'Air', DECO_GASES)).toThrow(/Depth/);
        expect(() => planDive(40, 0, 'Air', DECO_GASES)).toThrow(/Bottom time/);
    });

    it('rejects gradient factors that are inverted or out of range', () => {
        expect(() => planDive(40, 20, 'Air', DECO_GASES, 0.9, 0.3)).toThrow(/GF Low/);
        expect(() => planDive(40, 20, 'Air', DECO_GASES, 0.5, 1.2)).toThrow(/GF High/);
        expect(() => planDive(40, 20, 'Air', DECO_GASES, 0, 0.8)).toThrow(/GF Low/);
    });

    it('accepts equal gradient factors', () => {
        expect(() => planDive(40, 20, 'Air', DECO_GASES, 0.8, 0.8)).not.toThrow();
    });

    it('rejects non-positive descent and ascent rates', () => {
        expect(() => planDive(40, 20, 'Air', DECO_GASES, 0.5, 0.8, false, 1.2, null, null, 0, 10)).toThrow(/Descent rate/);
        expect(() => planDive(40, 20, 'Air', DECO_GASES, 0.5, 0.8, false, 1.2, null, null, 20, -5)).toThrow(/Ascent rate/);
    });

    it('rejects an unknown model instead of falling back to ZHL-16C', () => {
        expect(() => planDive(40, 20, 'Air', DECO_GASES, 0.5, 0.8, false, 1.2, null, null, 20, 10, true, 'X')).toThrow(/model/);
        expect(() => planDive(40, 20, 'Air', DECO_GASES, 0.5, 0.8, false, 1.2, null, null, 20, 10, true, 'b')).not.toThrow();
    });

    it('rejects an unknown deco gas instead of silently dropping it', () => {
        expect(() => planDive(50, 20, 'Air', ['Oxigen'])).toThrow(/Unknown deco gas "Oxigen"/);
    });

    it('rejects a bad setpoint for CCR dives only', () => {
        expect(() => planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, true, 0)).toThrow(/Setpoint/);
        expect(() => planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, true, '1.3' as unknown as number)).toThrow(/Setpoint/);
        expect(() => planDive(50, 20, 'Tx 18/45', DECO_GASES, 0.5, 0.8, false, 0)).not.toThrow();
    });
});
