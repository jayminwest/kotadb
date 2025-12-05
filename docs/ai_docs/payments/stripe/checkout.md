---
title: Stripe Checkout Documentation
source: https://docs.stripe.com/payments/checkout
date: 2025-12-05
---

# Use a prebuilt Stripe-hosted Checkout page

Use [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions.md) to create a Stripe-hosted Checkout page or embedded form.

[Explore the demo](https://checkout.stripe.dev/)

## Create a payments form to accept payments on your website

Accept one-time and subscription payments from over 40 local payment methods.
[Start building your checkout integration](https://docs.stripe.com/checkout/quickstart.md)

[Checkout](https://stripe.com/payments/checkout) is a low-code, prebuilt payment form that Stripe hosts or that you can embed into your website. It uses the [Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions.md).

## Payment UIs

You can use two different types of payment UIs with the Checkout Sessions API. [See the options in our demo](https://checkout.stripe.dev). The following images highlight which aspects of the checkout UI Stripe hosts in each option.

![Hosted checkout form](https://b.stripecdn.com/docs-statics-srv/assets/checkout-hosted-hover.4f0ec46833037b6fd0f1a62d9fcf7053.png)

[Stripe-hosted page](https://docs.stripe.com/checkout/quickstart.md): Customers enter their payment details in a Stripe-hosted payment page, then return to your site after payment completion.

![Embedded Checkout form](https://b.stripecdn.com/docs-statics-srv/assets/checkout-embedded-hover.19e99126cb27ab25f704d7357f672e1f.png)

[Embedded form](https://docs.stripe.com/checkout/embedded/quickstart.md): Customers enter their payment details in an embedded form on your site without redirection.

| &nbsp;                 | STRIPE-HOSTED PAGE | EMBEDDED FORM |
| ---------------------- | ------------------ | ------------- |
| **UI**                 | [Checkout](https://docs.stripe.com/payments/checkout/how-checkout-works.md?payment-ui=stripe-hosted) | [Checkout](https://docs.stripe.com/payments/checkout/how-checkout-works.md?payment-ui=embedded-form) |
| **API**                | [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions.md) | [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions.md) |
| **Integration effort** | Complexity: 2/5 | Complexity: 2/5 |
| **Hosting**            | Stripe-hosted page (optional [custom domains](https://docs.stripe.com/payments/checkout/custom-domains.md)) | Embed on your site |
| **UI customization**   | Limited customization¹ | Limited customization¹ |

¹Limited customization provides 20 preset fonts, 3 preset border radius options, logo and background customization, and custom button color.

## Customize checkout

[Customize look and feel](https://docs.stripe.com/payments/checkout/customization.md): Customize the appearance and behavior of Checkout.

[Collect additional information](https://docs.stripe.com/payments/checkout/collect-additional-info.md): Collect shipping and other customer info during checkout.

[Collect taxes](https://docs.stripe.com/payments/checkout/taxes.md): Learn how to collect taxes for one-time payments in Stripe Checkout.

[Dynamically update checkout](https://docs.stripe.com/payments/checkout/dynamic-updates.md): Make updates while your customer checks out.

[Add trials, discounts, upsells, and optional items](https://docs.stripe.com/payments/checkout/promotions.md): Add promotions like trials and discounts.

## Change when and how you collect payment

[Subscriptions](https://docs.stripe.com/payments/subscriptions.md): Create subscriptions for your customers.

[Set up future payments](https://docs.stripe.com/payments/checkout/save-and-reuse.md): Save payment details and charge your customers later.

[Save payment details during payment](https://docs.stripe.com/payments/checkout/save-during-payment.md): Accept a payment and save your customer's payment details for future purchases.

[Let customers pay in their local currency](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing.md): Use Adaptive Pricing to allow customers to pay in their local currency.

## Manage your business

[Manage your product catalog](https://docs.stripe.com/payments/checkout/product-catalog.md): Handle your inventory and fulfillment with Checkout.

[Migrate payment methods to the Dashboard](https://docs.stripe.com/payments/dashboard-payment-methods.md): Migrate the management of your payment methods to the Dashboard.

[After the payment](https://docs.stripe.com/payments/checkout/after-the-payment.md): Customize the post-payment checkout process.

## Sample projects

[One-time payments](https://github.com/stripe-samples/checkout-one-time-payments)

[Subscriptions](https://github.com/stripe-samples/checkout-single-subscription)
