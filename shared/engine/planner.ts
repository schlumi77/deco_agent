import { DecoEngine, calculateGasDensity, SURFACE_PRESSURE, GAS_LIMIT_SURFACE_PRESSURE, WATER_VAPOR_PRESSURE } from './deco_engine.js';
import type { ScheduleEntry, Gas, ProfileEntry, DivePlanResponse, DivePlanRequest, DivePlanInput, GasRequirements, CylinderCheck, CylinderKit } from '../types.js';
export type { Gas, DivePlanInput };
import { GASES, PLAN_DEFAULTS, CYLINDERS, OC_BOTTOM_CYLINDER_NAME } from '../config.js';
export { GASES, PLAN_DEFAULTS, CYLINDERS, OC_BOTTOM_CYLINDER_NAME };

// pO2 of a gas at a depth, by the gas-limit convention (see GAS_LIMIT_SURFACE_PRESSURE).
// Every gas limit goes through this or calculateMod/calculateMinOd so they agree.
export function gasLimitPo2(fo2: number, depth: number): number {
    return (GAS_LIMIT_SURFACE_PRESSURE + depth / 10) * fo2;
}

// Maximum pO2 for switching to a deco gas that has no listed switch depth.
export const DECO_GAS_MAX_PO2 = 1.6;

// Whether the ascent may switch to a deco gas at a depth: down to its listed
// switch depth, or down to its MOD for DECO_GAS_MAX_PO2 if it has none.
export function canSwitchTo(gas: Gas, depth: number): boolean {
    return gas.switch_depth !== undefined
        ? depth <= gas.switch_depth
        : gasLimitPo2(gas.fO2, depth) <= DECO_GAS_MAX_PO2;
}

export function calculateMod(fo2: number, maxPo2: number, surfacePressure = GAS_LIMIT_SURFACE_PRESSURE): number {
    if (fo2 <= 0) return Infinity;
    return (maxPo2 / fo2 - surfacePressure) * 10;
}

export function calculateMinOd(fo2: number, minPo2 = 0.16, surfacePressure = GAS_LIMIT_SURFACE_PRESSURE): number {
    if (fo2 <= 0) return Infinity;
    const depth = (minPo2 / fo2 - surfacePressure) * 10;
    return Math.max(0, depth);
}

export function calculateEnd(depth: number, fhe: number, surfacePressure = SURFACE_PRESSURE): number {
    const p_amb = surfacePressure + depth / 10.0;
    return (p_amb * (1 - fhe) - surfacePressure) * 10;
}

export function getCcrMix(depth: number, dil: Gas, sp: number, surfacePressure = SURFACE_PRESSURE): [number, number] {
    const p_amb = surfacePressure + depth / 10.0;
    const p_dry_total = p_amb - WATER_VAPOR_PRESSURE;
    const fo2_loop = Math.max(dil.fO2, sp / p_dry_total);
    const f_inert_total = 1.0 - fo2_loop;
    const f_inert_dil = 1.0 - dil.fO2;
    const fhe_loop = f_inert_dil > 0 ? f_inert_total * (dil.fHe / f_inert_dil) : 0.0;
    return [fo2_loop, fhe_loop];
}

// Depth from which the final ascent rate applies, up to the surface.
export const FINAL_ASCENT_DEPTH = 10.0;

// Minutes to ascend from d1 to d2: at ascentRate below FINAL_ASCENT_DEPTH and
// at finalAscentRate from there to the surface.
export function getTravelTime(d1: number, d2: number, ascentRate: number, finalAscentRate: number): number {
    if (d1 <= d2) return 0.0;
    if (d1 <= FINAL_ASCENT_DEPTH) return (d1 - d2) / finalAscentRate;
    if (d2 >= FINAL_ASCENT_DEPTH) return (d1 - d2) / ascentRate;
    return (d1 - FINAL_ASCENT_DEPTH) / ascentRate + (FINAL_ASCENT_DEPTH - d2) / finalAscentRate;
}

