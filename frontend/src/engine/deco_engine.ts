// ZH-L16B Coefficients (Standard Tables / Linear Kinetics)
// Entry format: [N2 half-time, N2_a, N2_b, He half-time, He_a, He_b]
export const ZHL16B_COMPARTMENTS: number[][] = [
    [4.0, 1.2599, 0.5050, 1.51, 1.7424, 0.4245],
    [8.0, 1.0000, 0.6514, 3.02, 1.3830, 0.5747],
    [12.5, 0.8618, 0.7222, 4.72, 1.1919, 0.6527],
    [18.5, 0.7562, 0.7825, 6.99, 1.0458, 0.7223],
    [27.0, 0.6667, 0.8126, 10.21, 0.9220, 0.7582],
    [38.3, 0.6200, 0.8434, 14.48, 0.8205, 0.7957],
    [54.3, 0.5043, 0.8693, 20.53, 0.7305, 0.8279],
    [77.0, 0.4410, 0.8910, 29.11, 0.6502, 0.8553],
    [109.0, 0.4000, 0.9092, 41.20, 0.5950, 0.8757],
    [146.0, 0.3750, 0.9222, 55.19, 0.5545, 0.8903],
    [187.0, 0.3500, 0.9319, 70.69, 0.5333, 0.8997],
    [239.0, 0.3295, 0.9403, 90.34, 0.5189, 0.9073],
    [305.0, 0.3065, 0.9477, 115.29, 0.5181, 0.9122],
    [390.0, 0.2835, 0.9544, 147.42, 0.5176, 0.9171],
    [498.0, 0.2610, 0.9602, 188.24, 0.5172, 0.9217],
    [635.0, 0.2480, 0.9653, 240.03, 0.5119, 0.9267],
];

// ZH-L16C Coefficients (Dive Computers)
export const ZHL16C_COMPARTMENTS: number[][] = [
    [4.0, 1.2599, 0.5050, 1.51, 1.7424, 0.4245],
    [8.0, 1.0000, 0.6514, 3.02, 1.3830, 0.5747],
    [12.5, 0.8618, 0.7222, 4.72, 1.1919, 0.6527],
    [18.5, 0.7562, 0.7825, 6.99, 1.0458, 0.7223],
    [27.0, 0.6667, 0.8126, 10.21, 0.9220, 0.7582],
    [38.3, 0.5600, 0.8434, 14.48, 0.8205, 0.7957],
    [54.3, 0.4947, 0.8693, 20.53, 0.7305, 0.8279],
    [77.0, 0.4500, 0.8910, 29.11, 0.6502, 0.8553],
    [109.0, 0.4187, 0.9092, 41.20, 0.5950, 0.8757],
    [146.0, 0.3798, 0.9222, 55.19, 0.5545, 0.8903],
    [187.0, 0.3497, 0.9319, 70.69, 0.5333, 0.8997],
    [239.0, 0.3223, 0.9403, 90.34, 0.5189, 0.9073],
    [305.0, 0.2850, 0.9477, 115.29, 0.5181, 0.9122],
    [390.0, 0.2737, 0.9544, 147.42, 0.5176, 0.9171],
    [498.0, 0.2523, 0.9602, 188.24, 0.5172, 0.9217],
    [635.0, 0.2327, 0.9653, 240.03, 0.5119, 0.9267],
];

export const WATER_VAPOR_PRESSURE = 0.0627; // bar @ 37C

export class OxygenToxicityTracker {
    NOAA_LIMITS = [
        [0.6, 720], [0.7, 570], [0.8, 450], [0.9, 360], [1.0, 300],
        [1.1, 240], [1.2, 210], [1.3, 180], [1.4, 150], [1.5, 120], [1.6, 45]
    ];

    cns_percent = 0.0;
    otus = 0.0;

    calculateCnsContribution(po2: number, time: number): number {
        if (po2 < 0.6) return 0.0;
        
        let limit = null;
        if (po2 >= 1.6) {
            limit = 45.0;
        } else {
            for (let i = 0; i < this.NOAA_LIMITS.length - 1; i++) {
                const [p1, l1] = this.NOAA_LIMITS[i];
                const [p2, l2] = this.NOAA_LIMITS[i+1];
                if (po2 >= p1 && po2 < p2) {
                    limit = l1 + (po2 - p1) * (l2 - l1) / (p2 - p1);
                    break;
                }
            }
        }
        
        if (limit) {
            return (time / limit) * 100.0;
        }
        return 0.0;
    }

    calculateOtuContribution(po2: number, time: number): number {
        if (po2 <= 0.5) return 0.0;
        return time * Math.pow((po2 - 0.5) / 0.5, 0.833);
    }

