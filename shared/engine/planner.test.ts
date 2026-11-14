import { describe, it, expect } from 'vitest';
import {
    planDive,
    planBailout,
    calculateGasRequirements,
    GAS_RESERVE_FACTOR,
    PLAN_DEFAULTS,
    CYLINDERS,
    GASES,
    GAS_SWITCH_STOP_TIME,
    getTravelTime,
    calculateMod,
    gasLimitPo2,
    canSwitchTo,
} from './planner.js';
import { SURFACE_PRESSURE, DecoEngine } from './deco_engine.js';
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
        
        const result = planDive({ depth: 50, bottom_time: 20, bottom_gas: "Tx 18/45", deco_gases: ["Tx 50/15", "Oxygen"], is_ccr: true, setpoint: 1.3 });
        
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
        
        const result = planDive({ depth: 50, bottom_time: 20, bottom_gas: "Tx 18/45", deco_gases: ["Tx 50/15", "Oxygen"], is_ccr: true, setpoint: 1.3 });
        
        const oxygenStop = result.schedule.find(s => s.depth === 6);
        if (oxygenStop) {
            expect(oxygenStop.gas).toContain('CCR Oxygen SP 1.4');
            expect(oxygenStop.gas).toContain('[100/0]');
        }
    });

    it('should NOT include brackets for OC dives', () => {
        const result = planDive({ depth: 50, bottom_time: 20, bottom_gas: "Tx 18/45", deco_gases: ["Tx 50/15", "Oxygen"] });
        
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
        const res = planDive({ depth: 30, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES });
        expect(res.schedule[0]).toMatchObject({ depth: 30, time: 20 });
        // Only the enforced 6 m floor stop, ~1 min
        expect(totalStopTime(res)).toBeLessThanOrEqual(2);
        expect(res.surface_gf).toBeCloseTo(43.0, 0);
        expect(res.warnings).toHaveLength(0);
    });

    it('50 m / 20 min on Tx 18/45 produces the expected stops', () => {
        const res = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES });
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
        const c = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES });
        const b = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES, model: 'B' });
        expect(b.schedule).not.toEqual(c.schedule);
    });
});

describe('Planner invariants', () => {
    const base = () => planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES });

    it('more bottom time never reduces total decompression', () => {
        const short = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES });
        const long = planDive({ depth: 50, bottom_time: 30, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES });
        expect(totalStopTime(long)).toBeGreaterThan(totalStopTime(short));
    });

    it('more depth never reduces total decompression', () => {
        const shallow = planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES });
        const deep = planDive({ depth: 60, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES });
        expect(totalStopTime(deep)).toBeGreaterThan(totalStopTime(shallow));
    });

    it('enforces the 6 m decompression floor (no 3 m stops) by default', () => {
        const res = base();
        expect(res.schedule.some(s => s.depth === 3)).toBe(false);
        expect(res.schedule.some(s => s.depth === 6)).toBe(true);
    });

    it('permits 3 m stops when the 6 m floor is disabled', () => {
        const res = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES, force_6m: false });
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
        const res = planDive({ depth: 90, bottom_time: 30, bottom_gas: 'Tx 12/65', deco_gases: DECO_GASES, gf_low: 40, gf_high: 70 });
        expect(res.warnings).not.toContain('Deco stuck: Infinite loop detected');
    });

    it('throws on an unknown bottom gas', () => {
        expect(() => planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Nonexistent Mix', deco_gases: DECO_GASES })).toThrow();
    });
});

