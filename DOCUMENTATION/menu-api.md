# Menu Management API

Base path: `/api/menu`

## Overview

Handles menu item management, categories, pricing, availability, and image uploads.

## Endpoints

### 1. Create Menu Item (Admin/Manager Only)

**POST** `/`

**Purpose**: Create new menu item with image upload

**Headers**:
```
Authorization: Bearer <admin/manager-token>
Content-Type: multipart/form-data
```

**Request Body (FormData)**:
```
name: "Chicken Burger"
description: "Grilled chicken breast with lettuce and tomato"
price: 12.99
category: "507f1f77bcf86cd799439020"
image: [File object]
availabilityStatus: "Available"
```

**Response**:
```json
{
  "success": true,
  "message": "Menu item created successfully",
  "data": {
    "id": "507f1f77bcf86cd799439021",
    "name": "Chicken Burger",
    "description": "Grilled chicken breast with lettuce and tomato",
    "price": 12.99,
    "category": {
      "id": "507f1f77bcf86cd799439020",
      "name": "Main Dishes",
      "description": "Hearty main courses"
    },
    "image": "https://res.cloudinary.com/waitzi/image/upload/v1704537600/menu/chicken-burger.webp",
    "imageId": "waitzi/menu/chicken-burger",
    "availabilityStatus": "Available",
    "createdAt": "2026-01-06T13:00:00.000Z",
    "updatedAt": "2026-01-06T13:00:00.000Z"
  }
}
```

**Rate Limit**: 20 requests per 15 minutes

---

### 2. Get All Menu Items

**GET** `/`

**Purpose**: Get menu items with filtering and pagination

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 12)
- `category`: Filter by category ID
- `availability`: Filter by availability status
- `minPrice`: Minimum price filter
- `maxPrice`: Maximum price filter
- `search`: Search in name and description
- `sortBy`: Sort field (name, price, createdAt)
- `sortOrder`: Sort order (asc, desc)

**Example**: `/api/menu?category=507f1f77bcf86cd799439020&availability=Available&page=1&limit=10`

**Response**:
```json
{
  "success": true,
  "message": "Menu items retrieved successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439021",
      "name": "Chicken Burger",
      "description": "Grilled chicken breast with lettuce and tomato",
      "price": 12.99,
      "category": {
        "id": "507f1f77bcf86cd799439020",
        "name": "Main Dishes"
      },
      "image": "https://res.cloudinary.com/waitzi/image/upload/v1704537600/menu/chicken-burger.webp",
      "availabilityStatus": "Available",
      "createdAt": "2026-01-06T13:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 48,
    "itemsPerPage": 12,
    "hasNext": true,
    "hasPrev": false
  },
  "filters": {
    "category": "507f1f77bcf86cd799439020",
    "availability": "Available",
    "priceRange": { "min": null, "max": null }
  }
}
```

---

### 3. Get Menu by Category (Public)

**GET** `/category/:categoryId`

**Purpose**: Get available menu items for specific category (for customer ordering)

**Response**:
```json
{
  "success": true,
  "message": "Menu items retrieved successfully",
  "data": {
    "category": {
      "id": "507f1f77bcf86cd799439020",
      "name": "Main Dishes",
      "description": "Hearty main courses"
    },
    "items": [
      {
        "id": "507f1f77bcf86cd799439021",
        "name": "Chicken Burger",
        "description": "Grilled chicken breast with lettuce and tomato",
        "price": 12.99,
        "image": "https://res.cloudinary.com/waitzi/image/upload/v1704537600/menu/chicken-burger.webp",
        "availabilityStatus": "Available"
      }
    ]
  }
}
```

---

### 4. Get Menu Item by ID

**GET** `/:menuItemId`

**Purpose**: Get detailed information about specific menu item

