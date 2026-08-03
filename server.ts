import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { parsePaymentSMS } from './src/utils/smsExtractor.js';
import { PaymentRecord, PaymentStats } from './src/types.js';

import { db, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, where, limit } from './src/firebase.js';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper function to create SMS hash
function createSmsHash(text: string): string {
  return crypto.createHash('md5').update(text.trim()).digest('hex');
}

// Helper to check for duplicates
async function isDuplicate(transactionId: string, smsHash: string): Promise<boolean> {
  // Check transactionId
  if (transactionId && transactionId !== 'TRXUNKNOWN') {
    const q1 = query(collection(db, 'payments'), where('transactionId', '==', transactionId), limit(1));
    const snapshot1 = await getDocs(q1);
    if (!snapshot1.empty) return true;
  }
  
  // Check smsHash
  const q2 = query(collection(db, 'payments'), where('smsHash', '==', smsHash), limit(1));
  const snapshot2 = await getDocs(q2);
  if (!snapshot2.empty) return true;

  return false;
}

// Helper function to get all payments from Firestore
async function fetchAllPayments(): Promise<PaymentRecord[]> {
  try {
    const q = query(collection(db, 'payments'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const payments: PaymentRecord[] = [];
    querySnapshot.forEach((doc) => {
      payments.push({ id: doc.id, ...doc.data() } as PaymentRecord);
    });
    return payments;
  } catch (err) {
    console.error("Error fetching payments", err);
    return [];
  }
}

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Get all payments
app.get('/api/payments', async (req, res) => {
  const sorted = await fetchAllPayments();
  res.json({ success: true, payments: sorted });
});

// Search payments by any field (TrxID, Sender, Amount, Ref, Date)
app.post('/api/payments/search', async (req, res) => {
  const { query: searchStr } = req.body;
  const queryStr = String(searchStr || '').trim().toLowerCase();
  
  if (!queryStr) {
    return res.status(400).json({ success: false, message: 'Search query is required' });
  }
  
  const paymentsDatabase = await fetchAllPayments();
  const matched = paymentsDatabase.filter((pay) => {
    return (
      pay.transactionId.toLowerCase().includes(queryStr) ||
      pay.senderNumber.toLowerCase().includes(queryStr) ||
      pay.reference.toLowerCase().includes(queryStr) ||
      pay.amount.toString().includes(queryStr) ||
      pay.dateTime.toLowerCase().includes(queryStr) ||
      pay.rawSms.toLowerCase().includes(queryStr)
    );
  });
  
  res.json({
    success: true,
    query: queryStr,
    count: matched.length,
    matchedPayments: matched,
  });
});

// Parse SMS & Auto-Add to DB
app.post('/api/sms/parse', async (req, res) => {
  const smsText = req.body.smsText || req.body.sms_message || req.body.body || req.body.message || req.body.text;
  if (!smsText || typeof smsText !== 'string') {
    return res.status(400).json({ success: false, message: 'SMS text is required' });
  }

  const parseResult = parsePaymentSMS(smsText);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, message: parseResult.error });
  }
  
  const smsHash = createSmsHash(smsText);
  const transactionId = parseResult.transactionId || 'TRXUNKNOWN';

  // Duplicate Check
  const duplicate = await isDuplicate(transactionId, smsHash);
  if (duplicate) {
    return res.status(409).json({ success: false, message: 'Duplicate transaction detected' });
  }

  const newPaymentData = {
    amount: parseResult.amount || 0,
    paymentMethod: parseResult.paymentMethod || 'bKash',
    transactionType: parseResult.transactionType || 'Received',
    last3DigitsTrx: parseResult.last3DigitsTrx || '000',
    last3DigitsSender: parseResult.last3DigitsSender || '000',
    senderNumber: parseResult.senderNumber || 'Unknown',
    reference: parseResult.reference || 'N/A',
    transactionId: transactionId,
    balance: parseResult.balance || 0,
    dateTime: parseResult.dateTime || new Date().toLocaleString(),
    rawSms: smsText,
    smsHash: smsHash,
    status: 'Success',
    verified: true,
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = await addDoc(collection(db, 'payments'), newPaymentData);
    res.json({
      success: true,
      message: 'Payment verified & saved successfully',
      payment: { id: docRef.id, ...newPaymentData },
    });
  } catch (err) {
    console.error("Error adding document", err);
    res.status(500).json({ success: false, message: 'Failed to save to database' });
  }
});

