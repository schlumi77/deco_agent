import { useState, useCallback } from 'react';
import './App.css';
import DiveForm from './components/DiveForm';
import TissueChart from './components/TissueChart';
import DiveProfileChart from './components/DiveProfileChart';
import type { DivePlanRequest, DivePlanResponse } from './types';
import { Activity, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from './api';

function App() {
  const [plan, setPlan] = useState<DivePlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState('C');

  const handlePlanChange = useCallback(async (request: DivePlanRequest) => {
    setLoading(true);
    setError(null);
    setModel(request.model);
    try {
      const response = await fetch(`${API_BASE_URL}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to calculate plan');
      }
      const data = await response.json();
      setPlan(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="app-container">
      <div style={{position: 'absolute', top: 0, right: 0, padding: '5px', color: '#333', fontSize: '10px'}}>RENDER OK</div>
      <header className="app-header">
        <div className="logo">
          <Activity size={24} color="#00ffcc" />
          <h1>DEKO_AGENT <span className="version">v2.0</span></h1>
        </div>
        <div className="status">
          {loading ? <span className="blink">CALCULATING...</span> : <span>ENGINE: ZHL-16{model}</span>}
        </div>
      </header>

      <main className="app-main-dashboard">
        <div className="parameters-toolbar">
          <DiveForm onPlanChange={handlePlanChange} />
          {plan && (
            <div className="stats-badges">
              <div className="stat-badge">
                <label>CNS</label>
                <span className={plan.cns_percent > 80 ? 'warn' : ''}>{plan.cns_percent.toFixed(0)}%</span>
              </div>
              <div className="stat-badge">
                <label>OTU</label>
                <span className={plan.otus > 300 ? 'warn' : ''}>{plan.otus.toFixed(0)}</span>
              </div>
              <div className="stat-badge">
                <label>SURF GF</label>
                <span className={plan.surface_gf > 100 ? 'warn' : ''}>{plan.surface_gf.toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-content">
          {error && <div className="error-banner">{error}</div>}
          
          {plan && plan.warnings.length > 0 && (
            <div className="warning-panel">
              <div className="panel-header-compact warning-text">
                <AlertTriangle size={12} /> SAFETY WARNINGS
              </div>
              <ul className="warning-list">
                {plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="dashboard-row profile-hero">
            <div className="panel profile-panel">
              <div className="panel-header-compact">DIVE PROFILE</div>
              {plan && <DiveProfileChart data={plan.profile} />}
            </div>
          </div>

          <div className="dashboard-row schedule-row">
            <div className="panel schedule-panel">
              <div className="panel-header-compact">DECOMPRESSION SCHEDULE</div>
              <div className="table-container-compact">
                <table>
                  <thead>
                    <tr>
                      <th>DEPTH</th>
                      <th>TIME</th>
                      <th>RT</th>
                      <th>GAS</th>
                      <th>CNS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan?.schedule.map((entry, i) => (
                      <tr key={i}>
                        <td>{entry.depth}m</td>
                        <td>{entry.time}m</td>
                        <td>{entry.run_time}m</td>
                        <td>{entry.gas.replace('CCR SP ', 'SP ')}</td>
                        <td>{entry.cns.toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="dashboard-row secondary-visuals">
            <div className="panel tissue-panel">
              <div className="panel-header-compact">TISSUE LOADING</div>
              {plan && <TissueChart data={plan.tissue_loads} />}
            </div>
            <div className="panel gas-requirements-panel">
              <div className="panel-header-compact">GAS REQUIREMENTS</div>
              {plan && (
                <div className="gas-sections-compact">
                  {Object.keys(plan.gas_requirements.onboard).length > 0 && (
                    <div className="gas-group">
                      <div className="gas-group-label">ONBOARD</div>
                      {Object.entries(plan.gas_requirements.onboard).map(([gas, vol]) => (
                        <div key={gas} className="gas-row">
                          <span>{gas.replace('Onboard ', '')}</span>
                          <span className="vol">{Math.round(vol)}L</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="gas-group">
                    <div className="gas-group-label">BAILOUT (1.5x)</div>
                    {Object.entries(plan.gas_requirements.bailout).map(([gas, vol]) => (
                      <div key={gas} className="gas-row">
                        <span>{gas}</span>
                        <span className="vol">{Math.round(vol)}L</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
