import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_get_gases():
    response = client.get("/api/gases")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert any(g['name'] == 'Air' for g in response.json())

def test_get_cylinders():
    response = client.get("/api/cylinders")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert any(c['name'] == 'Diluent/Bailout' for c in response.json())

def test_plan_endpoint():
    request_data = {
        "depth": 30.0,
        "bottom_time": 15.0,
        "bottom_gas": "Air",
        "deco_gases": ["Oxygen"],
        "gf_low": 50,
        "gf_high": 80,
        "is_ccr": False
    }
    response = client.post("/api/plan", json=request_data)
    assert response.status_code == 200
    data = response.json()
    assert "schedule" in data
    assert "gas_requirements" in data
    assert "cns_percent" in data
    assert len(data["schedule"]) > 0
    # First entry should be bottom (from my recent change)
    assert data["schedule"][0]["depth"] == 30.0
