# QR Code API

Base path: `/api/qr`

## Overview

Handles QR code generation, customer ordering pages, and QR-based table access for the contactless dining experience.

## Endpoints

### Public Endpoints (No Authentication)

### 1. Get Ordering Page Data by Table ID

**GET** `/order/table/:tableId`

**Purpose**: Get menu and table information for QR code scanning

**Response**:
```json
{
  "success": true,
  "message": "Ordering page data retrieved successfully",
  "data": {
    "table": {
      "id": "507f1f77bcf86cd799439011",
      "tableNumber": 5,
      "capacity": 4,
      "status": "Available",
      "isAvailableForOrder": true
    },
    "menu": [
      {
        "id": "507f1f77bcf86cd799439020",
        "name": "Appetizers",
        "description": "Start your meal right",
        "items": [
          {
            "id": "507f1f77bcf86cd799439021",
            "name": "Chicken Wings",
            "description": "Crispy wings with choice of sauce",
            "price": 12.99,
            "image": "https://cloudinary.com/wings.jpg",
            "availabilityStatus": "Available"
          }
        ]
      }
    ],
    "restaurant": {
      "name": "WaitZi Restaurant",
      "welcomeMessage": "Welcome! Please scan the QR code on your table to place your order."
    }
  }
}
```

---

### 2. Get Ordering Page Data by Table Number

**GET** `/order/table-number/:tableNumber`

**Purpose**: Alternative endpoint using table number instead of ID

**Response**: Same as above

---

### Staff Endpoints (Authentication Required)

### 3. Generate QR Code for Table

**GET** `/generate/:tableId`

**Purpose**: Generate QR code for specific table

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Query Parameters**:
- `format`: Response format (`png`, `url`) - default: `png`

**Response**:
```json
{
  "success": true,
  "message": "QR code generated successfully",
  "data": {
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "qrData": "http://localhost:3000/order/table/5?tableId=507f1f77bcf86cd799439011",
    "table": {
      "id": "507f1f77bcf86cd799439011",
      "tableNumber": 5,
      "capacity": 4,
      "status": "Available"
    }
  }
}
```

---

### 4. Download QR Code

**GET** `/download/:tableId`

**Purpose**: Download QR code as image file

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Query Parameters**:
- `format`: File format (`png`, `svg`) - default: `png`

**Response**: Binary image file with appropriate headers

---

### Manager/Admin Endpoints

### 5. Generate All Table QR Codes

**GET** `/generate-all`

**Purpose**: Generate QR codes for all tables

**Headers**:
```
Authorization: Bearer <manager/admin-token>
```

**Query Parameters**:
- `format`: Response format (`png`, `url`) - default: `png`

**Response**:
```json
{
  "success": true,
  "message": "QR codes generated for all tables",
  "data": [
    {
      "table": {
        "id": "507f1f77bcf86cd799439011",
        "tableNumber": 5,
        "capacity": 4
      },
      "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "qrData": "http://localhost:3000/order/table/5?tableId=507f1f77bcf86cd799439011"
    }
  ],
  "meta": {
    "totalTables": 25,
    "format": "png"
  }
}
```

---

### 6. Generate Branded QR Code

**POST** `/branded/:tableId`

**Purpose**: Generate QR code with restaurant branding

**Headers**:
```
Authorization: Bearer <manager/admin-token>
```

**Request Body**:
```json
{
  "logoUrl": "https://restaurant.com/logo.png",
  "primaryColor": "#FF6B35",
  "backgroundColor": "#FFFFFF",
  "title": "Table 5",
  "subtitle": "Scan to order"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Branded QR code generated successfully",
  "data": {
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "qrData": "http://localhost:3000/order/table/5?tableId=507f1f77bcf86cd799439011",
    "branding": {
      "logoUrl": "https://restaurant.com/logo.png",
      "primaryColor": "#FF6B35",
      "backgroundColor": "#FFFFFF",
      "title": "Table 5",
      "subtitle": "Scan to order"
    },
    "table": {
      "id": "507f1f77bcf86cd799439011",
      "tableNumber": 5,
      "capacity": 4
    }
  }
}
```

---

### 7. Get QR Analytics

**GET** `/analytics/:tableId`

**Purpose**: Get QR code usage analytics (future implementation)

**Headers**:
```
Authorization: Bearer <manager/admin-token>
```

**Response**:
```json
{
  "success": true,
  "message": "QR analytics retrieved successfully",
  "data": {
    "tableId": "507f1f77bcf86cd799439011",
    "qrData": "http://localhost:3000/order/table/5?tableId=507f1f77bcf86cd799439011",
    "analytics": {
      "totalScans": 0,
      "uniqueScans": 0,
      "ordersFromScans": 0,
      "conversionRate": "0%",
      "lastScanned": null
    },
    "note": "QR scan tracking requires additional implementation for detailed analytics"
  }
}
```

## Frontend Integration Examples

### Customer QR Scanning Flow

```javascript
// When customer scans QR code, extract tableId from URL
const getTableIdFromURL = () => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('tableId');
};

// Fetch ordering page data
const loadOrderingPage = async () => {
  try {
    const tableId = getTableIdFromURL();
    if (!tableId) {
      throw new Error('Invalid QR code - table ID not found');
    }
    
    const response = await fetch(`/api/qr/order/table/${tableId}`);
    const data = await response.json();
    
    if (data.success) {
      // Display table info and menu
      displayTableInfo(data.data.table);
      displayMenu(data.data.menu);
      return data.data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Failed to load ordering page:', error);
    showErrorPage('Invalid QR code or table not available');
  }
};

const displayTableInfo = (table) => {
  document.getElementById('table-info').innerHTML = `
    <h2>Table ${table.tableNumber}</h2>
    <p>Capacity: ${table.capacity} people</p>
    ${!table.isAvailableForOrder ? '<p class="warning">Table is currently occupied</p>' : ''}
  `;
};
```