describe('Per-segment toxicity accounting', () => {
    // Regression: generateResult() used to read the toxicity tracker for the
    // bottom row *after* the whole dive had been simulated, so that row showed
    // the end-of-dive total while the deco rows below it showed live running
    // values. The CNS/OTU columns therefore appeared to run backwards.

    it('reports CNS and OTU per segment, never decreasing down the schedule', () => {
        const res = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES });
        expect(res.schedule.length).toBeGreaterThan(1);

        for (let i = 1; i < res.schedule.length; i++) {
            const prev = res.schedule[i - 1];
            const curr = res.schedule[i];
            expect(curr.cns).toBeGreaterThanOrEqual(prev.cns);
            expect(curr.otu).toBeGreaterThanOrEqual(prev.otu);
        }
    });

    it('shows bottom-segment loading on the bottom row, not the whole-dive total', () => {
        const res = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES });
        const bottom = res.schedule[0];

        // The deco that follows adds meaningful O2 exposure, so the bottom row
        // must be strictly below the dive totals rather than equal to them.
        expect(bottom.cns).toBeLessThan(res.cns_percent);
        expect(bottom.otu).toBeLessThan(res.otus);
        expect(bottom.cns).toBeGreaterThan(0);
        expect(bottom.otu).toBeGreaterThan(0);
    });

    it('keeps every schedule row within the reported dive totals', () => {
        const res = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES });

        for (const entry of res.schedule) {
            expect(entry.cns).toBeLessThanOrEqual(res.cns_percent);
            expect(entry.otu).toBeLessThanOrEqual(res.otus);
        }
    });

    it('holds for CCR schedules as well', () => {
        const res = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES, is_ccr: true, setpoint: 1.3 });

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

    // No deco gases here, so the first stop is the one the ceiling requires
    // rather than a gas switch stop.
    it('lets GF Low alone decide the first stop', () => {
        const gf80 = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: [] });
        const gf95 = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: [], gf_high: 95 });
        expect(gf80.schedule[1].depth).toBe(18);
        expect(gf95.schedule[1].depth).toBe(gf80.schedule[1].depth);
    });

    it('starts stops deeper when GF Low is reduced', () => {
        const gf50 = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: [] });
        const gf30 = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: [], gf_low: 30 });
        expect(gf30.schedule[1].depth).toBeGreaterThan(gf50.schedule[1].depth);
    });

    it('surfaces at or below GF High', () => {
        const dives: [number, number, string, number, number, boolean, boolean][] = [
            [40, 25, 'Air', 50, 80, false, true],
            [60, 25, 'Tx 18/45', 30, 70, false, true],
            [90, 30, 'Tx 12/65', 40, 70, false, true],
            [50, 20, 'Tx 18/45', 50, 80, true, true],
            [45, 30, 'Air', 50, 80, false, false],
            [70, 20, 'Tx 15/55', 20, 85, false, true],
        ];
        for (const [depth, time, gas, gfLow, gfHigh, isCcr, force6m] of dives) {
            const res = planDive({ depth, bottom_time: time, bottom_gas: gas, deco_gases: DECO_GASES, gf_low: gfLow, gf_high: gfHigh, is_ccr: isCcr, setpoint: 1.3, force_6m: force6m });
            expect(res.surface_gf).toBeGreaterThan(0);
            expect(res.surface_gf).toBeLessThanOrEqual(gfHigh);
        }
    });
});

describe('Input validation', () => {
    it('rejects a non-positive or non-numeric depth and bottom time', () => {
        expect(() => planDive({ depth: -40, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES })).toThrow(/Depth/);
        expect(() => planDive({ depth: 0, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES })).toThrow(/Depth/);
        expect(() => planDive({ depth: NaN, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES })).toThrow(/Depth/);
        expect(() => planDive({ depth: '40' as unknown as number, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES })).toThrow(/Depth/);
        expect(() => planDive({ depth: 40, bottom_time: 0, bottom_gas: 'Air', deco_gases: DECO_GASES })).toThrow(/Bottom time/);
    });

    it('rejects gradient factors that are inverted or out of range', () => {
        expect(() => planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES, gf_low: 90, gf_high: 30 })).toThrow(/GF Low/);
        expect(() => planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES, gf_high: 120 })).toThrow(/GF High/);
        expect(() => planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES, gf_low: 0 })).toThrow(/GF Low/);
    });

    it('accepts equal gradient factors', () => {
        expect(() => planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES, gf_low: 80 })).not.toThrow();
    });

    it('rejects non-positive descent and ascent rates', () => {
        expect(() => planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES, descent_rate: 0 })).toThrow(/Descent rate/);
        expect(() => planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES, ascent_rate: -5 })).toThrow(/Ascent rate/);
    });

    it('rejects an unknown model instead of falling back to ZHL-16C', () => {
        expect(() => planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES, model: 'X' })).toThrow(/model/);
        expect(() => planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES, model: 'b' })).not.toThrow();
    });

    it('rejects an unknown deco gas instead of silently dropping it', () => {
        expect(() => planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: ['Oxigen'] })).toThrow(/Unknown deco gas "Oxigen"/);
    });

    it('rejects a bad setpoint for CCR dives only', () => {
        expect(() => planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES, is_ccr: true, setpoint: 0 })).toThrow(/Setpoint/);
        expect(() => planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES, is_ccr: true, setpoint: '1.3' as unknown as number })).toThrow(/Setpoint/);
        expect(() => planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES, setpoint: 0 })).not.toThrow();
    });
});

