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
    assert data["schedule"][0]["depth"] == 30.0

def test_plan_endpoint_invalid_gas():
    request_data = {
        "depth": 30.0,
        "bottom_time": 15.0,
        "bottom_gas": "InvalidGas",
        "deco_gases": [],
        "gf_low": 50,
        "gf_high": 80,
        "is_ccr": False
    }
    response = client.post("/api/plan", json=request_data)
    assert response.status_code == 400
    assert "InvalidGas" in response.json()["detail"]

def test_plan_endpoint_ccr():
    request_data = {
        "depth": 100.0,
        "bottom_time": 10.0,
        "bottom_gas": "Tx 10/80",
        "deco_gases": ["Oxygen", "Tx 50/15"],
        "gf_low": 30,
        "gf_high": 70,
        "is_ccr": True,
        "setpoint": 1.3,
        "deco_setpoint": 1.3
    }
    response = client.post("/api/plan", json=request_data)
    assert response.status_code == 200
    data = response.json()
    assert "onboard" in data["gas_requirements"]
    assert data["gas_requirements"]["onboard"]["Onboard Oxygen"] > 0