**Response**:
```json
{
  "success": true,
  "message": "Menu item retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439021",
    "name": "Chicken Burger",
    "description": "Grilled chicken breast with lettuce and tomato",
    "price": 12.99,
    "category": {
      "id": "507f1f77bcf86cd799439020",
      "name": "Main Dishes",
      "description": "Hearty main courses"
    },
    "image": "https://res.cloudinary.com/waitzi/image/upload/v1704537600/menu/chicken-burger.webp",
    "imageId": "waitzi/menu/chicken-burger",
    "availabilityStatus": "Available",
    "createdAt": "2026-01-06T13:00:00.000Z",
    "updatedAt": "2026-01-06T13:00:00.000Z"
  }
}
```

---

### 5. Update Menu Item (Admin/Manager Only)

**PUT** `/:menuItemId`

**Purpose**: Update menu item details and/or image

**Headers**:
```
Authorization: Bearer <admin/manager-token>
Content-Type: multipart/form-data
```

**Request Body (FormData)**:
```
name: "Spicy Chicken Burger"
description: "Grilled chicken breast with spicy sauce"
price: 13.99
category: "507f1f77bcf86cd799439020"
image: [File object] (optional)
availabilityStatus: "Available"
```

**Response**: Same as Create Menu Item

---

### 6. Update Availability Status (Staff Only)

**PATCH** `/:menuItemId/availability`

**Purpose**: Quick toggle of item availability

**Headers**:
```
Authorization: Bearer <staff-token>
```

**Request Body**:
```json
{
  "availabilityStatus": "Out of Stock"
}
```

**Valid Values**: `Available`, `Out of Stock`

**Response**:
```json
{
  "success": true,
  "message": "Availability status updated successfully",
  "data": {
    "id": "507f1f77bcf86cd799439021",
    "name": "Chicken Burger",
    "availabilityStatus": "Out of Stock",
    "updatedAt": "2026-01-06T14:00:00.000Z"
  }
}
```

---

### 7. Delete Menu Item (Admin Only)

**DELETE** `/:menuItemId`

**Purpose**: Remove menu item and associated image

**Headers**:
```
Authorization: Bearer <admin-token>
```

**Response**:
```json
{
  "success": true,
  "message": "Menu item deleted successfully",
  "data": {
    "deletedItem": {
      "id": "507f1f77bcf86cd799439021",
      "name": "Chicken Burger"
    }
  }
}
```

## Frontend Integration Examples

### Admin Menu Management Dashboard

