import type { DivePlanInput } from '../../types.js';
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

const dive = (
    id: string,
    description: string,
    input: DivePlanInput,
    reference: ReferenceResult | null = null,
): ReferenceDive => ({ id, description, input, reference });

export const REFERENCE_DIVES: ReferenceDive[] = [
    dive('oc-30m-20min-air', 'OC, 30 m for 20 min on air, short deco',
        { depth: 30, bottom_time: 20, bottom_gas: 'Air', deco_gases: STANDARD_DECO }),

    dive('oc-45m-20min-tx2135', 'OC, 45 m for 20 min on Tx 21/35 (web app default)',
        { depth: 45, bottom_time: 20, bottom_gas: 'Tx 21/35', deco_gases: STANDARD_DECO }),

    dive('oc-50m-20min-air', 'OC, 50 m for 20 min on air (CLI example)',
        { depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: STANDARD_DECO }),

    dive('oc-50m-20min-air-3m-last-stop', 'OC, 50 m for 20 min on air, last stop at 3 m',
        { depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: STANDARD_DECO, force_6m: false }),

    dive('oc-60m-25min-tx1845-gf3070', 'OC, 60 m for 25 min on Tx 18/45, GF 30/70',
        { depth: 60, bottom_time: 25, bottom_gas: 'Tx 18/45', deco_gases: STANDARD_DECO, gf_low: 30, gf_high: 70 }),

    dive('oc-90m-30min-tx1265-gf4070', 'OC, 90 m for 30 min on Tx 12/65 with Tx 35/35, GF 40/70',
        { depth: 90, bottom_time: 30, bottom_gas: 'Tx 12/65', deco_gases: ['Tx 35/35', ...STANDARD_DECO], gf_low: 40, gf_high: 70 }),

    dive('ccr-60m-25min-tx1845-sp13', 'CCR, 60 m for 25 min, Tx 18/45 diluent, constant setpoint 1.3, no deco gases',
        { depth: 60, bottom_time: 25, bottom_gas: 'Tx 18/45', deco_gases: [], is_ccr: true, setpoint: 1.3, deco_setpoint: 1.3 }),
];
