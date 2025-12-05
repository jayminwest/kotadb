# Stripe Subscriptions API Documentation

**Date:** 2025-12-05
**Source:** https://docs.stripe.com/api/subscriptions
**Note:** This is a partial capture from web scraping. For complete parameter details, visit the source URL.

---

## Overview

Subscriptions allow you to charge a customer on a recurring basis. The Stripe Subscriptions API provides comprehensive endpoints for managing the complete subscription lifecycle.

## Available Endpoints

### 1. Create a Subscription
**POST** `/v1/subscriptions`

Initiate a new recurring billing arrangement for a customer.

### 2. Update a Subscription
**POST** `/v1/subscriptions/:id`

Modify an existing subscription's settings, including items, billing cycle, and other properties.

### 3. Retrieve a Subscription
**GET** `/v1/subscriptions/:id`

Fetch details for a specific subscription by ID.

### 4. List All Subscriptions
**GET** `/v1/subscriptions`

Retrieve all subscriptions in your account with optional filtering.

### 5. Cancel a Subscription
**DELETE** `/v1/subscriptions/:id`

Terminate an active subscription immediately or at period end.

### 6. Migrate a Subscription
**POST** `/v1/subscriptions/:id/migrate`

Transfer a subscription to different terms or pricing.

### 7. Resume a Subscription
**POST** `/v1/subscriptions/:id/resume`

Reactivate a paused or canceled subscription.

### 8. Search Subscriptions
**GET** `/v1/subscriptions/search`

Query subscriptions using advanced search filters and criteria.

## Core Concepts

### Recurring Billing
Subscriptions enable automated, recurring charges to customers on a scheduled basis (monthly, yearly, etc.).

### Subscription Lifecycle
The API supports the complete lifecycle:
- Creation and initialization
- Active billing and renewals
- Updates and modifications
- Pausing and resumption
- Migration between plans
- Cancellation and termination

## Additional Resources

- **Creating Subscriptions Guide** - Referenced in the original documentation for implementation details
- **Individual Endpoint Documentation** - Each endpoint has detailed documentation with:
  - Complete parameter specifications
  - Code examples in multiple languages
  - Request/response schemas
  - Error handling examples

## Implementation Notes

For comprehensive details including:
- Full parameter lists and types
- Request/response examples
- Code samples in various languages (curl, Ruby, Python, PHP, Java, Node.js, Go, .NET)
- Authentication requirements
- Error codes and handling

Visit the source documentation at: https://docs.stripe.com/api/subscriptions

---

**Documentation Limitations:** This scraped version contains the endpoint overview only. The full Stripe API documentation is interactive and contains significantly more detail that requires direct access to view properly formatted code examples, nested object structures, and complete parameter definitions.