    addExposure(po2: number, time: number) {
        this.cns_percent += this.calculateCnsContribution(po2, time);
        this.otus += this.calculateOtuContribution(po2, time);
    }
}

export class DecoEngine {
    surface_pressure: number;
    model: string;
    compartments: number[][];
    p_n2: number[];
    p_he: number[];
    toxicity_tracker: OxygenToxicityTracker;

    constructor(surface_pressure = 1.013, model = "C") {
        this.surface_pressure = surface_pressure;
        this.model = model.toUpperCase();
        this.compartments = this.model === "B" ? ZHL16B_COMPARTMENTS : ZHL16C_COMPARTMENTS;
        
        this.p_n2 = new Array(16).fill((this.surface_pressure - WATER_VAPOR_PRESSURE) * 0.7902);
        this.p_he = new Array(16).fill(0.0);
        this.toxicity_tracker = new OxygenToxicityTracker();
    }

    schreiner(initial_tension: number, p_inspired_start: number, rate: number, time: number, k: number): number {
        if (time <= 0) return initial_tension;
        return p_inspired_start + rate * (time - 1/k) - (p_inspired_start - initial_tension - rate/k) * Math.exp(-k * time);
    }

    updateTissues(depth_start: number, depth_end: number, time: number, fo2: number, fhe: number) {
        if (time <= 0) return;
        
        const p_amb_start = this.surface_pressure + depth_start / 10.0;
        const p_amb_end = this.surface_pressure + depth_end / 10.0;
        const rate_amb = (p_amb_end - p_amb_start) / time;

        const avg_p_amb = (p_amb_start + p_amb_end) / 2.0;
        const po2 = avg_p_amb * fo2;
        this.toxicity_tracker.addExposure(po2, time);

        const fn2 = 1.0 - fo2 - fhe;
        const p_insp_n2_start = (p_amb_start - WATER_VAPOR_PRESSURE) * fn2;
        const p_insp_he_start = (p_amb_start - WATER_VAPOR_PRESSURE) * fhe
        const rate_n2 = rate_amb * fn2;
        const rate_he = rate_amb * fhe;

        for (let i = 0; i < 16; i++) {
            const k_n2 = Math.LN2 / this.compartments[i][0];
            this.p_n2[i] = this.schreiner(this.p_n2[i], p_insp_n2_start, rate_n2, time, k_n2);
            const k_he = Math.LN2 / this.compartments[i][3];
            this.p_he[i] = this.schreiner(this.p_he[i], p_insp_he_start, rate_he, time, k_he);
        }
    }

    getMaxPTolGf(gf: number): number {
        let max_p_tol = 0;
        for (let i = 0; i < 16; i++) {
            const p_tissue = this.p_n2[i] + this.p_he[i];
            if (p_tissue <= 0) continue;
            
            const a = (this.compartments[i][1] * this.p_n2[i] + this.compartments[i][4] * this.p_he[i]) / p_tissue;
            const b = (this.compartments[i][2] * this.p_n2[i] + this.compartments[i][5] * this.p_he[i]) / p_tissue;
            
            const p_tol = (p_tissue - a * gf) / (gf / b + (1.0 - gf));
            max_p_tol = Math.max(max_p_tol, p_tol);
        }
        return max_p_tol;
    }

    getCeiling(gf: number): number {
        const p_tol = this.getMaxPTolGf(gf);
        const ceiling = (p_tol - this.surface_pressure) * 10.0;
        return Math.max(0, ceiling);
    }

    getTissueLoads() {
        const loads = [];
        for (let i = 0; i < 16; i++) {
            const p_tissue = this.p_n2[i] + this.p_he[i];
            const a = p_tissue > 0 ? (this.compartments[i][1] * this.p_n2[i] + this.compartments[i][4] * this.p_he[i]) / p_tissue : this.compartments[i][1];
            const b = p_tissue > 0 ? (this.compartments[i][2] * this.p_n2[i] + this.compartments[i][5] * this.p_he[i]) / p_tissue : this.compartments[i][2];
            const m_value_surf = a + this.surface_pressure / b;
            
            loads.push({
                compartment: i + 1,
                n2_pressure: this.p_n2[i],
                he_pressure: this.p_he[i],
                total_pressure: p_tissue,
                load_percent: m_value_surf > 0 ? (p_tissue / m_value_surf) * 100.0 : 0.0
            });
        }
        return loads;
    }
}

export function calculateGasDensity(fo2: number, fhe: number, depth: number, surface_pressure = 1.013): number {
    const fn2 = 1.0 - fo2 - fhe;
    const p_amb = surface_pressure + depth / 10.0;
    return (fo2 * 1.429 + fhe * 0.1786 + fn2 * 1.251) * p_amb;
}
