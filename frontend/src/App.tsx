import { useState, useCallback, lazy, Suspense } from 'react';
import './App.css';
import DiveForm from './components/DiveForm';
import InfoModal from './components/InfoModal';
import type { DivePlanResponse, DivePlanRequest } from '@shared/types';
import { Activity, AlertTriangle, Settings, ChevronUp, Info } from 'lucide-react';
import { planDive, planBailout, calculateGasRequirements, GAS_RESERVE_FACTOR } from '@shared/engine/planner';

// The charts pull in Recharts, the bulk of the bundle. Loading them on demand
// keeps the form and the schedule table out of that download.
const TissueChart = lazy(() => import('./components/TissueChart'));
const DiveProfileChart = lazy(() => import('./components/DiveProfileChart'));

function App() {
  const [plan, setPlan] = useState<DivePlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState('C');
  const [isCcr, setIsCcr] = useState(false);
  const [showMobileParams, setShowMobileParams] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const handlePlanChange = useCallback(async (request: DivePlanRequest) => {
    setLoading(true);
    setError(null);
    setModel(request.model);
    
    setTimeout(() => {
      try {
        const result = planDive(request);
        const bailout = request.is_ccr ? planBailout(request) : null;
        const gasRequirements = calculateGasRequirements(request, result, bailout);

        setIsCcr(request.is_ccr);
        setPlan({
          ...result,
          warnings: [...result.warnings, ...(bailout?.warnings ?? []), ...gasRequirements.warnings],
          gas_requirements: gasRequirements,
        });
      } catch (err: unknown) {
        // The last plan no longer matches the inputs, so stop showing it.
        setPlan(null);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    }, 10);
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <Activity size={24} color="#00ffcc" />
          <h1>DECO AGENT <span className="version">v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.0'}</span></h1>
        </div>
        <div className="header-controls">
          <div className="status desktop-only">
            {loading ? <span className="blink">CALCULATING...</span> : <span>ENGINE: ZHL-16{model}</span>}
          </div>
          <button
            className="info-btn"
            onClick={() => setShowInfo(true)}
            aria-label="About Deco Agent"
            title="About / Features"
          >
            <Info size={20} />
          </button>
          <button
            className={`mobile-toggle-btn ${showMobileParams ? 'active' : ''}`}
            onClick={() => setShowMobileParams(!showMobileParams)}
          >
            {showMobileParams ? <ChevronUp size={20} /> : <Settings size={20} />}
            <span>{showMobileParams ? 'CLOSE' : 'PARAMS'}</span>
          </button>
        </div>
      </header>

      <main className="app-main-dashboard">
        <div className={`parameters-toolbar ${showMobileParams ? 'mobile-visible' : ''}`}>
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
          {loading && <div className="loading-overlay-mobile"><div className="blink">CALCULATING...</div></div>}
          {error && <div className="error-banner">{error}</div>}
          
          {plan && plan.warnings.length > 0 && (
            <div className="warning-panel">
              <div className="panel-header-compact warning-text">
                <AlertTriangle size={12} /> SAFETY WARNINGS
              </div>
              <ul className="warning-list">
                {plan.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="dashboard-row profile-hero">
            <div className="panel profile-panel">
              <div className="panel-header-compact">DIVE PROFILE</div>
              {plan && <Suspense fallback={null}><DiveProfileChart data={plan.profile} /></Suspense>}
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
                      <th className="desktop-only">CNS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan?.schedule.map((entry, i) => (
                      <tr key={i}>
                        <td>{entry.depth}m</td>
                        <td>{entry.time}min</td>
                        <td>{entry.run_time}min</td>
                        <td className="gas-cell">{entry.gas.replace(/^CCR /, '')}</td>
                        <td className="desktop-only">{entry.cns.toFixed(0)}%</td>
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
              {plan && <Suspense fallback={null}><TissueChart data={plan.tissue_loads} /></Suspense>}
            </div>
            <div className="panel gas-requirements-panel">
              <div className="panel-header-compact">GAS REQUIREMENTS</div>
              {plan && plan.gas_requirements && (
                <div className="gas-sections-compact">
                  {Object.keys(plan.gas_requirements.onboard).length > 0 && (
                    <div className="gas-group">
                      <div className="gas-group-label">ONBOARD</div>
                      {Object.entries(plan.gas_requirements.onboard).map(([gas, vol]) => (
                        <div key={gas} className="gas-row">
                          <span>{gas.replace('Onboard ', '')}</span>
                          <span className="vol">{Math.ceil(vol as number)}L</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="gas-group">
                    <div className="gas-group-label">{isCcr ? 'BAILOUT' : 'OPEN CIRCUIT'} ({GAS_RESERVE_FACTOR}x)</div>
                    {Object.entries(plan.gas_requirements.open_circuit).map(([gas, vol]) => (
                      <div key={gas} className="gas-row">
                        <span>{gas}</span>
                        <span className="vol">{Math.ceil(vol as number)}L</span>
                      </div>
                    ))}
                  </div>
                  <div className="gas-group">
                    <div className="gas-group-label">CYLINDERS (NEED / HOLD)</div>
                    {plan.gas_requirements.cylinders.map((c, i) => (
                      <div key={i} className="gas-row" title={c.supplies.join(' + ')}>
                        <span>{c.cylinder}: {c.supplies.join(' + ')}</span>
                        <span className={c.required > c.available ? 'vol short' : 'vol'}>
                          {Math.ceil(c.required)} / {Math.floor(c.available)}L
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}

export default App;
