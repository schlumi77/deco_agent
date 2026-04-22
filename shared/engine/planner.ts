import { DecoEngine, calculateGasDensity } from './deco_engine.js';
import type { ScheduleEntry, Gas } from '../types.js';
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
) {
    const effectiveDecoSetpoint = decoSetpoint ?? setpoint;
    const effectiveDecoGasSetpoint = decoGasSetpoint ?? 1.4;
    const engine = new DecoEngine(1.013, model);
    const gasesMap = new Map<string, Gas>(GASES.map(g => [g.name, g]));
    const diluent = gasesMap.get(bottomGasName);
    if (!diluent) throw new Error(`Gas ${bottomGasName} not found`);

    const decoCandidates = decoGasNames
        .map(name => gasesMap.get(name))
        .filter((g): g is Gas => !!g)
        .sort((a, b) => b.fO2 - a.fO2);

    let totalTime = 0.0;
    const profile: {time: number, depth: number, gas: string}[] = [];
    const warnings: string[] = [];

    const getGasStable = (dil: Gas, sp: number | null): string => {
        if (!isCcr || sp === null) return dil.name;
        const prefix = dil.name === diluent.name ? "CCR" : `CCR ${dil.name}`;
        return `${prefix} SP ${sp}`;
    };

    const getGasDisplay = (d: number, dil: Gas, sp: number | null): string => {
        if (!isCcr || sp === null) return dil.name;
        const [fo2, fhe] = getCcrMix(d, dil, sp);
        const prefix = dil.name === diluent.name ? "CCR" : `CCR ${dil.name}`;
        return `${prefix} SP ${sp} [${Math.round(fo2 * 100)}/${Math.round(fhe * 100)}]`;
    };

    let currentGasName = getGasStable(diluent, isCcr ? setpoint : null);

    // Initial checks
    if (isCcr) {
        if (setpoint > 1.4) warnings.push(`Bottom setpoint pO2 too high: ${setpoint.toFixed(2)} bar`);
        if (effectiveDecoSetpoint > 1.4) warnings.push(`Deco setpoint pO2 too high: ${effectiveDecoSetpoint.toFixed(2)} bar`);
        if (effectiveDecoGasSetpoint > 1.5) warnings.push(`Deco gas setpoint pO2 too high: ${effectiveDecoGasSetpoint.toFixed(2)} bar`);
        const p_amb_bottom = 1.0 + depth / 10.0;
        const dil_po2_bottom = (p_amb_bottom - 0.0627) * diluent.fO2;
        if (dil_po2_bottom > setpoint) {
            warnings.push(`Diluent pO2 too high at bottom: ${dil_po2_bottom.toFixed(2)} bar (Exceeds setpoint ${setpoint.toFixed(2)} bar)`);
        } else if (dil_po2_bottom > 1.4) {
            warnings.push(`Diluent pO2 too high at bottom: ${dil_po2_bottom.toFixed(2)} bar (Max 1.4 bar)`);
        }
    } else {
        const density = calculateGasDensity(diluent.fO2, diluent.fHe, depth);
        if (density > 6.2) warnings.push(`Bottom gas density too high: ${density.toFixed(1)} g/L`);
        const end = calculateEnd(depth, diluent.fHe);
        if (end > 30) warnings.push(`Bottom gas END too deep: ${end.toFixed(0)}m`);
        const po2 = (depth/10.0 + 1.0) * diluent.fO2;
        if (po2 > 1.4) warnings.push(`Bottom gas pO2 too high: ${po2.toFixed(2)} bar`);
    }

    // 1. Descent
    let currentD = 0.0;
    profile.push({time: 0.0, depth: 0.0, gas: currentGasName});
    while (currentD < depth) {
        const nextD = Math.min(depth, currentD + 3.0);
        const segmentTime = (nextD - currentD) / descentRate;
        const [fo2, fhe] = isCcr ? getCcrMix((currentD + nextD)/2, diluent, setpoint) : [diluent.fO2, diluent.fHe];
        engine.updateTissues(currentD, nextD, segmentTime, fo2, fhe);
        totalTime += segmentTime;
        currentD = nextD;
        profile.push({time: totalTime, depth: currentD, gas: currentGasName});
    }

    // 2. Bottom Time
    const [bfo2, bfhe] = isCcr ? getCcrMix(depth, diluent, setpoint) : [diluent.fO2, diluent.fHe];
    engine.updateTissues(depth, depth, bottomTime, bfo2, bfhe);
    totalTime += bottomTime;
    profile.push({time: totalTime, depth: depth, gas: currentGasName});

    // 3. Ascent
    let currentDepth = depth;
    const decoSchedule: [number, number, number, string, number, number][] = [];

    const getDisplayDepth = (d: number) => {
        const firstStop = Math.floor(depth / 3) * 3;
        const q = Math.ceil(Math.round(d * 100) / 100 / 3) * 3;
        return q > firstStop ? depth : q;
    };

    let stuckCounter = 0;
    while (currentDepth > 0) {
        stuckCounter++;
        if (stuckCounter > 5000) {
            warnings.push("Deco stuck: Infinite loop detected");
            break;
        }

        const gfAtDepth = gfHigh - (gfHigh - gfLow) * (currentDepth / depth);
        const ceiling = engine.getCeiling(gfAtDepth);
        const floor = force6m ? 6.0 : 3.0;
        
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

        if (currentDepth <= floor && engine.getCeiling(gfHigh) <= 0) {
            // Final ascent
            while (currentDepth > 0) {
                const nextD = Math.max(0, currentDepth - 3);
                const tTime = getTravelTime(currentDepth, nextD, ascentRate);
                let fo2, fhe;
                if (isCcr) {
                    let currentDil = diluent;
                    let currentSp = effectiveDecoSetpoint;
                    for (const g of decoCandidates) {
                        if ((currentDepth/10 + 1) * g.fO2 <= 1.6) {
                            currentDil = g;
                            currentSp = effectiveDecoGasSetpoint;
                            break;
                        }
                    }
                    [fo2, fhe] = getCcrMix((currentDepth + nextD)/2, currentDil, currentSp);
                    currentGasName = getGasStable(currentDil, currentSp);
                } else {
                    let bestGas = diluent;
                    for (const g of decoCandidates) {
                        if ((currentDepth/10 + 1) * g.fO2 <= 1.6) { bestGas = g; break; }
                    }
                    [fo2, fhe] = [bestGas.fO2, bestGas.fHe];
                    currentGasName = bestGas.name;
                }
                engine.updateTissues(currentDepth, nextD, tTime, fo2, fhe);
                totalTime += tTime;
                currentDepth = nextD;
                profile.push({time: totalTime, depth: getDisplayDepth(currentDepth), gas: currentGasName});
            }
            break;
        }

        if (ceiling <= nextStop) {
            const tTime = getTravelTime(currentDepth, nextStop, ascentRate);
            let fo2, fhe;
            if (isCcr) {
                let currentDil = diluent;
                let currentSp = effectiveDecoSetpoint;
                for (const g of decoCandidates) {
                    if ((currentDepth/10 + 1) * g.fO2 <= 1.6) {
                        currentDil = g;
                        currentSp = effectiveDecoGasSetpoint;
                        break;
                    }
                }
                [fo2, fhe] = getCcrMix((currentDepth + nextStop)/2, currentDil, currentSp);
                currentGasName = getGasStable(currentDil, currentSp);
            } else {
                let bestGas = diluent;
                for (const g of decoCandidates) {
                    if ((currentDepth/10 + 1) * g.fO2 <= 1.6) { bestGas = g; break; }
                }
                [fo2, fhe] = [bestGas.fO2, bestGas.fHe];
                currentGasName = bestGas.name;
            }
            engine.updateTissues(currentDepth, nextStop, tTime, fo2, fhe);
            totalTime += tTime;
            currentDepth = nextStop;
            profile.push({time: totalTime, depth: getDisplayDepth(currentDepth), gas: currentGasName});
            stuckCounter = 0;
        } else {
            // Stay
            let fo2, fhe;
            let currentDil = diluent;
            let currentSp: number | null = null;
            if (isCcr) {
                currentSp = effectiveDecoSetpoint;
                for (const g of decoCandidates) {
                    if ((currentDepth/10 + 1) * g.fO2 <= 1.6) {
                        currentDil = g;
                        currentSp = effectiveDecoGasSetpoint;
                        break;
                    }
                }
                [fo2, fhe] = getCcrMix(currentDepth, currentDil, currentSp);
                currentGasName = getGasStable(currentDil, currentSp);
            } else {
                let bestGas = diluent;
                for (const g of decoCandidates) {
                    if ((currentDepth/10 + 1) * g.fO2 <= 1.6) { bestGas = g; break; }
                }
                [fo2, fhe] = [bestGas.fO2, bestGas.fHe];
                currentDil = bestGas;
                currentGasName = bestGas.name;
            }
            engine.updateTissues(currentDepth, currentDepth, 1.0, fo2, fhe);
            totalTime += 1.0;
            profile.push({time: totalTime, depth: getDisplayDepth(currentDepth), gas: currentGasName});
            decoSchedule.push([getDisplayDepth(currentDepth), 1.0, totalTime, getGasDisplay(currentDepth, currentDil, currentSp), engine.toxicity_tracker.cns_percent, engine.toxicity_tracker.otus]);
        }
    }

    const finalSchedule: ScheduleEntry[] = [];
    // Always add bottom segment to schedule summary
    finalSchedule.push({
        depth, 
        time: bottomTime, 
        run_time: Math.round(depth/descentRate + bottomTime), 
        gas: getGasDisplay(depth, diluent, isCcr ? setpoint : null), 
        cns: engine.toxicity_tracker.cns_percent, 
        otu: engine.toxicity_tracker.otus
    });

    if (decoSchedule.length > 0) {
        let [currD, totalStopT, currRT, currG, currC, currO] = decoSchedule[0];
        for (let i = 1; i < decoSchedule.length; i++) {
            const [d, t, rt, g, c, o] = decoSchedule[i];
            if (d === currD && g === currG) {
                totalStopT += t;
                currRT = rt;
                currC = c; currO = o;
            } else {
                finalSchedule.push({depth: currD, time: totalStopT, run_time: Math.round(currRT), gas: currG, cns: currC, otu: currO});
                [currD, totalStopT, currRT, currG, currC, currO] = [d, t, rt, g, c, o];
            }
        }
        finalSchedule.push({depth: currD, time: totalStopT, run_time: Math.round(currRT), gas: currG, cns: currC, otu: currO});
    }

    const tissueLoads = engine.getTissueLoads();
    const surfaceGf = Math.max(...tissueLoads.map(l => l.load_percent));
    if (surfaceGf > 100) warnings.push(`Surfacing with tissue load > 100%: ${surfaceGf.toFixed(1)}%`);

    return {
        schedule: finalSchedule,
        profile,
        tissue_loads: tissueLoads,
        surface_gf: surfaceGf,
        warnings,
        cns_percent: engine.toxicity_tracker.cns_percent,
        otus: engine.toxicity_tracker.otus
    };
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