function requirePositive(value: number, label: string) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be a number greater than 0 (got ${value})`);
    }
}

// Minutes spent at a gas switch depth to change to the new gas, on open
// circuit, whether or not the ceiling requires a stop there.
export const GAS_SWITCH_STOP_TIME = 1;

class DivePlanner {
    private engine: DecoEngine;
    private totalTime = 0.0;
    private profile: ProfileEntry[] = [];
    private decoSchedule: [number, number, number, string, number, number][] = [];
    // Toxicity loading at the moment the bottom segment ends. Captured live,
    // because the tracker keeps accumulating through the ascent and would
    // otherwise report whole-dive totals on the bottom row.
    private bottomCns = 0.0;
    private bottomOtu = 0.0;
    private bottomGasDisplay = '';
    // Open-circuit gas breathed so far, per gas, in bar.min (see DivePlanResponse.gas_usage).
    private gasUsage: Record<string, number> = {};
    // Bailout plan: breathe the loop through descent and bottom time, then
    // switch to open circuit for the whole ascent.
    private bailout: boolean;
    private warnings: string[] = [];
    private currentGasName: string;
    // The gas breathed on the last segment, to detect gas switches.
    private breathingGas: Gas;
    private diluent: Gas;
    private decoCandidates: Gas[];
    // Listed deco gases left out because they carry no more oxygen than the bottom gas.
    private skippedDecoGases: string[];
    private effectiveDecoSetpoint: number;
    private effectiveDecoGasSetpoint: number;

    private surfacePressure: number;
    private depth: number;
    private bottomTime: number;
    private gfLow: number;
    private gfHigh: number;
    private isCcr: boolean;
    private setpoint: number;
    private descentRate: number;
    private ascentRate: number;
    private finalAscentRate: number;
    private force6m: boolean;

    constructor(request: DivePlanRequest, bailout = false) {
        this.bailout = bailout;
        const depth = request.depth;
        const bottomTime = request.bottom_time;
        const bottomGasName = request.bottom_gas;
        const decoGasNames = request.deco_gases;
        const isCcr = request.is_ccr;
        const setpoint = request.setpoint;
        const decoSetpoint = request.deco_setpoint;
        const decoGasSetpoint = request.deco_gas_setpoint;
        const descentRate = request.descent_rate;
        const ascentRate = request.ascent_rate;
        const force6m = request.force_6m;
        const model = request.model;

        // Reject bad input up front: a plan built on a typo is worse than no plan.
        requirePositive(depth, 'Depth');
        requirePositive(bottomTime, 'Bottom time');
        requirePositive(descentRate, 'Descent rate');
        requirePositive(ascentRate, 'Ascent rate');
        requirePositive(request.final_ascent_rate, 'Final ascent rate');
        requirePositive(request.gf_low, 'GF Low');
        requirePositive(request.gf_high, 'GF High');
        if (request.gf_high > 100) throw new Error(`GF High must not exceed 100% (got ${request.gf_high}%)`);
        if (request.gf_low > request.gf_high) {
            throw new Error(`GF Low (${request.gf_low}%) must not exceed GF High (${request.gf_high}%)`);
        }
        if (typeof model !== 'string' || !['B', 'C'].includes(model.toUpperCase())) {
            throw new Error(`Unknown model "${model}": use B or C`);
        }
        if (!Array.isArray(decoGasNames)) throw new Error('Deco gases must be a list of gas names');
        if (isCcr) {
            requirePositive(setpoint, 'Setpoint');
            requirePositive(decoSetpoint, 'Deco setpoint');
            requirePositive(decoGasSetpoint, 'Deco gas setpoint');
        }

        // The request carries gradient factors as percentages; the model uses fractions.
        const gfLow = request.gf_low / 100;
        const gfHigh = request.gf_high / 100;

        this.depth = depth;
        this.bottomTime = bottomTime;
        this.gfLow = gfLow;
        this.gfHigh = gfHigh;
        this.isCcr = isCcr;
        this.setpoint = setpoint;
        this.descentRate = descentRate;
        this.ascentRate = ascentRate;
        this.finalAscentRate = request.final_ascent_rate;
        this.force6m = force6m;

        this.effectiveDecoSetpoint = decoSetpoint;
        this.effectiveDecoGasSetpoint = decoGasSetpoint;
        this.engine = new DecoEngine(SURFACE_PRESSURE, model);
        this.surfacePressure = this.engine.surface_pressure;

        const gasesMap = new Map<string, Gas>(GASES.map(g => [g.name, g]));
        const dil = gasesMap.get(bottomGasName);
        if (!dil) throw new Error(`Unknown bottom gas "${bottomGasName}"`);
        this.diluent = dil;

        const listedDecoGases = decoGasNames.map(name => {
            const gas = gasesMap.get(name);
            if (!gas) throw new Error(`Unknown deco gas "${name}"`);
            return gas;
        });
        // Switching only helps if the deco gas carries more oxygen than the
        // bottom gas. A leaner one, such as a travel mix, would load the diver
        // with more inert gas on the ascent, so it is left out and reported.
        this.decoCandidates = listedDecoGases
            .filter(g => g.fO2 > dil.fO2)
            .sort((a, b) => b.fO2 - a.fO2);
        this.skippedDecoGases = listedDecoGases
            .filter(g => g.fO2 <= dil.fO2)
            .map(g => g.name);

        this.currentGasName = this.getGasStable(this.diluent, isCcr ? setpoint : null);
        this.breathingGas = this.diluent;
    }

    private getGasStable(dil: Gas, sp: number | null): string {
        if (!this.isCcr || sp === null) return dil.name;
        const prefix = dil.name === this.diluent.name ? "CCR" : `CCR ${dil.name}`;
        return `${prefix} SP ${sp}`;
    }

    private getGasDisplay(d: number, dil: Gas, sp: number | null): string {
        if (!this.isCcr || sp === null) return dil.name;
        const [fo2, fhe] = getCcrMix(d, dil, sp, this.surfacePressure);
        const prefix = dil.name === this.diluent.name ? "CCR" : `CCR ${dil.name}`;
        return `${prefix} SP ${sp} [${Math.round(fo2 * 100)}/${Math.round(fhe * 100)}]`;
    }

    private getDisplayDepth(d: number): number {
        const firstStop = Math.floor(this.depth / 3) * 3;
        const q = Math.ceil(Math.round(d * 100) / 100 / 3) * 3;
        return q > firstStop ? this.depth : q;
    }

    private runInitialChecks() {
        for (const name of this.skippedDecoGases) {
            this.warnings.push(`Deco gas ${name} not used: it carries no more oxygen than the bottom gas ${this.diluent.name}`);
        }
        if (this.isCcr) {
            if (this.setpoint > 1.4) this.warnings.push(`Bottom setpoint pO2 too high: ${this.setpoint.toFixed(2)} bar`);
            if (this.effectiveDecoSetpoint > 1.4) this.warnings.push(`Deco setpoint pO2 too high: ${this.effectiveDecoSetpoint.toFixed(2)} bar`);
            if (this.effectiveDecoGasSetpoint > 1.5) this.warnings.push(`Deco gas setpoint pO2 too high: ${this.effectiveDecoGasSetpoint.toFixed(2)} bar`);
            const p_amb_bottom = this.surfacePressure + this.depth / 10.0;
            const dil_po2_bottom = (p_amb_bottom - WATER_VAPOR_PRESSURE) * this.diluent.fO2;
            if (dil_po2_bottom > this.setpoint) {
                this.warnings.push(`Diluent pO2 too high at bottom: ${dil_po2_bottom.toFixed(2)} bar (Exceeds setpoint ${this.setpoint.toFixed(2)} bar)`);
            } else if (dil_po2_bottom > 1.4) {
                this.warnings.push(`Diluent pO2 too high at bottom: ${dil_po2_bottom.toFixed(2)} bar (Max 1.4 bar)`);
            }
        } else {
            this.checkOpenCircuitBottomGas();
        }
    }

    // Limits for breathing the bottom gas (or, on bailout, the diluent) on
    // open circuit at the deepest point.
    private checkOpenCircuitBottomGas() {
        const density = calculateGasDensity(this.diluent.fO2, this.diluent.fHe, this.depth);
        if (density > 6.2) this.warnings.push(`Bottom gas density too high: ${density.toFixed(1)} g/L`);
        const end = calculateEnd(this.depth, this.diluent.fHe);
        if (end > 30) this.warnings.push(`Bottom gas END too deep: ${end.toFixed(0)}m`);
        const po2 = gasLimitPo2(this.diluent.fO2, this.depth);
        if (po2 > 1.4) this.warnings.push(`Bottom gas pO2 too high: ${po2.toFixed(2)} bar`);
    }

    // Loads the tissues for one segment and, on open circuit, records the gas
    // breathed against the gas currently in use.
    private breathe(depthStart: number, depthEnd: number, time: number, fo2: number, fhe: number) {
        this.engine.updateTissues(depthStart, depthEnd, time, fo2, fhe);
        if (!this.isCcr && time > 0) {
            const avgPressure = this.surfacePressure + (depthStart + depthEnd) / 20.0;
            this.gasUsage[this.currentGasName] = (this.gasUsage[this.currentGasName] ?? 0) + avgPressure * time;
        }
    }

    private descend() {
        let currentD = 0.0;
        this.profile.push({ time: 0.0, depth: 0.0, gas: this.currentGasName });
        while (currentD < this.depth) {
            const nextD = Math.min(this.depth, currentD + 3.0);
            const segmentTime = (nextD - currentD) / this.descentRate;
            const [fo2, fhe] = this.isCcr ? getCcrMix((currentD + nextD) / 2, this.diluent, this.setpoint, this.surfacePressure) : [this.diluent.fO2, this.diluent.fHe];
            this.breathe(currentD, nextD, segmentTime, fo2, fhe);
            this.totalTime += segmentTime;
            currentD = nextD;
            this.profile.push({ time: this.totalTime, depth: currentD, gas: this.currentGasName });
        }
    }

    private stayAtBottom() {
        const [bfo2, bfhe] = this.isCcr ? getCcrMix(this.depth, this.diluent, this.setpoint, this.surfacePressure) : [this.diluent.fO2, this.diluent.fHe];
        this.breathe(this.depth, this.depth, this.bottomTime, bfo2, bfhe);
        this.totalTime += this.bottomTime;
        this.profile.push({ time: this.totalTime, depth: this.depth, gas: this.currentGasName });
        this.bottomCns = this.engine.toxicity_tracker.cns_percent;
        this.bottomOtu = this.engine.toxicity_tracker.otus;
        this.bottomGasDisplay = this.getGasDisplay(this.depth, this.diluent, this.isCcr ? this.setpoint : null);
    }

    private getBestGas(d: number): { gas: Gas; setpoint: number | null } {
        for (const g of this.decoCandidates) {
            if (canSwitchTo(g, d)) {
                return { 
                    gas: g, 
                    setpoint: this.isCcr ? this.effectiveDecoGasSetpoint : null 
                };
            }
        }
        return { 
            gas: this.diluent, 
            setpoint: this.isCcr ? (d === this.depth ? this.setpoint : this.effectiveDecoSetpoint) : null 
        };
    }

    private updateGas(depth: number, isTravel = false, nextDepth?: number): [number, number] {
        const { gas, setpoint } = this.getBestGas(depth);
        this.currentGasName = this.getGasStable(gas, setpoint);
        this.breathingGas = gas;

        if (this.isCcr && setpoint !== null) {
            const d = isTravel && nextDepth !== undefined ? (depth + nextDepth) / 2 : depth;
            return getCcrMix(d, gas, setpoint, this.surfacePressure);
        }
        return [gas.fO2, gas.fHe];
    }

    private ascend() {
        let currentDepth = this.depth;
        let stuckCounter = 0;
        const floor = this.force6m ? 6.0 : 3.0;
        // Depth of the first required stop. GF Low governs the ascent until
        // that stop is found; from there the GF rises linearly to GF High at
        // the surface.
        let firstStopDepth: number | null = null;
        // Minutes still owed for a gas switch at the current depth.
        let switchTimeLeft = 0;

        while (currentDepth > 0) {
            stuckCounter++;
            if (stuckCounter > 5000) {
                this.warnings.push("Deco stuck: Infinite loop detected");
                break;
            }

            const gfAtDepth = firstStopDepth === null
                ? this.gfLow
                : this.gfHigh - (this.gfHigh - this.gfLow) * (currentDepth / firstStopDepth);
            const ceiling = this.engine.getCeiling(gfAtDepth);

            let nextStop;
            if (currentDepth > floor) {
                nextStop = Math.max(floor, currentDepth - 3.0);
                if (currentDepth % 3 !== 0) {
                    nextStop = Math.floor(currentDepth / 3.0) * 3.0;
                    if (nextStop < floor) nextStop = floor;
                }
            } else {
                nextStop = 0.0;
            }

            // On open circuit, reaching a stop where a richer deco gas becomes
            // usable starts a gas switch stop. At the bottom the diver switches
            // on leaving instead. The CCR loop changes diluent without a stop.
            if (!this.isCcr && currentDepth < this.depth && this.getBestGas(currentDepth).gas !== this.breathingGas) {
                switchTimeLeft = GAS_SWITCH_STOP_TIME;
            }
            const switchStop = switchTimeLeft > 0;

            if (currentDepth <= floor && !switchStop && this.engine.getCeiling(this.gfHigh) <= 0) {
                this.finalAscent(currentDepth);
                break;
            }

            if (ceiling <= nextStop && !switchStop) {
                const tTime = getTravelTime(currentDepth, nextStop, this.ascentRate, this.finalAscentRate);
                const [fo2, fhe] = this.updateGas(currentDepth, true, nextStop);
                
                this.breathe(currentDepth, nextStop, tTime, fo2, fhe);
                this.totalTime += tTime;
                currentDepth = nextStop;
                this.profile.push({ time: this.totalTime, depth: this.getDisplayDepth(currentDepth), gas: this.currentGasName });
                stuckCounter = 0;
            } else {
                // GF Low stays anchored at the first stop the ceiling requires;
                // a gas switch stop does not move it.
                if (firstStopDepth === null && ceiling > nextStop) firstStopDepth = currentDepth;
                if (switchStop) switchTimeLeft -= 1;
                const [fo2, fhe] = this.updateGas(currentDepth);
                const { gas, setpoint } = this.getBestGas(currentDepth);

                this.breathe(currentDepth, currentDepth, 1.0, fo2, fhe);
                this.totalTime += 1.0;
                this.profile.push({ time: this.totalTime, depth: this.getDisplayDepth(currentDepth), gas: this.currentGasName });
                this.decoSchedule.push([
                    this.getDisplayDepth(currentDepth), 
                    1.0, 
                    this.totalTime, 
                    this.getGasDisplay(currentDepth, gas, setpoint), 
                    this.engine.toxicity_tracker.cns_percent, 
                    this.engine.toxicity_tracker.otus
                ]);
            }
        }
    }

    private finalAscent(depth: number) {
        let currentDepth = depth;
        while (currentDepth > 0) {
            const nextD = Math.max(0, currentDepth - 3);
            const tTime = getTravelTime(currentDepth, nextD, this.ascentRate, this.finalAscentRate);
            const [fo2, fhe] = this.updateGas(currentDepth, true, nextD);

            this.breathe(currentDepth, nextD, tTime, fo2, fhe);
            this.totalTime += tTime;
            currentDepth = nextD;
            this.profile.push({ time: this.totalTime, depth: this.getDisplayDepth(currentDepth), gas: this.currentGasName });
        }
    }

    private generateResult(): DivePlanResponse {
        const finalSchedule: ScheduleEntry[] = [];
        finalSchedule.push({
            depth: this.depth,
            time: this.bottomTime,
            run_time: Math.round(this.depth / this.descentRate + this.bottomTime),
            gas: this.bottomGasDisplay,
            cns: this.bottomCns,
            otu: this.bottomOtu
        });

        if (this.decoSchedule.length > 0) {
            let [currD, totalStopT, currRT, currG, currC, currO] = this.decoSchedule[0];
            for (let i = 1; i < this.decoSchedule.length; i++) {
                const [d, t, rt, g, c, o] = this.decoSchedule[i];
                if (d === currD && g === currG) {
                    totalStopT += t;
                    currRT = rt;
                    currC = c; currO = o;
                } else {
                    finalSchedule.push({ depth: currD, time: totalStopT, run_time: Math.round(currRT), gas: currG, cns: currC, otu: currO });
                    [currD, totalStopT, currRT, currG, currC, currO] = [d, t, rt, g, c, o];
                }
            }
            finalSchedule.push({ depth: currD, time: totalStopT, run_time: Math.round(currRT), gas: currG, cns: currC, otu: currO });
        }

        const tissueLoads = this.engine.getTissueLoads();
        const surfaceGf = this.engine.getSurfaceGf();
        if (surfaceGf > 100) this.warnings.push(`Surfacing above the M-value: surface GF ${surfaceGf.toFixed(1)}%`);

        return {
            schedule: finalSchedule,
            profile: this.profile,
            tissue_loads: tissueLoads,
            surface_gf: surfaceGf,
            warnings: this.warnings,
            cns_percent: this.engine.toxicity_tracker.cns_percent,
            otus: this.engine.toxicity_tracker.otus,
            gas_usage: this.gasUsage
        };
    }

    public plan(): DivePlanResponse {
        // The loop checks belong to the CCR plan itself; the bailout plan only
        // reports what changes once the diver is on open circuit.
        if (!this.bailout) this.runInitialChecks();
        this.descend();
        this.stayAtBottom();
        if (this.bailout) {
            this.isCcr = false;
            this.checkOpenCircuitBottomGas();
        }
        this.ascend();
        return this.generateResult();
    }
}

function toRequest(input: DivePlanInput): DivePlanRequest {
    const setpoint = input.setpoint ?? PLAN_DEFAULTS.setpoint;
    return {
        ...PLAN_DEFAULTS,
        ...input,
        setpoint,
        deco_setpoint: input.deco_setpoint ?? setpoint,
        cylinders: { ...PLAN_DEFAULTS.cylinders, ...input.cylinders },
    };
}

// Plans a dive. Only depth, bottom_time and bottom_gas are required; every
// other field falls back to PLAN_DEFAULTS. Gradient factors are percentages.
export function planDive(input: DivePlanInput): DivePlanResponse {
    return new DivePlanner(toRequest(input)).plan();
}

// Plans the open-circuit bailout for a CCR dive. The loop is breathed through
// descent and bottom time; the diver then bails out at the deepest point, at
// the end of the bottom time (the worst case), and makes the whole ascent on
// open circuit: the diluent first, then the deco gases as their MODs allow.
// Warnings are prefixed with "Bailout: ".
export function planBailout(input: DivePlanInput): DivePlanResponse {
    const request = toRequest(input);
    if (!request.is_ccr) throw new Error('Bailout planning applies to CCR dives only');
    const plan = new DivePlanner(request, true).plan();
    return { ...plan, warnings: plan.warnings.map(w => `Bailout: ${w}`) };
}

// Reserve factor applied to all open-circuit gas requirements.
export const GAS_RESERVE_FACTOR = 1.5;

// Gas to carry for a planned dive, in litres, checked against the cylinder
// kit. On an OC dive the open-circuit requirement is the dive's own gas; on a
// CCR dive it is the gas for the bailout ascent (computed with planBailout()
// unless passed in), and the onboard oxygen and diluent are estimated from the
// run time. The breathing rate, oxygen use and cylinders come from the input,
// falling back to PLAN_DEFAULTS.
export function calculateGasRequirements(
    input: DivePlanInput,
    plan: DivePlanResponse,
    bailoutPlan: DivePlanResponse | null = null
): GasRequirements {
    const request = toRequest(input);
    requirePositive(request.sac_rate, 'SAC rate');
    if (request.is_ccr) requirePositive(request.o2_consumption, 'Oxygen consumption');
    for (const role of Object.keys(CYLINDERS) as (keyof CylinderKit)[]) {
        const cyl = request.cylinders[role];
        requirePositive(cyl?.volume, `${CYLINDERS[role].name} cylinder volume`);
        requirePositive(cyl?.pressure, `${CYLINDERS[role].name} cylinder pressure`);
    }

    const ocPlan = request.is_ccr ? (bailoutPlan ?? planBailout(request)) : plan;

    const open_circuit: Record<string, number> = {};
    for (const [gas, barMinutes] of Object.entries(ocPlan.gas_usage)) {
        open_circuit[gas] = barMinutes * request.sac_rate * GAS_RESERVE_FACTOR;
    }

    const onboard: Record<string, number> = {};
    if (request.is_ccr) {
        const runTime = plan.profile.length > 0 ? plan.profile[plan.profile.length - 1].time : 0;
        onboard["Onboard Oxygen"] = runTime * request.o2_consumption;
        onboard["Onboard Diluent"] = 5.0 * (request.depth / 10.0) + 20.0;
    }

    // Free gas a cylinder holds at its fill pressure (ideal gas).
    const capacity = (role: keyof CylinderKit) =>
        request.cylinders[role].volume * request.cylinders[role].pressure;
    const cylinders: CylinderCheck[] = [];
    const bottomGas = request.bottom_gas;

    // On CCR the diluent cylinder feeds both the loop and the bailout on diluent.
    const bottomSupplies: string[] = [];
    let bottomRequired = 0;
    if (open_circuit[bottomGas] !== undefined) {
        bottomSupplies.push(request.is_ccr ? `${bottomGas} (bailout)` : bottomGas);
        bottomRequired += open_circuit[bottomGas];
    }
    if (request.is_ccr) {
        bottomSupplies.push(`${bottomGas} (onboard diluent)`);
        bottomRequired += onboard["Onboard Diluent"];
    }
    const bottomName = request.is_ccr ? CYLINDERS.bottom.name : OC_BOTTOM_CYLINDER_NAME;
    cylinders.push({ cylinder: bottomName, supplies: bottomSupplies, required: bottomRequired, available: capacity('bottom') });

    for (const [gas, required] of Object.entries(open_circuit)) {
        if (gas === bottomGas) continue;
        cylinders.push({ cylinder: CYLINDERS.stage.name, supplies: [gas], required, available: capacity('stage') });
    }

    if (request.is_ccr) {
        cylinders.push({ cylinder: CYLINDERS.oxygen.name, supplies: ['Onboard oxygen'], required: onboard["Onboard Oxygen"], available: capacity('oxygen') });
    }

    const warnings = cylinders
        .filter(c => c.required > c.available)
        .map(c => `Not enough gas in ${c.cylinder} cylinder for ${c.supplies.join(' + ')}: needs ${Math.ceil(c.required)} L, holds ${Math.floor(c.available)} L`);

    return { open_circuit, onboard, cylinders, warnings };
}