describe('Request defaults', () => {
    it('needs only the dive itself and fills the rest from PLAN_DEFAULTS', () => {
        const minimal = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES });
        const explicit = planDive({
            depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45',
            ...PLAN_DEFAULTS, deco_gases: DECO_GASES,
        });
        expect(minimal).toEqual(explicit);
        expect(PLAN_DEFAULTS).toMatchObject({ gf_low: 50, gf_high: 80, model: 'C', force_6m: true });
    });

    it('uses the default deco gases when none are given', () => {
        expect(PLAN_DEFAULTS.deco_gases).toEqual(['Tx 50/15', 'Oxygen']);
        const res = planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air' });
        expect(Object.keys(res.gas_usage)).toEqual(['Air', 'Tx 50/15', 'Oxygen']);
    });

    it('plans on the bottom gas alone when given an empty deco list', () => {
        const res = planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air', deco_gases: [] });
        expect(res.schedule.every(s => s.gas === 'Air')).toBe(true);
    });

    it('lets the deco setpoint follow the bottom setpoint unless given', () => {
        const dive = { depth: 50, bottom_time: 20, bottom_gas: 'Tx 18/45', is_ccr: true, setpoint: 1.3 };
        const followed = planDive(dive);
        const same = planDive({ ...dive, deco_setpoint: 1.3 });
        const lower = planDive({ ...dive, deco_setpoint: 1.0 });
        expect(followed).toEqual(same);
        expect(lower.schedule).not.toEqual(followed.schedule);
    });
});

