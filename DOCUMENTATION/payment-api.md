# Payment API

Base path: `/api/payments`

## Overview

Handles payment processing, payment methods, transaction tracking, and refund management for restaurant orders.

## Endpoints

### 1. Create Payment (Customer)

**POST** `/`

**Purpose**: Process payment for an order

**Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "orderId": "507f1f77bcf86cd799439030",
  "paymentMethod": "Card",
  "amount": 35.99,
  "paymentDetails": {
    "cardNumber": "4111111111111111",
    "expiryMonth": "12",
    "expiryYear": "2026",
    "cvv": "123",
    "cardholderName": "John Doe"
  },
  "customerInfo": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  }
}
```

**Payment Methods**: `Card`, `Cash`, `UPI`, `Wallet`

**Response**:
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "paymentId": "507f1f77bcf86cd799439040",
    "orderId": "507f1f77bcf86cd799439030",
    "transactionId": "txn_1234567890",
    "amount": 35.99,
    "paymentMethod": "Card",
    "paymentStatus": "Completed",
    "paymentDate": "2026-01-06T14:30:00.000Z",
    "order": {
      "id": "507f1f77bcf86cd799439030",
      "orderNumber": "ORD-001",
      "tableNumber": 5,
      "status": "Paid"
    },
    "receipt": {
      "receiptNumber": "RCT-001",
      "downloadUrl": "/api/payments/507f1f77bcf86cd799439040/receipt"
    }
  }
}
```

---

### 2. Get Payment Details

**GET** `/:paymentId`

**Purpose**: Get payment transaction details

**Response**:
```json
{
  "success": true,
  "message": "Payment details retrieved successfully",
  "data": {
    "paymentId": "507f1f77bcf86cd799439040",
    "orderId": "507f1f77bcf86cd799439030",
    "transactionId": "txn_1234567890",
    "amount": 35.99,
    "paymentMethod": "Card",
    "paymentStatus": "Completed",
    "paymentDate": "2026-01-06T14:30:00.000Z",
    "customerInfo": {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890"
    },
    "order": {
      "id": "507f1f77bcf86cd799439030",
      "orderNumber": "ORD-001",
      "tableNumber": 5,
      "totalAmount": 35.99,
      "items": [
        {
          "name": "Chicken Burger",
          "quantity": 2,
          "price": 12.99,
          "subtotal": 25.98
        },
        {
          "name": "French Fries",
          "quantity": 1,
          "price": 6.99,
          "subtotal": 6.99
        }
      ],
      "tax": 3.02,
      "discount": 0
    }
  }
}
```

---

### 3. Get Payment Receipt

**GET** `/:paymentId/receipt`

**Purpose**: Download payment receipt (PDF)

**Response**: PDF file with receipt details

