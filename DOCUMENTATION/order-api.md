# Order Management API

Base path: `/api/orders`

## Overview

Handles order creation, management, and kitchen workflow. Supports both customer QR ordering and staff order management.

## Endpoints

### 1. Create Order (Customer - No Auth Required)

**POST** `/`

**Purpose**: Create new order from QR code scan

**Request Body**:
```json
{
  "tableId": "507f1f77bcf86cd799439011",
  "customerName": "John Doe",
  "items": [
    {
      "menuItem": "507f1f77bcf86cd799439012",
      "quantity": 2,
      "notes": "No onions please"
    }
  ],
  "note": "Table by the window",
  "discount": 5.00
}
```

**Response**:
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "id": "507f1f77bcf86cd799439013",
    "table": {
      "id": "507f1f77bcf86cd799439011",
      "tableNumber": 5,
      "capacity": 4
    },
    "customerName": "John Doe",
    "items": [
      {
        "menuItem": {
          "id": "507f1f77bcf86cd799439012",
          "name": "Chicken Burger",
          "price": 12.99
        },
        "quantity": 2,
        "subtotal": 25.98,
        "status": "Pending",
        "notes": "No onions please"
      }
    ],
    "totalAmount": 25.98,
    "discount": 5.00,
    "finalAmount": 20.98,
    "status": "Pending",
    "assignedWaiter": {
      "id": "507f1f77bcf86cd799439014",
      "firstName": "Jane",
      "lastName": "Smith"
    },
    "orderTimeout": "2026-01-06T13:30:00.000Z",
    "createdAt": "2026-01-06T13:00:00.000Z"
  }
}
```

**Rate Limit**: 20 requests per 10 minutes

---

### 2. Get All Orders (Staff Only)

**GET** `/`

**Purpose**: Get all orders with filtering and pagination

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `status`: Filter by status (Pending, InKitchen, Paid, Completed, Cancelled)
- `table`: Filter by table ID
- `startDate`: Filter orders from date (YYYY-MM-DD)
- `endDate`: Filter orders to date (YYYY-MM-DD)
- `sortBy`: Sort field (createdAt, totalAmount)
- `sortOrder`: Sort order (asc, desc)

**Example**: `/api/orders?status=Pending&page=1&limit=10&sortBy=createdAt&sortOrder=desc`

**Response**:
```json
{
  "success": true,
  "message": "Orders retrieved successfully",
  "data": [
    // Array of orders
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 50,
    "itemsPerPage": 10,
    "hasNext": true,
    "hasPrev": false
  },
  "stats": {
    "totalPending": 5,
    "totalInKitchen": 8,
    "totalCompleted": 37
  }
}
```

---

### 3. Get Kitchen Orders (Kitchen Staff)

**GET** `/kitchen`

**Purpose**: Get orders for kitchen workflow

**Headers**:
```
Authorization: Bearer <kitchen-staff-token>
```

**Query Parameters**:
- `status`: Filter by status (default: active orders)

**Response**:
```json
{
  "success": true,
  "message": "Kitchen orders retrieved successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439013",
      "table": {
        "tableNumber": 5,
        "capacity": 4
      },
      "customerName": "John Doe",
      "items": [
        {
          "menuItem": {
            "name": "Chicken Burger",
            "description": "Grilled chicken with lettuce"
          },
          "quantity": 2,
          "status": "Pending",
          "notes": "No onions please"
        }
      ],
      "itemsByStatus": {
        "pending": [/* items */],
        "cooking": [/* items */],
        "ready": [/* items */]
      },
      "totalAmount": 20.98,
      "createdAt": "2026-01-06T13:00:00.000Z",
      "waitTime": "5 minutes"
    }
  ]
}
```

---

### 4. Update Order Status (Staff Only)

**PATCH** `/:orderId/status`

**Purpose**: Update overall order status

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Request Body**:
```json
{
  "status": "InKitchen",
  "note": "Started cooking"
}
```

**Valid Status Transitions**:
- `Pending` → `InKitchen`, `Cancelled`
- `InKitchen` → `Paid`, `Cancelled`
- `Paid` → `Completed`

---

### 5. Update Order Item Status (Kitchen Staff)

**PATCH** `/:orderId/items/:itemId/status`

**Purpose**: Update individual item cooking status

**Request Body**:
```json
{
  "status": "Cooking"
}
```

**Valid Item Statuses**: `Pending`, `Cooking`, `Ready`, `Served`

---

### 6. Complete Order (Staff Only)

**PATCH** `/:orderId/complete`

**Purpose**: Mark order as completed and clear table

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Response**:
```json
{
  "success": true,
  "message": "Order completed successfully",
  "data": {
    // Completed order details
  }
}
```

---

### 7. Cancel Order (Staff Only)

**DELETE** `/:orderId/cancel`

**Purpose**: Cancel order and free table

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Request Body**:
```json
{
  "reason": "Customer left"
}
```

---

### 8. Add Items to Order

**POST** `/:orderId/items`

**Purpose**: Add more items to existing order

**Request Body**:
```json
{
  "items": [
    {
      "menuItem": "507f1f77bcf86cd799439015",
      "quantity": 1,
      "notes": "Extra spicy"
    }
  ]
}
```

---

### 9. Get Orders by Table (Customer)

**GET** `/table/:tableId`

**Purpose**: Get orders for specific table (for customer to track)

**Query Parameters**:
- `status`: Filter by status

**Response**:
```json
{
  "success": true,
  "message": "Table orders retrieved successfully",
  "data": [
    // Array of orders for the table
  ]
}
```

## Frontend Integration Examples

### Customer Order Placement

```javascript
const placeOrder = async (tableId, customerName, items) => {
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tableId,
        customerName,
        items,
        note: 'Please serve quickly'
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert(`Order placed! Order ID: ${data.data.id}`);
      return data.data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Order placement failed:', error);
    throw error;
  }
};
```

### Kitchen Order Management

```javascript
const updateItemStatus = async (orderId, itemId, status) => {
  try {
    const token = localStorage.getItem('accessToken');
    
    const response = await fetch(`/api/orders/${orderId}/items/${itemId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Item status updated');
      return data.data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Status update failed:', error);
  }
};
```

### Real-time Kitchen Dashboard

```jsx
import React, { useState, useEffect } from 'react';

const KitchenDashboard = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKitchenOrders();
    const interval = setInterval(fetchKitchenOrders, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchKitchenOrders = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/orders/kitchen', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        setOrders(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch kitchen orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateItemStatus = async (orderId, itemId, newStatus) => {
    // Update item status implementation
  };

  if (loading) return <div>Loading kitchen orders...</div>;

  return (
    <div className="kitchen-dashboard">
      <h2>Kitchen Orders</h2>
      {orders.map(order => (
        <div key={order.id} className="order-card">
          <h3>Table {order.table.tableNumber} - {order.customerName}</h3>
          <div className="items">
            {order.items.map(item => (
              <div key={item.id} className="item">
                <span>{item.quantity}x {item.menuItem.name}</span>
                <select 
                  value={item.status} 
                  onChange={(e) => updateItemStatus(order.id, item.id, e.target.value)}
                >
                  <option value="Pending">Pending</option>
                  <option value="Cooking">Cooking</option>
                  <option value="Ready">Ready</option>
                  <option value="Served">Served</option>
                </select>
                {item.notes && <span className="notes">{item.notes}</span>}
              </div>
            ))}
          </div>
          <small>Ordered: {new Date(order.createdAt).toLocaleTimeString()}</small>
        </div>
      ))}
    </div>
  );
};
```

## Order Status Flow

```
Customer Orders → Pending → InKitchen → Paid → Completed
                     ↓         ↓        ↓
                 Cancelled  Cancelled  (Auto-complete after 10 min)
```

## Error Handling

### Common Error Responses

```json
// Kitchen at capacity
{
  "success": false,
  "message": "Kitchen is at capacity. Please try again in a few minutes.",
  "kitchenStatus": {
    "activeOrders": 20,
    "maxCapacity": 20,
    "utilizationPercent": 100
  }
}

// Duplicate order
{
  "success": false,
  "message": "A recent order already exists for this customer on this table",
  "existingOrder": {
    "id": "507f1f77bcf86cd799439013",
    "status": "Pending"
  }
}

// Invalid status transition
{
  "success": false,
  "message": "Cannot change status from Paid to Pending"
}
```