describe('Gas requirements and bailout planning', () => {
    // Regression: gas requirements were rebuilt from the schedule rows. On CCR
    // dives that charged the descent and the whole bottom time to open circuit,
    // and recovered gas names by parsing display strings like
    // "CCR Tx 50/15 SP 1.4 [76/7]". Bailout is now a real open-circuit ascent
    // re-planned from the end of bottom time, and gas use is tracked per
    // segment as it is breathed.

    const CCR_DIVE = { depth: 60, bottom_time: 25, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES, is_ccr: true, setpoint: 1.3 };
    const runTime = (res: DivePlanResponse) => res.profile[res.profile.length - 1].time;

    it('charges OC descent and bottom time to the bottom gas at ambient pressure', () => {
        // At 20 m Tx 50/15 is already within its MOD, so the ascent switches to
        // it straight from the bottom and air covers only descent and bottom.
        const res = planDive({ depth: 20, bottom_time: 15, bottom_gas: 'Air', deco_gases: ['Tx 50/15'] });
        const descent = (SURFACE_PRESSURE + 20 / 20) * (20 / PLAN_DEFAULTS.descent_rate);
        const bottom = (SURFACE_PRESSURE + 20 / 10) * 15;
        expect(res.gas_usage['Air']).toBeCloseTo(descent + bottom, 9);
        expect(res.gas_usage['Tx 50/15']).toBeGreaterThan(0);
    });

    it('converts OC gas usage to litres with SAC rate and reserve factor', () => {
        const dive = { depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES };
        const res = planDive(dive);
        const req = calculateGasRequirements(dive, res);
        expect(PLAN_DEFAULTS.sac_rate).toBe(15);
        expect(Object.keys(req.open_circuit)).toEqual(['Air', 'Tx 50/15', 'Oxygen']);
        for (const [gas, barMinutes] of Object.entries(res.gas_usage)) {
            expect(req.open_circuit[gas]).toBeCloseTo(barMinutes * 15 * GAS_RESERVE_FACTOR, 6);
        }
        // Air covers at least the descent and the full bottom time.
        const descent = (SURFACE_PRESSURE + 50 / 20) * (50 / PLAN_DEFAULTS.descent_rate);
        const bottom = (SURFACE_PRESSURE + 50 / 10) * 20;
        expect(res.gas_usage['Air']).toBeGreaterThan(descent + bottom);
        expect(req.onboard).toEqual({});
    });

    it('records no open-circuit gas while on the loop', () => {
        expect(planDive(CCR_DIVE).gas_usage).toEqual({});
    });

    it('bails out from the CCR tissue state at the end of bottom time', () => {
        const loop = planDive(CCR_DIVE);
        const bailout = planBailout(CCR_DIVE);
        // Same descent and bottom on the loop, so the same loading at bailout.
        expect(bailout.schedule[0]).toEqual(loop.schedule[0]);
        expect(bailout.schedule[0].gas).toContain('CCR SP 1.3');
        // Every ascent row is open circuit.
        for (const row of bailout.schedule.slice(1)) expect(row.gas).not.toContain('CCR');
        // Fixed-fraction OC gases carry less oxygen than a 1.4 bar loop, so
        // this ascent takes longer.
        expect(runTime(bailout)).toBeGreaterThan(runTime(loop));
    });

    it('sizes CCR bailout gas from the ascent only, not the bottom time', () => {
        const loop = planDive(CCR_DIVE);
        const req = calculateGasRequirements(CCR_DIVE, loop);
        const bottomTimeOnOc = (SURFACE_PRESSURE + 60 / 10) * 25 * 15 * GAS_RESERVE_FACTOR;
        expect(req.open_circuit['Tx 18/45']).toBeGreaterThan(0);
        expect(req.open_circuit['Tx 18/45']).toBeLessThan(bottomTimeOnOc / 4);
        expect(Object.keys(req.open_circuit)).toEqual(['Tx 18/45', 'Tx 50/15', 'Oxygen']);
        expect(Object.keys(req.onboard)).toEqual(['Onboard Oxygen', 'Onboard Diluent']);
        expect(req.onboard['Onboard Oxygen']).toBeCloseTo(runTime(loop), 6);
    });

    it('uses a bailout plan that is passed in instead of planning it again', () => {
        const loop = planDive(CCR_DIVE);
        const bailout = planBailout(CCR_DIVE);
        expect(calculateGasRequirements(CCR_DIVE, loop, bailout)).toEqual(calculateGasRequirements(CCR_DIVE, loop));
    });

    it('scales open-circuit requirements linearly with SAC rate', () => {
        const dive = { depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES };
        const res = planDive(dive);
        const at15 = calculateGasRequirements({ ...dive, sac_rate: 15 }, res).open_circuit;
        const at20 = calculateGasRequirements({ ...dive, sac_rate: 20 }, res).open_circuit;
        for (const gas of Object.keys(at15)) expect(at20[gas]).toBeCloseTo(at15[gas] * 20 / 15, 6);
        expect(() => calculateGasRequirements({ ...dive, sac_rate: 0 }, res)).toThrow(/SAC rate/);
    });

    it('reports open-circuit limits of the diluent as bailout warnings', () => {
        const dive = { depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES, is_ccr: true, setpoint: 1.3 };
        const warnings = planBailout(dive).warnings;
        expect(warnings).toContain('Bailout: Bottom gas density too high: 7.7 g/L');
        expect(warnings.every(w => w.startsWith('Bailout: '))).toBe(true);
        // The loop's own checks stay with the loop plan, not repeated here.
        expect(warnings.some(w => /setpoint/i.test(w))).toBe(false);
    });

    it('refuses to plan a bailout for an open-circuit dive', () => {
        expect(() => planBailout({ depth: 40, bottom_time: 20, bottom_gas: 'Air' })).toThrow(/CCR dives only/);
    });
});

