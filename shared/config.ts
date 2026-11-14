import type { Gas, Cylinder, CylinderKit } from './types.js';

// Deco gases carry their standard switch depth: the MOD for pO2 1.6 rounded
// to the nearest 3 m stop, as in GUE practice (oxygen 6 m, Tx 50/15 21 m,
// Tx 35/35 36 m). Where that rounds deeper than the MOD, the switch is at a
// pO2 slightly above 1.6 (Tx 35/35 at 36 m: 1.61).
export const GASES: Gas[] = [
    {"name": "Air", "fO2": 0.21, "fHe": 0.00, "type": "bottom"},
    {"name": "Oxygen", "fO2": 1.00, "fHe": 0.00, "type": "deco", "switch_depth": 6},
    {"name": "Tx 50/15", "fO2": 0.50, "fHe": 0.15, "type": "deco", "switch_depth": 21},
    {"name": "Tx 35/35", "fO2": 0.35, "fHe": 0.35, "type": "deco", "switch_depth": 36},
    {"name": "Tx 24/35", "fO2": 0.24, "fHe": 0.35, "type": "deco", "switch_depth": 57},
    {"name": "Tx 17/70", "fO2": 0.17, "fHe": 0.70, "type": "deco", "switch_depth": 84},
    {"name": "Nx 32", "fO2": 0.32, "fHe": 0.00, "type": "bottom"},
    {"name": "Tx 21/35", "fO2": 0.21, "fHe": 0.35, "type": "bottom"},
    {"name": "Tx 18/45", "fO2": 0.18, "fHe": 0.45, "type": "bottom"},
    {"name": "Tx 15/55", "fO2": 0.15, "fHe": 0.55, "type": "bottom"},
    {"name": "Tx 12/65", "fO2": 0.12, "fHe": 0.65, "type": "bottom"},
    {"name": "Tx 10/80", "fO2": 0.10, "fHe": 0.80, "type": "bottom"},
    {"name": "Tx 6/90", "fO2": 0.06, "fHe": 0.90, "type": "bottom"}
];

// The default cylinder kit, named for display. See CylinderKit in types.ts for
// what each cylinder supplies. Volumes are water capacity in litres, pressures
// fill pressure in bar.
// The bottom cylinder is named for CCR dives; OC dives call it OC_BOTTOM_CYLINDER_NAME.
export const OC_BOTTOM_CYLINDER_NAME = "Bottom";
export const CYLINDERS: Record<keyof CylinderKit, { name: string } & Cylinder> = {
    bottom: { name: "Diluent/Bailout", volume: 16.5, pressure: 200 },
    stage: { name: "Stage", volume: 5.4, pressure: 200 },
    oxygen: { name: "Oxygen", volume: 3.0, pressure: 200 },
};

// Defaults shared by the engine, the CLI and the web form, so the same dive
// gives the same plan wherever it is entered. Gradient factors are percentages.
export const PLAN_DEFAULTS = {
    deco_gases: ['Tx 50/15', 'Oxygen'],
    gf_low: 50,
    gf_high: 80,
    is_ccr: false,
    setpoint: 1.2,
    deco_gas_setpoint: 1.4,
    descent_rate: 20,
    ascent_rate: 10,
    final_ascent_rate: 1,
    force_6m: true,
    model: 'C',
    sac_rate: 15,
    o2_consumption: 1.0,
    cylinders: {
        bottom: { volume: CYLINDERS.bottom.volume, pressure: CYLINDERS.bottom.pressure },
        stage: { volume: CYLINDERS.stage.volume, pressure: CYLINDERS.stage.pressure },
        oxygen: { volume: CYLINDERS.oxygen.volume, pressure: CYLINDERS.oxygen.pressure },
    } as CylinderKit,
};
