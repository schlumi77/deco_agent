export interface GasMix {
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

export interface GasRequirements {
  bailout: Record<string, number>;
  onboard: Record<string, number>;
}

export interface DivePlanResponse {
  schedule: ScheduleEntry[];
  profile: ProfileEntry[];
  gas_requirements: GasRequirements;
  cns_percent: number;
  otus: number;
  tissue_loads: TissueLoad[];
  surface_gf: number;
  warnings: string[];
}

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
  descent_rate: number;
  ascent_rate: number;
  force_6m: boolean;
  model: string;
}
