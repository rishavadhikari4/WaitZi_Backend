# Category Management API

Base path: `/api/categories`

## Overview

Handles menu category management, including CRUD operations for organizing menu items into logical groups.

## Endpoints

### 1. Get All Categories (Public)

**GET** `/`

**Purpose**: Get all menu categories (for public menu display)

**Response**:
```json
{
  "success": true,
  "message": "Categories retrieved successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439020",
      "name": "Appetizers",
      "description": "Start your meal with our delicious appetizers",
      "displayOrder": 1,
      "isActive": true,
      "itemCount": 8,
      "createdAt": "2026-01-06T10:00:00.000Z",
      "updatedAt": "2026-01-06T12:00:00.000Z"
    },
    {
      "id": "507f1f77bcf86cd799439021",
      "name": "Main Dishes",
      "description": "Hearty main courses to satisfy your hunger",
      "displayOrder": 2,
      "isActive": true,
      "itemCount": 15,
      "createdAt": "2026-01-06T10:00:00.000Z",
      "updatedAt": "2026-01-06T12:00:00.000Z"
    },
    {
      "id": "507f1f77bcf86cd799439022",
      "name": "Desserts",
      "description": "Sweet treats to end your meal perfectly",
      "displayOrder": 3,
      "isActive": true,
      "itemCount": 6,
      "createdAt": "2026-01-06T10:00:00.000Z",
      "updatedAt": "2026-01-06T12:00:00.000Z"
    }
  ]
}
```

---

### 2. Get Category by ID

**GET** `/:categoryId`

**Purpose**: Get specific category details with menu items

**Response**:
```json
{
  "success": true,
  "message": "Category retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439020",
    "name": "Appetizers",
    "description": "Start your meal with our delicious appetizers",
    "displayOrder": 1,
    "isActive": true,
    "createdAt": "2026-01-06T10:00:00.000Z",
    "updatedAt": "2026-01-06T12:00:00.000Z",
    "menuItems": [
      {
        "id": "507f1f77bcf86cd799439030",
        "name": "Chicken Wings",
        "description": "Crispy wings with choice of sauce",
        "price": 12.99,
        "image": "https://cloudinary.com/wings.jpg",
        "availabilityStatus": "Available"
      },
      {
        "id": "507f1f77bcf86cd799439031",
        "name": "Mozzarella Sticks",
        "description": "Golden fried mozzarella with marinara sauce",
        "price": 8.99,
        "image": "https://cloudinary.com/mozzarella.jpg",
        "availabilityStatus": "Available"
      }
    ]
  }
}
```

---

### Staff/Admin Endpoints (Authentication Required)

### 3. Create Category (Admin/Manager Only)

**POST** `/`

**Purpose**: Create new menu category

**Headers**:
```
Authorization: Bearer <admin/manager-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "Beverages",
  "description": "Refreshing drinks to complement your meal",
  "displayOrder": 4,
  "isActive": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Category created successfully",
  "data": {
    "id": "507f1f77bcf86cd799439023",
    "name": "Beverages",
    "description": "Refreshing drinks to complement your meal",
    "displayOrder": 4,
    "isActive": true,
    "itemCount": 0,
    "createdAt": "2026-01-06T13:00:00.000Z",
    "updatedAt": "2026-01-06T13:00:00.000Z"
  }
}
```

**Rate Limit**: 10 requests per 15 minutes

---

### 4. Update Category (Admin/Manager Only)

**PUT** `/:categoryId`

**Purpose**: Update category details

**Headers**:
```
Authorization: Bearer <admin/manager-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "Hot Beverages",
  "description": "Coffee, tea, and other warm drinks",
  "displayOrder": 4,
  "isActive": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Category updated successfully",
  "data": {
    "id": "507f1f77bcf86cd799439023",
    "name": "Hot Beverages",
    "description": "Coffee, tea, and other warm drinks",
    "displayOrder": 4,
    "isActive": true,
    "itemCount": 5,
    "createdAt": "2026-01-06T13:00:00.000Z",
    "updatedAt": "2026-01-06T14:00:00.000Z"
  }
}
```

---

### 5. Update Category Status (Staff Only)

**PATCH** `/:categoryId/status`

**Purpose**: Quick toggle of category active status

**Headers**:
```
Authorization: Bearer <staff-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "isActive": false
}
```

**Response**:
```json
{
  "success": true,
  "message": "Category status updated successfully",
  "data": {
    "id": "507f1f77bcf86cd799439023",
    "name": "Hot Beverages",
    "isActive": false,
    "updatedAt": "2026-01-06T14:30:00.000Z"
  }
}
```

