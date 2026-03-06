# Stripe Setup Documentation

## Required Stripe Products and Prices

This document outlines the Stripe products and prices that need to be created in your Stripe dashboard to support StackHatch's billing system.

## Products Overview

You need to create **6 price objects** in Stripe for the following subscription plans:

### 1. Pro Monthly
- **Product Name**: StackHatch Pro
- **Price**: $19.00 USD per month
- **Billing**: Recurring monthly
- **Price ID**: Copy this to `STRIPE_PRICE_PRO_MONTHLY` environment variable

### 2. Pro Annual
- **Product Name**: StackHatch Pro
- **Price**: $180.00 USD per year (equivalent to $15/month)
- **Billing**: Recurring yearly
- **Price ID**: Copy this to `STRIPE_PRICE_PRO_ANNUAL` environment variable

### 3. Team5 Monthly
- **Product Name**: StackHatch Team (5 users)
- **Price**: $39.00 USD per month
- **Billing**: Recurring monthly
- **Price ID**: Copy this to `STRIPE_PRICE_TEAM5_MONTHLY` environment variable

### 4. Team5 Annual
- **Product Name**: StackHatch Team (5 users)
- **Price**: $396.00 USD per year (equivalent to $33/month)
- **Billing**: Recurring yearly
- **Price ID**: Copy this to `STRIPE_PRICE_TEAM5_ANNUAL` environment variable

### 5. Team15 Monthly
- **Product Name**: StackHatch Team (15 users)
- **Price**: $79.00 USD per month
- **Billing**: Recurring monthly
- **Price ID**: Copy this to `STRIPE_PRICE_TEAM15_MONTHLY` environment variable

### 6. Team15 Annual
- **Product Name**: StackHatch Team (15 users)
- **Price**: $792.00 USD per year (equivalent to $66/month)
- **Billing**: Recurring yearly
- **Price ID**: Copy this to `STRIPE_PRICE_TEAM15_ANNUAL` environment variable

## Setup Instructions

### Step 1: Create Products
1. Log into your Stripe Dashboard
2. Go to **Products** in the sidebar
3. Click **Add product** for each plan:
   - **StackHatch Pro** (for Pro monthly/annual)
   - **StackHatch Team (5 users)** (for Team5 monthly/annual)
   - **StackHatch Team (15 users)** (for Team15 monthly/annual)

### Step 2: Create Prices
For each product, create both monthly and annual pricing:

1. Click on the product
2. Click **Add another price**
3. Set the pricing model to **Recurring**
4. Enter the price amount
5. Set the billing period (monthly or yearly)
6. Save the price
7. Copy the **Price ID** (starts with `price_`)

### Step 3: Configure Environment Variables
Update your `.env.local` file with the Price IDs:

```bash
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

STRIPE_PRICE_PRO_MONTHLY=price_your_pro_monthly_id
STRIPE_PRICE_PRO_ANNUAL=price_your_pro_annual_id
STRIPE_PRICE_TEAM5_MONTHLY=price_your_team5_monthly_id
STRIPE_PRICE_TEAM5_ANNUAL=price_your_team5_annual_id
STRIPE_PRICE_TEAM15_MONTHLY=price_your_team15_monthly_id
STRIPE_PRICE_TEAM15_ANNUAL=price_your_team15_annual_id
```

### Step 4: Webhook Configuration
1. Go to **Webhooks** in Stripe Dashboard
2. Click **Add endpoint**
3. Set endpoint URL to: `https://your-domain.com/api/webhooks/stripe`
4. Select these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.paid`
5. Copy the **Signing secret** to `STRIPE_WEBHOOK_SECRET`

## Feature Mapping

| Plan | Monthly Price | Annual Price | Features |
|------|---------------|--------------|----------|
| Free | $0 | - | 2 projects, 20 messages/mo, 2 scans/mo |
| Pro | $19 | $15 ($180/yr) | Unlimited projects/messages/scans, all models, exports |
| Team (5) | $39 | $33 ($396/yr) | Pro features + collaboration, 5 users |
| Team (15) | $79 | $66 ($792/yr) | Pro features + collaboration, 15 users |

## Testing

Use Stripe's test mode and test card numbers:
- **Success**: `4242424242424242`
- **Decline**: `4000000000000002`
- **3D Secure**: `4000000000003220`

For more test cards, see: https://stripe.com/docs/testing#cards