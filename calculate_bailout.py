from deco_engine import DecoEngine
from deko_agent import plan_dive_with_engine, calculate_gas_consumption

def run_bailout_calc(gf_low, gf_high):
    engine = DecoEngine()
    depth = 150
    bottom_time = 5
    bottom_gas = "Tx 6/90"
    deco_gases = ["Oxygen", "Tx 50/15"]
    
    # Calculate OC schedule for bailout
    schedule = plan_dive_with_engine(engine, depth, bottom_time, bottom_gas, deco_gases, 
                                    gf_low=gf_low, gf_high=gf_high, is_ccr=False)
    
    # Calculate consumption (SAC 15 L/min)
    gas_reqs = calculate_gas_consumption(schedule['schedule'], depth, bottom_time, bottom_gas, sac_rate=15.0)
    return gas_reqs['bailout']

print("--- Standard (50/80) ---")
print(run_bailout_calc(0.50, 0.80))

print("\n--- Aggressive (50/85) ---")
print(run_bailout_calc(0.50, 0.85))
