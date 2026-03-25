import math

# ZH-L16B Coefficients (Standard Tables / Linear Kinetics)
# Entry format: [N2 half-time, N2_a, N2_b, He half-time, He_a, He_b]
ZHL16B_COMPARTMENTS = [
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
]

# ZH-L16C Coefficients (Dive Computers)
# These are typically more conservative in mid-range compartments.
ZHL16C_COMPARTMENTS = [
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
]

WATER_VAPOR_PRESSURE = 0.0627  # bar @ 37C

class OxygenToxicityTracker:
    # NOAA pO2 Limits (bar) vs Single Exposure Limit (min)
    NOAA_LIMITS = [
        (0.6, 720), (0.7, 570), (0.8, 450), (0.9, 360), (1.0, 300),
        (1.1, 240), (1.2, 210), (1.3, 180), (1.4, 150), (1.5, 120), (1.6, 45)
    ]

    def __init__(self):
        self.cns_percent = 0.0
        self.otus = 0.0

    def calculate_cns_contribution(self, po2, time):
        if po2 < 0.6: return 0.0
        
        limit = None
        if po2 >= 1.6:
            limit = 45.0
        else:
            for i in range(len(self.NOAA_LIMITS) - 1):
                p1, l1 = self.NOAA_LIMITS[i]
                p2, l2 = self.NOAA_LIMITS[i+1]
                if p1 <= po2 < p2:
                    limit = l1 + (po2 - p1) * (l2 - l1) / (p2 - p1)
                    break
        
        if limit:
            return (time / limit) * 100.0
        return 0.0

    def calculate_otu_contribution(self, po2, time):
        if po2 <= 0.5: return 0.0
        return time * math.pow((po2 - 0.5) / 0.5, 0.833)

    def add_exposure(self, po2, time):
        self.cns_percent += self.calculate_cns_contribution(po2, time)
        self.otus += self.calculate_otu_contribution(po2, time)

class DecoEngine:
    def __init__(self, surface_pressure=1.013, model="C"):
        self.surface_pressure = surface_pressure
        self.model = model.upper()
        if self.model == "B":
            self.compartments = ZHL16B_COMPARTMENTS
        else:
            self.compartments = ZHL16C_COMPARTMENTS
            
        # Initial tension: inspired gas at surface
        # Pinert = (Psurf - PH2O) * fraction
        self.p_n2 = [(self.surface_pressure - WATER_VAPOR_PRESSURE) * 0.7902] * 16
        self.p_he = [0.0] * 16
        self.toxicity_tracker = OxygenToxicityTracker()

    def schreiner(self, initial_tension, p_inspired_start, rate, time, k):
        """
        Standard Schreiner Equation for gas uptake/elimination.
        Used by Subsurface and professional planners.
        """
        if time <= 0: return initial_tension
        return p_inspired_start + rate * (time - 1/k) - (p_inspired_start - initial_tension - rate/k) * math.exp(-k * time)

    def update_tissues(self, depth_start, depth_end, time, fo2, fhe):
        if time <= 0: return
        
        p_amb_start = self.surface_pressure + depth_start / 10.0
        p_amb_end = self.surface_pressure + depth_end / 10.0
        rate_amb = (p_amb_end - p_amb_start) / time

        # Track toxicity
        avg_p_amb = (p_amb_start + p_amb_end) / 2.0
        po2 = avg_p_amb * fo2
        self.toxicity_tracker.add_exposure(po2, time)

        fn2 = 1.0 - fo2 - fhe
        
        # Inspired gas pressures (accounting for water vapor in lungs)
        p_insp_n2_start = (p_amb_start - WATER_VAPOR_PRESSURE) * fn2
        p_insp_he_start = (p_amb_start - WATER_VAPOR_PRESSURE) * fhe
        
        # Rate of change of inspired gas pressure
        rate_n2 = rate_amb * fn2
        rate_he = rate_amb * fhe

        for i in range(16):
            # Nitrogen
            k_n2 = math.log(2) / self.compartments[i][0]
            self.p_n2[i] = self.schreiner(self.p_n2[i], p_insp_n2_start, rate_n2, time, k_n2)
            # Helium
            k_he = math.log(2) / self.compartments[i][3]
            self.p_he[i] = self.schreiner(self.p_he[i], p_insp_he_start, rate_he, time, k_he)

    def get_max_p_tol_gf(self, gf):
        """
        Calculates the maximum tolerated ambient pressure based on Gradient Factors.
        Formula: Ptol = (Ptissue - a*GF) / (GF/b + 1 - GF)
        Matches Subsurface logic for applying GF to the M-value slope.
        """
        max_p_tol = 0
        for i in range(16):
            p_tissue = self.p_n2[i] + self.p_he[i]
            if p_tissue <= 0: continue
            
            # Weighted average of a and b coefficients
            a = (self.compartments[i][1] * self.p_n2[i] + self.compartments[i][4] * self.p_he[i]) / p_tissue
            b = (self.compartments[i][2] * self.p_n2[i] + self.compartments[i][5] * self.p_he[i]) / p_tissue
            
            # Ptol formula derived from M = a + Pamb/b and M_gf = M_surf + GF*(M_pamb - M_surf)
            p_tol = (p_tissue - a * gf) / (gf / b + (1.0 - gf))
            max_p_tol = max(max_p_tol, p_tol)
            
        return max_p_tol

    def get_ceiling(self, gf):
        p_tol = self.get_max_p_tol_gf(gf)
        ceiling = (p_tol - self.surface_pressure) * 10.0
        return max(0, ceiling)

    def get_tissue_loads(self):
        """
        Returns a list of tissue loads for all 16 compartments.
        Load percentage is relative to the surface M-value.
        """
        loads = []
        for i in range(16):
            p_tissue = self.p_n2[i] + self.p_he[i]
            # M-value at surface: a + surface_pressure/b
            a = (self.compartments[i][1] * self.p_n2[i] + self.compartments[i][4] * self.p_he[i]) / p_tissue if p_tissue > 0 else self.compartments[i][1]
            b = (self.compartments[i][2] * self.p_n2[i] + self.compartments[i][5] * self.p_he[i]) / p_tissue if p_tissue > 0 else self.compartments[i][2]
            m_value_surf = a + self.surface_pressure / b
            
            loads.append({
                "compartment": i + 1,
                "n2_pressure": self.p_n2[i],
                "he_pressure": self.p_he[i],
                "total_pressure": p_tissue,
                "load_percent": (p_tissue / m_value_surf) * 100.0 if m_value_surf > 0 else 0.0
            })
        return loads

def calculate_gas_density(fo2, fhe, depth, surface_pressure=1.013):
    """
    Calculates gas density in g/L at a given depth.
    Formula: Density = [fO2 * 1.429 + fHe * 0.1786 + fN2 * 1.251] * Pamb
    """
    fn2 = 1.0 - fo2 - fhe
    p_amb = surface_pressure + depth / 10.0
    density = (fo2 * 1.429 + fhe * 0.1786 + fn2 * 1.251) * p_amb
    return density