```jsx
import React, { useState, useEffect } from 'react';

const MenuManagement = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    category: '',
    availability: '',
    search: ''
  });
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchMenuItems();
    fetchCategories();
  }, [filters]);

  const fetchMenuItems = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const queryParams = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });
      
      const response = await fetch(`/api/menu?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        setMenuItems(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch menu items:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories');
      const data = await response.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const toggleAvailability = async (itemId, currentStatus) => {
    try {
      const token = localStorage.getItem('accessToken');
      const newStatus = currentStatus === 'Available' ? 'Out of Stock' : 'Available';
      
      const response = await fetch(`/api/menu/${itemId}/availability`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ availabilityStatus: newStatus })
      });
      
      const data = await response.json();
      if (data.success) {
        fetchMenuItems(); // Refresh list
      }
    } catch (error) {
      console.error('Failed to update availability:', error);
    }
  };

  const deleteMenuItem = async (itemId, itemName) => {
    if (!window.confirm(`Are you sure you want to delete "${itemName}"?`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/menu/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        fetchMenuItems(); // Refresh list
        alert('Menu item deleted successfully');
      }
    } catch (error) {
      console.error('Failed to delete menu item:', error);
      alert('Failed to delete menu item');
    }
  };

  return (
    <div className="menu-management">
      <div className="header">
        <h2>Menu Management</h2>
        <button 
          onClick={() => setShowAddForm(true)}
          className="add-item-btn"
        >
          Add New Item
        </button>
      </div>
      
      <div className="filters">
        <select 
          value={filters.category} 
          onChange={(e) => setFilters({...filters, category: e.target.value})}
        >
          <option value="">All Categories</option>
          {categories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        
        <select 
          value={filters.availability} 
          onChange={(e) => setFilters({...filters, availability: e.target.value})}
        >
          <option value="">All Items</option>
          <option value="Available">Available</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
        
        <input 
          type="text"
          placeholder="Search menu items..."
          value={filters.search}
          onChange={(e) => setFilters({...filters, search: e.target.value})}
        />
      </div>
      
      <div className="menu-grid">
        {menuItems.map(item => (
          <div key={item.id} className="menu-item-card">
            {item.image && (
              <img src={item.image} alt={item.name} className="item-image" />
            )}
            
            <div className="item-details">
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <span className="price">${item.price}</span>
              <span className={`status ${item.availabilityStatus.toLowerCase().replace(' ', '-')}`}>
                {item.availabilityStatus}
              </span>
            </div>
            
            <div className="item-actions">
              <button 
                onClick={() => toggleAvailability(item.id, item.availabilityStatus)}
                className={`availability-btn ${item.availabilityStatus === 'Available' ? 'available' : 'unavailable'}`}
              >
                {item.availabilityStatus === 'Available' ? 'Mark Unavailable' : 'Mark Available'}
              </button>
              
              <button 
                onClick={() => editMenuItem(item)}
                className="edit-btn"
              >
                Edit
              </button>
              
              <button 
                onClick={() => deleteMenuItem(item.id, item.name)}
                className="delete-btn"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {showAddForm && (
        <AddMenuItemForm 
          categories={categories}
          onClose={() => setShowAddForm(false)}
          onSuccess={() => {
            setShowAddForm(false);
            fetchMenuItems();
          }}
        />
      )}
    </div>
  );
};
```

### Add Menu Item Form Component

```jsx
const AddMenuItemForm = ({ categories, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    availabilityStatus: 'Available'
  });
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const token = localStorage.getItem('accessToken');
      const formDataToSend = new FormData();
      
      Object.entries(formData).forEach(([key, value]) => {
        formDataToSend.append(key, value);
      });
      
      if (imageFile) {
        formDataToSend.append('image', imageFile);
      }
      
      const response = await fetch('/api/menu', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formDataToSend
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('Menu item created successfully!');
        onSuccess();
      } else {
        alert('Failed to create menu item: ' + data.message);
      }
    } catch (error) {
      alert('Error creating menu item: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Add New Menu Item</h3>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Item Name"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            required
          />
          
          <textarea
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            required
          />
          
          <input
            type="number"
            step="0.01"
            placeholder="Price"
            value={formData.price}
            onChange={(e) => setFormData({...formData, price: e.target.value})}
            required
          />
          
          <select
            value={formData.category}
            onChange={(e) => setFormData({...formData, category: e.target.value})}
            required
          >
            <option value="">Select Category</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
          />
          
          <select
            value={formData.availabilityStatus}
            onChange={(e) => setFormData({...formData, availabilityStatus: e.target.value})}
          >
            <option value="Available">Available</option>
            <option value="Out of Stock">Out of Stock</option>
          </select>
          
          <div className="form-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

### Customer Menu Display

```javascript
const loadMenuForCustomer = async (categoryId = null) => {
  try {
    let url = '/api/menu';
    if (categoryId) {
      url = `/api/menu/category/${categoryId}`;
    } else {
      url += '?availability=Available';
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success) {
      if (categoryId) {
        displayCategoryMenu(data.data);
      } else {
        displayFullMenu(data.data);
      }
    }
  } catch (error) {
    console.error('Failed to load menu:', error);
  }
};
```

## Error Handling

### Common Error Responses

```json
// Invalid category
{
  "success": false,
  "message": "Category not found"
}

// Image upload error
{
  "success": false,
  "message": "Image upload failed. Please try again."
}

// Price validation error
{
  "success": false,
  "message": "Price must be a positive number"
}

// Item not found
{
  "success": false,
  "message": "Menu item not found"
}
```