---

### 6. Reorder Categories (Admin/Manager Only)

**PATCH** `/reorder`

**Purpose**: Update display order for multiple categories

**Headers**:
```
Authorization: Bearer <admin/manager-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "categories": [
    {
      "id": "507f1f77bcf86cd799439020",
      "displayOrder": 1
    },
    {
      "id": "507f1f77bcf86cd799439021",
      "displayOrder": 2
    },
    {
      "id": "507f1f77bcf86cd799439023",
      "displayOrder": 3
    },
    {
      "id": "507f1f77bcf86cd799439022",
      "displayOrder": 4
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Category order updated successfully",
  "data": {
    "updatedCategories": [
      {
        "id": "507f1f77bcf86cd799439020",
        "name": "Appetizers",
        "displayOrder": 1
      },
      {
        "id": "507f1f77bcf86cd799439021",
        "name": "Main Dishes",
        "displayOrder": 2
      },
      {
        "id": "507f1f77bcf86cd799439023",
        "name": "Hot Beverages",
        "displayOrder": 3
      },
      {
        "id": "507f1f77bcf86cd799439022",
        "name": "Desserts",
        "displayOrder": 4
      }
    ]
  }
}
```

---

### 7. Delete Category (Admin Only)

**DELETE** `/:categoryId`

**Purpose**: Delete category (only if no menu items exist)

**Headers**:
```
Authorization: Bearer <admin-token>
```

**Response**:
```json
{
  "success": true,
  "message": "Category deleted successfully",
  "data": {
    "deletedCategory": {
      "id": "507f1f77bcf86cd799439023",
      "name": "Hot Beverages"
    }
  }
}
```

---

### 8. Get Category Statistics (Manager/Admin Only)

**GET** `/:categoryId/stats`

**Purpose**: Get analytics for specific category

**Headers**:
```
Authorization: Bearer <manager/admin-token>
```

**Response**:
```json
{
  "success": true,
  "message": "Category statistics retrieved successfully",
  "data": {
    "categoryId": "507f1f77bcf86cd799439020",
    "categoryName": "Appetizers",
    "statistics": {
      "totalMenuItems": 8,
      "availableItems": 7,
      "outOfStockItems": 1,
      "averagePrice": 10.50,
      "priceRange": {
        "min": 6.99,
        "max": 15.99
      },
      "orderStatistics": {
        "totalOrders": 45,
        "popularItems": [
          {
            "itemId": "507f1f77bcf86cd799439030",
            "itemName": "Chicken Wings",
            "orderCount": 25
          },
          {
            "itemId": "507f1f77bcf86cd799439031",
            "itemName": "Mozzarella Sticks",
            "orderCount": 20
          }
        ],
        "revenue": 472.50
      }
    }
  }
}
```

## Frontend Integration Examples

### Category Management Dashboard

