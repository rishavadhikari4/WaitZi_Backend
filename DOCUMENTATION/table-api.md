# Table Management API

Base path: `/api/tables`

## Overview

Handles restaurant table management, QR code integration, and table status tracking.

## Endpoints

### 1. Create Table (Admin/Manager Only)

**POST** `/`

**Purpose**: Create new restaurant table

**Headers**:
```
Authorization: Bearer <admin/manager-token>
```

**Request Body**:
```json
{
  "tableNumber": 5,
  "capacity": 4
}
```

**Response**:
```json
{
  "success": true,
  "message": "Table created successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "tableNumber": 5,
    "capacity": 4,
    "status": "Available",
    "currentOrder": null,
    "assignedWaiter": null,
    "createdAt": "2026-01-06T13:00:00.000Z"
  }
}
```

---

### 2. Get All Tables (Staff Only)

**GET** `/`

**Purpose**: Get all tables with filtering and pagination

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `status`: Filter by status (Available, Occupied, Reserved)
- `capacity`: Filter by capacity
- `assignedWaiter`: Filter by waiter ID
- `sortBy`: Sort field (tableNumber, capacity, createdAt)
- `sortOrder`: Sort order (asc, desc)

**Response**:
```json
{
  "success": true,
  "message": "Tables retrieved successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "tableNumber": 5,
      "capacity": 4,
      "status": "Available",
      "currentOrder": null,
      "assignedWaiter": {
        "id": "507f1f77bcf86cd799439014",
        "firstName": "Jane",
        "lastName": "Smith"
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalItems": 25
  },
  "stats": {
    "available": 15,
    "occupied": 8,
    "reserved": 2,
    "utilization": {
      "totalCapacity": 100,
      "occupiedCapacity": 32
    }
  }
}
```

---

### 3. Get Table by ID (Public)

**GET** `/:tableId`

**Purpose**: Get specific table details (used for QR code scanning)

**Response**:
```json
{
  "success": true,
  "message": "Table retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "tableNumber": 5,
    "capacity": 4,
    "status": "Available",
    "currentOrder": {
      "id": "507f1f77bcf86cd799439013",
      "customerName": "John Doe",
      "status": "InKitchen",
      "totalAmount": 25.98
    },
    "assignedWaiter": {
      "firstName": "Jane",
      "lastName": "Smith"
    }
  }
}
```

---

### 4. Get Table by Number (Public)

**GET** `/number/:tableNumber`

**Purpose**: Get table by table number (alternative QR endpoint)

**Response**: Same as Get Table by ID

---

### 5. Update Table (Admin/Manager Only)

**PUT** `/:tableId`

**Purpose**: Update table details

**Headers**:
```
Authorization: Bearer <admin/manager-token>
```

**Request Body**:
```json
{
  "tableNumber": 6,
  "capacity": 6,
  "status": "Available",
  "assignedWaiter": "507f1f77bcf86cd799439014"
}
```

---

### 6. Update Table Status (Staff Only)

**PATCH** `/:tableId/status`

**Purpose**: Quick status update

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Request Body**:
```json
{
  "status": "Occupied"
}
```

**Valid Status Values**: `Available`, `Occupied`, `Reserved`

---

### 7. Check Table Availability (Public)

**GET** `/:tableId/availability`

**Purpose**: Check if table is available for new orders

**Response**:
```json
{
  "success": true,
  "message": "Table availability checked",
  "data": {
    "table": {
      "id": "507f1f77bcf86cd799439011",
      "tableNumber": 5,
      "capacity": 4,
      "status": "Available"
    },
    "isAvailable": true,
    "canTakeNewOrder": true,
    "currentOrder": null
  }
}
```

---

### 8. Reset Table (Staff Only)

**PATCH** `/:tableId/reset`

**Purpose**: Reset table for new customers after order completion

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Response**:
```json
{
  "success": true,
  "message": "Table reset for new customers",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "tableNumber": 5,
    "status": "Available",
    "currentOrder": null
  }
}
```

---

### 9. Assign Order to Table (Staff Only)

**POST** `/:tableId/assign-order`

**Purpose**: Manually assign order to table

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Request Body**:
```json
{
  "orderId": "507f1f77bcf86cd799439013"
}
```

---

### 10. Clear Order from Table (Staff Only)

