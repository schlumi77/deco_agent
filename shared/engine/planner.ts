import { DecoEngine, calculateGasDensity } from './deco_engine.js';
import type { ScheduleEntry, Gas, ProfileEntry, DivePlanResponse } from '../types.js';
export type { Gas };
import { GASES } from '../config.js';
export { GASES };

export function calculateMod(fo2: number, maxPo2: number): number {
    if (fo2 <= 0) return Infinity;
    return (maxPo2 / fo2 - 1) * 10;
}

export function calculateMinOd(fo2: number, minPo2 = 0.16): number {
    if (fo2 <= 0) return Infinity;
    const depth = (minPo2 / fo2 - 1) * 10;
    return Math.max(0, depth);
}

export function calculateEnd(depth: number, fhe: number): number {
    return (depth + 10) * (1 - fhe) - 10;
}

export function getCcrMix(depth: number, dil: Gas, sp: number): [number, number] {
    const p_amb = 1.0 + depth / 10.0;
    const p_h2o = 0.0627;
    const p_dry_total = p_amb - p_h2o;
    const fo2_loop = Math.max(dil.fO2, sp / p_dry_total);
    const f_inert_total = 1.0 - fo2_loop;
    const f_inert_dil = 1.0 - dil.fO2;
    const fhe_loop = f_inert_dil > 0 ? f_inert_total * (dil.fHe / f_inert_dil) : 0.0;
    return [fo2_loop, fhe_loop];
}

export function getTravelTime(d1: number, d2: number, asc_rate: number): number {
    if (d1 <= d2) return 0.0;
    if (d1 <= 10.0) return (d1 - d2) / 1.0;
    if (d2 >= 10.0) return (d1 - d2) / asc_rate;
    return (d1 - 10.0) / asc_rate + (10.0 - d2) / 1.0;
}

class DivePlanner {
    private engine: DecoEngine;
    private totalTime = 0.0;
    private profile: ProfileEntry[] = [];
    private decoSchedule: [number, number, number, string, number, number][] = [];
    private warnings: string[] = [];
    private currentGasName: string;
    private diluent: Gas;
    private decoCandidates: Gas[];
    private effectiveDecoSetpoint: number;
    private effectiveDecoGasSetpoint: number;

    constructor(
        private depth: number,
        private bottomTime: number,
        private bottomGasName: string,
        private decoGasNames: string[],
        private gfLow: number,
        private gfHigh: number,
        private isCcr: boolean,
        private setpoint: number,
        decoSetpoint: number | null,
        decoGasSetpoint: number | null,
        private descentRate: number,
        private ascentRate: number,
        private force6m: boolean,
        model: string
    ) {
        this.effectiveDecoSetpoint = decoSetpoint ?? setpoint;
        this.effectiveDecoGasSetpoint = decoGasSetpoint ?? 1.4;
        this.engine = new DecoEngine(1.013, model);
        
        const gasesMap = new Map<string, Gas>(GASES.map(g => [g.name, g]));
        const dil = gasesMap.get(bottomGasName);
        if (!dil) throw new Error(`Gas ${bottomGasName} not found`);
        this.diluent = dil;

        this.decoCandidates = decoGasNames
            .map(name => gasesMap.get(name))
            .filter((g): g is Gas => !!g)
            .sort((a, b) => b.fO2 - a.fO2);

        this.currentGasName = this.getGasStable(this.diluent, isCcr ? setpoint : null);
    }

    private getGasStable(dil: Gas, sp: number | null): string {
        if (!this.isCcr || sp === null) return dil.name;
        const prefix = dil.name === this.diluent.name ? "CCR" : `CCR ${dil.name}`;
        return `${prefix} SP ${sp}`;
    }

    private getGasDisplay(d: number, dil: Gas, sp: number | null): string {
        if (!this.isCcr || sp === null) return dil.name;
        const [fo2, fhe] = getCcrMix(d, dil, sp);
        const prefix = dil.name === this.diluent.name ? "CCR" : `CCR ${dil.name}`;
        return `${prefix} SP ${sp} [${Math.round(fo2 * 100)}/${Math.round(fhe * 100)}]`;
    }

    private getDisplayDepth(d: number): number {
        const firstStop = Math.floor(this.depth / 3) * 3;
        const q = Math.ceil(Math.round(d * 100) / 100 / 3) * 3;
        return q > firstStop ? this.depth : q;
    }