```jsx
import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const CategoryManagement = () => {
  const [categories, setCategories] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories');
      const data = await response.json();
      if (data.success) {
        // Sort by display order
        const sortedCategories = data.data.sort((a, b) => a.displayOrder - b.displayOrder);
        setCategories(sortedCategories);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const createCategory = async (categoryData) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(categoryData)
      });
      
      const data = await response.json();
      if (data.success) {
        fetchCategories(); // Refresh list
        setShowAddForm(false);
        alert('Category created successfully!');
      }
    } catch (error) {
      alert('Failed to create category: ' + error.message);
    }
  };

  const updateCategory = async (categoryId, categoryData) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(categoryData)
      });
      
      const data = await response.json();
      if (data.success) {
        fetchCategories(); // Refresh list
        setEditingCategory(null);
        alert('Category updated successfully!');
      }
    } catch (error) {
      alert('Failed to update category: ' + error.message);
    }
  };

  const toggleCategoryStatus = async (categoryId, currentStatus) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/categories/${categoryId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      
      const data = await response.json();
      if (data.success) {
        fetchCategories(); // Refresh list
      }
    } catch (error) {
      alert('Failed to update category status: ' + error.message);
    }
  };

  const deleteCategory = async (categoryId, categoryName) => {
    if (!window.confirm(`Are you sure you want to delete "${categoryName}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        fetchCategories(); // Refresh list
        alert('Category deleted successfully!');
      } else {
        alert('Failed to delete category: ' + data.message);
      }
    } catch (error) {
      alert('Failed to delete category: ' + error.message);
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const items = Array.from(categories);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update display order
    const updatedCategories = items.map((category, index) => ({
      id: category.id,
      displayOrder: index + 1
    }));
    
    // Optimistically update UI
    setCategories(items);
    
    // Save to server
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/categories/reorder', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ categories: updatedCategories })
      });
      
      const data = await response.json();
      if (!data.success) {
        // Revert on failure
        fetchCategories();
        alert('Failed to update category order');
      }
    } catch (error) {
      fetchCategories(); // Revert on error
      alert('Failed to update category order: ' + error.message);
    }
  };

  return (
    <div className="category-management">
      <div className="header">
        <h2>Category Management</h2>
        <button 
          onClick={() => setShowAddForm(true)}
          className="add-category-btn"
        >
          Add New Category
        </button>
      </div>
      
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="categories">
          {(provided) => (
            <div 
              {...provided.droppableProps} 
              ref={provided.innerRef}
              className="categories-list"
            >
              {categories.map((category, index) => (
                <Draggable 
                  key={category.id} 
                  draggableId={category.id} 
                  index={index}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`category-card ${snapshot.isDragging ? 'dragging' : ''}`}
                    >
                      <div className="category-info">
                        <div className="drag-handle">⋮⋮</div>
                        <div className="category-details">
                          <h3>{category.name}</h3>
                          <p>{category.description}</p>
                          <div className="category-meta">
                            <span className="item-count">
                              {category.itemCount} items
                            </span>
                            <span className={`status ${category.isActive ? 'active' : 'inactive'}`}>
                              {category.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="category-actions">
                        <button 
                          onClick={() => toggleCategoryStatus(category.id, category.isActive)}
                          className={`status-btn ${category.isActive ? 'active' : 'inactive'}`}
                        >
                          {category.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        
                        <button 
                          onClick={() => setEditingCategory(category)}
                          className="edit-btn"
                        >
                          Edit
                        </button>
                        
                        {category.itemCount === 0 && (
                          <button 
                            onClick={() => deleteCategory(category.id, category.name)}
                            className="delete-btn"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      
      {showAddForm && (
        <CategoryForm 
          title="Add New Category"
          onSubmit={createCategory}
          onClose={() => setShowAddForm(false)}
        />
      )}
      
      {editingCategory && (
        <CategoryForm 
          title="Edit Category"
          category={editingCategory}
          onSubmit={(data) => updateCategory(editingCategory.id, data)}
          onClose={() => setEditingCategory(null)}
        />
      )}
    </div>
  );
};
```

### Category Form Component

```jsx
const CategoryForm = ({ title, category, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    name: category?.name || '',
    description: category?.description || '',
    displayOrder: category?.displayOrder || 1,
    isActive: category?.isActive !== undefined ? category.isActive : true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{title}</h3>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Category Name"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            required
          />
          
          <textarea
            placeholder="Category Description"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            required
          />
          
          <input
            type="number"
            min="1"
            placeholder="Display Order"
            value={formData.displayOrder}
            onChange={(e) => setFormData({...formData, displayOrder: parseInt(e.target.value)})}
          />
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
            />
            Active Category
          </label>
          
          <div className="form-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit">
              {category ? 'Update' : 'Create'} Category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

### Customer Menu Display by Category

```javascript
const displayCategorizedMenu = async () => {
  try {
    const response = await fetch('/api/categories');
    const data = await response.json();
    
    if (data.success) {
      const menuContainer = document.getElementById('menu-container');
      
      data.data.forEach(category => {
        if (category.isActive && category.itemCount > 0) {
          const categorySection = createCategorySection(category);
          menuContainer.appendChild(categorySection);
        }
      });
    }
  } catch (error) {
    console.error('Failed to load categorized menu:', error);
  }
};

const createCategorySection = (category) => {
  const section = document.createElement('section');
  section.className = 'menu-category';
  section.innerHTML = `
    <div class="category-header">
      <h2>${category.name}</h2>
      <p>${category.description}</p>
    </div>
    <div class="menu-items" id="category-${category.id}"></div>
  `;
  
  // Load menu items for this category
  loadCategoryItems(category.id);
  
  return section;
};
```

## Error Handling

### Common Error Responses

```json
// Category name already exists
{
  "success": false,
  "message": "Category with this name already exists"
}

// Cannot delete category with items
{
  "success": false,
  "message": "Cannot delete category that contains menu items"
}

// Category not found
{
  "success": false,
  "message": "Category not found"
}

// Invalid display order
{
  "success": false,
  "message": "Display order must be a positive number"
}
```