**PATCH** `/:tableId/clear-order`

**Purpose**: Remove current order from table

**Headers**:
```
Authorization: Bearer <staff-token>
```

---

### 11. Delete Table (Admin Only)

**DELETE** `/:tableId`

**Purpose**: Remove table from system

**Headers**:
```
Authorization: Bearer <admin-token>
```

## Frontend Integration Examples

### Table Status Dashboard

```jsx
import React, { useState, useEffect } from 'react';

const TableDashboard = () => {
  const [tables, setTables] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchTables();
    const interval = setInterval(fetchTables, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [filter]);

  const fetchTables = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const url = filter === 'all' ? '/api/tables' : `/api/tables?status=${filter}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        setTables(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    }
  };

  const updateTableStatus = async (tableId, newStatus) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/tables/${tableId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      const data = await response.json();
      if (data.success) {
        fetchTables(); // Refresh table list
      }
    } catch (error) {
      console.error('Failed to update table status:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Available': return 'green';
      case 'Occupied': return 'red';
      case 'Reserved': return 'orange';
      default: return 'gray';
    }
  };

  return (
    <div className="table-dashboard">
      <div className="filters">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All Tables
        </button>
        <button 
          className={filter === 'Available' ? 'active' : ''}
          onClick={() => setFilter('Available')}
        >
          Available
        </button>
        <button 
          className={filter === 'Occupied' ? 'active' : ''}
          onClick={() => setFilter('Occupied')}
        >
          Occupied
        </button>
        <button 
          className={filter === 'Reserved' ? 'active' : ''}
          onClick={() => setFilter('Reserved')}
        >
          Reserved
        </button>
      </div>

      <div className="table-grid">
        {tables.map(table => (
          <div 
            key={table.id} 
            className={`table-card status-${table.status.toLowerCase()}`}
            style={{ borderColor: getStatusColor(table.status) }}
          >
            <h3>Table {table.tableNumber}</h3>
            <p>Capacity: {table.capacity}</p>
            <p>Status: <span className={`status ${table.status.toLowerCase()}`}>{table.status}</span></p>
            
            {table.currentOrder && (
              <div className="current-order">
                <p>Customer: {table.currentOrder.customerName}</p>
                <p>Order Status: {table.currentOrder.status}</p>
                <p>Amount: ${table.currentOrder.totalAmount}</p>
              </div>
            )}
            
            {table.assignedWaiter && (
              <p>Waiter: {table.assignedWaiter.firstName} {table.assignedWaiter.lastName}</p>
            )}
            
            <div className="table-actions">
              <select 
                value={table.status} 
                onChange={(e) => updateTableStatus(table.id, e.target.value)}
              >
                <option value="Available">Available</option>
                <option value="Occupied">Occupied</option>
                <option value="Reserved">Reserved</option>
              </select>
              
              {table.status !== 'Available' && (
                <button 
                  onClick={() => updateTableStatus(table.id, 'Available')}
                  className="clear-btn"
                >
                  Clear Table
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableDashboard;
```

### QR Code Table Lookup

```javascript
const getTableForQR = async (tableId) => {
  try {
    // First check if table is available
    const availabilityResponse = await fetch(`/api/tables/${tableId}/availability`);
    const availabilityData = await availabilityResponse.json();
    
    if (!availabilityData.success || !availabilityData.data.canTakeNewOrder) {
      throw new Error('Table is not available for new orders');
    }
    
    // Get full table details
    const tableResponse = await fetch(`/api/tables/${tableId}`);
    const tableData = await tableResponse.json();
    
    if (tableData.success) {
      return tableData.data;
    } else {
      throw new Error('Table not found');
    }
  } catch (error) {
    console.error('Failed to get table:', error);
    throw error;
  }
};
```

## Table Status Flow

```
Available → Occupied (when order placed)
    ↑         ↓
    ←─────────┐
           │
           v
     Reserved (manual)
```

## Error Handling

### Common Error Responses

```json
// Table not found
{
  "success": false,
  "message": "Table not found"
}

// Table number already exists
{
  "success": false,
  "message": "Table with this number already exists"
}

// Cannot delete table with active order
{
  "success": false,
  "message": "Cannot delete table with active order"
}

// Invalid table status
{
  "success": false,
  "message": "Invalid table status. Must be Available, Occupied, or Reserved"
}
```