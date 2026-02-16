# Password Management API

Base path: `/api/password`

## Overview

Handles password reset, change password, and forgot password functionality for staff members.

## Endpoints

### 1. Forgot Password

**POST** `/forgot-password`

**Purpose**: Request password reset link for forgotten password

**Request Body**:
```json
{
  "email": "staff@restaurant.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password reset link sent to your email"
}
```

**Rate Limit**: 5 requests per 15 minutes

---

### 2. Reset Password

**POST** `/reset-password`

**Purpose**: Reset password using reset token from email

**Request Body**:
```json
{
  "token": "reset_token_from_email",
  "newPassword": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password reset successful. You can now login with your new password."
}
```

---

### 3. Change Password

**POST** `/change-password`

**Purpose**: Change password for authenticated user

**Headers**:
```
Authorization: Bearer <access-token>
```

**Request Body**:
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### 4. Validate Reset Token

**GET** `/validate-token/:token`

**Purpose**: Check if reset token is valid before showing reset form

**Response**:
```json
{
  "success": true,
  "message": "Reset token is valid",
  "data": {
    "email": "staff@restaurant.com",
    "expiresAt": "2026-01-06T12:00:00.000Z",
    "timeRemaining": 847
  }
}
```

---

### 5. Generate Temporary Password (Admin Only)

**POST** `/generate-temp-password/:userId`

**Purpose**: Admin generates temporary password for staff member

**Headers**:
```
Authorization: Bearer <admin-token>
```

**Response**:
```json
{
  "success": true,
  "message": "Temporary password generated successfully",
  "data": {
    "temporaryPassword": "temp123abc",
    "email": "staff@restaurant.com",
    "mustChangePassword": true
  }
}
```

## Frontend Integration Examples

### Forgot Password Form

```javascript
const forgotPassword = async (email) => {
  try {
    const response = await fetch('/api/password/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('Password reset link sent to your email');
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
};
```

### Reset Password Form

```javascript
const resetPassword = async (token, newPassword, confirmPassword) => {
  try {
    // First validate the token
    const validateResponse = await fetch(`/api/password/validate-token/${token}`);
    const validateData = await validateResponse.json();
    
    if (!validateData.success) {
      throw new Error('Invalid or expired reset link');
    }
    
    // Reset the password
    const response = await fetch('/api/password/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, newPassword, confirmPassword })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('Password reset successful! You can now login.');
      // Redirect to login page
      window.location.href = '/login';
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
};
```

### Change Password Form

```javascript
const changePassword = async (currentPassword, newPassword, confirmPassword) => {
  try {
    const token = localStorage.getItem('accessToken');
    
    const response = await fetch('/api/password/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('Password changed successfully!');
      // Optionally log out user to force re-login
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
};
```

### React Password Reset Flow

```jsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const ResetPasswordPage = () => {
  const { token } = useParams();
  const [isValidToken, setIsValidToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      const response = await fetch(`/api/password/validate-token/${token}`);
      const data = await response.json();
      setIsValidToken(data.success);
    } catch (error) {
      setIsValidToken(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Call resetPassword function here
  };

  if (loading) return <div>Validating reset link...</div>;
  if (!isValidToken) return <div>Invalid or expired reset link</div>;

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="password"
        placeholder="New Password"
        value={formData.newPassword}
        onChange={(e) => setFormData({...formData, newPassword: e.target.value})}
        required
      />
      <input
        type="password"
        placeholder="Confirm New Password"
        value={formData.confirmPassword}
        onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
        required
      />
      <button type="submit">Reset Password</button>
    </form>
  );
};
```

## Error Handling

### Common Error Responses

```json
// Invalid token
{
  "success": false,
  "message": "Invalid or expired reset token"
}

// Password mismatch
{
  "success": false,
  "message": "Passwords do not match"
}

// Weak password
{
  "success": false,
  "message": "Password must be at least 6 characters long"
}

// Current password incorrect
{
  "success": false,
  "message": "Current password is incorrect"
}
```