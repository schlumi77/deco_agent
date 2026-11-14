import { describe, it, expect } from 'vitest';
import { planDive } from '../planner.js';
import { REFERENCE_DIVES } from './dives.js';
import { compareWithReference, summarisePlan, formatStops, type ReferenceResult } from './compare.js';

describe('Reference dives (external planner comparison)', () => {
    for (const dive of REFERENCE_DIVES) {
        if (dive.reference === null) {
            it.todo(`${dive.id}: paste reference results into shared/engine/reference/dives.ts`);
            continue;
        }
        const reference = dive.reference;
        it(`${dive.id} agrees with ${reference.source}`, () => {
            const ours = summarisePlan(planDive(dive.input));
            const problems = compareWithReference(ours, reference, dive.tolerance);
            const detail = [
                `${dive.description}`,
                ...problems.map(p => `  - ${p}`),
                `  ours:      ${formatStops(ours.stops)} | run time ${ours.run_time.toFixed(1)} min`,
                `  reference: ${formatStops(reference.stops)} | run time ${reference.run_time} min`,
                ...(reference.notes ? [`  notes: ${reference.notes}`] : []),
            ].join('\n');
            expect(problems, detail).toEqual([]);
        });
    }
});

describe('Reference harness', () => {
    // Self-checks for the comparison, so a broken harness cannot pass silently.
    const dive = REFERENCE_DIVES.find(d => d.id === 'oc-50m-20min-air')!;
    const ours = summarisePlan(planDive(dive.input));
    const asReference = (overrides: Partial<ReferenceResult> = {}): ReferenceResult => ({
        source: 'self-check', first_stop: ours.first_stop, stops: ours.stops, run_time: ours.run_time, ...overrides,
    });

    it("plans every dive with its reference planner's conventions", () => {
        // gue() (OC dives) counts the descent in the bottom time; baltic()
        // (CCR dive) keeps the bottom time at depth. Both ascend at the
        // ascent rate all the way to the surface.
        const thirty = REFERENCE_DIVES.find(d => d.id === 'oc-30m-20min-air')!.input;
        expect(thirty.bottom_time).toBeCloseTo(20 - 30 / 20, 9);
        const ccr = REFERENCE_DIVES.find(d => d.id === 'ccr-60m-25min-tx1845-sp13')!.input;
        expect(ccr.bottom_time).toBe(25);
        for (const d of REFERENCE_DIVES) expect(d.input.final_ascent_rate, d.id).toBe(10);
    });

    it('defines unique ids and valid inputs for every dive', () => {
        expect(new Set(REFERENCE_DIVES.map(d => d.id)).size).toBe(REFERENCE_DIVES.length);
        for (const d of REFERENCE_DIVES) expect(() => planDive(d.input), d.id).not.toThrow();
    });

    it('summarises a plan as first stop, stops and run time at surfacing', () => {
        const plan = planDive(dive.input);
        expect(ours.first_stop).toBe(plan.schedule[1].depth);
        expect(ours.stops).toHaveLength(plan.schedule.length - 1);
        expect(ours.run_time).toBe(plan.profile[plan.profile.length - 1].time);
        expect(ours.run_time).toBeGreaterThan(plan.schedule[plan.schedule.length - 1].run_time - 1);
    });

    it('accepts a plan that matches the reference', () => {
        expect(compareWithReference(ours, asReference())).toEqual([]);
    });

    it('accepts differences inside the tolerance', () => {
        expect(compareWithReference(ours, asReference({ first_stop: ours.first_stop + 3, run_time: ours.run_time + 3 }))).toEqual([]);
    });

    it('rejects a first stop more than one stop away', () => {
        const problems = compareWithReference(ours, asReference({ first_stop: ours.first_stop + 6 }));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/^first stop/);
    });

    it('allows 10% of the reference run time on long dives', () => {
        const summary = { first_stop: 18, stops: [], run_time: 100 };
        const ref = (run_time: number) => asReference({ first_stop: 18, run_time });
        expect(compareWithReference(summary, ref(109))).toEqual([]);   // 10.9 min allowed
        const problems = compareWithReference(summary, ref(112));      // 11.2 min allowed, 12 off
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/^run time/);
    });

    it('allows at least 3 min on short dives', () => {
        const summary = { first_stop: 6, stops: [], run_time: 20 };
        const ref = (run_time: number) => asReference({ first_stop: 6, run_time });
        expect(compareWithReference(summary, ref(22.5))).toEqual([]);  // 10% would be 2.25 min
        expect(compareWithReference(summary, ref(23.5))).toHaveLength(1);
    });

    it('applies per-dive tolerances', () => {
        expect(compareWithReference(ours, asReference({ first_stop: ours.first_stop + 6 }), { first_stop_m: 6 })).toEqual([]);
    });
});