describe('Cylinder checks', () => {
    // Regression: the README promised warnings for gas volume violations, but
    // CYLINDERS was never used and requirements were never compared with what
    // the cylinders hold.

    const OC_DIVE = { depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES };
    const CCR_DIVE = { depth: 60, bottom_time: 25, bottom_gas: 'Tx 18/45', deco_gases: DECO_GASES, is_ccr: true, setpoint: 1.3 };
    const litres = (c: { volume: number; pressure: number }) => c.volume * c.pressure;

    it('checks the bottom gas against the bottom cylinder and each deco gas against a stage', () => {
        const req = calculateGasRequirements(OC_DIVE, planDive(OC_DIVE));
        expect(req.cylinders.map(c => [c.cylinder, c.supplies])).toEqual([
            ['Bottom', ['Air']],
            ['Stage', ['Tx 50/15']],
            ['Stage', ['Oxygen']],
        ]);
        expect(req.cylinders[0].required).toBeCloseTo(req.open_circuit['Air'], 9);
        expect(req.cylinders[0].available).toBe(litres(CYLINDERS.bottom));
        expect(req.cylinders[1].available).toBe(litres(CYLINDERS.stage));
    });

    it('warns for every cylinder that holds less than the plan needs', () => {
        const ok = calculateGasRequirements(OC_DIVE, planDive(OC_DIVE));
        expect(ok.warnings).toEqual([]);

        const smallStage = { ...OC_DIVE, cylinders: { stage: { volume: 1, pressure: 200 } } };
        const req = calculateGasRequirements(smallStage, planDive(smallStage));
        expect(req.warnings).toHaveLength(2);
        expect(req.warnings[0]).toMatch(/^Not enough gas in Stage cylinder for Tx 50\/15: needs \d+ L, holds 200 L$/);
        // The bottom cylinder keeps its default size.
        expect(req.cylinders[0].available).toBe(litres(CYLINDERS.bottom));
    });

    it('draws CCR onboard diluent and bailout on diluent from the same cylinder', () => {
        const req = calculateGasRequirements(CCR_DIVE, planDive(CCR_DIVE));
        const bottom = req.cylinders[0];
        expect(bottom.cylinder).toBe('Diluent/Bailout');
        expect(bottom.supplies).toEqual(['Tx 18/45 (bailout)', 'Tx 18/45 (onboard diluent)']);
        expect(bottom.required).toBeCloseTo(req.open_circuit['Tx 18/45'] + req.onboard['Onboard Diluent'], 9);

        const oxygen = req.cylinders[req.cylinders.length - 1];
        expect(oxygen).toMatchObject({ cylinder: 'Oxygen', supplies: ['Onboard oxygen'], available: litres(CYLINDERS.oxygen) });
        expect(oxygen.required).toBeCloseTo(req.onboard['Onboard Oxygen'], 9);
    });

    it('scales onboard oxygen with the oxygen consumption rate', () => {
        const loop = planDive(CCR_DIVE);
        const at1 = calculateGasRequirements(CCR_DIVE, loop).onboard['Onboard Oxygen'];
        const at2 = calculateGasRequirements({ ...CCR_DIVE, o2_consumption: 2 }, loop).onboard['Onboard Oxygen'];
        expect(at2).toBeCloseTo(at1 * 2, 9);
    });

    it('rejects invalid cylinders and rates', () => {
        const res = planDive(OC_DIVE);
        expect(() => calculateGasRequirements({ ...OC_DIVE, cylinders: { stage: { volume: 0, pressure: 200 } } }, res)).toThrow(/Stage cylinder volume/);
        expect(() => calculateGasRequirements({ ...OC_DIVE, cylinders: { bottom: { volume: 12, pressure: -1 } } }, res)).toThrow(/Diluent\/Bailout cylinder pressure/);
        expect(() => calculateGasRequirements({ ...CCR_DIVE, o2_consumption: 0 }, planDive(CCR_DIVE))).toThrow(/Oxygen consumption/);
        // Oxygen consumption only matters on the loop.
        expect(() => calculateGasRequirements({ ...OC_DIVE, o2_consumption: 0 }, res)).not.toThrow();
    });
});

