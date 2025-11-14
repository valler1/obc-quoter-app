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
  return_date: '', // optional return date for the courier
  package_description: '',
  weight_kg: '',
  traveler: 'you',
  travel_class: 'ANY', // ANY / ECONOMY / PREMIUM_ECONOMY / BUSINESS / FIRST
  nights_at_destination: 0, // auto from RT flight
  days_out_total: 0, // auto from RT flight (for meals / per diem)
  status: 'draft',
  flight_cost_total: 0,
  ground_cost_total: 0,
  time_cost_total: 0,
  other_cost_total: 0,
  total_cost: 0,
  margin_type: 'percent', // 'percent' | 'fixed'
  margin_value: 30,       // either % or € depending on type
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

  // --- helper: compute totals & margin from current costs + quote ---
  function computeTotals(items, q) {
    const flightCost = Number(q.flight_cost_total || 0);
    const timeCost = Number(q.time_cost_total || 0);

    const ground = items
      .filter((i) => i.category === 'ground')
      .reduce((sum, i) => sum + Number(i.line_total || 0), 0);

    // everything that is NOT ground is treated as "other" (hotel, meals, per diem, other misc)
    const other = items
      .filter((i) => i.category !== 'ground')
      .reduce((sum, i) => sum + Number(i.line_total || 0), 0);

    const totalCost = flightCost + timeCost + ground + other;

    let price = totalCost;
    let marginAmount = 0;
    const marginType = q.margin_type || 'percent';
    const marginVal = Number(q.margin_value || 0);

    if (marginType === 'percent') {
      price = totalCost * (1 + marginVal / 100);
      marginAmount = price - totalCost;
    } else {
      marginAmount = marginVal;
      price = totalCost + marginAmount;
    }

    return { ground, other, totalCost, marginAmount, price };
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

      // optional courier return
      if (quote.return_date) {
        payload.returnDate = quote.return_date.slice(0, 10);
      }

      // travel class filter
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

    // --- auto-calc nights at destination for RTs AND total days out ---
    let nights = 0;
    let daysOut = 1; // at least 1 day out

    try {
      if (offer.itineraries && offer.itineraries.length > 1) {
        const outbound = offer.itineraries[0];
        const inbound = offer.itineraries[offer.itineraries.length - 1];

        if (outbound.segments && outbound.segments.length && inbound.segments && inbound.segments.length) {
          const firstOutboundSeg = outbound.segments[0];
          const lastOutboundSeg = outbound.segments[outbound.segments.length - 1];
          const lastInboundSeg = inbound.segments[inbound.segments.length - 1];

          const departHome = new Date(firstOutboundSeg.departure);
          const arriveDest = new Date(lastOutboundSeg.arrival);
          const arriveHome = new Date(lastInboundSeg.arrival);

          // Nights at destination: difference in calendar days between arrival and return departure
          const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
          const dArriveDest = toDateOnly(arriveDest);
          const dArriveHome = toDateOnly(arriveHome);

          const diffMsNights = dArriveHome.getTime() - dArriveDest.getTime();
          if (diffMsNights > 0) {
            nights = Math.round(diffMsNights / (1000 * 60 * 60 * 24));
            if (nights < 0) nights = 0;
          }

          // Days out total: from departure at home to arrival back home, rounded up
          const diffMsDays = arriveHome.getTime() - departHome.getTime();
          if (diffMsDays > 0) {
            const diffHours = diffMsDays / (1000 * 60 * 60);
            daysOut = Math.ceil(diffHours / 24); // round up prorata
            if (daysOut < 1) daysOut = 1;
          }
        }
      }
    } catch (e) {
      console.warn('Error computing nights/days_out_total', e);
      nights = 0;
      daysOut = 1;
    }

    setQuote((q) => {
      const updated = {
        ...q,
        flight_cost_total: flightCost,
        nights_at_destination: nights,
        days_out_total: daysOut,
      };
      const totals = computeTotals(costItems, updated);
      return {
        ...updated,
        ground_cost_total: totals.ground,
        other_cost_total: totals.other,
        total_cost: totals.totalCost,
        margin_amount: totals.marginAmount,
        price_to_customer: totals.price,
      };
    });
  }

  // ---- Step 3: costs & margin ----

  function updateCostItem(index, field, value) {
    setCostItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      const qty = Number(copy[index].quantity || 0);
      const unitPrice = Number(copy[index].unit_price || 0);
      copy[index].line_total = qty * unitPrice;

      const totals = computeTotals(copy, quote);
      setQuote((prevQuote) => ({
        ...prevQuote,
        ground_cost_total: totals.ground,
        other_cost_total: totals.other,
        total_cost: totals.totalCost,
        margin_amount: totals.marginAmount,
        price_to_customer: totals.price,
      }));

      return copy;
    });
  }

  function addCostItem(category, defaults = {}) {
    setCostItems((prev) => {
      const baseItem = {
        description: '',
        quantity: 1,
        unit: '', // kept for backend compatibility, not shown in UI
        unit_price: 0,
        line_total: 0,
        category,
      };
      const item = { ...baseItem, ...defaults };
      const newItems = [...prev, item];

      const totals = computeTotals(newItems, quote);
      setQuote((prevQuote) => ({
        ...prevQuote,
        ground_cost_total: totals.ground,
        other_cost_total: totals.other,
        total_cost: totals.totalCost,
        margin_amount: totals.marginAmount,
        price_to_customer: totals.price,
      }));

      return newItems;
    });
  }

  function updateQuoteField(field, value) {
    setQuote((prev) => {
      const updated = { ...prev, [field]: value };

      // if margin or flight/time costs change, recompute totals
      if (
        field === 'margin_type' ||
        field === 'margin_value' ||
        field === 'flight_cost_total' ||
        field === 'time_cost_total'
      ) {
        const totals = computeTotals(costItems, updated);
        updated.ground_cost_total = totals.ground;
        updated.other_cost_total = totals.other;
        updated.total_cost = totals.totalCost;
        updated.margin_amount = totals.marginAmount;
        updated.price_to_customer = totals.price;
      }

      return updated;
    });
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

      {/* STEP 1 */}
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
              <label>Latest acceptable delivery time</label>
              <input
                type="datetime-local"
                value={quote.delivery_deadline}
                onChange={(e) => updateQuoteField('delivery_deadline', e.target.value)}
              />
              <label>Courier return date (optional)</label>
              <input
                type="date"
                value={quote.return_date}
                onChange={(e) => updateQuoteField('return_date', e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Customer name</label>
              <input
                value={quote.customer_name}
                onChange={(e) => updateQuoteField('customer_name', e.target.value)}
              />
              <label>Customer company</label>
              <input
                value={quote.customer_company}
                onChange={(e) => updateQuoteField('customer_company', e.target.value)}
              />
              <label>Customer contact</label>
              <input
                value={quote.customer_contact}
                onChange={(e) => updateQuoteField('customer_contact', e.target.value)}
              />
              <label>Package description</label>
              <input
                value={quote.package_description}
                onChange={(e) => updateQuoteField('package_description', e.target.value)}
              />
              <label>Weight (kg)</label>
              <input
                type="number"
                value={quote.weight_kg}
                onChange={(e) => updateQuoteField('weight_kg', e.target.value)}
              />
              <label>Who will travel</label>
              <select
                value={quote.traveler}
                onChange={(e) => updateQuoteField('traveler', e.target.value)}
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

      {/* STEP 2 */}
      {step === 2 && (
        <div>
          <h2>Step 2 – Flights & routing</h2>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ marginRight: '10px' }}>Preferred travel class: </label>
            <select
              value={quote.travel_class}
              onChange={(e) => updateQuoteField('travel_class', e.target.value)}
            >
              <option value="ANY">Any / cheapest</option>
              <option value="ECONOMY">Economy</option>
              <option value="PREMIUM_ECONOMY">Premium Economy</option>
              <option value="BUSINESS">Business</option>
              <option value="FIRST">First</option>
            </select>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <button onClick={handleSearchFlights} disabled={loadingFlights}>
              {loadingFlights ? 'Searching…' : 'Search flights'}
            </button>
          </div>
          {flightOffers.length > 0 ? (
            <>
              <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Itinerary</th>
                    <th>Departure → Arrival</th>
                    <th>Stops</th>
                    <th>Cabin</th>
                    <th>Total price (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {flightOffers.map((offer) => {
                    const firstIt = offer.itineraries[0];
                    const firstSeg = firstIt.segments[0];
                    const lastIt = offer.itineraries[offer.itineraries.length - 1];
                    const lastSeg = lastIt.segments[lastIt.segments.length - 1];
                    const stops = firstIt.segments.length - 1;
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
                        <td>{offer.cabin || 'N/A'}</td>
                        <td>{offer.totalPrice}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {selectedOffer && (
                <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '10px' }}>
                  <h3>Selected flight details</h3>
                  {selectedOffer.itineraries.map((it, idxIt) => (
                    <div key={idxIt} style={{ marginBottom: '10px' }}>
                      <p>
                        <strong>Itinerary {idxIt + 1}</strong> – Duration: {it.duration}
                      </p>
                      <ul>
                        {it.segments.map((seg, idxSeg) => (
                          <li key={idxSeg}>
                            {seg.from} → {seg.to} ({seg.carrierCode}
                            {seg.flightNumber})
                            <br />
                            Depart: {new Date(seg.departure).toLocaleString()}
                            <br />
                            Arrive: {new Date(seg.arrival).toLocaleString()}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {selectedOffer.cabin && (
                    <p>
                      Travel cabin: <strong>{selectedOffer.cabin}</strong>
                    </p>
                  )}
                </div>
              )}
            </>
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

      {/* STEP 3 */}
      {step === 3 && (
        <div>
          <h2>Step 3 – Costs & margin</h2>

          <h3>Flight cost</h3>
          <label>Flight cost total (€)</label>
          <input
            type="number"
            value={quote.flight_cost_total}
            onChange={(e) => {
              const val = Number(e.target.value || 0);
              updateQuoteField('flight_cost_total', val);
            }}
          />

          <h3>Overnights & days out</h3>
          <p>
            Nights at destination (auto from RT flight):{' '}
            <strong>{quote.nights_at_destination}</strong>
          </p>
          <p>
            Days out for meals/per diem (auto, rounded up):{' '}
            <strong>{quote.days_out_total}</strong>
          </p>

          <h3>Ground transport</h3>
          <button onClick={() => addCostItem('ground')}>+ Add ground cost line</button>
          {costItems
            .filter((i) => i.category === 'ground')
            .map((item) => {
              const index = costItems.indexOf(item);
              return (
                <div key={index} style={{ border: '1px solid #ccc', padding: '5px', marginTop: '5px' }}>
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateCostItem(index, 'description', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateCostItem(index, 'quantity', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Unit price"
                    value={item.unit_price}
                    onChange={(e) => updateCostItem(index, 'unit_price', e.target.value)}
                  />
                  <span> Line total: {item.line_total}</span>
                </div>
              );
            })}

          <h3>Hotel</h3>
          <button
            onClick={() =>
              addCostItem('hotel', {
                description: 'Hotel nights',
                quantity: quote.nights_at_destination || 0,
              })
            }
          >
            + Add hotel cost line (prefill nights)
          </button>
          {costItems
            .filter((i) => i.category === 'hotel')
            .map((item) => {
              const index = costItems.indexOf(item);
              return (
                <div key={index} style={{ border: '1px solid #ccc', padding: '5px', marginTop: '5px' }}>
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateCostItem(index, 'description', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Nights"
                    value={item.quantity}
                    onChange={(e) => updateCostItem(index, 'quantity', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Price per night"
                    value={item.unit_price}
                    onChange={(e) => updateCostItem(index, 'unit_price', e.target.value)}
                  />
                  <span> Line total: {item.line_total}</span>
                </div>
              );
            })}

          <h3>Meals</h3>
          <button
            onClick={() =>
              addCostItem('meals', {
                description: 'Meals (2 per day)',
                quantity: (quote.days_out_total || 0) * 2,
              })
            }
          >
            + Add meals cost line (prefill 2/day)
          </button>
          {costItems
            .filter((i) => i.category === 'meals')
            .map((item) => {
              const index = costItems.indexOf(item);
              return (
                <div key={index} style={{ border: '1px solid #ccc', padding: '5px', marginTop: '5px' }}>
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateCostItem(index, 'description', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Number of meals"
                    value={item.quantity}
                    onChange={(e) => updateCostItem(index, 'quantity', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Price per meal"
                    value={item.unit_price}
                    onChange={(e) => updateCostItem(index, 'unit_price', e.target.value)}
                  />
                  <span> Line total: {item.line_total}</span>
                </div>
              );
            })}

          <h3>Per diem</h3>
          <button
            onClick={() =>
              addCostItem('per_diem', {
                description: 'Per diem',
                quantity: quote.days_out_total || 0,
              })
            }
          >
            + Add per diem cost line (prefill days)
          </button>
          {costItems
            .filter((i) => i.category === 'per_diem')
            .map((item) => {
              const index = costItems.indexOf(item);
              return (
                <div key={index} style={{ border: '1px solid #ccc', padding: '5px', marginTop: '5px' }}>
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateCostItem(index, 'description', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Days"
                    value={item.quantity}
                    onChange={(e) => updateCostItem(index, 'quantity', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Per diem per day"
                    value={item.unit_price}
                    onChange={(e) => updateCostItem(index, 'unit_price', e.target.value)}
                  />
                  <span> Line total: {item.line_total}</span>
                </div>
              );
            })}

          <h3>Other costs</h3>
          <button onClick={() => addCostItem('other')}>+ Add other cost line</button>
          {costItems
            .filter((i) => i.category === 'other')
            .map((item) => {
              const index = costItems.indexOf(item);
              return (
                <div key={index} style={{ border: '1px solid #ccc', padding: '5px', marginTop: '5px' }}>
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateCostItem(index, 'description', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateCostItem(index, 'quantity', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Unit price"
                    value={item.unit_price}
                    onChange={(e) => updateCostItem(index, 'unit_price', e.target.value)}
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
              onChange={(e) => updateQuoteField('margin_type', e.target.value)}
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
              onChange={(e) =>
                updateQuoteField('margin_value', Number(e.target.value || 0))
              }
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

      {/* STEP 4 */}
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
            {quote.return_date && <p>Courier return date: {quote.return_date}</p>}
            <p>Package: {quote.package_description}</p>
            <p>Nights at destination: {quote.nights_at_destination}</p>
            <p>Days out (for meals / per diem): {quote.days_out_total}</p>
            <p>
              Total all-inclusive price:{' '}
              <strong>
                {quote.price_to_customer} {quote.currency}
              </strong>
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
