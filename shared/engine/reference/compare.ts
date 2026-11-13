import type { DivePlanInput, DivePlanResponse } from '../../types.js';

// A decompression stop as a reference planner prints it.
export interface ReferenceStop {
    depth: number; // m
    time: number;  // min spent at the stop
}

// What an external planner produced for a reference dive.
export interface ReferenceResult {
    source: string;          // planner, version and date, e.g. "Subsurface 6.0.5123, 2026-11-20"
    first_stop: number;      // m; 0 for a dive without stops
    stops: ReferenceStop[];  // deepest first; shown on failure, not compared one by one
    run_time: number;        // min at surfacing
    notes?: string;          // settings the reference could not match, see README.md
}

export interface Tolerance {
    first_stop_m: number;     // allowed difference in first stop depth
    run_time_min: number;     // allowed difference in run time, at least ...
    run_time_fraction: number; // ... or this fraction of the reference run time, whichever is larger
}

export const DEFAULT_TOLERANCE: Tolerance = {
    first_stop_m: 3,
    run_time_min: 3,
    run_time_fraction: 0.1,
};

export interface ReferenceDive {
    id: string;
    description: string;
    input: DivePlanInput;
    reference: ReferenceResult | null;
    tolerance?: Partial<Tolerance>;
}

// The figures of a plan that are compared, in the same units as ReferenceResult.
export interface PlanSummary {
    first_stop: number;
    stops: ReferenceStop[];
    run_time: number;
}

export function summarisePlan(plan: DivePlanResponse): PlanSummary {
    const stops = plan.schedule.slice(1).map(s => ({ depth: s.depth, time: s.time }));
    return {
        first_stop: stops.length > 0 ? stops[0].depth : 0,
        stops,
        run_time: plan.profile.length > 0 ? plan.profile[plan.profile.length - 1].time : 0,
    };
}

export function formatStops(stops: ReferenceStop[]): string {
    return stops.length === 0 ? 'no stops' : stops.map(s => `${s.depth}m:${s.time}`).join(' ');
}

// Compares a plan with a reference result. Returns one message per figure
// outside its tolerance; an empty list means the plan agrees.
export function compareWithReference(
    ours: PlanSummary,
    reference: ReferenceResult,
    tolerance: Partial<Tolerance> = {}
): string[] {
    const tol = { ...DEFAULT_TOLERANCE, ...tolerance };
    const problems: string[] = [];

    const stopDiff = ours.first_stop - reference.first_stop;
    if (Math.abs(stopDiff) > tol.first_stop_m) {
        problems.push(`first stop ${ours.first_stop} m vs reference ${reference.first_stop} m (allowed ±${tol.first_stop_m} m)`);
    }

    const allowedRunTime = Math.max(tol.run_time_min, tol.run_time_fraction * reference.run_time);
    const runDiff = ours.run_time - reference.run_time;
    if (Math.abs(runDiff) > allowedRunTime) {
        problems.push(`run time ${ours.run_time.toFixed(1)} min vs reference ${reference.run_time} min (allowed ±${allowedRunTime.toFixed(1)} min)`);
    }

    return problems;
}
