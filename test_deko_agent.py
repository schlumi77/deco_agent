import pytest
from deko_agent import load_gases, load_cylinders, plan_dive_with_engine
from deco_engine import DecoEngine

def test_load_data():
    gases = load_gases()
    assert len(gases) > 0
    assert any(g['name'] == 'Air' for g in gases)
    
    cylinders = load_cylinders()
    assert len(cylinders) > 0
    assert any(c['name'] == 'Diluent/Bailout' for c in cylinders)

def test_plan_simple_dive():
    engine = DecoEngine()
    # 30m for 20 min on Air
    # We expect a schedule that includes bottom and some ascent/deco
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
