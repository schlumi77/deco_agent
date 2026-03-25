import React, { useState, useEffect } from 'react';
import type { DivePlanRequest, GasMix } from '../types';

interface Props {
  onPlanChange: (request: DivePlanRequest) => void;
}

const DiveForm: React.FC<Props> = ({ onPlanChange }) => {
  const [gases, setGases] = useState<GasMix[]>([]);
  const [request, setRequest] = useState<DivePlanRequest>({
    depth: 45,
    bottom_time: 20,
    bottom_gas: 'Air',
    deco_gases: [],
    gf_low: 50,
    gf_high: 80,
    is_ccr: false,
    setpoint: 1.2,
    deco_setpoint: 1.2,
    descent_rate: 20,
    ascent_rate: 10,
    force_6m: true,
    model: 'C',
  });

  useEffect(() => {
    const hostname = window.location.hostname;
    fetch(`http://${hostname}:8000/api/gases`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch gases');
        return res.json();
      })
      .then(data => {
        setGases(data);
        if (data.length > 0) {
          const air = data.find((g: GasMix) => g.name === 'Air');
          const nx32 = data.find((g: GasMix) => g.name === 'Nx 32');
          const firstBottom = data.find((g: GasMix) => g.type === 'bottom');
          setRequest(prev => ({ 
            ...prev, 
            bottom_gas: air ? 'Air' : (nx32 ? 'Nx 32' : (firstBottom ? firstBottom.name : data[0].name)) 
          }));
        }
      })
      .catch(err => {
        console.error("Gas fetch error:", err);
      });
  }, []);

  useEffect(() => {
    if (request.bottom_gas) {
      onPlanChange(request);
    }
  }, [request]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
                type === 'number' ? parseFloat(value) : value;
    
    setRequest(prev => ({ ...prev, [name]: val }));
  };

  const handleDecoGasToggle = (name: string) => {
    setRequest(prev => {
      const exists = prev.deco_gases.includes(name);
      if (exists) {
        return { ...prev, deco_gases: prev.deco_gases.filter(g => g !== name) };
      } else {
        return { ...prev, deco_gases: [...prev.deco_gases, name] };
      }
    });
  };

  return (
    <div className="dive-form-toolbar">
      <div className="toolbar-section">
        <div className="form-group-inline">
          <label>DEPTH</label>
          <input type="number" name="depth" value={request.depth} onChange={handleChange} style={{width: '60px'}} />
        </div>
        <div className="form-group-inline">
          <label>TIME</label>
          <input type="number" name="bottom_time" value={request.bottom_time} onChange={handleChange} style={{width: '60px'}} />
        </div>
        <div className="form-group-inline">
          <label>GAS</label>
          <select name="bottom_gas" value={request.bottom_gas} onChange={handleChange}>
            {gases.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </div>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-section">
        <div className="form-group-inline">
          <label>MODE</label>
          <div className="toggle-group compact">
            <button 
              className={!request.is_ccr ? 'active' : ''} 
              onClick={() => setRequest(p => ({...p, is_ccr: false}))}
            >OC</button>
            <button 
              className={request.is_ccr ? 'active' : ''} 
              onClick={() => setRequest(p => ({...p, is_ccr: true}))}
            >CCR</button>
          </div>
        </div>
        {request.is_ccr && (
          <>
            <div className="form-group-inline">
              <label>SP B</label>
              <input type="number" name="setpoint" step="0.1" value={request.setpoint} onChange={handleChange} style={{width: '50px'}} />
            </div>
            <div className="form-group-inline">
              <label>SP D</label>
              <input type="number" name="deco_setpoint" step="0.1" value={request.deco_setpoint} onChange={handleChange} style={{width: '50px'}} />
            </div>
          </>
        )}
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-section">
        <div className="form-group-inline">
          <label>GF LOW</label>
          <input type="number" name="gf_low" step="5" value={request.gf_low} onChange={handleChange} style={{width: '50px'}} />
        </div>
        <div className="form-group-inline">
          <label>GF HIGH</label>
          <input type="number" name="gf_high" step="5" value={request.gf_high} onChange={handleChange} style={{width: '50px'}} />
        </div>
        <div className="form-group-inline">
          <label>MODEL</label>
          <select name="model" value={request.model} onChange={handleChange} style={{width: '100px'}}>
            <option value="B">ZH-L16B</option>
            <option value="C">ZH-L16C</option>
          </select>
        </div>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-section">
        <div className="form-group-inline">
          <label>DECO</label>
          <div className="gas-pills">
            {gases.filter(g => g.type === 'deco' || g.name === 'Oxygen').map(g => (
              <button 
                key={g.name}
                className={request.deco_gases.includes(g.name) ? 'active' : ''}
                onClick={() => handleDecoGasToggle(g.name)}
              >
                {g.name === 'Oxygen' ? 'O2' : g.name.replace('Tx ', '')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiveForm;
