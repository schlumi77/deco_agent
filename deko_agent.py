import json
import math
import argparse
import sys
from deco_engine import DecoEngine, calculate_gas_density

# --- Data Loading ---

def load_gases():
    try:
        with open('gas_config.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def load_cylinders():
    try:
        with open('cylinders.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

# --- Calculations ---

def calculate_mod(fo2, max_po2):
    if fo2 <= 0: return float('inf')
    return (max_po2 / fo2 - 1) * 10

def calculate_min_od(fo2, min_po2=0.16):
    if fo2 <= 0: return float('inf')
    depth = (min_po2 / fo2 - 1) * 10
    return max(0, depth)

def calculate_end(depth, fhe):
    return (depth + 10) * (1 - fhe) - 10

def get_ccr_mix(depth, dil, sp):
    """
    Calculates loop fO2 and fHe such that pInert = Pamb - SP - PH2O.
    This matches professional decompression software (e.g. MultiDeco, Shearwater).
    """
    p_amb = 1.0 + depth / 10.0
    p_h2o = 0.0627 # Water vapor at 37C
    
    # In CCR, solenoid maintains constant O2 pressure (SP)
    p_dry_total = p_amb - p_h2o
    p_inert_total = max(0.0, p_amb - sp - p_h2o)
    
    # Cap fO2 at diluent fraction (simulating loop flush if SP < Pamb*fO2)
    fo2_loop = max(dil['fO2'], sp / p_dry_total)
    f_inert_total = 1.0 - fo2_loop
    
    # Maintain Helium/Nitrogen ratio from diluent
    f_inert_dil = 1.0 - dil['fO2']
    if f_inert_dil > 0:
        fhe_loop = f_inert_total * (dil['fHe'] / f_inert_dil)
    else:
        fhe_loop = 0.0
        
    return fo2_loop, fhe_loop

# --- Core Planning Logic ---

def get_travel_time(d1, d2, asc_rate):
    """Calculates ascent travel time between two depths with a 1m/min cap below 10m."""
    if d1 <= d2: return 0.0 # Not an ascent
    if d1 <= 10.0:
        return (d1 - d2) / 1.0
    if d2 >= 10.0:
        return (d1 - d2) / asc_rate
    # Segment crosses 10m boundary
    return (d1 - 10.0) / asc_rate + (10.0 - d2) / 1.0

def plan_dive_with_engine(engine, depth, bottom_time, bottom_gas_name, deco_gas_names, gf_low=0.50, gf_high=0.80, is_ccr=False, setpoint=1.2, deco_setpoint=None, descent_rate=20.0, ascent_rate=10.0, force_6m=True):
    if deco_setpoint is None:
        deco_setpoint = setpoint
    
    gases = {g['name']: g for g in load_gases()}
    if bottom_gas_name not in gases:
        raise KeyError(f"Bottom gas {bottom_gas_name} not found.")
    
    diluent = gases[bottom_gas_name]
    deco_candidates = [gases[name] for name in deco_gas_names if name in gases]
    deco_candidates.sort(key=lambda x: x['fO2'], reverse=True)
    
    total_time = 0.0
    profile = [] # Stores {'time': t, 'depth': d, 'gas': g}
    warnings = []
    
    current_gas_name = f"CCR SP {setpoint}" if is_ccr else bottom_gas_name

    # Check bottom gas limits
    if is_ccr:
        if setpoint > 1.4:
            warnings.append(f"Bottom setpoint pO2 too high: {setpoint:.2f} bar (Max 1.4)")
        if deco_setpoint and deco_setpoint > 1.4:
            warnings.append(f"Deco setpoint pO2 too high: {deco_setpoint:.2f} bar (Max 1.4)")
            
        # Check if diluent pO2 exceeds setpoint at bottom depth
        p_amb_bottom = 1.0 + depth / 10.0
        p_dry_bottom = p_amb_bottom - 0.0627
        dil_po2_bottom = p_dry_bottom * diluent['fO2']
        if dil_po2_bottom > setpoint:
            warnings.append(f"Diluent pO2 too high at bottom: {dil_po2_bottom:.2f} bar (Exceeds setpoint {setpoint:.2f} bar)")
        elif dil_po2_bottom > 1.4:
            warnings.append(f"Diluent pO2 too high at bottom: {dil_po2_bottom:.2f} bar (Max 1.4 bar)")
    else:
        density = calculate_gas_density(diluent['fO2'], diluent['fHe'], depth)
        if density > 6.2:
            warnings.append(f"Bottom gas density too high: {density:.1f} g/L (Max 6.2)")
        elif density > 5.2:
            warnings.append(f"Bottom gas density high: {density:.1f} g/L (Ideal < 5.2)")
            
        end = calculate_end(depth, diluent['fHe'])
        if end > 30:
            warnings.append(f"Bottom gas END too deep: {end:.0f}m (Max 30m)")
            
        po2 = (depth/10.0 + 1.0) * diluent['fO2']
        if po2 > 1.4:
            warnings.append(f"Bottom gas pO2 too high: {po2:.2f} bar (Max 1.4)")

    # 1. Descent
    current_d = 0.0
    profile.append({'time': 0.0, 'depth': 0.0, 'gas': current_gas_name})
    while current_d < depth:
        next_d = min(depth, current_d + 3.0)
        segment_time = (next_d - current_d) / descent_rate
        
        # Calculate mix at average depth of segment for tissue update
        fo2, fhe = get_ccr_mix((current_d + next_d)/2.0, diluent, setpoint) if is_ccr else (diluent['fO2'], diluent['fHe'])
        engine.update_tissues(current_d, next_d, segment_time, fo2, fhe)
        
        total_time += segment_time
        current_d = next_d
        profile.append({'time': total_time, 'depth': current_d, 'gas': current_gas_name})
    
    # 2. Bottom Time
    actual_bottom_time = max(0, bottom_time)
    fo2, fhe = get_ccr_mix(depth, diluent, setpoint) if is_ccr else (diluent['fO2'], diluent['fHe'])
    engine.update_tissues(depth, depth, actual_bottom_time, fo2, fhe)
    total_time += actual_bottom_time
    profile.append({'time': total_time, 'depth': depth, 'gas': current_gas_name})
    
    # 3. Ascent and Deco
    current_depth = depth
    deco_schedule = [] # Stores (depth, time, run_time, gas, cns, otu)
    stuck_counter = 0
    
    # Helper to quantize depth for ascent profile while ensuring it never exceeds bottom
    def get_ascent_display_depth(d, bottom_d):
        # Round to avoid float precision issues before ceil
        d_rounded = round(d, 2)
        first_stop = (bottom_d // 3) * 3
        q = math.ceil(d_rounded / 3.0) * 3.0
        if q > first_stop:
            return bottom_d
        return q

    while current_depth > 0:
        stuck_counter += 1
        if stuck_counter > 5000:
            warnings.append("Deco stuck: Infinite deco loop detected. Check gases and GF.")
            break
            
        gf_at_depth = gf_high - (gf_high - gf_low) * (current_depth / depth) if depth > 0 else gf_high
        ceiling = engine.get_ceiling(gf_at_depth)
        floor = 6.0 if force_6m else 3.0
        
        # Determine next potential stop depth (multiple of 3)
        if current_depth > floor:
            next_stop = max(floor, current_depth - 3.0)
            if current_depth % 3 != 0:
                next_stop = math.floor(current_depth / 3.0) * 3.0
                if next_stop < floor: next_stop = floor
        else:
            next_stop = 0.0

        if current_depth <= floor:
            if engine.get_ceiling(gf_high) <= 0:
                # Last ascent to surface
                while current_depth > 0:
                    next_d = max(0.0, current_depth - 3.0)
                    travel_time = get_travel_time(current_depth, next_d, ascent_rate)
                    
                    if is_ccr:
                        fo2, fhe = get_ccr_mix((current_depth + next_d)/2.0, diluent, deco_setpoint)
                        current_gas_name = f"CCR SP {deco_setpoint}"
                    else:
                        current_gas = diluent
                        for g in deco_candidates:
                            if (current_depth/10.0 + 1.0) * g['fO2'] <= 1.6:
                                current_gas = g
                                break
                        fo2, fhe = current_gas['fO2'], current_gas['fHe']
                        current_gas_name = current_gas['name']

                    # Check deco gas limits
                    end = calculate_end(current_depth, fhe)
                    if end > 30:
                        msg = f"Deco gas {current_gas_name} END too deep: {end:.0f}m"
                        if msg not in warnings: warnings.append(msg)
                    
                    density = calculate_gas_density(fo2, fhe, current_depth)
                    if density > 6.2:
                        msg = f"Deco gas {current_gas_name} density too high: {density:.1f} g/L"
                        if msg not in warnings: warnings.append(msg)

                    engine.update_tissues(current_depth, next_d, travel_time, fo2, fhe)
                    total_time += travel_time
                    current_depth = next_d
                    stuck_counter = 0
                    profile.append({'time': total_time, 'depth': get_ascent_display_depth(current_depth, depth), 'gas': current_gas_name})
                break
            else:
                # Stay at floor
                current_depth = floor
                if is_ccr:
                    fo2, fhe = get_ccr_mix(floor, diluent, deco_setpoint)
                    current_gas_name = f"CCR SP {deco_setpoint}"
                else:
                    current_gas = diluent
                    for g in deco_candidates:
                        if (floor/10.0 + 1.0) * g['fO2'] <= 1.6:
                            current_gas = g
                            break
                    fo2, fhe = current_gas['fO2'], current_gas['fHe']
                    current_gas_name = current_gas['name']
                
                engine.update_tissues(floor, floor, 1.0, fo2, fhe)
                total_time += 1.0
                profile.append({'time': total_time, 'depth': get_ascent_display_depth(floor, depth), 'gas': current_gas_name})
                deco_schedule.append((get_ascent_display_depth(floor, depth), 1.0, round(total_time), current_gas_name, engine.toxicity_tracker.cns_percent, engine.toxicity_tracker.otus))
                continue

        # Can we ascend to the next stop?
        if ceiling <= next_stop:
            travel_time = get_travel_time(current_depth, next_stop, ascent_rate)
            if is_ccr:
                fo2, fhe = get_ccr_mix((current_depth + next_stop)/2.0, diluent, deco_setpoint)
                current_gas_name = f"CCR SP {deco_setpoint}"
            else:
                current_gas = diluent
                for g in deco_candidates:
                    if (current_depth/10.0 + 1.0) * g['fO2'] <= 1.6:
                        current_gas = g
                        break
                fo2, fhe = current_gas['fO2'], current_gas['fHe']
                current_gas_name = current_gas['name']

            # Check deco gas limits
            end = calculate_end(current_depth, fhe)
            if end > 30:
                msg = f"Deco gas {current_gas_name} END too deep: {end:.0f}m"
                if msg not in warnings: warnings.append(msg)
            
            density = calculate_gas_density(fo2, fhe, current_depth)
            if density > 6.2:
                msg = f"Deco gas {current_gas_name} density too high: {density:.1f} g/L"
                if msg not in warnings: warnings.append(msg)

            engine.update_tissues(current_depth, next_stop, travel_time, fo2, fhe)
            total_time += travel_time
            current_depth = next_stop
            stuck_counter = 0
            profile.append({'time': total_time, 'depth': get_ascent_display_depth(current_depth, depth), 'gas': current_gas_name})
        else:
            # Must stay at current depth for 1 minute
            if is_ccr:
                fo2, fhe = get_ccr_mix(current_depth, diluent, deco_setpoint)
                current_gas_name = f"CCR SP {deco_setpoint}"
            else:
                current_gas = diluent
                for g in deco_candidates:
                    if (current_depth/10.0 + 1.0) * g['fO2'] <= 1.6:
                        current_gas = g
                        break
                fo2, fhe = current_gas['fO2'], current_gas['fHe']
                current_gas_name = current_gas['name']
                
                # Check deco gas limits
                end = calculate_end(current_depth, fhe)
                if end > 30:
                    msg = f"Deco gas {current_gas_name} END too deep: {end:.0f}m"
                    if msg not in warnings: warnings.append(msg)
                
                density = calculate_gas_density(fo2, fhe, current_depth)
                if density > 6.2:
                    msg = f"Deco gas {current_gas_name} density too high: {density:.1f} g/L"
                    if msg not in warnings: warnings.append(msg)
            
            engine.update_tissues(current_depth, current_depth, 1.0, fo2, fhe)
            total_time += 1.0
            profile.append({'time': total_time, 'depth': get_ascent_display_depth(current_depth, depth), 'gas': current_gas_name})
            deco_schedule.append((get_ascent_display_depth(current_depth, depth), 1.0, round(total_time), current_gas_name, engine.toxicity_tracker.cns_percent, engine.toxicity_tracker.otus))

    # Consolidate
    final_schedule = [(depth, bottom_time, round(depth/descent_rate + bottom_time), current_gas_name, engine.toxicity_tracker.cns_percent, engine.toxicity_tracker.otus)]
    if deco_schedule:
        curr_d, curr_t, curr_rt, curr_g, curr_c, curr_o = deco_schedule[0]
        total_stop_t = curr_t
        for d, t, rt, g, c, o in deco_schedule[1:]:
            if d == curr_d and g == curr_g:
                total_stop_t += t
                curr_rt = rt
                curr_c, curr_o = c, o
            else:
                final_schedule.append((curr_d, total_stop_t, curr_rt, curr_g, curr_c, curr_o))
                curr_d, curr_t, curr_rt, curr_g, curr_c, curr_o = d, t, rt, g, c, o
                total_stop_t = t
        final_schedule.append((curr_d, total_stop_t, curr_rt, curr_g, curr_c, curr_o))
    
    # Calculate surface GF
    surface_gf = max([l['load_percent'] for l in engine.get_tissue_loads()])
    if surface_gf > 100:
        warnings.append(f"Surfacing with tissue load > 100% M-value: {surface_gf:.1f}%")

    return {
        "schedule": final_schedule,
        "profile": profile,
        "surface_gf": surface_gf,
        "warnings": warnings
    }

def calculate_gas_consumption(schedule, depth, bottom_time, bottom_gas_name, sac_rate=15.0, is_ccr=False, o2_consumption=1.0, descent_rate=20.0, ascent_rate=10.0):
    """
    Calculates required gas volumes.
    For CCR: Returns CCR Oxygen and Diluent (for loops/flushes).
    For OC: Returns required bailout volumes including a 1.5x safety factor.
    """
    bailout_reqs = {bottom_gas_name: 0.0}
    
    # 1. Calculate Bailout (Open Circuit) Requirements
    # This assumes the diver has to bail out at the WORST point (end of bottom time)
    # Descent + Bottom Time
    descent_time = depth / descent_rate
    bailout_reqs[bottom_gas_name] += (depth / 20.0 + 1.0) * descent_time * sac_rate
    bailout_reqs[bottom_gas_name] += (depth / 10.0 + 1.0) * bottom_time * sac_rate
    
    # Descent from bottom to first stop (or surface if no stops)
    first_stop_depth = schedule[0][0] if schedule else 0.0
    travel_time_to_first = get_travel_time(depth, first_stop_depth, ascent_rate)
    bailout_reqs[bottom_gas_name] += ((depth + first_stop_depth) / 20.0 + 1.0) * travel_time_to_first * sac_rate

    # Deco Schedule
    for i, (d, t, rt, g, cns, otu) in enumerate(schedule):
        gas_name = g
        if g.startswith("CCR SP"):
            gas_name = bottom_gas_name
        
        if gas_name not in bailout_reqs: bailout_reqs[gas_name] = 0.0
        # Stop time
        bailout_reqs[gas_name] += (d/10.0 + 1.0) * t * sac_rate
        
        # Ascent to next stop (or surface)
        next_d = schedule[i+1][0] if i < len(schedule) - 1 else 0.0
        travel_time = get_travel_time(d, next_d, ascent_rate)
        bailout_reqs[gas_name] += ((d + next_d)/20.0 + 1.0) * travel_time * sac_rate

    # Apply safety factor (1.5x) for bailout
    for g in bailout_reqs:
        bailout_reqs[g] *= 1.5

    # 2. Calculate CCR Onboard Requirements
    ccr_reqs = {}
    if is_ccr:
        # Total dive time including final ascent from bottom to surface
        # rt from last entry is end of last stop
        last_rt = schedule[-1][2] if schedule else (depth/descent_rate + bottom_time)
        last_d = schedule[-1][0] if schedule else depth
        total_time = last_rt + get_travel_time(last_d, 0, ascent_rate)
        
        # Oxygen: metabolized at o2_consumption rate
        ccr_reqs["Onboard Oxygen"] = total_time * o2_consumption
        
        # Diluent: used for volume changes (descent) and flushes (approx 50L per 100m)
        # 1. Compression of loop: ~5L per bar of depth
        loop_compression = 5.0 * (depth / 10.0)
        # 2. Flushes: 1-2 full flushes (say 2 flushes of 10L each)
        flushes = 20.0
        ccr_reqs["Onboard Diluent"] = loop_compression + flushes

    return {
        "bailout": bailout_reqs,
        "onboard": ccr_reqs
    }

# --- CLI Menus ---

def show_gas_info():
    gases = load_gases()
    print(f"\n{'Gas':<10} | {'Type':<8} | {'fO2':>4} | {'fHe':>4} | {'Limit':>5} | {'MOD':>8} | {'MinOD':>8} | {'END @ MOD':>8}")
    print("-" * 84)
    for gas in gases:
        limit_po2 = 1.6 if gas['type'] == "deco" else 1.2
        mod = calculate_mod(gas['fO2'], limit_po2)
        min_od = calculate_min_od(gas['fO2'])
        end = calculate_end(mod, gas['fHe'])
        print(f"{gas['name']:<10} | {gas['type']:<8} | {gas['fO2']:>4.2f} | {gas['fHe']:>4.2f} | {limit_po2:>5.1f} | {mod:>8.1f}m | {min_od:>8.1f}m | {end:>8.1f}m")

def run_planner(args=None):
    if args is None:
        print("\n--- Dive Planner ---")
        try:
            depth = float(input("Enter max depth (m) [150]: ") or 150)
            time_at_depth = float(input("Enter time AT depth (min) [5]: ") or 5)
            bottom_gas = input("Enter bottom gas/diluent [Tx 6/90]: ") or "Tx 6/90"
            
            mode = input("Dive mode (ccr/oc) [ccr]: ").lower() or "ccr"
            is_ccr = (mode == "ccr")
            setpoint = 1.2
            deco_setpoint = 1.2
            o2_cons = 1.0
            if is_ccr:
                setpoint = float(input("Enter Bottom Setpoint (bar) [1.2]: ") or 1.2)
                deco_setpoint = float(input("Enter Deco Setpoint (bar) [1.2]: ") or 1.2)
                o2_cons = float(input("Enter O2 Cons (L/min) [1.0]: ") or 1.0)
                
            gf_low = float(input("Enter GF Low [%] [50]: ") or 50) / 100.0
            gf_high = float(input("Enter GF High [%] [80]: ") or 80) / 100.0
            
            desc_rate = float(input("Descent Rate (m/min) [20]: ") or 20)
            asc_rate = float(input("Ascent Rate (m/min) [10]: ") or 10)
            model = input("Decompression Model (B/C) [C]: ") or "C"
        except ValueError:
            print("Invalid input.")
            return
    else:
        depth = args.depth
        time_at_depth = args.time
        bottom_gas = args.gas
        is_ccr = (args.mode == "ccr")
        setpoint = args.setpoint
        deco_setpoint = args.deco_setpoint or setpoint
        o2_cons = args.o2_cons
        # Check if GF is provided in percent or decimal
        gf_low = args.gf_low / 100.0 if args.gf_low > 1.0 else args.gf_low
        gf_high = args.gf_high / 100.0 if args.gf_high > 1.0 else args.gf_high
        desc_rate = args.desc_rate
        asc_rate = args.asc_rate
        model = args.model

    deco_gases = ["Oxygen", "Tx 50/15", "Tx 35/35", "Tx 24/35", "Tx 17/70"]
    try:
        engine = DecoEngine(model=model)
        result = plan_dive_with_engine(engine, depth, time_at_depth, bottom_gas, deco_gases, 
                                                 gf_low=gf_low, gf_high=gf_high, is_ccr=is_ccr, 
                                                 setpoint=setpoint, deco_setpoint=deco_setpoint, 
                                                 descent_rate=desc_rate, ascent_rate=asc_rate)
        schedule = result['schedule']
        surface_gf = result['surface_gf']
        plan_warnings = result['warnings']
        
        gas_reqs = calculate_gas_consumption(schedule, depth, time_at_depth, bottom_gas, 
                                            is_ccr=is_ccr, o2_consumption=o2_cons, 
                                            descent_rate=desc_rate, ascent_rate=asc_rate)
        
        cns = engine.toxicity_tracker.cns_percent
        otus = engine.toxicity_tracker.otus
    except KeyError as e:
        print(f"Error: {e}")
        return

    print(f"\nDeco Schedule ({'CCR' if is_ccr else 'OC'} | Model: ZH-L16{model.upper()} | GF: {int(gf_low*100)}/{int(gf_high*100)}):")
    print(f"Rates: Descent {desc_rate}m/min, Ascent {asc_rate}m/min")
    print(f"{'Depth':>5} | {'RT':>7} | {'Time':>5} | {'Gas':<12} | {'CNS %':>6} | {'OTU':>6}")
    print("-" * 65)
    for d, t, rt, g, c, o in schedule:
        print(f"{d:>4.0f}m | {rt:>5.1f}min | {t:>4.0f}min | {g:<12} | {c:>5.1f}% | {o:>6.1f}")

    if is_ccr:
        print("\nOnboard Gas Requirements (Minimum for Dive):")
        for gas, vol in gas_reqs['onboard'].items():
            print(f"  {gas:<15}: {vol:>5.0f} L")
        print("  (Oxygen met. rate: {:.1f} L/min, Diluent for compression/flushes)".format(o2_cons))

    print("\nBailout Gas Requirements (OC descent + deco, 1.5x Safety):")
    for gas, vol in gas_reqs['bailout'].items():
        print(f"  {gas:<15}: {vol:>5.0f} L")
    print("  (Based on SAC: {:.1f} L/min, includes 1.5x reserve factor)".format(15.0))

    print(f"\nOxygen Toxicity:")
    print(f"  CNS Clock: {cns:>6.1f} %")
    print(f"  OTUs:      {otus:>6.1f}")
    
    print(f"\nSurface Pressure Load:")
    print(f"  Surface GF: {surface_gf:>6.1f} %")
    
    if cns > 80:
        print("  !!! WARNING: CNS EXCEEDS 80% !!!")
    if otus > 300:
        print("  !!! WARNING: OTUs EXCEED 300 (Daily Limit) !!!")
        
    if plan_warnings:
        print("\nSafety Warnings:")
        for w in plan_warnings:
            print(f"  !!! {w} !!!")

def main():
    parser = argparse.ArgumentParser(description="Deko Agent - Technical Diving Planner")
    parser.add_argument("--depth", type=float, help="Max depth in meters")
    parser.add_argument("--time", type=float, help="Bottom time in minutes")
    parser.add_argument("--gas", type=str, help="Bottom gas name (e.g., 'Tx 6/90')")
    parser.add_argument("--mode", choices=["ccr", "oc"], help="Dive mode")
    parser.add_argument("--gf-low", type=float, default=50, help="Gradient Factor Low (default: 50)")
    parser.add_argument("--gf-high", type=float, default=80, help="Gradient Factor High (default: 80)")
    parser.add_argument("--desc-rate", type=float, default=20.0, help="Descent rate m/min (default: 20.0)")
    parser.add_argument("--asc-rate", type=float, default=10.0, help="Ascent rate m/min (default: 10.0)")
    parser.add_argument("--model", choices=["B", "C"], default="C", help="Bühlmann Model B or C (default: C)")
    parser.add_argument("--setpoint", type=float, default=1.2, help="CCR Bottom Setpoint (default: 1.2)")
    parser.add_argument("--deco-setpoint", type=float, help="CCR Deco Setpoint")
    parser.add_argument("--o2-cons", type=float, default=1.0, help="O2 Consumption L/min (default: 1.0)")
    parser.add_argument("--interactive", action="store_true", help="Force interactive mode")

    # If any essential planning args are provided, skip the menu unless --interactive is set
    args = parser.parse_args()
    
    if (args.depth or args.time or args.gas or args.mode) and not args.interactive:
        # Validate essential args
        if not (args.depth and args.time and args.gas and args.mode):
            print("Error: Missing required arguments for quick plan (--depth, --time, --gas, --mode).")
            sys.exit(1)
        run_planner(args)
    else:
        while True:
            print("\n=== Deko Agent CLI ===")
            print("1. Gas Information")
            print("2. Plan a Dive")
            print("3. Exit")
            choice = input("Choice: ")
            if choice == '1': show_gas_info()
            elif choice == '2': run_planner()
            elif choice == '3': break

if __name__ == "__main__":
    main()
