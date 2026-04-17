import pytest
import io
from unittest.mock import patch
from deko_agent import (
    load_gases, load_cylinders, plan_dive_with_engine, 
    calculate_mod, calculate_min_od, calculate_end, get_ccr_mix,
    calculate_gas_consumption, run_planner, show_gas_info, get_travel_time
)
from deco_engine import DecoEngine

def test_load_data():
    gases = load_gases()
    assert len(gases) > 0
    assert any(g['name'] == 'Air' for g in gases)
    
    cylinders = load_cylinders()
    assert len(cylinders) > 0
    assert any(c['name'] == 'Diluent/Bailout' for c in cylinders)

def test_gas_math():
    # MOD: 21% O2, 1.4 bar limit -> (1.4/0.21 - 1) * 10 = 56.66m
    assert pytest.approx(calculate_mod(0.21, 1.4)) == 56.666666
    assert calculate_mod(0, 1.4) == float('inf')
    
    # MinOD: 10% O2, 0.16 bar limit -> (0.16/0.10 - 1) * 10 = 6m
    assert pytest.approx(calculate_min_od(0.10, 0.16)) == 6.0
    assert calculate_min_od(0.21, 0.16) == 0.0
    assert calculate_min_od(0, 0.16) == float('inf')
    
    # END: 30m, 50% He -> (30+10)*(1-0.5) - 10 = 10m
    assert pytest.approx(calculate_end(30, 0.5)) == 10.0

def test_ccr_mix():
    dil = {'fO2': 0.10, 'fHe': 0.50} # Tx 10/50
    # Depth 90m (10 bar), SP 1.3
    # P_dry = 10 - 0.0627 = 9.9373
    # P_o2 = 1.3
    # fO2_loop = 1.3 / 9.9373 = 0.1308
    # fHe_loop = (1 - 0.1308) * (0.50 / 0.90) = 0.8692 * 0.5555 = 0.4828
    fo2, fhe = get_ccr_mix(90.0, dil, 1.3)
    assert pytest.approx(fo2, abs=0.01) == 0.13
    assert pytest.approx(fhe, abs=0.01) == 0.48

def test_plan_simple_dive():
    engine = DecoEngine()
    # 30m for 20 min on Air
    result = plan_dive_with_engine(
        engine, 
        depth=30.0, 
        bottom_time=20.0, 
        bottom_gas_name="Air", 
        deco_gas_names=[],
        gf_low=0.3,
        gf_high=0.7
    )
    
    assert "schedule" in result
    assert "profile" in result
    assert len(result["schedule"]) > 0
    
    # First entry should be bottom
    bottom_entry = result["schedule"][0]
    assert bottom_entry[0] == 30.0 # Depth
    assert bottom_entry[1] == 20.0 # Time

def test_plan_ccr_dive():
    engine = DecoEngine()
    # 100m for 10 min on Tx 10/80 (Diluent)
    result = plan_dive_with_engine(
        engine,
        depth=100.0,
        bottom_time=10.0,
        bottom_gas_name="Tx 10/80",
        deco_gas_names=["Oxygen", "Tx 50/15"],
        is_ccr=True,
        setpoint=1.3,
        deco_setpoint=1.3
    )
    
    assert len(result["schedule"]) > 0
    # Should have deco stops
    stops = [s[0] for s in result["schedule"] if s[1] > 0 and s[0] < 100]
    assert len(stops) > 0

def test_gas_consumption():
    schedule = [
        (21.0, 3.0, 13.0, "Air", 0.0, 0.0), # 21m for 3 min
        (0.0, 0.0, 15.0, "Air", 0.0, 0.0)   # Surface
    ]
    # Simple OC dive
    reqs = calculate_gas_consumption(schedule, 30.0, 10.0, "Air", is_ccr=False, sac_rate=20.0)
    assert "Air" in reqs["bailout"]
    assert reqs["bailout"]["Air"] > 0
    
    # CCR dive
    reqs_ccr = calculate_gas_consumption(schedule, 30.0, 10.0, "Air", is_ccr=True, o2_consumption=1.0)
    assert "Onboard Oxygen" in reqs_ccr["onboard"]
    assert "Onboard Diluent" in reqs_ccr["onboard"]
    assert reqs_ccr["onboard"]["Onboard Oxygen"] > 0

def test_show_gas_info():
    with patch('sys.stdout', new=io.StringIO()) as fake_out:
        show_gas_info()
        output = fake_out.getvalue()
        assert "Air" in output
        assert "Oxygen" in output

def test_run_planner_cli():
    class Args:
        depth = 30.0
        time = 15.0
        gas = "Air"
        mode = "oc"
        gf_low = 50.0
        gf_high = 80.0
        desc_rate = 20.0
        asc_rate = 10.0
        model = "C"
        setpoint = 1.2
        deco_setpoint = None
        o2_cons = 1.0

    with patch('sys.stdout', new=io.StringIO()) as fake_out:
        run_planner(Args())
        output = fake_out.getvalue()
        assert "Deco Schedule" in output
        assert "30m" in output
        assert "Air" in output

def test_plan_dive_warnings():
    engine = DecoEngine()
    # High density dive: 60m on Air
    result = plan_dive_with_engine(engine, 60.0, 5.0, "Air", [])
    assert any("density too high" in w for w in result["warnings"])
    
    # High END dive: 60m on Air (He=0, so END=60)
    assert any("END too deep" in w for w in result["warnings"])
    
    # High pO2 dive: 60m on Air (pO2 = 7 * 0.21 = 1.47)
    assert any("pO2 too high" in w for w in result["warnings"])

