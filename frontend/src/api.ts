const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;

  const hostname = window.location.hostname;
  // If running on localhost or similar, assume port 8000
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
    return `http://${hostname}:8000`;
  }
  
  // Default fallback (will likely fail on GitHub Pages unless configured via VITE_API_URL)
  return `http://${hostname}:8000`;
};

export const API_BASE_URL = getApiBaseUrl();
