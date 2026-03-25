import os
from deco_engine import DecoEngine
from deko_agent import plan_dive_with_engine

def make_heatmap(engine):
    md = "\n## 5. End-of-Dive Tissue Saturation (CCR Heat Map)\n"
    md += "Final inert gas tensions across the 16 Bühlmann compartments relative to their surface M-Values ($M_0$).\n\n"
    md += "| Comp | Half-time (N2/He) | $P_{N2}$ (bar) | $P_{He}$ (bar) | Tension | $M_0$ Limit | Load % | Heat Map |\n"
    md += "| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n"
    
    for i in range(16):
        pn2 = engine.p_n2[i]
        phe = engine.p_he[i]
        ptot = pn2 + phe
        
        a_n2, b_n2 = engine.compartments[i][1], engine.compartments[i][2]
        a_he, b_he = engine.compartments[i][4], engine.compartments[i][5]
        
        if ptot > 0:
            a = (a_n2 * pn2 + a_he * phe) / ptot
            b = (b_n2 * pn2 + b_he * phe) / ptot
        else:
            a, b = a_n2, b_n2
            
        m0 = a + 1.013 / b
        load = (ptot / m0) * 100
        
        # Build 10-block bar
        bar_len = min(10, max(0, int(load / 10)))
        bar = "█" * bar_len + "░" * (10 - bar_len)
        
        alert = " ⚠️" if load >= 85 else ""
        ht_str = f"{engine.compartments[i][0]:.1f}/{engine.compartments[i][3]:.1f}"
        
        md += f"| {i+1} | {ht_str} | {pn2:.2f} | {phe:.2f} | {ptot:.2f} | {m0:.2f} | {load:.1f}% | `{bar}`{alert} |\n"
        
    return md

# 1. 50m Dive
eng1 = DecoEngine()
plan_dive_with_engine(eng1, 50, 20, "Tx 15/55", ["Oxygen", "Tx 50/15"], gf_low=0.50, gf_high=0.80, is_ccr=True, setpoint=1.2, deco_setpoint=1.2)
with open("Dive_Plan_50m.md", "a") as f:
    f.write(make_heatmap(eng1))

# 2. 150m Std
eng2 = DecoEngine()
plan_dive_with_engine(eng2, 150, 1, "Tx 6/90", ["Oxygen", "Tx 50/15"], gf_low=0.50, gf_high=0.80, is_ccr=True, setpoint=1.2, deco_setpoint=1.2)
with open("Dive_Plan_150m.md", "a") as f:
    f.write(make_heatmap(eng2))

# 3. 150m Adv
eng3 = DecoEngine()
plan_dive_with_engine(eng3, 150, 1, "Tx 6/90", ["Oxygen", "Tx 50/15"], gf_low=0.50, gf_high=0.80, is_ccr=True, setpoint=1.0, deco_setpoint=1.3)
with open("Dive_Plan_150m_Advanced.md", "a") as f:
    f.write(make_heatmap(eng3))

# 4. 150m Agg
eng4 = DecoEngine()
plan_dive_with_engine(eng4, 150, 1, "Tx 6/90", ["Oxygen", "Tx 50/15"], gf_low=0.50, gf_high=0.85, is_ccr=True, setpoint=1.0, deco_setpoint=1.4)
with open("Dive_Plan_150m_Aggressive.md", "a") as f:
    f.write(make_heatmap(eng4))

print("Heatmaps generated and appended to all markdown files.")