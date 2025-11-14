const express = require('express');
const cors = require('cors');
require('dotenv').config();

const flightsRouter = require('./routes/flights');
const quotesRouter = require('./routes/quotes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('OBC Quoter backend running');
});

app.use('/api/flights', flightsRouter);
app.use('/api/quotes', quotesRouter);

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