describe('Deco gas selection', () => {
    // Regression: the planner switched to the richest listed gas within pO2
    // 1.6 without comparing it with the bottom gas. Bailing out from 60 m on a
    // Tx 18/45 diluent, it switched to Tx 17/70: less oxygen and more inert gas.

    const usedGases = (res: DivePlanResponse) => Object.keys(res.gas_usage);

    it('never switches to a gas with less oxygen than the bottom gas', () => {
        const dive = { depth: 60, bottom_time: 25, bottom_gas: 'Tx 18/45', deco_gases: ['Tx 17/70', 'Tx 50/15', 'Oxygen'] };
        const res = planDive(dive);
        expect(usedGases(res)).toEqual(['Tx 18/45', 'Tx 50/15', 'Oxygen']);
        expect(res.schedule.some(s => s.gas.includes('17/70'))).toBe(false);
        expect(res.warnings).toContain('Deco gas Tx 17/70 not used: it carries no more oxygen than the bottom gas Tx 18/45');
    });

    it('plans exactly as if a skipped gas had not been listed', () => {
        const withLean = planDive({ depth: 60, bottom_time: 25, bottom_gas: 'Tx 18/45', deco_gases: ['Tx 17/70', 'Tx 50/15', 'Oxygen'] });
        const without = planDive({ depth: 60, bottom_time: 25, bottom_gas: 'Tx 18/45', deco_gases: ['Tx 50/15', 'Oxygen'] });
        expect(withLean.schedule).toEqual(without.schedule);
        expect(withLean.gas_usage).toEqual(without.gas_usage);
    });

    it('skips a deco gas that matches the bottom gas', () => {
        const res = planDive({ depth: 40, bottom_time: 20, bottom_gas: 'Air', deco_gases: ['Air', 'Oxygen'] });
        expect(res.warnings).toContain('Deco gas Air not used: it carries no more oxygen than the bottom gas Air');
    });

    it('applies the same rule on bailout, reporting skipped gases only once', () => {
        const dive = { depth: 60, bottom_time: 25, bottom_gas: 'Tx 18/45', deco_gases: ['Tx 17/70', 'Tx 50/15', 'Oxygen'], is_ccr: true, setpoint: 1.3 };
        const bailout = planBailout(dive);
        expect(usedGases(bailout)).toEqual(['Tx 18/45', 'Tx 50/15', 'Oxygen']);
        // The CCR plan reports it; the bailout plan does not repeat it.
        expect(planDive(dive).warnings.some(w => w.includes('Tx 17/70'))).toBe(true);
        expect(bailout.warnings.some(w => w.includes('Tx 17/70'))).toBe(false);
    });

    it('still uses a richer listed gas as soon as it is within its MOD', () => {
        // Tx 24/35 carries more oxygen than air and is within pO2 1.6 at 50 m,
        // so a diver who lists it switches to it when leaving the bottom.
        const res = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: ['Tx 24/35', 'Tx 50/15', 'Oxygen'] });
        expect(usedGases(res)).toEqual(['Air', 'Tx 24/35', 'Tx 50/15', 'Oxygen']);
        expect(res.warnings.some(w => w.startsWith('Deco gas'))).toBe(false);
    });
});

describe('Gas limit convention', () => {
    // Regression: the gas switch assumed a 1 bar surface while calculateMod()
    // and the `gases` table used 1.013 bar, so oxygen was used at 6 m while
    // its MOD was listed as 5.9 m. All gas limits now share one convention.

    it('computes MODs and the gas-limit pO2 with the same convention', () => {
        for (const gas of GASES) {
            const mod = calculateMod(gas.fO2, 1.6);
            expect(gasLimitPo2(gas.fO2, mod), gas.name).toBeCloseTo(1.6, 9);
        }
    });

    it('uses oxygen at a 6 m stop', () => {
        const res = planDive({ depth: 50, bottom_time: 20, bottom_gas: 'Air' });
        expect(res.schedule.find(s => s.depth === 6)?.gas).toBe('Oxygen');
        expect(calculateMod(1.0, 1.6)).toBeCloseTo(6, 9);
    });

    it('computes oxygen toxicity from the real ambient pressure', () => {
        // Oxygen at 6 m is pO2 1.6 by the gas-limit convention, but the diver
        // really breathes 1.613 bar. OTUs scale continuously with pO2, so they
        // show which one the engine uses.
        const engine = new DecoEngine(SURFACE_PRESSURE, 'C');
        engine.updateTissues(6, 6, 1, 1.0, 0.0);
        const realPo2 = SURFACE_PRESSURE + 0.6;
        expect(gasLimitPo2(1.0, 6)).toBeCloseTo(1.6, 9);
        expect(engine.toxicity_tracker.otus).toBeCloseTo(Math.pow((realPo2 - 0.5) / 0.5, 0.833), 9);
        expect(engine.toxicity_tracker.otus).toBeGreaterThan(Math.pow((1.6 - 0.5) / 0.5, 0.833));
    });
});

