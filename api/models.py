from pydantic import BaseModel
from typing import List, Dict, Optional

class GasMix(BaseModel):
    name: str
    fO2: float
    fHe: float
    type: str

class DivePlanRequest(BaseModel):
    depth: float
    bottom_time: float
    bottom_gas: str
    deco_gases: List[str]
    gf_low: float = 50
    gf_high: float = 80
    is_ccr: bool = False
    setpoint: float = 1.2
    deco_setpoint: Optional[float] = 1.2
    descent_rate: float = 20.0
    ascent_rate: float = 10.0
    force_6m: bool = True
    model: str = "C"

class ScheduleEntry(BaseModel):
    depth: float
    time: float
    run_time: float
    gas: str
    cns: float
    otu: float

class ProfileEntry(BaseModel):
    time: float
    depth: float
    gas: str

class TissueLoad(BaseModel):
    compartment: int
    n2_pressure: float
    he_pressure: float
    total_pressure: float
    load_percent: float  # Relative to M-value at surface

class GasRequirements(BaseModel):
    bailout: Dict[str, float]
    onboard: Dict[str, float]

class DivePlanResponse(BaseModel):
    schedule: List[ScheduleEntry]
    profile: List[ProfileEntry]
    gas_requirements: GasRequirements
    cns_percent: float
    otus: float
    tissue_loads: List[TissueLoad]
    surface_gf: float
    warnings: List[str]
