from deco_engine import DecoEngine, WATER_VAPOR_PRESSURE
from deko_agent import get_ccr_mix

def find_offgassing_depth(depth, bottom_time, bottom_gas_name, is_ccr, setpoint, deco_setpoint):
    engine = DecoEngine()
    gases = {"Tx 15/55": {"fO2": 0.15, "fHe": 0.55}, "Tx 6/90": {"fO2": 0.06, "fHe": 0.90}}
    dil = gases[bottom_gas_name]
    
    # 1. Descent & Bottom
    desc_time = depth / 20.0
    fo2, fhe = get_ccr_mix(depth/2.0, dil, setpoint) if is_ccr else (dil['fO2'], dil['fHe'])
    engine.update_tissues(0, depth, desc_time, fo2, fhe)
    fo2, fhe = get_ccr_mix(depth, dil, setpoint) if is_ccr else (dil['fO2'], dil['fHe'])
    engine.update_tissues(depth, depth, bottom_time, fo2, fhe)
    
    # 2. Find Off-gassing start during ascent
    current_depth = depth
    while current_depth > 0:
        current_depth -= 1.0
        p_amb = 1.0 + current_depth / 10.0
        
        if is_ccr:
            fo2_loop, fhe_loop = get_ccr_mix(current_depth, dil, deco_setpoint)
            p_amb_inert = (p_amb - WATER_VAPOR_PRESSURE) * (1.0 - fo2_loop)
        else:
            f_inert = 1.0 - dil['fO2'] - dil['fHe']
            if current_depth <= 6: f_inert = 0.0
            elif current_depth <= 21: f_inert = 0.50 
            p_amb_inert = (p_amb - WATER_VAPOR_PRESSURE) * f_inert

        max_tension = max([engine.p_n2[i] + engine.p_he[i] for i in range(16)])
        if max_tension > p_amb_inert:
            return current_depth + 1.0

    return 0

print(f"50m CCR (50/80): {find_offgassing_depth(50, 20, 'Tx 15/55', True, 1.2, 1.2)}m")
print(f"50m OC (50/80):  {find_offgassing_depth(50, 20, 'Tx 15/55', False, 1.2, 1.2)}m")
print(f"150m Std (50/80): {find_offgassing_depth(150, 1, 'Tx 6/90', True, 1.2, 1.2)}m")
print(f"150m Adv (50/80): {find_offgassing_depth(150, 1, 'Tx 6/90', True, 1.0, 1.3)}m")
print(f"150m Agg (50/85): {find_offgassing_depth(150, 1, 'Tx 6/90', True, 1.0, 1.4)}m")
