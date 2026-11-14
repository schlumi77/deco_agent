import type { DivePlanInput } from '../../types.js';
import { PLAN_DEFAULTS } from '../../config.js';
import type { ReferenceDive, ReferenceResult } from './compare.js';

// Reference dives for checking this planner against an external one
// (Subsurface, MultiDeco, ...). See README.md in this folder for the planner
// settings to use and how to fill in `reference`.
//
// Each dive takes the external planner's result as an optional last argument.
// Without it the dive is reported as a todo and not compared, e.g.
//
//     dive('oc-50m-20min-air', '...', { ...input }, {
//         source: 'Subsurface 6.0.5123, 2026-11-20',
//         first_stop: 18,
//         stops: [{ depth: 18, time: 2 }, { depth: 15, time: 2 }, ...],
//         run_time: 55,
//     }),

const STANDARD_DECO = ['Tx 50/15', 'Oxygen'];

// GUE Deco Planner conventions, shared by Baltic 1.0.2 (the CCR reference):
// - its bottom time includes the descent, while this planner's starts on
//   arrival at depth, so the descent is subtracted here;
// - it ascends at the ascent rate all the way to the surface, without this
//   planner's default of 1 m/min over the last 10 m.
// The dive ids and descriptions keep GUE's bottom time, which is what to
// enter in GUE Deco Planner.
const gue = (input: DivePlanInput): DivePlanInput => {
    const descentRate = input.descent_rate ?? PLAN_DEFAULTS.descent_rate;
    return {
        ...input,
        bottom_time: input.bottom_time - input.depth / descentRate,
        final_ascent_rate: input.ascent_rate ?? PLAN_DEFAULTS.ascent_rate,
    };
};

const dive = (
    id: string,
    description: string,
    input: DivePlanInput,
    reference: ReferenceResult | null = null,
): ReferenceDive => ({ id, description, input, reference });

export const REFERENCE_DIVES: ReferenceDive[] = [
    dive('oc-30m-20min-air', 'OC, 30 m for 20 min on air, oxygen as the only deco gas',
        gue({ depth: 30, bottom_time: 20, bottom_gas: 'Air', deco_gases: ['Oxygen'] }),
        {
            source: 'GUE Deco Planner 3.1.4',
            first_stop: 9,
            stops: [{ depth: 9, time: 1 }, { depth: 6, time: 2 }],
            run_time: 26,
            notes: 'GUE does not apply the 1 m/min final ascent and counts the descent in the bottom time; planned here with gue() to match',
        }),

    dive('oc-45m-20min-tx2135', 'OC, 45 m for 20 min on Tx 21/35, Tx 50/15 as the only deco gas',
        gue({ depth: 45, bottom_time: 20, bottom_gas: 'Tx 21/35', deco_gases: ['Tx 50/15'] }),
        {
            source: 'GUE Deco Planner 3.1.4',
            first_stop: 21,
            stops: [{ depth: 21, time: 1 }, { depth: 12, time: 1 }, { depth: 9, time: 2 }, { depth: 6, time: 15 }],
            run_time: 43,
            notes: 'GUE does not apply the 1 m/min final ascent and counts the descent in the bottom time; planned here with gue() to match',
        }),

    dive('oc-50m-20min-air', 'OC, 50 m for 20 min on air, Tx 50/15 as the only deco gas',
        gue({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: ['Tx 50/15'] }),
        {
            source: 'GUE Deco Planner 3.1.4',
            first_stop: 21,
            stops: [{ depth: 21, time: 1 }, { depth: 12, time: 3 }, { depth: 9, time: 3 }, { depth: 6, time: 18 }],
            run_time: 50,
            notes: 'GUE does not apply the 1 m/min final ascent and counts the descent in the bottom time; planned here with gue() to match',
        }),

    dive('oc-50m-20min-air-3m-last-stop', 'OC, 50 m for 20 min on air, Tx 50/15 as the only deco gas, last stop at 3 m',
        gue({ depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: ['Tx 50/15'], force_6m: false }),
        {
            source: 'GUE Deco Planner 3.1.4',
            first_stop: 21,
            stops: [{ depth: 21, time: 1 }, { depth: 12, time: 3 }, { depth: 9, time: 3 }, { depth: 6, time: 6 }, { depth: 3, time: 10 }],
            run_time: 47,
            notes: 'GUE does not apply the 1 m/min final ascent and counts the descent in the bottom time; planned here with gue() to match',
        }),

    dive('oc-60m-25min-tx1845-gf3070', 'OC, 60 m for 25 min on Tx 18/45, GF 30/70',
        gue({ depth: 60, bottom_time: 25, bottom_gas: 'Tx 18/45', deco_gases: STANDARD_DECO, gf_low: 30, gf_high: 70 }),
        {
            source: 'GUE Deco Planner 3.1.4',
            first_stop: 30,
            stops: [{ depth: 30, time: 1 }, { depth: 27, time: 3 }, { depth: 24, time: 2 }, { depth: 21, time: 2 }, { depth: 18, time: 3 }, { depth: 15, time: 3 }, { depth: 12, time: 5 }, { depth: 9, time: 9 }, { depth: 6, time: 27 }],
            run_time: 84,
            notes: 'GUE does not apply the 1 m/min final ascent and counts the descent in the bottom time; planned here with gue() to match',
        }),

    dive('oc-90m-30min-tx1265-gf4070', 'OC, 90 m for 30 min on Tx 12/65 with Tx 35/35, GF 40/70',
        gue({ depth: 90, bottom_time: 30, bottom_gas: 'Tx 12/65', deco_gases: ['Tx 35/35', ...STANDARD_DECO], gf_low: 40, gf_high: 70 }),
        {
            source: 'GUE Deco Planner 3.1.4',
            first_stop: 54,
            stops: [{ depth: 54, time: 1 }, { depth: 51, time: 1 }, { depth: 48, time: 2 }, { depth: 45, time: 3 }, { depth: 42, time: 3 }, { depth: 39, time: 3 }, { depth: 36, time: 3 }, { depth: 33, time: 3 }, { depth: 30, time: 3 }, { depth: 27, time: 4 }, { depth: 24, time: 6 }, { depth: 21, time: 6 }, { depth: 18, time: 8 }, { depth: 15, time: 11 }, { depth: 12, time: 15 }, { depth: 9, time: 25 }, { depth: 6, time: 80 }],
            run_time: 212,
            notes: 'GUE does not apply the 1 m/min final ascent and counts the descent in the bottom time; planned here with gue() to match',
        }),

    dive('ccr-60m-25min-tx1845-sp13', 'CCR, 60 m for 25 min, Tx 18/45 diluent, constant setpoint 1.3, no deco gases',
        gue({ depth: 60, bottom_time: 25, bottom_gas: 'Tx 18/45', deco_gases: [], is_ccr: true, setpoint: 1.3, deco_setpoint: 1.3 }),
        {
            source: 'Baltic 1.0.2',
            first_stop: 27,
            stops: [{ depth: 27, time: 1 }, { depth: 24, time: 1 }, { depth: 21, time: 2 }, { depth: 18, time: 2 }, { depth: 15, time: 3 }, { depth: 12, time: 5 }, { depth: 9, time: 6 }, { depth: 6, time: 28 }],
            run_time: 76,
            notes: 'Baltic shows 25 min when leaving 60 m and ascends at 10 m/min, the same conventions as GUE; planned here with gue() to match',
        }),
];