describe('Gas switch stops', () => {
    // On open circuit the diver stops at each deco gas's switch depth to
    // change gas (21 m for Tx 50/15, 6 m for oxygen), whether or not the
    // ceiling requires a stop there. Previously the planner switched in
    // passing on the way to the next required stop.

    const stops = (res: DivePlanResponse) => res.schedule.slice(1).map(s => [s.depth, s.time]);

    it('stops at the switch depth to change gas, before the first required stop', () => {
        expect(GAS_SWITCH_STOP_TIME).toBe(1);
        const res = planDive({ depth: 45, bottom_time: 20, bottom_gas: 'Tx 21/35', deco_gases: ['Tx 50/15'] });
        expect(res.schedule[1]).toMatchObject({ depth: 21, time: 1, gas: 'Tx 50/15' });
        // Without the deco gas the first required stop is at 15 m, so 21 m is a switch stop.
        const noDecoGas = planDive({ depth: 45, bottom_time: 20, bottom_gas: 'Tx 21/35', deco_gases: [] });
        expect(noDecoGas.schedule[1].depth).toBe(15);
    });

    it('keeps GF Low anchored at the first required stop, not the switch stop', () => {
        // Anchoring at 21 m would drop the 15 m stop and lengthen the 6 m stop.
        const res = planDive({ depth: 45, bottom_time: 20, bottom_gas: 'Tx 21/35', deco_gases: ['Tx 50/15'] });
        expect(stops(res)).toEqual([[21, 1], [15, 1], [12, 2], [9, 2], [6, 13]]);
    });

    it('makes switch stops on a dive without a deco obligation', () => {
        const withGases = planDive({ depth: 25, bottom_time: 10, bottom_gas: 'Air', deco_gases: ['Tx 50/15', 'Oxygen'] });
        expect(stops(withGases)).toEqual([[21, 1], [6, 1]]);
        expect(withGases.schedule.map(s => s.gas)).toEqual(['Air', 'Tx 50/15', 'Oxygen']);
        const without = planDive({ depth: 25, bottom_time: 10, bottom_gas: 'Air', deco_gases: [] });
        expect(stops(without)).toEqual([]);
    });

    it('switches on leaving the bottom, without a stop, when the gas is usable there', () => {
        // Tx 50/15 is within its MOD at 20 m.
        const res = planDive({ depth: 20, bottom_time: 20, bottom_gas: 'Air', deco_gases: ['Tx 50/15'] });
        expect(stops(res)).toEqual([]);
        expect(Object.keys(res.gas_usage)).toEqual(['Air', 'Tx 50/15']);
    });

    it('makes switch stops on bailout but not on the CCR loop', () => {
        const dive = { depth: 40, bottom_time: 20, bottom_gas: 'Tx 21/35', deco_gases: ['Tx 50/15'], is_ccr: true, setpoint: 1.3 };
        expect(planDive(dive).schedule.some(s => s.depth === 21)).toBe(false);
        expect(planBailout(dive).schedule[1]).toMatchObject({ depth: 21, time: 1, gas: 'Tx 50/15' });
    });
});

