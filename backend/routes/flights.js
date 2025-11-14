const express = require('express');
const router = express.Router();
const Amadeus = require('amadeus');
require('dotenv').config();

const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_CLIENT_ID,
  clientSecret: process.env.AMADEUS_CLIENT_SECRET,
});

// POST /api/flights/search
router.post('/search', async (req, res) => {
  try {
    const {
      originLocationCode,
      destinationLocationCode,
      departureDate,
      returnDate,
      adults = 1,
      travelClass, // ECONOMY | PREMIUM_ECONOMY | BUSINESS | FIRST
    } = req.body;

    const params = {
      originLocationCode,
      destinationLocationCode,
      departureDate,
      adults,
      currencyCode: 'EUR',
      max: 10,
    };

    if (returnDate) {
      params.returnDate = returnDate;
    }

    // Only set travelClass if the frontend sent it (and not "ANY")
    if (travelClass) {
      params.travelClass = travelClass;
    }

    const response = await amadeus.shopping.flightOffersSearch.get(params);

    const offers = response.data.map((offer) => {
      // Try to get cabin (Economy / Business / etc.) from the first traveler pricing
      let cabin = null;
      if (
        offer.travelerPricings &&
        offer.travelerPricings[0] &&
        offer.travelerPricings[0].fareDetailsBySegment &&
        offer.travelerPricings[0].fareDetailsBySegment[0]
      ) {
        cabin = offer.travelerPricings[0].fareDetailsBySegment[0].cabin || null;
      }

      return {
        id: offer.id,
        totalPrice: offer.price.total,
        currency: offer.price.currency,
        cabin, // Travel class (ECONOMY / BUSINESS / etc.)
        itineraries: offer.itineraries.map((it) => ({
          duration: it.duration,
          segments: it.segments.map((seg) => ({
            from: seg.departure.iataCode,
            to: seg.arrival.iataCode,
            departure: seg.departure.at,
            arrival: seg.arrival.at,
            carrierCode: seg.carrierCode,
            flightNumber: seg.number,
          })),
        })),
      };
    });

    res.json({ offers });
  } catch (err) {
    console.error('Flight search error:', err);
    res.status(500).json({ error: 'Flight search failed' });
  }
});

module.exports = router;
