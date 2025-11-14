import React, { useEffect, useState } from 'react';
import { getQuotes, searchFlights, saveQuote } from './api';

const emptyQuote = {
  id: null,
  customer_name: '',
  customer_company: '',
  customer_contact: '',
  origin_city: '',
  destination_city: '',
  pickup_time: '',
  delivery_deadline: '',
  package_description: '',
  weight_kg: '',
  traveler: 'you',
  travel_class: 'ANY', // ANY / ECONOMY / PREMIUM_ECONOMY / BUSINESS / FIRST
  status: 'draft',
  flight_cost_total: 0,
  ground_cost_total: 0,
  time_cost_total: 0,
  other_cost_total: 0,
  total_cost: 0,
  margin_type: 'percent',
  margin_value: 30,
  margin_amount: 0,
  price_to_customer: 0,
  currency: 'EUR',
  internal_note: '',
};

function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'new'
  const [step, setStep] = useState(1);
  const [quotes, setQuotes] = useState([]);
  const [quote, setQuote] = useState(emptyQuote);
  const [flightOffers, setFlightOffers] = useState([]);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [costItems, setCostItems] = useState([]);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadQuotes();
  }, []);

  async function loadQuotes() {
    try {
      const data = await getQuotes();
      setQuotes(data);
    } catch (e) {
      console.error(e);
    }
  }

  function startNewQuote() {
    setQuote(emptyQuote);
    setCostItems([]);
    setFlightOffers([]);
    setSelectedOffer(null);
    setStep(1);
    setView('new');
  }

  // ---- Step 2: flights ----
  async function handleSearchFlights() {
    setError('');
    if (!quote.origin_city || !quote.destination_city || !quote.pickup_time) {
      setError('Fill origin, destination and pickup time first.');
      return;
    }
    setLoadingFlights(true);
    try {
      const departureDate = quote.pickup_time.slice(0, 10);

      const payload = {
        originLocationCode: quote.origin_city.toUpperCase(),
        destinationLocationCode: quote.destination_city.toUpperCase(),
        departureDate,
        adults: 1,
      };

      if (quote.travel_class && quote.travel_class !== 'ANY') {
        payload.travelClass = quote.travel_class;
      }

      const res = await searchFlights(payload);
      setFlightOffers(res.offers || []);
    } catch (e) {
      console.error(e);
      setError('Flight search failed.');
    } finally {
      setLoadingFlights(false);
    }
  }

  function useOffer(offer) {
    setSelectedOffer(offer);
    const flightCost = Number(offer.totalPrice || 0);
    setQuote((q) => ({ ...q, flight_cost_total: flightCost }));
  }

  // ---- Step 3: costs & margin ----
  function recalcTotals(items) {
    const ground = items
      .filter((i) => i.category === 'ground')
      .reduce((sum, i) => sum + Number(i.line_total || 0), 0);
    const other = items
      .filter((i) => i.category === 'other')
      .reduce((sum, i) => sum + Number(i.line_total || 0), 0);
    const timeCost = Number(quote.time_cost_total || 0);
    const flightCost = Number(quote.flight_cost_total || 0);
    const totalCost = flightCost + ground + timeCost + other;

    let price = totalCost;
    let marginAmount = 0;

    if (quote.margin_type === 'percent') {
      price = totalCost * (1 + Number(quote.margin_value || 0) / 100);
      marginAmount = price - totalCost;
    } else {
      marginAmount = Number(quote.margin_value || 0);
      price = totalCost + marginAmount;
    }

    setQuote((q) => ({
      ...q,
      ground_cost_total: ground,
      other_cost_total: other,
      total_cost: totalCost,
      margin_amount: marginAmount,
      price_to_customer: price,
    }));
  }

  function updateCostItem(index, field, value) {
    setCostItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      const qty = Number(copy[index].quantity || 0);
      const unitPrice = Number(copy[index].unit_price || 0);
      copy[index].line_total = qty * unitPrice;
      recalcTotals(copy);
      return copy;
    });
  }

  function addCostItem(category) {
    setCostItems((prev) => [
      ...prev,
      {
        description: '',
        quantity: 1,
        unit: '',
        unit_price: 0,
        line_total: 0,
        category,
      },
    ]);
  }

  function updateQuoteField(field, value) {
    setQuote((prev) => {
      const updated = { ...prev, [field]: value };
      return updated;
    });
    if (field === 'margin_type' || field === 'margin_value') {
      recalcTotals(costItems);
    }
  }

  // ---- Save quote ----
  async function handleSave(statusToSet) {
    const payload = {
      ...quote,
      status: statusToSet || quote.status,
      cost_items: costItems,
      flight_segments: selectedOffer
        ? selectedOffer.itineraries.flatMap((it) =>
            it.segments.map((seg) => ({
              from: seg.from,
              to: seg.to,
              departure: seg.departure,
              arrival: seg.arrival,
              carrierCode: seg.carrierCode,
              flightNumber: seg.flightNumber,
              price_component: null,
            })),
          )
        : [],
    };
    try {
      const res = await saveQuote(payload);
      setQuote((q) => ({ ...q, id: res.id, status: statusToSet || q.status }));
      await loadQuotes();
      alert('Quote saved');
    } catch (e) {
      console.error(e);
      alert('Error saving quote');
    }
  }

  // ---- UI: Dashboard ----
  if (view === 'dashboard') {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        <h1>OBC Quoter</h1>
        <button onClick={startNewQuote}>+ New Quote</button>
        <h2 style={{ marginTop: '20px' }}>Recent Quotes</h2>
        <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Created</th>
              <th>Customer</th>
              <th>Route</th>
              <th>Price (€)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td>{q.id}</td>
                <td>{new Date(q.created_at).toLocaleString()}</td>
                <td>{q.customer_name}</td>
                <td>
                  {q.origin_city} → {q.destination_city}
                </td>
                <td>{q.price_to_customer}</td>
                <td>{q.status}</td>
              </tr>
            ))}
            {quotes.length === 0 && (
              <tr>
                <td colSpan="6">No quotes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // ---- UI: Wizard (steps 1–4) ----
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1100px', margin: '0 auto' }}>
      <button onClick={() => setView('dashboard')}>← Back to dashboard</button>
      <h1>New Quote</h1>
      <div style={{ marginBottom: '10px' }}>Step {step} of 4</div>
      {error && <div style={{ color: 'red' }}>{error}</div>}

      {step === 1 && (
        <div>
          <h2>Step 1 – Request details</h2>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1 }}>
              <label>Pickup city/airport (IATA)</label>
              <input
                value={quote.origin_city}
                onChange={(e) => updateQuoteField('origin_city', e.target.value)}
              />
              <label>Delivery city/airport (IATA)</label>
              <input
                value={quote.destination_city}
                onChange={(e) => updateQuoteField('destination_city', e.target.value)}
              />
              <label>Pickup earliest time</label>
              <input
                type="datetime-local"
                value={quote.pickup_time}
                onChange={(e) => updateQuoteField('pickup_time', e.target.value)}
              />