    private runInitialChecks() {
        if (this.isCcr) {
            if (this.setpoint > 1.4) this.warnings.push(`Bottom setpoint pO2 too high: ${this.setpoint.toFixed(2)} bar`);
            if (this.effectiveDecoSetpoint > 1.4) this.warnings.push(`Deco setpoint pO2 too high: ${this.effectiveDecoSetpoint.toFixed(2)} bar`);
            if (this.effectiveDecoGasSetpoint > 1.5) this.warnings.push(`Deco gas setpoint pO2 too high: ${this.effectiveDecoGasSetpoint.toFixed(2)} bar`);
            const p_amb_bottom = 1.0 + this.depth / 10.0;
            const dil_po2_bottom = (p_amb_bottom - 0.0627) * this.diluent.fO2;
            if (dil_po2_bottom > this.setpoint) {
                this.warnings.push(`Diluent pO2 too high at bottom: ${dil_po2_bottom.toFixed(2)} bar (Exceeds setpoint ${this.setpoint.toFixed(2)} bar)`);
            } else if (dil_po2_bottom > 1.4) {
                this.warnings.push(`Diluent pO2 too high at bottom: ${dil_po2_bottom.toFixed(2)} bar (Max 1.4 bar)`);
            }
        } else {
            const density = calculateGasDensity(this.diluent.fO2, this.diluent.fHe, this.depth);
            if (density > 6.2) this.warnings.push(`Bottom gas density too high: ${density.toFixed(1)} g/L`);
            const end = calculateEnd(this.depth, this.diluent.fHe);
            if (end > 30) this.warnings.push(`Bottom gas END too deep: ${end.toFixed(0)}m`);
            const po2 = (this.depth / 10.0 + 1.0) * this.diluent.fO2;
            if (po2 > 1.4) this.warnings.push(`Bottom gas pO2 too high: ${po2.toFixed(2)} bar`);
        }
    }

    private descend() {
        let currentD = 0.0;
        this.profile.push({ time: 0.0, depth: 0.0, gas: this.currentGasName });
        while (currentD < this.depth) {
            const nextD = Math.min(this.depth, currentD + 3.0);
            const segmentTime = (nextD - currentD) / this.descentRate;
            const [fo2, fhe] = this.isCcr ? getCcrMix((currentD + nextD) / 2, this.diluent, this.setpoint) : [this.diluent.fO2, this.diluent.fHe];
            this.engine.updateTissues(currentD, nextD, segmentTime, fo2, fhe);
            this.totalTime += segmentTime;
            currentD = nextD;
            this.profile.push({ time: this.totalTime, depth: currentD, gas: this.currentGasName });
        }
    }

    private stayAtBottom() {
        const [bfo2, bfhe] = this.isCcr ? getCcrMix(this.depth, this.diluent, this.setpoint) : [this.diluent.fO2, this.diluent.fHe];
        this.engine.updateTissues(this.depth, this.depth, this.bottomTime, bfo2, bfhe);
        this.totalTime += this.bottomTime;
        this.profile.push({ time: this.totalTime, depth: this.depth, gas: this.currentGasName });
    }

