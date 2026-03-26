import sys
import os
import math
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict

# Add parent directory to sys.path to import deko_agent and deco_engine
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from deko_agent import plan_dive_with_engine, calculate_gas_consumption, load_gases, load_cylinders
from deco_engine import DecoEngine
from .models import DivePlanRequest, DivePlanResponse, ScheduleEntry, TissueLoad, ProfileEntry, GasRequirements, GasMix

app = FastAPI(
    title="Deco Agent API",
    description="High-precision technical diving gas management and decompression planning utility.",
    version="2.1.0",
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/gases", summary="Get standard diving gases", response_description="List of available gases", response_model=List[GasMix])
def get_gases():
    return load_gases()

@app.get("/api/cylinders", summary="Get standard cylinder sizes", response_description="List of available cylinders", response_model=List[Dict])
def get_cylinders():
    return load_cylinders()

@app.post("/api/plan", response_model=DivePlanResponse, summary="Calculate a dive plan", response_description="Detailed dive schedule and gas requirements")
def plan_dive(request: DivePlanRequest):
    try:
        # Validate finite numbers
        for field, value in request.model_dump().items():
            if isinstance(value, (int, float)) and not math.isfinite(value):
                raise ValueError(f"Field {field} must be a finite number")

        engine = DecoEngine(model=request.model)
        result = plan_dive_with_engine(
            engine,
            depth=request.depth,
            bottom_time=request.bottom_time,
            bottom_gas_name=request.bottom_gas,
            deco_gas_names=request.deco_gases,
            gf_low=request.gf_low / 100.0 if request.gf_low > 1.0 else request.gf_low,
            gf_high=request.gf_high / 100.0 if request.gf_high > 1.0 else request.gf_high,
            is_ccr=request.is_ccr,
            setpoint=request.setpoint,
            deco_setpoint=request.deco_setpoint,
            descent_rate=request.descent_rate,
            ascent_rate=request.ascent_rate,
            force_6m=request.force_6m
        )
        
        schedule_raw = result['schedule']
        profile_raw = result['profile']
        
        gas_reqs_raw = calculate_gas_consumption(
            schedule_raw,
            depth=request.depth,
            bottom_time=request.bottom_time,
            bottom_gas_name=request.bottom_gas,
            is_ccr=request.is_ccr,
            descent_rate=request.descent_rate,
            ascent_rate=request.ascent_rate
        )
        
        gas_reqs = GasRequirements(
            bailout=gas_reqs_raw['bailout'],
            onboard=gas_reqs_raw['onboard']
        )
        
        schedule = [
            ScheduleEntry(
                depth=d, time=t, run_time=rt, gas=g, cns=c, otu=o
            ) for d, t, rt, g, c, o in schedule_raw
        ]

        profile = [
            ProfileEntry(time=p['time'], depth=p['depth'], gas=p['gas'])
            for p in profile_raw
        ]
        
        tissue_loads = [
            TissueLoad(**load) for load in engine.get_tissue_loads()
        ]
        
        return DivePlanResponse(
            schedule=schedule,
            profile=profile,
            gas_requirements=gas_reqs,
            cns_percent=engine.toxicity_tracker.cns_percent,
            otus=engine.toxicity_tracker.otus,
            tissue_loads=tissue_loads,
            surface_gf=result['surface_gf'],
            warnings=result['warnings']
        )
    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"ERROR: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