def test_plan_ccr_warnings():
    engine = DecoEngine()
    # High setpoint
    result = plan_dive_with_engine(engine, 30.0, 5.0, "Air", [], is_ccr=True, setpoint=1.5, deco_setpoint=1.6)
    assert any("Bottom setpoint pO2 too high" in w for w in result["warnings"])
    assert any("Deco setpoint pO2 too high" in w for w in result["warnings"])
    
    # Diluent pO2 too high (30m on Air -> pO2 ~ 0.83. Setpoint 0.8 -> warning)
    result_dil = plan_dive_with_engine(engine, 30.0, 5.0, "Air", [], is_ccr=True, setpoint=0.8)
    assert any("Diluent pO2 too high at bottom" in w for w in result_dil["warnings"])

def test_load_data_errors():
    with patch('builtins.open', side_effect=FileNotFoundError):
        assert load_gases() == []
        assert load_cylinders() == []

def test_get_travel_time():
    # Ascent 20m to 10m at 10m/min -> 1 min
    assert get_travel_time(20, 10, 10) == 1.0
    # Ascent 10m to 0m -> 10m/min but capped at 1m/min below 10m?
    # Wait, the code says:
    # if d1 <= 10.0: return (d1 - d2) / 1.0
    assert get_travel_time(10, 0, 10) == 10.0
    # Ascent 20m to 0m -> (20-10)/10 + (10-0)/1 = 1 + 10 = 11.0
    assert get_travel_time(20, 0, 10) == 11.0
    # Not an ascent
    assert get_travel_time(10, 20, 10) == 0.0

def test_main_cli_entry():
    with patch('sys.argv', ['deko_agent.py', '--depth', '30', '--time', '20', '--gas', 'Air', '--mode', 'oc']):
        with patch('deko_agent.run_planner') as mock_planner:
            from deko_agent import main
            try:
                main()
            except SystemExit:
                pass
            assert mock_planner.called

def test_run_planner_interactive():
    inputs = [
        "30", # depth
        "20", # time
        "Air", # gas
        "oc", # mode
        "50", # gf_low
        "80", # gf_high
        "20", # desc
        "10", # asc
        "C"   # model
    ]
    with patch('builtins.input', side_effect=inputs):
        with patch('sys.stdout', new=io.StringIO()) as fake_out:
            run_planner()
            output = fake_out.getvalue()
            assert "Deco Schedule" in output

def test_run_planner_interactive_ccr():
    inputs = [
        "100", # depth
        "10", # time
        "Tx 10/80", # gas
        "ccr", # mode
        "1.3", # setpoint
        "1.3", # deco setpoint
        "1.0", # o2 cons
        "30", # gf_low
        "70", # gf_high
        "20", # desc
        "10", # asc
        "C"   # model
    ]
    with patch('builtins.input', side_effect=inputs):
        with patch('sys.stdout', new=io.StringIO()) as fake_out:
            run_planner()
            output = fake_out.getvalue()
            assert "Onboard Gas Requirements" in output

def test_run_planner_interactive_invalid():
    with patch('builtins.input', side_effect=["invalid"]):
        with patch('sys.stdout', new=io.StringIO()) as fake_out:
            run_planner()
            assert "Invalid input." in fake_out.getvalue()

def test_main_cli_missing_args():
    with patch('sys.argv', ['deko_agent.py', '--depth', '30']):
        with patch('sys.stdout', new=io.StringIO()) as fake_out:
            from deko_agent import main
            with pytest.raises(SystemExit):
                main()
            assert "Error: Missing required arguments" in fake_out.getvalue()

def test_calculate_min_od_zero():
    assert calculate_min_od(0) == float('inf')

def test_plan_dive_deco_warnings():
    engine = DecoEngine()
    # 40m dive, use Air as deco gas. Air at 40m has END 40m (> 30m).
    # Use high GF to avoid hanging (off-gassing requirements will be minimal).
    result = plan_dive_with_engine(engine, 40.0, 5.0, "Tx 15/55", ["Air"], gf_low=0.8, gf_high=0.8)
    assert any("Deco gas" in w and "END" in w for w in result["warnings"])

def test_run_planner_high_toxicity_warnings():
    # Dive that exceeds 80% CNS and 300 OTUs
    # 30m for 120 min on Oxygen? pO2 = 4.0 (very high)
    # But planner might complain about pO2 first.
    # Let's use a very long dive at 1.6 pO2.
    # pO2 1.6 for 45 min = 100% CNS.
    # 45 min at 1.6 pO2 = 45 * ((1.6-0.5)/0.5)^0.833 = 45 * 2.2^0.833 = 45 * 1.9 = 85 OTU.
    # To get 300 OTU, we need more.
    
    class Args:
        depth = 6.0 # 1.6 bar on O2
        time = 200.0
        gas = "Oxygen"
        mode = "oc"
        gf_low = 100
        gf_high = 100
        desc_rate = 20.0
        asc_rate = 10.0
        model = "C"
        setpoint = 1.2
        deco_setpoint = None
        o2_cons = 1.0

    with patch('sys.stdout', new=io.StringIO()) as fake_out:
        run_planner(Args())
        output = fake_out.getvalue()
        assert "!!! WARNING: CNS EXCEEDS 80% !!!" in output
        assert "!!! WARNING: OTUs EXCEED 300 (Daily Limit) !!!" in output

def test_plan_dive_invalid_gas():
    engine = DecoEngine()
    with pytest.raises(KeyError):
        plan_dive_with_engine(engine, 30, 20, "NonExistentGas", [])
