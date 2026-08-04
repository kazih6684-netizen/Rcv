import { db, collection, getDocs } from './src/firebase';

async function checkDatabase() {
  console.log("Checking payments in database...");
  const querySnapshot = await getDocs(collection(db, 'payments'));
  console.log(`Total payments found: ${querySnapshot.size}`);
  
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`- ID: ${doc.id}, Method: ${data.paymentMethod}, Amount: ${data.amount}, Trx: ${data.transactionId}, Sender: ${data.senderNumber}`);
  });

  console.log("\nChecking failed parse logs...");
  const failedSnapshot = await getDocs(collection(db, 'failed_parse_logs'));
  console.log(`Total failed logs: ${failedSnapshot.size}`);
  failedSnapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`- Error: ${data.error}, Sender: ${data.sender}, SMS Snippet: ${data.smsText?.substring(0, 30)}...`);
  });
}

checkDatabase();