### React Customer Ordering Component

```jsx
import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

const CustomerOrderingPage = () => {
  const { tableNumber } = useParams();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('tableId');
  
  const [orderingData, setOrderingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);

  useEffect(() => {
    if (tableId) {
      loadOrderingData();
    } else {
      setLoading(false);
    }
  }, [tableId]);

  const loadOrderingData = async () => {
    try {
      const response = await fetch(`/api/qr/order/table/${tableId}`);
      const data = await response.json();
      
      if (data.success) {
        setOrderingData(data.data);
      } else {
        console.error('Failed to load ordering data:', data.message);
      }
    } catch (error) {
      console.error('Error loading ordering data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (menuItem, quantity = 1, notes = '') => {
    const cartItem = {
      menuItem: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity,
      notes,
      subtotal: menuItem.price * quantity
    };
    
    setCart(prevCart => [...prevCart, cartItem]);
  };

  const placeOrder = async () => {
    try {
      const customerName = document.getElementById('customer-name').value;
      
      if (!customerName.trim()) {
        alert('Please enter your name');
        return;
      }
      
      if (cart.length === 0) {
        alert('Please add items to your cart');
        return;
      }
      
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tableId,
          customerName,
          items: cart
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('Order placed successfully!');
        setCart([]);
        // Redirect to order tracking page
        window.location.href = `/order-status/${data.data.id}`;
      } else {
        alert('Failed to place order: ' + data.message);
      }
    } catch (error) {
      alert('Error placing order: ' + error.message);
    }
  };

  if (loading) return <div>Loading menu...</div>;
  if (!orderingData) return <div>Invalid QR code or table not available</div>;

  return (
    <div className="customer-ordering">
      <div className="restaurant-header">
        <h1>{orderingData.restaurant.name}</h1>
        <p>{orderingData.restaurant.welcomeMessage}</p>
      </div>
      
      <div className="table-info">
        <h2>Table {orderingData.table.tableNumber}</h2>
        <p>Capacity: {orderingData.table.capacity} people</p>
      </div>
      
      <div className="customer-form">
        <input 
          id="customer-name"
          type="text" 
          placeholder="Enter your name" 
          required 
        />
      </div>
      
      <div className="menu">
        {orderingData.menu.map(category => (
          <div key={category.id} className="category">
            <h3>{category.name}</h3>
            <p>{category.description}</p>
            
            <div className="menu-items">
              {category.items.map(item => (
                <div key={item.id} className="menu-item">
                  {item.image && (
                    <img src={item.image} alt={item.name} className="item-image" />
                  )}
                  <div className="item-details">
                    <h4>{item.name}</h4>
                    <p>{item.description}</p>
                    <span className="price">${item.price}</span>
                    <button 
                      onClick={() => addToCart(item)}
                      disabled={item.availabilityStatus !== 'Available'}
                      className="add-to-cart"
                    >
                      {item.availabilityStatus === 'Available' ? 'Add to Cart' : 'Out of Stock'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {cart.length > 0 && (
        <div className="cart">
          <h3>Your Order</h3>
          {cart.map((item, index) => (
            <div key={index} className="cart-item">
              <span>{item.quantity}x {item.name}</span>
              <span>${item.subtotal.toFixed(2)}</span>
            </div>
          ))}
          <div className="cart-total">
            <strong>Total: ${cart.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)}</strong>
          </div>
          <button onClick={placeOrder} className="place-order">
            Place Order
          </button>
        </div>
      )}
    </div>
  );
};

export default CustomerOrderingPage;
```

### Staff QR Code Generation

```javascript
const generateTableQRCodes = async () => {
  try {
    const token = localStorage.getItem('accessToken');
    const response = await fetch('/api/qr/generate-all?format=png', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Display QR codes for printing
      data.data.forEach(tableQR => {
        createPrintableQR(tableQR.table, tableQR.qrCode);
      });
    }
  } catch (error) {
    console.error('Failed to generate QR codes:', error);
  }
};

const createPrintableQR = (table, qrCodeDataURL) => {
  const qrContainer = document.createElement('div');
  qrContainer.className = 'qr-print-card';
  qrContainer.innerHTML = `
    <div class="qr-header">
      <h3>Table ${table.tableNumber}</h3>
      <p>Capacity: ${table.capacity}</p>
    </div>
    <img src="${qrCodeDataURL}" alt="QR Code for Table ${table.tableNumber}" />
    <div class="qr-instructions">
      <p>Scan to view menu and place your order</p>
    </div>
  `;
  
  document.getElementById('qr-codes-container').appendChild(qrContainer);
};
```

## QR Code Flow

```
Customer Scans QR → Load Ordering Page → Browse Menu → Add to Cart → Place Order
                                                                    ↓
Staff Receives Order ←────────────────────────────────┐
```

## Error Handling

### Common Error Responses

```json
// Invalid table ID
{
  "success": false,
  "message": "Table not found"
}

// Table not available
{
  "success": false,
  "message": "Table is not available for ordering"
}

// QR generation failed
{
  "success": false,
  "message": "Failed to generate QR code"
}
```