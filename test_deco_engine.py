import math
import pytest
from deco_engine import DecoEngine, OxygenToxicityTracker, calculate_gas_density

def test_toxicity_tracker_cns():
    tracker = OxygenToxicityTracker()
    
    # At pO2 1.6, limit is 45 min. 22.5 min should be 50%
    cns = tracker.calculate_cns_contribution(1.6, 22.5)
    assert pytest.approx(cns) == 50.0
    
    # At pO2 < 0.6, contribution should be 0
    cns = tracker.calculate_cns_contribution(0.5, 60)
    assert cns == 0.0

def test_toxicity_tracker_otu():
    tracker = OxygenToxicityTracker()
    
    # At pO2 1.0, 1 min = 1 OTU
    otu = tracker.calculate_otu_contribution(1.0, 1.0)
    assert pytest.approx(otu) == 1.0
    
    # At pO2 0.5, 0 OTU
    otu = tracker.calculate_otu_contribution(0.5, 60)
    assert otu == 0.0

def test_engine_initial_state():
    engine = DecoEngine(surface_pressure=1.0)
    # Surface pressure 1.0, Water vapor 0.0627, N2 79.02%
    expected_n2 = (1.0 - 0.0627) * 0.7902
    for p in engine.p_n2:
        assert pytest.approx(p) == expected_n2
    for p in engine.p_he:
        assert p == 0.0

def test_schreiner_equation():
    engine = DecoEngine()
    # If time is 0, tension shouldn't change
    p = engine.schreiner(1.0, 1.5, 0.1, 0, 0.5)
    assert p == 1.0
    
    # Constant inspired pressure (rate = 0)
    # Tension should move towards inspired pressure
    # P = Pi + (P0 - Pi) * exp(-kt)
    # k = ln(2)/half_time. Let's say half_time = 5, t = 5 => exp(-ln(2)) = 0.5
    k = math.log(2) / 5.0
    p = engine.schreiner(1.0, 2.0, 0, 5.0, k)
    assert pytest.approx(p) == 1.5

def test_update_tissues_descent():
    engine = DecoEngine(surface_pressure=1.0)
    # Descent to 30m (4 bar total) in 3 min on Air (21/0)
    initial_n2 = engine.p_n2[0]
    engine.update_tissues(0, 30, 3, 0.21, 0.0)
    
    # Tissues should have increased
    assert engine.p_n2[0] > initial_n2
    # CNS should be 0 since pO2 < 0.6 (avg pO2 during descent: (0.21 + 0.84)/2 = 0.525)
    assert engine.toxicity_tracker.cns_percent == 0.0

def test_get_ceiling():
    engine = DecoEngine(surface_pressure=1.0)
    # At surface, ceiling should be 0
    assert engine.get_ceiling(1.0) == 0.0
    
    # After deep long dive, ceiling should be > 0
    engine.update_tissues(0, 50, 20, 0.21, 0.0) # 50m for 20 min on Air
    ceiling = engine.get_ceiling(1.0)
    assert ceiling > 0.0

def test_gas_density():
    # Air at 0m: (0.21*1.429 + 0.79*1.251) * 1.013 = ~1.305
    d = calculate_gas_density(0.21, 0.0, 0, 1.013)
    assert 1.28 <= d <= 1.31
    
    # Air at 30m (4 bar): ~5.15
    d_30 = calculate_gas_density(0.21, 0.0, 30, 1.0)
    d_0 = calculate_gas_density(0.21, 0.0, 0, 1.0)
    assert pytest.approx(d_30) == d_0 * 4