describe('Final ascent rate', () => {
    // The last 10 m to the surface used a fixed 1 m/min. It is now a plan
    // setting, so plans can match planners that ascend at the ascent rate
    // all the way up, such as GUE Deco Planner.

    it('splits travel time at 10 m between the ascent and final ascent rates', () => {
        expect(getTravelTime(30, 12, 10, 1)).toBeCloseTo(1.8, 9);   // all below 10 m
        expect(getTravelTime(9, 6, 10, 1)).toBeCloseTo(3, 9);       // all within the last 10 m
        expect(getTravelTime(12, 6, 10, 1)).toBeCloseTo(0.2 + 4, 9);
        expect(getTravelTime(30, 0, 10, 10)).toBeCloseTo(3, 9);
        expect(getTravelTime(6, 9, 10, 1)).toBe(0);
    });

    it('defaults to 1 m/min, so plans are unchanged', () => {
        expect(PLAN_DEFAULTS.final_ascent_rate).toBe(1);
        const dive = { depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: DECO_GASES };
        expect(planDive(dive)).toEqual(planDive({ ...dive, final_ascent_rate: 1 }));
    });

    it('trades slow final ascent for stop time', () => {
        // The slow ascent off-gasses on the way up, so it needs less stop time;
        // ascending faster needs more stops but surfaces sooner overall.
        const dive = { depth: 30, bottom_time: 18.5, bottom_gas: 'Air', deco_gases: ['Oxygen'] };
        const slow = planDive(dive);
        const fast = planDive({ ...dive, final_ascent_rate: 10 });
        const runTime = (r: DivePlanResponse) => r.profile[r.profile.length - 1].time;
        const stopTime = (r: DivePlanResponse) => r.schedule.slice(1).reduce((t, s) => t + s.time, 0);
        expect(stopsOf(slow)).toEqual([[6, 1]]);
        expect(stopsOf(fast)).toEqual([[9, 1], [6, 2]]);
        expect(stopTime(fast)).toBeGreaterThan(stopTime(slow));
        expect(runTime(fast)).toBeLessThan(runTime(slow));
    });

    it('rejects a non-positive final ascent rate', () => {
        expect(() => planDive({ depth: 30, bottom_time: 20, bottom_gas: 'Air', final_ascent_rate: 0 })).toThrow(/Final ascent rate/);
    });

    function stopsOf(res: DivePlanResponse) {
        return res.schedule.slice(1).map(s => [s.depth, s.time]);
    }
});

describe('Gas switch depths', () => {
    // Regression: the ascent switched to a deco gas at the deepest 3 m stop
    // within pO2 1.6, so Tx 35/35 came in at 33 m. Divers, and GUE Deco
    // Planner, use standard switch depths: the MOD rounded to the nearest
    // 3 m stop, which puts Tx 35/35 at 36 m.

    const decoGases = GASES.filter(g => g.type === 'deco');

    it('gives every deco gas its standard switch depth', () => {
        expect(Object.fromEntries(decoGases.map(g => [g.name, g.switch_depth]))).toEqual({
            'Oxygen': 6, 'Tx 50/15': 21, 'Tx 35/35': 36, 'Tx 24/35': 57, 'Tx 17/70': 84,
        });
        for (const g of decoGases) {
            // On the 3 m stop grid, at the stop nearest the MOD, so within
            // 1.5 m of it and never far above pO2 1.6.
            expect(g.switch_depth! % 3, g.name).toBe(0);
            expect(g.switch_depth, g.name).toBe(Math.round(calculateMod(g.fO2, 1.6) / 3) * 3);
            expect(gasLimitPo2(g.fO2, g.switch_depth!), g.name).toBeLessThanOrEqual(1.61 + 1e-9);
        }
    });

    it('switches to a deco gas exactly down to its switch depth', () => {
        for (const g of decoGases) {
            for (let depth = 0; depth <= 100; depth++) {
                expect(canSwitchTo(g, depth), `${g.name} at ${depth} m`).toBe(depth <= g.switch_depth!);
            }
        }
    });

    it('falls back to the MOD for pO2 1.6 for a gas without a switch depth', () => {
        const nx32 = GASES.find(g => g.name === 'Nx 32')!;
        expect(nx32.switch_depth).toBeUndefined();
        expect(canSwitchTo(nx32, 40)).toBe(true);   // MOD 40 m
        expect(canSwitchTo(nx32, 41)).toBe(false);
    });

    it('switches to Tx 35/35 at 36 m on a deep trimix dive', () => {
        const res = planDive({ depth: 90, bottom_time: 25.5, bottom_gas: 'Tx 12/65', deco_gases: ['Tx 35/35', 'Tx 50/15', 'Oxygen'], gf_low: 40, gf_high: 70 });
        expect(res.schedule.find(s => s.depth === 36)?.gas).toBe('Tx 35/35');
        expect(res.schedule.find(s => s.depth === 39)?.gas).toBe('Tx 12/65');
    });
});
