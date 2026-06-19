import { version as reactVersion } from 'react';
import {
  X,
  Activity,
  Gauge,
  FlaskConical,
  ShieldAlert,
  LineChart,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  onClose: () => void;
}

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: <Activity size={18} />,
    title: 'Bühlmann ZHL-16 Engine',
    description:
      'Single TypeScript implementation tracking 16 tissue compartments for both Nitrogen and Helium via the Schreiner equation. Both the B and C coefficient sets are selectable.',
  },
  {
    icon: <Gauge size={18} />,
    title: 'Gradient Factors',
    description:
      'Full GF Low / GF High control over conservatism (e.g. 50/80) to tune deep stops and surfacing margins.',
  },
  {
    icon: <FlaskConical size={18} />,
    title: 'Gas Management & Physics',
    description:
      'MOD, MinOD, END and gas density calculations, with mCCR (constant setpoint) and Open Circuit planning plus automated bailout gas requirements.',
  },
  {
    icon: <ShieldAlert size={18} />,
    title: 'Oxygen Toxicity Tracking',
    description:
      'Real-time CNS% (NOAA single-exposure limits) and OTU (pulmonary toxicity) accounting across the whole dive.',
  },
  {
    icon: <LineChart size={18} />,
    title: 'Interactive Visualisation',
    description:
      'Live dive profile, decompression schedule and tissue-saturation charts, recalculated entirely in the browser — fully offline-capable.',
  },
];

function formatBuildTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const InfoModal: React.FC<Props> = ({ onClose }) => {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

  return (
    <div
      className="info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="About Deco Agent"
    >
      <div className="info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="info-modal-header">
          <div className="logo">
            <Activity size={22} color="var(--accent-color)" />
            <h2>
              DECO AGENT <span className="info-version-tag">v{version}</span>
            </h2>
          </div>
          <button className="info-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="info-modal-body">
          <p className="info-intro">
            A high-precision technical diving gas-management and decompression
            planning utility. The decompression engine runs directly in your
            browser, providing identical results to the command-line agent.
          </p>

          <div className="info-section-label">FEATURES</div>
          <ul className="info-feature-list">
            {FEATURES.map((f) => (
              <li key={f.title} className="info-feature">
                <span className="info-feature-icon">{f.icon}</span>
                <div>
                  <div className="info-feature-title">{f.title}</div>
                  <div className="info-feature-desc">{f.description}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="info-section-label">VERSION INFORMATION</div>
          <div className="info-meta-grid">
            <span className="info-meta-key">Application</span>
            <span className="info-meta-val">v{version}</span>
            <span className="info-meta-key">Decompression Model</span>
            <span className="info-meta-val">Bühlmann ZHL-16B / ZHL-16C</span>
            <span className="info-meta-key">Frontend</span>
            <span className="info-meta-val">React {reactVersion}</span>
            {buildTime && (
              <>
                <span className="info-meta-key">Build</span>
                <span className="info-meta-val">{formatBuildTime(buildTime)}</span>
              </>
            )}
          </div>

          <div className="info-disclaimer">
            <AlertTriangle size={16} />
            <span>
              <strong>For planning purposes only.</strong> Technical diving
              carries inherent risks of serious injury or death. Always verify
              dive plans with secondary software and a dive computer, and never
              dive beyond your training.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoModal;
