from deco_engine import DecoEngine
from deko_agent import plan_dive_with_engine

def generate_oc_schedule_md(gf_low, gf_high):
    engine = DecoEngine()
    depth = 150
    bottom_time = 5
    bottom_gas = "Tx 6/90"
    deco_gases = ["Oxygen", "Tx 50/15"]
    
    schedule = plan_dive_with_engine(engine, depth, bottom_time, bottom_gas, deco_gases, 
                                    gf_low=gf_low, gf_high=gf_high, is_ccr=False)
    
    md_table = "| Depth | Stop Time | Gas |\n| :--- | :--- | :--- |\n"
    md_table += f"| **{depth}m** | **{bottom_time} min** | **{bottom_gas}** |\n"
    
    for d, t, g, c, o in schedule:
        md_table += f"| {int(d)}m | {int(t)} min | {g} |\n"
        
    return md_table

print("--- Standard (50/80) ---")
print(generate_oc_schedule_md(0.50, 0.80))

print("\n--- Aggressive (50/85) ---")
print(generate_oc_schedule_md(0.50, 0.85))
