# WaitZi API Documentation

## 🚀 Overview

WaitZi is a comprehensive digital waiter and restaurant management system. This documentation provides complete API reference for frontend integration.

## 📋 Base Information

- **Base URL**: `http://localhost:5000/api`
- **Authentication**: JWT Bearer Token
- **Content Type**: `application/json`
- **Rate Limiting**: Applied per endpoint

## 🔐 Authentication Flow

1. **Staff Registration**: Admin creates staff accounts
2. **Login**: Staff login with email/password
3. **Token Usage**: Include `Authorization: Bearer <token>` in headers
4. **Token Refresh**: Use refresh endpoint when access token expires

## 🏗️ System Architecture

### User Roles
- **Admin**: Full system access
- **Manager**: Operational management
- **Waiter/Staff**: Order and table management
- **Kitchen**: Order preparation
- **Accountant**: Payment and reporting
- **Customer**: No account needed (QR-based ordering)

### Core Workflows
1. **Customer Journey**: QR Scan → Browse Menu → Place Order → Payment
2. **Staff Workflow**: Login → Manage Orders → Update Status → Complete Service
3. **Kitchen Workflow**: View Orders → Update Cooking Status → Mark Ready
4. **Management**: Analytics → Staff Management → Menu Management

## 📚 Controller Documentation

- [Authentication API](./auth-api.md)
- [User Management API](./user-api.md)
- [Role Management API](./role-api.md)
- [Menu Management API](./menu-api.md)
- [Table Management API](./table-api.md)
- [Order Management API](./order-api.md)
- [Payment Processing API](./payment-api.md)
- [QR Code API](./qr-api.md)
- [Dashboard Analytics API](./dashboard-api.md)
- [Category Management API](./category-api.md)
- [Password Management API](./password-api.md)

## 🔧 Quick Start

### 1. Authentication
```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@waitzi.com","password":"password"}'
```

### 2. Customer QR Ordering
```bash
# Get ordering page data
curl -X GET http://localhost:5000/api/qr/order/table/TABLE_ID

# Place order
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"tableId":"TABLE_ID","customerName":"John","items":[...]}'
```

### 3. Staff Order Management
```bash
# Get kitchen orders
curl -X GET http://localhost:5000/api/orders/kitchen \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update order status
curl -X PATCH http://localhost:5000/api/orders/ORDER_ID/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"InKitchen"}'
```

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    // Validation errors (if applicable)
  ]
}
```

## 🚨 Error Codes

- `400`: Bad Request (Invalid input)
- `401`: Unauthorized (No/invalid token)
- `403`: Forbidden (Insufficient permissions)
- `404`: Not Found
- `409`: Conflict (Duplicate data)
- `429`: Too Many Requests (Rate limited)
- `500`: Internal Server Error

## 🔗 Related Resources

- [Postman Collection](./postman-collection.json)
- [Frontend Integration Guide](./frontend-integration.md)
- [Error Handling Guide](./error-handling.md)
- [Rate Limiting Details](./rate-limiting.md)

---

**Last Updated**: January 6, 2026
**API Version**: 1.0.0