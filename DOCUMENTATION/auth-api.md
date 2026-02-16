# Authentication API

Base path: `/api/auth`

## Overview

Handles staff authentication, registration (admin-only), and session management. No customer authentication required.

## Endpoints

### 1. Staff Registration (Admin Only)

**POST** `/register`

**Purpose**: Create new staff account (only admins can register staff)

**Headers**:
```
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@restaurant.com",
  "password": "securePassword123",
  "number": "+1234567890",
  "address": "123 Main St",
  "role": "waiter"
}
```

**Response**:
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": "user_id",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@restaurant.com",
    "role": {
      "id": "role_id",
      "name": "waiter",
      "description": "Waiter role"
    },
    "status": "Active"
  }
}
```

**Rate Limit**: 10 requests per hour

---

### 2. Staff Login

**POST** `/login`

**Purpose**: Authenticate staff and get access/refresh tokens

**Request Body**:
```json
{
  "email": "john.doe@restaurant.com",
  "password": "securePassword123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@restaurant.com",
      "role": {
        "name": "waiter",
        "description": "Waiter role"
      }
    },
    "tokens": {
      "accessToken": "jwt_access_token",
      "refreshToken": "jwt_refresh_token"
    }
  }
}
```

**Rate Limit**: 5 requests per 15 minutes

---

### 3. Token Refresh

**POST** `/refresh-token`

**Purpose**: Get new access token using refresh token

**Request Body**:
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "new_jwt_access_token",
    "refreshToken": "new_jwt_refresh_token"
  }
}
```

---

### 4. Logout

**POST** `/logout`

**Purpose**: Invalidate current session

**Headers**:
```
Authorization: Bearer <access-token>
```

**Response**:
```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

### 5. Verify Token

**GET** `/verify`

**Purpose**: Verify if current token is valid

**Headers**:
```
Authorization: Bearer <access-token>
```

**Response**:
```json
{
  "success": true,
  "message": "Token is valid",
  "data": {
    "user": {
      "id": "user_id",
      "email": "john.doe@restaurant.com",
      "role": "waiter"
    },
    "isValid": true
  }
}
```

## Frontend Integration Examples

### React/JavaScript Login

```javascript
const login = async (email, password) => {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Store tokens
      localStorage.setItem('accessToken', data.data.tokens.accessToken);
      localStorage.setItem('refreshToken', data.data.tokens.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      
      return data.data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
};
```

### Axios Interceptor for Token Management

```javascript
// Request interceptor to add token
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const response = await axios.post('/api/auth/refresh-token', {
          refreshToken
        });
        
        const { accessToken, refreshToken: newRefreshToken } = response.data.data;
        
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', newRefreshToken);
        
        return axios(originalRequest);
      } catch (refreshError) {
        // Redirect to login
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);
```

## Error Responses

### Invalid Credentials
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

### Validation Errors
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Email is required",
    "Password must be at least 6 characters"
  ]
}
```

### Rate Limit Exceeded
```json
{
  "success": false,
  "message": "Too many authentication attempts, please try again later.",
  "retryAfter": 900
}
```