    private getBestGas(d: number): { gas: Gas; setpoint: number | null } {
        const candidates = this.isCcr ? this.decoCandidates : this.decoCandidates; // Both use candidates
        for (const g of this.decoCandidates) {
            if ((d / 10 + 1) * g.fO2 <= 1.6) {
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
        
        if (this.isCcr && setpoint !== null) {
            const d = isTravel && nextDepth !== undefined ? (depth + nextDepth) / 2 : depth;
            return getCcrMix(d, gas, setpoint);
        }
        return [gas.fO2, gas.fHe];
    }

    private ascend() {
        let currentDepth = this.depth;
        let stuckCounter = 0;
        const floor = this.force6m ? 6.0 : 3.0;

        while (currentDepth > 0) {
            stuckCounter++;
            if (stuckCounter > 5000) {
                this.warnings.push("Deco stuck: Infinite loop detected");
                break;
            }

            const gfAtDepth = this.gfHigh - (this.gfHigh - this.gfLow) * (currentDepth / this.depth);
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

            if (currentDepth <= floor && this.engine.getCeiling(this.gfHigh) <= 0) {
                this.finalAscent(currentDepth);
                break;
            }

            if (ceiling <= nextStop) {
                const tTime = getTravelTime(currentDepth, nextStop, this.ascentRate);
                const [fo2, fhe] = this.updateGas(currentDepth, true, nextStop);
                
                this.engine.updateTissues(currentDepth, nextStop, tTime, fo2, fhe);
                this.totalTime += tTime;
                currentDepth = nextStop;
                this.profile.push({ time: this.totalTime, depth: this.getDisplayDepth(currentDepth), gas: this.currentGasName });
                stuckCounter = 0;
            } else {
                const [fo2, fhe] = this.updateGas(currentDepth);
                const { gas, setpoint } = this.getBestGas(currentDepth);

                this.engine.updateTissues(currentDepth, currentDepth, 1.0, fo2, fhe);
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
            const tTime = getTravelTime(currentDepth, nextD, this.ascentRate);
            const [fo2, fhe] = this.updateGas(currentDepth, true, nextD);

            this.engine.updateTissues(currentDepth, nextD, tTime, fo2, fhe);
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
            gas: this.getGasDisplay(this.depth, this.diluent, this.isCcr ? this.setpoint : null),
            cns: this.engine.toxicity_tracker.cns_percent,
            otu: this.engine.toxicity_tracker.otus
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
        const surfaceGf = Math.max(...tissueLoads.map(l => l.load_percent));
        if (surfaceGf > 100) this.warnings.push(`Surfacing with tissue load > 100%: ${surfaceGf.toFixed(1)}%`);

        return {
            schedule: finalSchedule,
            profile: this.profile,
            tissue_loads: tissueLoads,
            surface_gf: surfaceGf,
            warnings: this.warnings,
            cns_percent: this.engine.toxicity_tracker.cns_percent,
            otus: this.engine.toxicity_tracker.otus
        };
    }

    public plan(): DivePlanResponse {
        this.runInitialChecks();
        this.descend();
        this.stayAtBottom();
        this.ascend();
        return this.generateResult();
    }
}

export function planDive(
    depth: number,
    bottomTime: number,
    bottomGasName: string,
    decoGasNames: string[],
    gfLow = 0.50,
    gfHigh = 0.80,
    isCcr = false,
    setpoint = 1.2,
    decoSetpoint: number | null = null,
    decoGasSetpoint: number | null = null,
    descentRate = 20.0,
    ascentRate = 10.0,
    force6m = true,
    model = "C"
): DivePlanResponse {
    const planner = new DivePlanner(
        depth, bottomTime, bottomGasName, decoGasNames,
        gfLow, gfHigh, isCcr, setpoint, decoSetpoint, decoGasSetpoint,
        descentRate, ascentRate, force6m, model
    );
    return planner.plan();
}

export function calculateGasConsumption(
    schedule: ScheduleEntry[],
    depth: number,
    bottomTime: number,
    bottomGasName: string,
    sacRate = 15.0,
    isCcr = false,
    o2Consumption = 1.0,
    descentRate = 20.0,
    ascentRate = 10.0
) {
    const bailout: Record<string, number> = { [bottomGasName]: 0.0 };
    
    // OC Bailout
    const dTime = depth / descentRate;
    bailout[bottomGasName] += (depth / 20.0 + 1.0) * dTime * sacRate;
    bailout[bottomGasName] += (depth / 10.0 + 1.0) * bottomTime * sacRate;
    
    const firstStopD = schedule.length > 1 ? schedule[1].depth : 0;
    const tTimeToFirst = getTravelTime(depth, firstStopD, ascentRate);
    bailout[bottomGasName] += ((depth + firstStopD) / 20.0 + 1.0) * tTimeToFirst * sacRate;

    for (let i = 1; i < schedule.length; i++) {
        const s = schedule[i];
        // Parse gas name from CCR string if needed
        let gName = s.gas;
        if (s.gas.startsWith("CCR ")) {
            const parts = s.gas.split(" ");
            const spIndex = parts.indexOf("SP");
            if (spIndex > 1) {
                // CCR Tx 50/15 SP 1.4 [10/50] -> Tx 50/15
                gName = parts.slice(1, spIndex).join(" ");
            } else {
                gName = bottomGasName;
            }
        }
        
        if (!bailout[gName]) bailout[gName] = 0;
        bailout[gName] += (s.depth / 10.0 + 1.0) * s.time * sacRate;
        
        const nextD = i < schedule.length - 1 ? schedule[i+1].depth : 0;
        const tTime = getTravelTime(s.depth, nextD, ascentRate);
        bailout[gName] += ((s.depth + nextD) / 20.0 + 1.0) * tTime * sacRate;
    }

    for (const g in bailout) bailout[g] *= 1.5;

    const onboard: Record<string, number> = {};
    if (isCcr) {
        const lastRt = schedule.length > 0 ? schedule[schedule.length - 1].run_time : (depth / descentRate + bottomTime);
        const lastD = schedule.length > 0 ? schedule[schedule.length - 1].depth : depth;
        const totalTime = lastRt + getTravelTime(lastD, 0, ascentRate);
        onboard["Onboard Oxygen"] = totalTime * o2Consumption;
        onboard["Onboard Diluent"] = 5.0 * (depth / 10.0) + 20.0;
    }

    return { bailout, onboard };
}