**Headers**:
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="receipt-RCT-001.pdf"
```

---

### Staff/Admin Endpoints (Authentication Required)

### 4. Get All Payments (Staff Only)

**GET** `/`

**Purpose**: Get payment history with filtering

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `startDate`: Filter from date (YYYY-MM-DD)
- `endDate`: Filter to date (YYYY-MM-DD)
- `paymentMethod`: Filter by payment method
- `paymentStatus`: Filter by status
- `orderId`: Filter by specific order
- `sortBy`: Sort field (paymentDate, amount)
- `sortOrder`: Sort order (asc, desc)

**Response**:
```json
{
  "success": true,
  "message": "Payments retrieved successfully",
  "data": [
    {
      "paymentId": "507f1f77bcf86cd799439040",
      "orderId": "507f1f77bcf86cd799439030",
      "orderNumber": "ORD-001",
      "tableNumber": 5,
      "amount": 35.99,
      "paymentMethod": "Card",
      "paymentStatus": "Completed",
      "paymentDate": "2026-01-06T14:30:00.000Z",
      "customerName": "John Doe",
      "transactionId": "txn_1234567890"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 100,
    "itemsPerPage": 20,
    "hasNext": true,
    "hasPrev": false
  },
  "summary": {
    "totalAmount": 1250.75,
    "totalTransactions": 100,
    "completedPayments": 98,
    "failedPayments": 2,
    "refundedPayments": 0
  }
}
```

---

### 5. Process Refund (Manager/Admin Only)

**POST** `/:paymentId/refund`

**Purpose**: Process full or partial refund

**Headers**:
```
Authorization: Bearer <manager/admin-token>
```

**Request Body**:
```json
{
  "refundAmount": 35.99,
  "reason": "Customer complaint - incorrect order",
  "refundType": "Full"
}
```

**Refund Types**: `Full`, `Partial`

**Response**:
```json
{
  "success": true,
  "message": "Refund processed successfully",
  "data": {
    "refundId": "507f1f77bcf86cd799439050",
    "paymentId": "507f1f77bcf86cd799439040",
    "refundAmount": 35.99,
    "refundType": "Full",
    "reason": "Customer complaint - incorrect order",
    "refundStatus": "Completed",
    "refundDate": "2026-01-06T15:00:00.000Z",
    "processedBy": {
      "id": "507f1f77bcf86cd799439010",
      "name": "Manager Name",
      "role": "Manager"
    },
    "originalPayment": {
      "paymentId": "507f1f77bcf86cd799439040",
      "originalAmount": 35.99,
      "paymentMethod": "Card"
    }
  }
}
```

---

### 6. Get Payment Analytics (Manager/Admin Only)

**GET** `/analytics`

**Purpose**: Get payment analytics and insights

**Headers**:
```
Authorization: Bearer <manager/admin-token>
```

**Query Parameters**:
- `period`: Time period (today, week, month, year, custom)
- `startDate`: Start date for custom period
- `endDate`: End date for custom period

**Response**:
```json
{
  "success": true,
  "message": "Payment analytics retrieved successfully",
  "data": {
    "summary": {
      "totalRevenue": 15750.50,
      "totalTransactions": 425,
      "averageOrderValue": 37.06,
      "successRate": 97.2
    },
    "paymentMethods": [
      {
        "method": "Card",
        "count": 280,
        "amount": 11250.75,
        "percentage": 71.4
      },
      {
        "method": "UPI",
        "count": 95,
        "amount": 3200.25,
        "percentage": 20.3
      },
      {
        "method": "Cash",
        "count": 40,
        "amount": 1150.50,
        "percentage": 7.3
      },
      {
        "method": "Wallet",
        "count": 10,
        "amount": 149.00,
        "percentage": 0.9
      }
    ],
    "dailyTrends": [
      {
        "date": "2026-01-01",
        "revenue": 450.75,
        "transactions": 12,
        "averageValue": 37.56
      },
      {
        "date": "2026-01-02",
        "revenue": 523.25,
        "transactions": 15,
        "averageValue": 34.88
      }
    ],
    "refunds": {
      "totalRefunds": 2,
      "refundedAmount": 75.50,
      "refundRate": 0.47
    },
    "failedTransactions": {
      "count": 12,
      "amount": 445.25,
      "commonReasons": [
        "Insufficient funds",
        "Card declined",
        "Network error"
      ]
    }
  }
}
```

---

### 7. Update Payment Status (Admin Only)

**PATCH** `/:paymentId/status`

**Purpose**: Manually update payment status (for failed transactions)

**Headers**:
```
Authorization: Bearer <admin-token>
```

**Request Body**:
```json
{
  "paymentStatus": "Failed",
  "failureReason": "Card declined",
  "notes": "Customer notified via email"
}
```

**Valid Statuses**: `Pending`, `Completed`, `Failed`, `Refunded`

**Response**:
```json
{
  "success": true,
  "message": "Payment status updated successfully",
  "data": {
    "paymentId": "507f1f77bcf86cd799439040",
    "orderId": "507f1f77bcf86cd799439030",
    "paymentStatus": "Failed",
    "failureReason": "Card declined",
    "updatedBy": {
      "id": "507f1f77bcf86cd799439010",
      "name": "Admin Name"
    },
    "updatedAt": "2026-01-06T15:30:00.000Z"
  }
}
```

## Frontend Integration Examples

### Customer Payment Form

```jsx
import React, { useState } from 'react';

const PaymentForm = ({ order, onPaymentSuccess }) => {
  const [paymentData, setPaymentData] = useState({
    paymentMethod: 'Card',
    customerInfo: {
      name: '',
      email: '',
      phone: ''
    },
    paymentDetails: {
      cardNumber: '',
      expiryMonth: '',
      expiryYear: '',
      cvv: '',
      cardholderName: ''
    }
  });
  
  const [processing, setProcessing] = useState(false);

  const handlePayment = async (e) => {
    e.preventDefault();
    setProcessing(true);
    
    try {
      const paymentRequest = {
        orderId: order.id,
        paymentMethod: paymentData.paymentMethod,
        amount: order.totalAmount,
        paymentDetails: paymentData.paymentDetails,
        customerInfo: paymentData.customerInfo
      };
      
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentRequest)
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('Payment successful!');
        onPaymentSuccess(data.data);
        
        // Download receipt
        const receiptUrl = data.data.receipt.downloadUrl;
        window.open(receiptUrl, '_blank');
      } else {
        alert('Payment failed: ' + data.message);
      }
    } catch (error) {
      alert('Payment error: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const updatePaymentDetails = (field, value) => {
    setPaymentData(prev => ({
      ...prev,
      paymentDetails: {
        ...prev.paymentDetails,
        [field]: value
      }
    }));
  };

  const updateCustomerInfo = (field, value) => {
    setPaymentData(prev => ({
      ...prev,
      customerInfo: {
        ...prev.customerInfo,
        [field]: value
      }
    }));
  };

  return (
    <form onSubmit={handlePayment} className="payment-form">
      <div className="order-summary">
        <h3>Order Summary</h3>
        <div className="order-details">
          <p>Order: {order.orderNumber}</p>
          <p>Table: {order.tableNumber}</p>
          <div className="order-items">
            {order.items.map((item, index) => (
              <div key={index} className="item">
                <span>{item.quantity}x {item.name}</span>
                <span>${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="total">
            <strong>Total: ${order.totalAmount.toFixed(2)}</strong>
          </div>
        </div>
      </div>
      
      <div className="customer-info">
        <h3>Customer Information</h3>
        <input
          type="text"
          placeholder="Full Name"
          value={paymentData.customerInfo.name}
          onChange={(e) => updateCustomerInfo('name', e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={paymentData.customerInfo.email}
          onChange={(e) => updateCustomerInfo('email', e.target.value)}
          required
        />
        <input
          type="tel"
          placeholder="Phone Number"
          value={paymentData.customerInfo.phone}
          onChange={(e) => updateCustomerInfo('phone', e.target.value)}
          required
        />
      </div>
      
      <div className="payment-method">
        <h3>Payment Method</h3>
        <select
          value={paymentData.paymentMethod}
          onChange={(e) => setPaymentData({...paymentData, paymentMethod: e.target.value})}
        >
          <option value="Card">Credit/Debit Card</option>
          <option value="UPI">UPI</option>
          <option value="Wallet">Digital Wallet</option>
          <option value="Cash">Cash</option>
        </select>
      </div>
      
      {paymentData.paymentMethod === 'Card' && (
        <div className="card-details">
          <h3>Card Details</h3>
          <input
            type="text"
            placeholder="Card Number"
            value={paymentData.paymentDetails.cardNumber}
            onChange={(e) => updatePaymentDetails('cardNumber', e.target.value)}
            maxLength="16"
            required
          />
          <input
            type="text"
            placeholder="Cardholder Name"
            value={paymentData.paymentDetails.cardholderName}
            onChange={(e) => updatePaymentDetails('cardholderName', e.target.value)}
            required
          />
          <div className="card-row">
            <select
              value={paymentData.paymentDetails.expiryMonth}
              onChange={(e) => updatePaymentDetails('expiryMonth', e.target.value)}
              required
            >
              <option value="">Month</option>
              {[...Array(12)].map((_, i) => (
                <option key={i} value={String(i + 1).padStart(2, '0')}>
                  {String(i + 1).padStart(2, '0')}
                </option>
              ))}
            </select>
            <select
              value={paymentData.paymentDetails.expiryYear}
              onChange={(e) => updatePaymentDetails('expiryYear', e.target.value)}
              required
            >
              <option value="">Year</option>
              {[...Array(10)].map((_, i) => {
                const year = new Date().getFullYear() + i;
                return (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                );
              })}
            </select>
            <input
              type="text"
              placeholder="CVV"
              value={paymentData.paymentDetails.cvv}
              onChange={(e) => updatePaymentDetails('cvv', e.target.value)}
              maxLength="3"
              required
            />
          </div>
        </div>
      )}
      
      <button 
        type="submit" 
        disabled={processing}
        className="pay-button"
      >
        {processing ? 'Processing...' : `Pay $${order.totalAmount.toFixed(2)}`}
      </button>
    </form>
  );
};

export default PaymentForm;
```

### Payment History Dashboard (Staff)

```javascript
const PaymentDashboard = () => {
  const [payments, setPayments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    paymentMethod: '',
    paymentStatus: ''
  });

  useEffect(() => {
    fetchPayments();
    fetchAnalytics();
  }, [filters]);

  const fetchPayments = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const queryParams = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });
      
      const response = await fetch(`/api/payments?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        setPayments(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch payments:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/payments/analytics?period=week', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        setAnalytics(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  const processRefund = async (paymentId, amount, reason) => {
    if (!window.confirm('Are you sure you want to process this refund?')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          refundAmount: amount,
          reason: reason,
          refundType: 'Full'
        })
      });
      
      const data = await response.json();
      if (data.success) {
        alert('Refund processed successfully');
        fetchPayments(); // Refresh list
      }
    } catch (error) {
      alert('Failed to process refund: ' + error.message);
    }
  };

  return (
    <div className="payment-dashboard">
      <div className="analytics-section">
        {analytics && (
          <div className="analytics-cards">
            <div className="card">
              <h3>Total Revenue</h3>
              <p>${analytics.summary.totalRevenue.toFixed(2)}</p>
            </div>
            <div className="card">
              <h3>Transactions</h3>
              <p>{analytics.summary.totalTransactions}</p>
            </div>
            <div className="card">
              <h3>Average Order</h3>
              <p>${analytics.summary.averageOrderValue.toFixed(2)}</p>
            </div>
            <div className="card">
              <h3>Success Rate</h3>
              <p>{analytics.summary.successRate}%</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="payments-table">
        <h2>Payment History</h2>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Table</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(payment => (
              <tr key={payment.paymentId}>
                <td>{payment.orderNumber}</td>
                <td>{payment.tableNumber}</td>
                <td>{payment.customerName}</td>
                <td>${payment.amount.toFixed(2)}</td>
                <td>{payment.paymentMethod}</td>
                <td className={`status ${payment.paymentStatus.toLowerCase()}`}>
                  {payment.paymentStatus}
                </td>
                <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                <td>
                  {payment.paymentStatus === 'Completed' && (
                    <button 
                      onClick={() => processRefund(payment.paymentId, payment.amount, 'Manager refund')}
                      className="refund-btn"
                    >
                      Refund
                    </button>
                  )}
                  <a 
                    href={`/api/payments/${payment.paymentId}/receipt`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="receipt-btn"
                  >
                    Receipt
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

## Error Handling

### Common Error Responses

```json
// Payment failed
{
  "success": false,
  "message": "Payment failed: Card declined",
  "errorCode": "PAYMENT_DECLINED"
}

// Invalid payment amount
{
  "success": false,
  "message": "Payment amount does not match order total"
}

// Order already paid
{
  "success": false,
  "message": "Order has already been paid"
}

// Refund not possible
{
  "success": false,
  "message": "Refund cannot be processed for this payment method"
}
```