import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { parsePaymentSMS } from './src/utils/smsExtractor.js';
import { PaymentRecord, PaymentStats } from './src/types.js';

import { db, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, updateDoc } from './src/firebase.js';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

async function fetchAllPendingRequests(): Promise<any[]> {
  try {
    const q = query(collection(db, 'pending_requests'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const requests: any[] = [];
    querySnapshot.forEach((doc) => {
      requests.push({ id: doc.id, ...doc.data() });
    });
    return requests;
  } catch (err) {
    console.error("Error fetching pending requests", err);
    return [];
  }
}

async function fetchAllRawSmsLogs(): Promise<any[]> {
  try {
    const q = query(collection(db, 'raw_sms_logs'), orderBy('receivedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const logs: any[] = [];
    querySnapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    return logs;
  } catch (err) {
    console.error("Error fetching raw sms logs", err);
    return [];
  }
}

// Matching logic
async function processMatching() {
  const pendingRequests = await fetchAllPendingRequests();
  const activeRequests = pendingRequests.filter(r => r.status === 'Pending');
  
  if (activeRequests.length === 0) return;

  const rawLogs = await fetchAllRawSmsLogs();
  const unprocessedLogs = rawLogs.filter(l => !l.isProcessed);

  for (const log of unprocessedLogs) {
    for (const request of activeRequests) {
      const queryStr = request.last3Digits.trim();
      // Check if digits are in the SMS
      if (log.smsText.includes(queryStr)) {
        const parseResult = parsePaymentSMS(log.smsText);
        if (parseResult.success) {
          // Found a match!
          await updateDoc(doc(db, 'pending_requests', request.id), {
            status: 'Success',
            matchedPaymentId: log.id,
            paymentMethod: parseResult.paymentMethod,
            senderNumber: parseResult.senderNumber,
            transactionId: parseResult.transactionId,
            matchedAt: new Date().toISOString(),
          });
          
          console.log(`Matched request ${request.id} with SMS ${log.id}`);
          
          // We also create a real payment record
          const newPaymentData = {
            amount: parseResult.amount || request.amount || 0,
            paymentMethod: parseResult.paymentMethod || 'bKash',
            last3DigitsTrx: parseResult.last3DigitsTrx || '000',
            last3DigitsSender: parseResult.last3DigitsSender || '000',
            senderNumber: parseResult.senderNumber || '01700000000',
            transactionId: parseResult.transactionId || 'TRXUNKNOWN',
            dateTime: parseResult.dateTime || new Date().toLocaleString(),
            rawSms: log.smsText,
            status: 'Success',
            createdAt: new Date().toISOString(),
          };
          
          await addDoc(collection(db, 'payments'), newPaymentData);
          
          // Mark raw SMS as processed
          await updateDoc(doc(db, 'raw_sms_logs', log.id), {
            isProcessed: true,
            matchedRequestId: request.id
          });
        }
      }
    }
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

// Search payments by last 3 digits or full transaction/sender
app.post('/api/payments/search', async (req, res) => {
  const { digits } = req.body;
  if (!digits || typeof digits !== 'string') {
    return res.status(400).json({ success: false, message: 'Digits string is required' });
  }
  const queryStr = digits.trim().toLowerCase();
  
  // Trigger matching logic before search to ensure we catch recent SMS
  await processMatching();

  const paymentsDatabase = await fetchAllPayments();
  const matched = paymentsDatabase.filter((pay) => {
    return (
      pay.last3DigitsTrx.toLowerCase() === queryStr ||
      pay.last3DigitsSender.toLowerCase() === queryStr ||
      pay.transactionId.toLowerCase().endsWith(queryStr) ||
      pay.senderNumber.toLowerCase().endsWith(queryStr) ||
      pay.transactionId.toLowerCase().includes(queryStr) ||
      pay.senderNumber.toLowerCase().includes(queryStr)
    );
  });
  
  // Also check if there's a pending request that hasn't been matched yet
  let pendingRequest = null;
  if (matched.length === 0) {
      // Create a pending request if not found
      const pendingQ = query(collection(db, 'pending_requests'), orderBy('createdAt', 'desc'));
      const pendingSnapshot = await getDocs(pendingQ);
      const existing = [];
      pendingSnapshot.forEach(doc => existing.push({id: doc.id, ...doc.data()}));
      
      const found = existing.find(r => r.last3Digits === queryStr && r.status === 'Pending');
      if (!found) {
        const docRef = await addDoc(collection(db, 'pending_requests'), {
            last3Digits: queryStr,
            status: 'Pending',
            createdAt: new Date().toISOString()
        });
        pendingRequest = { id: docRef.id, last3Digits: queryStr, status: 'Pending' };
      } else {
        pendingRequest = found;
      }
  }

  res.json({
    success: true,
    query: queryStr,
    count: matched.length,
    matchedPayments: matched,
    pendingRequest: pendingRequest,
  });
});

// Parse SMS & Auto-Add to DB
app.post('/api/sms/parse', async (req, res) => {
  const smsText = req.body.smsText || req.body.sms_message || req.body.body || req.body.message || req.body.text;
  if (!smsText || typeof smsText !== 'string') {
    return res.status(400).json({ success: false, message: 'SMS text is required in smsText or sms_message field' });
  }

  // 1. Save Raw SMS first as requested
  try {
    await addDoc(collection(db, 'raw_sms_logs'), {
      smsText: smsText,
      receivedAt: new Date().toISOString(),
      isProcessed: false
    });
  } catch (err) {
    console.error("Error saving raw sms", err);
  }

  // 2. Trigger Matching
  await processMatching();

  // 3. For backward compatibility/immediate feedback in simulator, still return parse result
  const parseResult = parsePaymentSMS(smsText);
  if (!parseResult.success) {
    // If it's a raw SMS that we couldn't parse, we still return success but note it's logged
    return res.json({ 
        success: true, 
        message: 'Raw SMS received and logged. Matching in progress.',
        isRaw: true
    });
  }
  
  const newPaymentData = {
    amount: parseResult.amount || 0,
    paymentMethod: parseResult.paymentMethod || 'bKash',
    last3DigitsTrx: parseResult.last3DigitsTrx || '000',
    last3DigitsSender: parseResult.last3DigitsSender || '000',
    senderNumber: parseResult.senderNumber || '01700000000',
    transactionId: parseResult.transactionId || 'TRXUNKNOWN',
    dateTime: parseResult.dateTime || new Date().toLocaleString(),
    rawSms: parseResult.rawSms || smsText,
    status: 'Success',
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = await addDoc(collection(db, 'payments'), newPaymentData);
    const newPayment = { id: docRef.id, ...newPaymentData };
    res.json({
      success: true,
      message: 'Payment extracted & saved successfully',
      payment: newPayment,
    });
  } catch (err) {
    console.error("Error adding document", err);
    res.status(500).json({ success: false, message: 'Failed to save to database' });
  }
});

// Create payment manually by admin
app.post('/api/payments', async (req, res) => {
  const { amount, paymentMethod, senderNumber, transactionId } = req.body;
  if (!amount || !paymentMethod || !senderNumber || !transactionId) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  const cleanSender = String(senderNumber).trim();
  const cleanTrx = String(transactionId).trim().toUpperCase();
  
  const newPaymentData = {
    amount: Number(amount) || 0,
    paymentMethod: paymentMethod,
    last3DigitsTrx: cleanTrx.slice(-3),
    last3DigitsSender: cleanSender.slice(-3),
    senderNumber: cleanSender,
    transactionId: cleanTrx,
    dateTime: `${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
    rawSms: `Manual Payment Entry: Tk ${amount} from ${cleanSender}. TrxID: ${cleanTrx}`,
    status: 'Success',
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = await addDoc(collection(db, 'payments'), newPaymentData);
    res.json({ success: true, payment: { id: docRef.id, ...newPaymentData } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save to database' });
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
