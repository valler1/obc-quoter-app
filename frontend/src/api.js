// When you deploy, set this from an env variable.
// For local dev: backend at http://localhost:4000
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export async function searchFlights(payload) {
  const res = await fetch(`${API_BASE_URL}/api/flights/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Flight search failed');
  return res.json();
}

export async function getQuotes() {
  const res = await fetch(`${API_BASE_URL}/api/quotes`);
  if (!res.ok) throw new Error('Fetch quotes failed');
  return res.json();
}

export async function saveQuote(payload) {
  const res = await fetch(`${API_BASE_URL}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Save quote failed');
  return res.json();
}
