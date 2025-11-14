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

  // ---- step 2: flights ----
  async function handleSearchFlights() {
    setError('');
    if (!quote.origin_city || !quote.destination_city || !quote.pickup_time) {
      setError('Fill origin, destination and pickup time first.');
      return;
    }
    setLoadingFlights(true);
    try {
      const departureDate = quote.pickup_time.slice(0, 10);
      const res = await searchFlights({
        originLocationCode: quote.origin_city.toUpperCase(),
        destinationLocationCode: quote.destination_city.toUpperCase(),
        departureDate,
        adults: 1
      });
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
    setQuote(q => ({ ...q, flight_cost_total: flightCost }));
  }

  // ---- step 3: costs & margin ----
  function updateCostItem(index, field, value) {
    setCostItems(prev => {
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
    setCostItems(prev => {
      const copy = [
        ...prev,
        {
          description: '',
          quantity: 1,
          unit: '',
          unit_price: 0,
          line_total: 0,
          category
        }
      ];
      return copy;
    });
  }

  function recalcTotals(items) {
    const ground = items
      .filter(i => i.category === 'ground')
      .reduce((sum, i) => sum + Number(i.line_total || 0), 0);
    const other = items
      .filter(i => i.category === 'other')
      .reduce((sum, i) => sum + Number(i.line_total || 0), 0);
    const timeCost = Number(quote.time_cost_total || 0); // simple for now
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
    setQuote(q => ({
      ...q,
      ground_cost_total: ground,
      other_cost_total: other,
      total_cost: totalCost,
      margin_amount: marginAmount,
      price_to_customer: price
    }));
  }

  function updateQuoteField(field, value) {
    setQuote(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'margin_type' || field === 'margin_value') {
        recalcTotals(costItems);
      }
      return updated;
    });
  }

  // ---- save ----
  async function handleSave(statusToSet) {
    const payload = {
      ...quote,
      status: statusToSet || quote.status,
      cost_items: costItems,
      flight_segments: selectedOffer
        ? selectedOffer.itineraries.flatMap(it =>
            it.segments.map(seg => ({
              from: seg.from,
              to: seg.to,
              departure: seg.departure,
              arrival: seg.arrival,
              carrierCode: seg.carrierCode,
              flightNumber: seg.flightNumber,
              price_component: null
            }))
          )
        : []
    };
    try {
      const res = await saveQuote(payload);
      setQuote(q => ({ ...q, id: res.id, status: statusToSet || q.status }));
      await loadQuotes();
      alert('Quote saved');
    } catch (e) {
      console.error(e);
      alert('Error saving quote');
    }
  }

  // ---- UI ----

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
            {quotes.map(q => (
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
                onChange={e => updateQuoteField('origin_city', e.target.value)}
              />
              <label>Delivery city/airport (IATA)</label>
              <input
                value={quote.destination_city}
                onChange={e => updateQuoteField('destination_city', e.target.value)}
              />
              <label>Pickup earliest time</label>
              <input
                type="datetime-local"
                value={quote.pickup_time}
                onChange={e => updateQuoteField('pickup_time', e.target.value)}
              />
              <label>Latest acceptable delivery time</label>
              <input
                type="datetime-local"
                value={quote.delivery_deadline}
                onChange={e => updateQuoteField('delivery_deadline', e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Customer name</label>
              <input
                value={quote.customer_name}
                onChange={e => updateQuoteField('customer_name', e.target.value)}
              />
              <label>Customer company</label>
              <input
                value={quote.customer_company}
                onChange={e => updateQuoteField('customer_company', e.target.value)}
              />
              <label>Customer contact</label>
              <input
                value={quote.customer_contact}
                onChange={e => updateQuoteField('customer_contact', e.target.value)}
              />
              <label>Package description</label>
              <input
                value={quote.package_description}
                onChange={e => updateQuoteField('package_description', e.target.value)}
              />
              <label>Weight (kg)</label>
              <input
                type="number"
                value={quote.weight_kg}
                onChange={e => updateQuoteField('weight_kg', e.target.value)}
              />
              <label>Who will travel</label>
              <select
                value={quote.traveler}
                onChange={e => updateQuoteField('traveler', e.target.value)}
              >
                <option value="you">You</option>
                <option value="partner">Partner courier</option>
                <option value="tbd">To be decided</option>
              </select>
            </div>
          </div>
          <button
            style={{ marginTop: '20px' }}
            onClick={() => setStep(2)}
            disabled={
              !quote.origin_city ||
              !quote.destination_city ||
              !quote.pickup_time ||
              !quote.delivery_deadline ||
              !quote.customer_name ||
              !quote.customer_contact
            }
          >
            Next – Flights
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2>Step 2 – Flights & routing</h2>
          <div style={{ marginBottom: '10px' }}>
            <button onClick={handleSearchFlights} disabled={loadingFlights}>
              {loadingFlights ? 'Searching…' : 'Search flights'}
            </button>
          </div>
          {flightOffers.length > 0 ? (
            <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Itinerary</th>
                  <th>Departure → Arrival</th>
                  <th>Stops</th>
                  <th>Total price (€)</th>
                </tr>
              </thead>
              <tbody>
                {flightOffers.map(offer => {
                  const firstSeg = offer.itineraries[0].segments[0];
                  const lastIt = offer.itineraries[offer.itineraries.length - 1];
                  const lastSeg = lastIt.segments[lastIt.segments.length - 1];
                  const stops = offer.itineraries[0].segments.length - 1;
                  return (
                    <tr key={offer.id}>
                      <td>
                        <input
                          type="radio"
                          name="offer"
                          checked={selectedOffer && selectedOffer.id === offer.id}
                          onChange={() => useOffer(offer)}
                        />
                      </td>
                      <td>
                        {firstSeg.from} → {lastSeg.to}
                      </td>
                      <td>
                        {new Date(firstSeg.departure).toLocaleString()} →{' '}
                        {new Date(lastSeg.arrival).toLocaleString()}
                      </td>
                      <td>{stops === 0 ? 'Non-stop' : `${stops} stop(s)`}</td>
                      <td>{offer.totalPrice}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div>No flights loaded yet.</div>
          )}
          <div style={{ marginTop: '20px' }}>
            <button onClick={() => setStep(1)}>Back</button>
            <button
              style={{ marginLeft: '10px' }}
              onClick={() => setStep(3)}
              disabled={!selectedOffer}
            >
              Next – Costs & margin
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2>Step 3 – Costs & margin</h2>

          <h3>Flight cost</h3>
          <label>Flight cost total (€)</label>
          <input
            type="number"
            value={quote.flight_cost_total}
            onChange={e => {
              const val = Number(e.target.value || 0);
              setQuote(q => ({ ...q, flight_cost_total: val }));
              recalcTotals(costItems);
            }}
          />

          <h3>Ground transport</h3>
          <button onClick={() => addCostItem('ground')}>+ Add ground cost line</button>
          {costItems
            .filter(i => i.category === 'ground')
            .map((item, idx) => {
              const index = costItems.indexOf(item);
              return (
                <div key={index} style={{ border: '1px solid #ccc', padding: '5px', marginTop: '5px' }}>
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={e => updateCostItem(index, 'description', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={e => updateCostItem(index, 'quantity', e.target.value)}
                  />
                  <input
                    placeholder="Unit"
                    value={item.unit}
                    onChange={e => updateCostItem(index, 'unit', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Unit price"
                    value={item.unit_price}
                    onChange={e => updateCostItem(index, 'unit_price', e.target.value)}
                  />
                  <span> Line total: {item.line_total}</span>
                </div>
              );
            })}

          <h3>Other costs</h3>
          <button onClick={() => addCostItem('other')}>+ Add other cost line</button>
          {costItems
            .filter(i => i.category === 'other')
            .map((item, idx) => {
              const index = costItems.indexOf(item);
              return (
                <div key={index} style={{ border: '1px solid #ccc', padding: '5px', marginTop: '5px' }}>
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={e => updateCostItem(index, 'description', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={e => updateCostItem(index, 'quantity', e.target.value)}
                  />
                  <input
                    placeholder="Unit"
                    value={item.unit}
                    onChange={e => updateCostItem(index, 'unit', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Unit price"
                    value={item.unit_price}
                    onChange={e => updateCostItem(index, 'unit_price', e.target.value)}
                  />
                  <span> Line total: {item.line_total}</span>
                </div>
              );
            })}

          <h3>Margin</h3>
          <div>
            <label>Margin type </label>
            <select
              value={quote.margin_type}
              onChange={e => updateQuoteField('margin_type', e.target.value)}
            >
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed €</option>
            </select>
          </div>
          <div>
            <label>Margin value ({quote.margin_type === 'percent' ? '%' : '€'})</label>
            <input
              type="number"
              value={quote.margin_value}
              onChange={e => updateQuoteField('margin_value', e.target.value)}
            />
          </div>

          <div style={{ marginTop: '10px' }}>
            <strong>Total cost:</strong> {quote.total_cost}
            <br />
            <strong>Margin amount:</strong> {quote.margin_amount}
            <br />
            <strong>Price to customer:</strong> {quote.price_to_customer}
          </div>

          <div style={{ marginTop: '20px' }}>
            <button onClick={() => setStep(2)}>Back</button>
            <button style={{ marginLeft: '10px' }} onClick={() => setStep(4)}>
              Next – Preview & send
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2>Step 4 – Preview</h2>
          <div style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
            <h3>
              OBC Quote – {quote.origin_city} → {quote.destination_city}
            </h3>
            <p>
              Customer: {quote.customer_name} ({quote.customer_company}) <br />
              Contact: {quote.customer_contact}
            </p>
            <p>
              Pickup earliest: {quote.pickup_time} <br />
              Latest delivery: {quote.delivery_deadline}
            </p>
            <p>Package: {quote.package_description}</p>
            <p>
              Total all-inclusive price: <strong>{quote.price_to_customer} {quote.currency}</strong>
            </p>
            <p>Status: {quote.status}</p>
          </div>
          <textarea
            style={{ width: '100%', height: '200px' }}
            value={
`Dear ${quote.customer_name},

As discussed, please find below our On-Board Courier proposal for your urgent shipment from ${quote.origin_city} to ${quote.destination_city}.

Total all-inclusive price: €${quote.price_to_customer}

Route: ${quote.origin_city} → ${quote.destination_city}
Pickup earliest: ${quote.pickup_time}
Latest acceptable delivery: ${quote.delivery_deadline}

Please confirm by replying to this email so we can secure the flights and start the operation.

Best regards,
[Your Name]`
            }
            readOnly
          />
          <p style={{ marginTop: '10px' }}>
            Copy the email text above and paste into your mail client.
          </p>
          <div style={{ marginTop: '20px' }}>
            <button onClick={() => setStep(3)}>Back</button>
            <button style={{ marginLeft: '10px' }} onClick={() => handleSave('sent')}>
              Save & mark as sent
            </button>
            <button style={{ marginLeft: '10px' }} onClick={() => handleSave('draft')}>
              Save as draft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
