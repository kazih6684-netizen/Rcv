export type PaymentMethod = 'bKash' | 'Nagad' | 'Rocket' | 'Upay';

export type TransactionType = 'Received' | 'Cash In' | 'Deposit' | 'NPSB' | 'Manual';

export interface PaymentRecord {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionType: TransactionType;
  last3DigitsTrx: string;
  last3DigitsSender: string;
  senderNumber: string;
  reference: string;
  transactionId: string;
  balance: number;
  dateTime: string;
  rawSms: string;
  smsHash: string;
  message?: string;
  status: 'Success' | 'Pending' | 'Failed';
  verified: boolean;
  createdAt: string;
}

export interface SMSParseResult {
  success: boolean;
  error?: string;
  amount?: number;
  paymentMethod?: PaymentMethod;
  transactionType?: TransactionType;
  last3DigitsTrx?: string;
  last3DigitsSender?: string;
  senderNumber?: string;
  reference?: string;
  transactionId?: string;
  balance?: number;
  dateTime?: string;
  rawSms?: string;
}

export interface PaymentStats {
  totalPayments: number;
  todayPayments: number;
  totalVolume: number;
  todayVolume: number;
  byMethod: Record<PaymentMethod, number>;
}

export interface AppState {
  isAdminLoggedIn: boolean;
  smsPermissionStatus: 'granted' | 'denied' | 'prompt';
  firebaseConnected: boolean;
  autoSimulate: boolean;
  viewMode: 'mobile' | 'fullscreen';
}
