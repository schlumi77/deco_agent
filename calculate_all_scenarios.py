from deco_engine import DecoEngine
from deko_agent import plan_dive_with_engine, calculate_gas_consumption

def get_dive_data(depth, bottom_time, bottom_gas, is_ccr, setpoint, deco_setpoint, gf_low, gf_high):
    engine = DecoEngine()
    deco_gases = ["Oxygen", "Tx 50/15"]
    
    # CCR Schedule
    result_ccr = plan_dive_with_engine(engine, depth, bottom_time, bottom_gas, deco_gases, 
                                        gf_low=gf_low, gf_high=gf_high, is_ccr=is_ccr, 
                                        setpoint=setpoint, deco_setpoint=deco_setpoint)
    ccr_schedule = result_ccr['schedule']
    ccr_gas = calculate_gas_consumption(ccr_schedule, depth, bottom_time, bottom_gas, is_ccr=is_ccr)
    ccr_cns = engine.toxicity_tracker.cns_percent
    ccr_otu = engine.toxicity_tracker.otus
    
    # OC Bailout Schedule
    engine_oc = DecoEngine()
    result_oc = plan_dive_with_engine(engine_oc, depth, bottom_time, bottom_gas, deco_gases, 
                                       gf_low=gf_low, gf_high=gf_high, is_ccr=False)
    oc_schedule = result_oc['schedule']
    oc_gas = calculate_gas_consumption(oc_schedule, depth, bottom_time, bottom_gas, sac_rate=15.0)
    
    return {
        "ccr_schedule": ccr_schedule,
        "ccr_gas": ccr_gas,
        "ccr_cns": ccr_cns,
        "ccr_otu": ccr_otu,
        "oc_schedule": oc_schedule,
        "oc_gas": oc_gas
    }

def print_scenario(name, depth, bottom_time, bottom_gas, is_ccr, setpoint, deco_setpoint, gf_low, gf_high):
    data = get_dive_data(depth, bottom_time, bottom_gas, is_ccr, setpoint, deco_setpoint, gf_low, gf_high)
    print(f"### SCENARIO: {name} ###")
    print(f"CCR Schedule:")
    print(f"Descent RT: {round(depth/20.0)} min, Bottom End RT: {round(depth/20.0 + bottom_time)} min")
    for d, t, rt, g, c, o in data['ccr_schedule']:
        print(f"| {int(d)}m | {round(rt)} min | {int(t)} min | {g} | {c:.1f}% | {o:.1f} |")
    print(f"CCR CNS: {data['ccr_cns']:.1f}%, OTU: {data['ccr_otu']:.1f}")
    print(f"CCR Gas (Onboard): {data['ccr_gas']['onboard']}")
    print(f"CCR Bailout (OC): {data['ccr_gas']['bailout']}")
    print(f"OC Bailout Schedule:")
    print(f"Descent RT: {round(depth/20.0)} min, Bottom End RT: {round(depth/20.0 + bottom_time)} min")
    for d, t, rt, g, c, o in data['oc_schedule']:
        print(f"| {int(d)}m | {round(rt)} min | {int(t)} min | {g} |")
    print(f"OC Bailout Gas: {data['oc_gas']['bailout']}")
    print("-" * 30)

# Scenarios
print_scenario("Standard", 150, 1, "Tx 6/90", True, 1.2, 1.2, 0.50, 0.80)
print_scenario("Advanced", 150, 1, "Tx 6/90", True, 1.0, 1.3, 0.50, 0.80)
print_scenario("Aggressive", 150, 1, "Tx 6/90", True, 1.0, 1.4, 0.50, 0.85)
