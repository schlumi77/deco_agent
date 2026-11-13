// Prints every reference dive with this planner's result, ready to plan the
// same dives in an external planner. Run with `npm run reference`.
import { planDive } from '../planner.js';
import { PLAN_DEFAULTS } from '../../config.js';
import { REFERENCE_DIVES } from './dives.js';
import { compareWithReference, summarisePlan, formatStops } from './compare.js';

let compared = 0;
let failing = 0;

for (const dive of REFERENCE_DIVES) {
    const input = { ...PLAN_DEFAULTS, ...dive.input };
    const ours = summarisePlan(planDive(dive.input));
    const mode = input.is_ccr
        ? `CCR, setpoint ${input.setpoint} (deco ${input.deco_setpoint ?? input.setpoint}, deco gases ${input.deco_gas_setpoint})`
        : 'OC';

    console.log(`\n${dive.id}: ${dive.description}`);
    console.log(`  plan:      ${input.depth} m, ${input.bottom_time} min bottom time (descent not included), ${input.bottom_gas}, ${mode}`);
    console.log(`             deco gases: ${input.deco_gases.length > 0 ? input.deco_gases.join(', ') : 'none'}`);
    console.log(`             ZHL-16${input.model}, GF ${input.gf_low}/${input.gf_high}, descent ${input.descent_rate} m/min, ascent ${input.ascent_rate} m/min, last stop ${input.force_6m ? 6 : 3} m`);
    console.log(`  ours:      first stop ${ours.first_stop} m | ${formatStops(ours.stops)} | run time ${ours.run_time.toFixed(1)} min`);

    if (dive.reference === null) {
        console.log('  reference: not entered yet');
        continue;
    }
    compared++;
    const problems = compareWithReference(ours, dive.reference, dive.tolerance);
    if (problems.length > 0) failing++;
    console.log(`  reference: first stop ${dive.reference.first_stop} m | ${formatStops(dive.reference.stops)} | run time ${dive.reference.run_time} min (${dive.reference.source})`);
    console.log(`  result:    ${problems.length === 0 ? 'agrees' : problems.join('; ')}`);
}

console.log(`\n${REFERENCE_DIVES.length} reference dives, ${compared} with reference results, ${failing} outside tolerance.`);