// Create payment manually by admin
app.post('/api/payments', async (req, res) => {
  const { amount, paymentMethod, senderNumber, transactionId, message } = req.body;
  if (!amount || !paymentMethod || !senderNumber || !transactionId) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  const cleanSender = String(senderNumber).trim();
  const cleanTrx = String(transactionId).trim().toUpperCase();
  const smsHash = createSmsHash(`MANUAL-${cleanTrx}-${Date.now()}`);

  // Duplicate Check for manual
  const duplicate = await isDuplicate(cleanTrx, smsHash);
  if (duplicate) {
    return res.status(409).json({ success: false, message: 'Transaction ID already exists' });
  }
  
  const newPaymentData = {
    amount: Number(amount) || 0,
    paymentMethod: paymentMethod,
    transactionType: 'Manual',
    last3DigitsTrx: cleanTrx.slice(-3),
    last3DigitsSender: cleanSender.slice(-3),
    senderNumber: cleanSender,
    reference: 'MANUAL',
    transactionId: cleanTrx,
    balance: 0,
    dateTime: `${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
    rawSms: `Manual Entry: Tk ${amount} from ${cleanSender}. TrxID: ${cleanTrx}`,
    smsHash: smsHash,
    message: message || '',
    status: 'Success',
    verified: true,
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = await addDoc(collection(db, 'payments'), newPaymentData);
    res.json({ success: true, payment: { id: docRef.id, ...newPaymentData } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save to database' });
  }
});

// Delete single payment
app.delete('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await deleteDoc(doc(db, 'payments', id));
    res.json({ success: true, message: 'Payment deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete payment' });
  }
});

// Reset / Clear database
app.delete('/api/payments/clear-all', async (req, res) => {
  try {
    const paymentsDatabase = await fetchAllPayments();
    for (const p of paymentsDatabase) {
      if (p.id) {
        await deleteDoc(doc(db, 'payments', p.id));
      }
    }
    res.json({ success: true, message: 'All payments cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to clear payments' });
  }
});

// Stats summary endpoint
app.get('/api/stats', async (req, res) => {
  const paymentsDatabase = await fetchAllPayments();
  const totalPayments = paymentsDatabase.length;
  const totalVolume = paymentsDatabase.reduce((acc, curr) => acc + curr.amount, 0);
  const todayStr = new Date().toLocaleDateString('en-GB');
  
  const todayRecords = paymentsDatabase.filter((p) => {
    return p.dateTime.includes(todayStr) || new Date(p.createdAt).toDateString() === new Date().toDateString();
  });
  const todayPayments = todayRecords.length;
  const todayVolume = todayRecords.reduce((acc, curr) => acc + curr.amount, 0);
  
  const byMethod = {
    bKash: paymentsDatabase.filter((p) => p.paymentMethod === 'bKash').length,
    Nagad: paymentsDatabase.filter((p) => p.paymentMethod === 'Nagad').length,
    Rocket: paymentsDatabase.filter((p) => p.paymentMethod === 'Rocket').length,
    Upay: paymentsDatabase.filter((p) => p.paymentMethod === 'Upay').length,
  };
  
  const stats: PaymentStats = {
    totalPayments,
    todayPayments,
    totalVolume,
    todayVolume,
    byMethod,
  };
  res.json({ success: true, stats });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Unity Earning Payment Confirm System running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
