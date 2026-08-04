import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  limit
} from "firebase/firestore";
import { parsePaymentSMS } from "./src/utils/smsExtractor";

// Read Firebase config manually for safety
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));

async function startServer() {
  const app = express();
  const PORT = 3000;

  try {
    // Initialize Firebase inside startServer
    const firebaseApp = initializeApp(firebaseConfig);
    const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
    console.log(`[FIREBASE] Initializing with DB ID: ${dbId}`);
    const db = getFirestore(firebaseApp, dbId);

    app.use(express.json());

    // API: Health Check
    app.get("/api/health", async (req, res) => {
      try {
        // Test firestore connection
        const testSnapshot = await getDocs(query(collection(db, 'payments'), limit(1)));
        res.json({ 
          status: "ok", 
          firestore: "connected",
          dbId: dbId,
          timestamp: new Date().toISOString() 
        });
      } catch (err: any) {
        res.status(500).json({ 
          status: "error", 
          firestore: "failed",
          error: err.message,
          timestamp: new Date().toISOString() 
        });
      }
    });

    // ... rest of the routes ...

  /**
   * CORE API: SMS Processing Pipeline
   * 1. Log Raw SMS (Auditing)
   * 2. Detect & Parse SMS
   * 3. Handle Parse Failure (Logging)
   * 4. Perform Payment Matching
   * 5. Record Result (Success/Log)
   */
  app.post("/api/sms/parse", async (req, res) => {
    const { smsText, sender, timestamp } = req.body;

    if (!smsText) {
      return res.status(400).json({ success: false, message: 'smsText is required' });
    }

    console.log(`[PIPELINE] Incoming SMS from ${sender || 'Unknown'}`);

    // STEP 1: Immediate Audit Log (Admin SMS Logs)
    let adminLogId = '';
    try {
      const logRef = await addDoc(collection(db, 'admin_sms_logs'), {
        smsText,
        sender: sender || 'Unknown',
        receivedAt: new Date().toISOString(),
        timestamp: serverTimestamp()
      });
      adminLogId = logRef.id;
    } catch (err) {
      console.error("[PIPELINE ERROR] Admin Log Failed:", err);
    }

    // STEP 2: Detect & Parse
    const parseResult = parsePaymentSMS(smsText, sender);

    // STEP 3: Handle Parse Failure
    if (!parseResult.success) {
      console.log(`[PIPELINE] Parse Failed: ${parseResult.error}`);
      try {
        await addDoc(collection(db, 'failed_parse_logs'), {
          smsText,
          sender: sender || 'Unknown',
          error: parseResult.error,
          debug: parseResult.debug || null,
          adminLogId,
          receivedAt: new Date().toISOString(),
          timestamp: serverTimestamp()
        });
      } catch (err) {
        console.error("[PIPELINE ERROR] Failed Parse Log Error:", err);
      }
      return res.status(400).json({ success: false, message: parseResult.error, debug: parseResult.debug });
    }

    // STEP 4: Successful Parse - Now Match Payment
    console.log(`[PIPELINE] Parse Success: ${parseResult.paymentMethod} | ${parseResult.amount} | ${parseResult.transactionId}`);

    const paymentData = {
      amount: parseResult.amount,
      paymentMethod: parseResult.paymentMethod,
      transactionId: parseResult.transactionId,
      senderNumber: parseResult.senderNumber,
      last3DigitsTrx: parseResult.last3DigitsTrx,
      last3DigitsSender: parseResult.last3DigitsSender,
      rawSms: smsText,
      status: 'UNMATCHED', // Default until matched
      timestamp: serverTimestamp(),
      debug: parseResult.debug
    };

    try {
      // Create Payment Document
      const paymentRef = await addDoc(collection(db, 'payments'), paymentData);
      const paymentId = paymentRef.id;

      // START MATCHING LOGIC
      // 1. Search for pending payments with matching criteria
      const pendingRef = collection(db, 'pending_payments');
      
      // Match Strategy A: Amount + Last 3 of TrxID
      let matchQuery = query(
        pendingRef, 
        where('status', '==', 'PENDING'),
        where('amount', '==', parseResult.amount),
        where('last3DigitsTrx', '==', parseResult.last3DigitsTrx)
      );
      
      let matchDocs = await getDocs(matchQuery);
      let matchType = 'TRX_ID';
      
      // Match Strategy B: Amount + Last 3 of Sender (if A fails)
      if (matchDocs.empty) {
        matchQuery = query(
          pendingRef,
          where('status', '==', 'PENDING'),
          where('amount', '==', parseResult.amount),
          where('last3DigitsSender', '==', parseResult.last3DigitsSender)
        );
        matchDocs = await getDocs(matchQuery);
        matchType = 'SENDER_PHONE';
      }

      // If matched, confirm payment
      if (!matchDocs.empty) {
        const pendingDoc = matchDocs.docs[0];
        const pendingId = pendingDoc.id;

        // Update Pending Request
        await updateDoc(doc(db, 'pending_payments', pendingId), {
          status: 'CONFIRMED',
          confirmedAt: serverTimestamp(),
          paymentId: paymentId
        });

        // Update Payment Status
        await updateDoc(doc(db, 'payments', paymentId), {
          status: 'MATCHED'
        });

        // Log the Match Decision
        await addDoc(collection(db, 'payment_match_logs'), {
          paymentId,
          pendingPaymentId: pendingId,
          matchType,
          matchScore: 100,
          details: `Automatic match found using ${matchType} and Amount ${parseResult.amount}`,
          timestamp: serverTimestamp()
        });

        console.log(`[PIPELINE] MATCH FOUND: Payment ${paymentId} matched to Pending ${pendingId}`);
      } else {
        // Log "No Match Found" decision
        await addDoc(collection(db, 'payment_match_logs'), {
          paymentId,
          matchType: 'NONE',
          matchScore: 0,
          details: `No pending payment found for Amount ${parseResult.amount} and Trx/Sender suffix match.`,
          timestamp: serverTimestamp()
        });
        console.log(`[PIPELINE] NO MATCH FOUND for Payment ${paymentId}`);
      }

      return res.status(200).json({ 
        success: true, 
        paymentId,
        matchFound: !matchDocs.empty,
        payment: { id: paymentId, ...paymentData }, // Return the payment object as expected by App.tsx
        data: parseResult 
      });

    } catch (err) {
      console.error("[PIPELINE ERROR] Database Error:", err);
      return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  });

  // API: Get All Payments
  app.get("/api/payments", async (req, res) => {
    try {
      const q = query(collection(db, 'payments'), orderBy('timestamp', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({ success: true, payments });
    } catch (err) {
      console.error("Fetch payments error:", err);
      res.status(500).json({ success: false, message: "Failed to fetch payments" });
    }
  });

  // API: Get Stats
  app.get("/api/stats", async (req, res) => {
    try {
      const snapshot = await getDocs(collection(db, 'payments'));
      const payments = snapshot.docs.map(doc => doc.data());
      
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      
      let totalVolume = 0;
      let todayVolume = 0;
      let todayCount = 0;
      const byMethod = { bKash: 0, Nagad: 0, Rocket: 0, Upay: 0 };

      payments.forEach((p: any) => {
        const amount = Number(p.amount) || 0;
        totalVolume += amount;
        
        if (p.paymentMethod && byMethod[p.paymentMethod as keyof typeof byMethod] !== undefined) {
          byMethod[p.paymentMethod as keyof typeof byMethod]++;
        }

        // Check if today (simple comparison for demo)
        if (p.timestamp && p.timestamp.toDate) {
          const date = p.timestamp.toDate();
          if (date.toISOString().split('T')[0] === todayStr) {
            todayVolume += amount;
            todayCount++;
          }
        }
      });

      const stats = {
        totalPayments: payments.length,
        todayPayments: todayCount,
        totalVolume,
        todayVolume,
        byMethod
      };

      res.json({ success: true, stats });
    } catch (err) {
      console.error("Fetch stats error:", err);
      res.status(500).json({ success: false, message: "Failed to fetch stats" });
    }
  });

  // API: Search Payments
  app.post("/api/payments/search", async (req, res) => {
    const { digits } = req.body;
    if (!digits || digits.length < 3) {
      return res.status(400).json({ success: false, message: "Minimum 3 digits required" });
    }

    try {
      // Since Firestore doesn't support partial string matching across fields easily,
      // we'll fetch recent payments and filter in memory for this demo.
      // In production, one might use a dedicated search index.
      const snapshot = await getDocs(collection(db, 'payments'));
      const allPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const matchedPayments = allPayments.filter((p: any) => {
        const q = digits.toLowerCase();
        return (
          p.last3DigitsTrx?.includes(q) ||
          p.last3DigitsSender?.includes(q) ||
          p.transactionId?.toLowerCase().includes(q) ||
          p.senderNumber?.includes(q)
        );
      });

      res.json({ success: true, matchedPayments });
    } catch (err) {
      console.error("Search error:", err);
      res.status(500).json({ success: false, message: "Search failed" });
    }
  });

  // API: Add Manual Payment
  app.post("/api/payments", async (req, res) => {
    const { amount, paymentMethod, senderNumber, transactionId } = req.body;
    
    if (!amount || !paymentMethod || !transactionId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
      const last3Trx = transactionId.slice(-3);
      const last3Sender = (senderNumber || "").slice(-3);

      const paymentData = {
        amount: Number(amount),
        paymentMethod,
        transactionId,
        senderNumber: senderNumber || "MANUAL",
        last3DigitsTrx: last3Trx,
        last3DigitsSender: last3Sender,
        status: 'MANUAL_CONFIRMED',
        timestamp: serverTimestamp(),
        rawSms: "Manually entered by admin"
      };

      const docRef = await addDoc(collection(db, 'payments'), paymentData);
      res.json({ success: true, id: docRef.id });
    } catch (err) {
      console.error("Add manual payment error:", err);
      res.status(500).json({ success: false, message: "Failed to add payment" });
    }
  });

  // API: Delete Payment
  app.delete("/api/payments/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await updateDoc(doc(db, 'payments', id), { deleted: true }); // Soft delete or actual delete
      // Actually delete for this app
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, 'payments', id));
      res.json({ success: true });
    } catch (err) {
      console.error("Delete payment error:", err);
      res.status(500).json({ success: false, message: "Failed to delete payment" });
    }
  });

  // API: Clear All Payments
  app.delete("/api/payments/clear-all", async (req, res) => {
    try {
      const snapshot = await getDocs(collection(db, 'payments'));
      const { deleteDoc } = await import("firebase/firestore");
      const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
      res.json({ success: true });
    } catch (err) {
      console.error("Clear all error:", err);
      res.status(500).json({ success: false, message: "Failed to clear payments" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
  } catch (err: any) {
    console.error("[CRITICAL ERROR] Server failed to start:", err);
  }
}

startServer();
