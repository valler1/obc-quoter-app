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

  // ---- Step 2: flights ----
  async function handleSearchFlights() {
    setError('');
    if (!quote.origin_city || !quote.destinat_
