export interface Gas {
    name: string;
    fO2: number;
    fHe: number;
    type: string;
}

export interface ScheduleEntry {
    depth: number;
    time: number;
    run_time: number;
    gas: string;
    cns: number;
    otu: number;
}

export interface ProfileEntry {
    time: number;
    depth: number;
    gas: string;
}

export interface TissueLoad {
    compartment: number;
    n2_pressure: number;
    he_pressure: number;
    total_pressure: number;
    load_percent: number;
}

// A cylinder: water capacity in litres and fill pressure in bar.
export interface Cylinder {
    volume: number;
    pressure: number;
}

// The cylinders gas requirements are checked against.
// - bottom: the bottom gas on OC; on CCR the off-board diluent/bailout
//   cylinder, which feeds the loop's diluent and the bailout on diluent.
// - stage: one per deco gas, on OC and for CCR bailout.
// - oxygen: the CCR's onboard oxygen.
export interface CylinderKit {
    bottom: Cylinder;
    stage: Cylinder;
    oxygen: Cylinder;
}

// One cylinder compared with what the plan needs from it, in litres.
export interface CylinderCheck {
    cylinder: string;
    supplies: string[];
    required: number;
    available: number;
}

// Litres of gas to carry, including the reserve factor. `open_circuit` is the
// dive's own gas on an OC dive and the bailout gas on a CCR dive; `onboard`
// (oxygen and diluent cylinders) is filled only for CCR dives. `cylinders`
// compares those requirements with the cylinder kit, and `warnings` names
// every cylinder that holds too little.
export interface GasRequirements {
    open_circuit: Record<string, number>;
    onboard: Record<string, number>;
    cylinders: CylinderCheck[];
    warnings: string[];
}

export interface DivePlanResponse {
    schedule: ScheduleEntry[];
    profile: ProfileEntry[];
    tissue_loads: TissueLoad[];
    surface_gf: number;
    warnings: string[];
    cns_percent: number;
    otus: number;
    // Open-circuit breathing per gas, as ambient pressure x time (bar.min).
    // Multiply by a SAC rate in L/min for litres. Empty while on the loop.
    gas_usage: Record<string, number>;
    gas_requirements?: GasRequirements;
}

// A complete dive plan request. Gradient factors are percentages (e.g. 50 / 80).
export interface DivePlanRequest {
    depth: number;
    bottom_time: number;
    bottom_gas: string;
    deco_gases: string[];
    gf_low: number;
    gf_high: number;
    is_ccr: boolean;
    setpoint: number;
    deco_setpoint: number;
    deco_gas_setpoint: number;
    descent_rate: number;
    ascent_rate: number;
    force_6m: boolean;
    model: string;
    // Gas planning; planDive() ignores these.
    sac_rate: number;        // open-circuit breathing rate at the surface, L/min
    o2_consumption: number;  // CCR metabolic oxygen use, L/min
    cylinders: CylinderKit;
}

// What planDive() accepts: the dive itself is required, everything else falls
// back to PLAN_DEFAULTS in config.ts. An omitted deco_setpoint follows setpoint.
// Cylinders may be given per role; the rest come from the defaults.
export type DivePlanInput =
    Pick<DivePlanRequest, 'depth' | 'bottom_time' | 'bottom_gas'> &
    Partial<Omit<DivePlanRequest, 'depth' | 'bottom_time' | 'bottom_gas' | 'cylinders'>> &
    { cylinders?: Partial<CylinderKit> };
