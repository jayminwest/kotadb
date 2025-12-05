# Stripe Webhooks Documentation

**Source:** https://docs.stripe.com/webhooks
**Date:** 2025-12-05

---

## Overview

Stripe enables receiving events through webhook endpoints, allowing applications to automatically trigger reactions when events occur in a Stripe account. The platform sends real-time event data as JSON payloads containing Event objects via HTTPS.

## Key Concepts

**Event Types**: Webhook events respond to asynchronous occurrences such as payment confirmations, charge disputes, or recurring payment completions.

**Event Destinations**: Users can create up to 16 event destinations per account, routing events to HTTPS webhook endpoints or Amazon EventBridge.

## Getting Started - Four Steps

1. Create a webhook endpoint handler accepting POST requests with JSON event data
2. Test locally using Stripe CLI
3. Register an event destination via Dashboard or API
4. Implement security measures

## Handler Implementation Requirements

Webhook handlers must:
- Accept POST requests containing JSON event objects
- Return successful status codes (2xx) immediately, before complex operations
- For organization handlers, inspect the `context` value and set corresponding `Stripe-Context` headers
- Verify webhook signatures using official libraries

## Code Examples by Language

### Ruby (Snapshot Events)
```ruby
require 'json'

endpoint_secret = 'whsec_...';

post '/webhook' do
  payload = request.body.read
  event = nil

  begin
    event = Stripe::Event.construct_from(
      JSON.parse(payload, symbolize_names: true)
    )
  rescue JSON::ParserError => e
    status 400
    return
  end

  if endpoint_secret
    signature = request.env['HTTP_STRIPE_SIGNATURE'];
    begin
      event = Stripe::Webhook.construct_event(
        payload, signature, endpoint_secret
      )
    rescue Stripe::SignatureVerificationError => e
      puts "⚠️  Webhook signature verification failed. #{e.message}"
      status 400
    end
  end

  case event.type
  when 'payment_intent.succeeded'
    payment_intent = event.data.object
  when 'payment_method.attached'
    payment_method = event.data.object
  else
    puts "Unhandled event type: #{event.type}"
  end

  status 200
end
```

### Python (Snapshot Events)
```python
import json
from django.http import HttpResponse

endpoint_secret = 'whsec_...'

@csrf_exempt
def my_webhook_view(request):
  payload = request.body
  event = None

  try:
    event = stripe.Event.construct_from(
      json.loads(payload), stripe.api_key
    )
  except ValueError as e:
    return HttpResponse(status=400)

  if endpoint_secret:
        sig_header = request.headers.get('stripe-signature')
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, endpoint_secret
            )
        except stripe.error.SignatureVerificationError as e:
            print('⚠️  Webhook signature verification failed.' + str(e))
            return jsonify(success=False)

  if event.type == 'payment_intent.succeeded':
    payment_intent = event.data.object
  elif event.type == 'payment_method.attached':
    payment_method = event.data.object
  else:
    print('Unhandled event type {}'.format(event.type))

  return HttpResponse(status=200)
```

### PHP (Snapshot Events)
```php
$endpoint_secret = 'whsec_...';

$payload = @file_get_contents('php://input');
$event = null;

try {
    $event = \Stripe\Event::constructFrom(
        json_decode($payload, true)
    );
} catch(\UnexpectedValueException $e) {
    http_response_code(400);
    exit();
}

if ($endpoint_secret) {
  $sig_header = $_SERVER['HTTP_STRIPE_SIGNATURE'];
  try {
    $event = \Stripe\Webhook::constructEvent(
      $payload, $sig_header, $endpoint_secret
    );
  } catch(\Stripe\Exception\SignatureVerificationException $e) {
    echo '⚠️  Webhook error while validating signature.';
    http_response_code(400);
    exit();
  }
}

switch ($event->type) {
    case 'payment_intent.succeeded':
        $paymentIntent = $event->data->object;
        break;
    case 'payment_method.attached':
        $paymentMethod = $event->data->object;
        break;
    default:
        echo 'Received unknown event type ' . $event->type;
}

http_response_code(200);
```

### Java (Snapshot Events)
```java
public Object handle(Request request, Response response) {
  String endpointSecret = "whsec_...";

  String payload = request.body();
  Event event = null;

  try {
    event = ApiResource.GSON.fromJson(payload, Event.class);
  } catch (JsonSyntaxException e) {
    response.status(400);
    return "";
  }

  String sigHeader = request.headers("Stripe-Signature");
  if(endpointSecret != null && sigHeader != null) {
      try {
          event = Webhook.constructEvent(
              payload, sigHeader, endpointSecret
          );
      } catch (SignatureVerificationException e) {
          System.out.println("⚠️  Webhook error while validating signature.");
          response.status(400);
          return "";
      }
  }

  EventDataObjectDeserializer dataObjectDeserializer = event.getDataObjectDeserializer();
  StripeObject stripeObject = null;
  if (dataObjectDeserializer.getObject().isPresent()) {
    stripeObject = dataObjectDeserializer.getObject().get();
  }

  switch (event.getType()) {
    case "payment_intent.succeeded":
      PaymentIntent paymentIntent = (PaymentIntent) stripeObject;
      break;
    case "payment_method.attached":
      PaymentMethod paymentMethod = (PaymentMethod) stripeObject;
      break;
    default:
      System.out.println("Unhandled event type: " + event.getType());
  }

  response.status(200);
  return "";
}
```

### Node.js (Snapshot Events)
```javascript
const express = require('express');
const app = express();

const endpointSecret = 'whsec_...';

app.post('/webhook', express.raw({type: 'application/json'}), (request, response) => {
  let event;
  if (endpointSecret) {
    const signature = request.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        signature,
        endpointSecret
      );
    } catch (err) {
      console.log(`⚠️ Webhook signature verification failed.`, err.message);
      return response.sendStatus(400);
    }

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      break;
    case 'payment_method.attached':
      const paymentMethod = event.data.object;
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  response.json({received: true});
});

app.listen(4242, () => console.log('Running on port 4242'));
```

### Go (Snapshot Events)
```go
http.HandleFunc("/webhook", func(w http.ResponseWriter, req *http.Request) {
    const MaxBodyBytes = int64(65536)
    req.Body = http.MaxBytesReader(w, req.Body, MaxBodyBytes)
    payload, err := ioutil.ReadAll(req.Body)
    if err != nil {
        fmt.Fprintf(os.Stderr, "Error reading request body: %v\n", err)
        w.WriteHeader(http.StatusServiceUnavailable)
        return
    }

    event := stripe.Event{}

    if err := json.Unmarshal(payload, &event); err != nil {
        fmt.Fprintf(os.Stderr, "Failed to parse webhook body json: %v\n", err.Error())
        w.WriteHeader(http.StatusBadRequest)
        return
    }

    switch event.Type {
    case "payment_intent.succeeded":
        var paymentIntent stripe.PaymentIntent
        err := json.Unmarshal(event.Data.Raw, &paymentIntent)
        if err != nil {
            fmt.Fprintf(os.Stderr, "Error parsing webhook JSON: %v\n", err)
            w.WriteHeader(http.StatusBadRequest)
            return
        }
    case "payment_method.attached":
        var paymentMethod stripe.PaymentMethod
        err := json.Unmarshal(event.Data.Raw, &paymentMethod)
        if err != nil {
            fmt.Fprintf(os.Stderr, "Error parsing webhook JSON: %v\n", err)
            w.WriteHeader(http.StatusBadRequest)
            return
        }
    default:
        fmt.Fprintf(os.Stderr, "Unhandled event type: %s\n", event.Type)
    }

    w.WriteHeader(http.StatusOK)
})
```

### .NET (Snapshot Events)
```csharp
using System;
using System.IO;
using Microsoft.AspNetCore.Mvc;
using Stripe;

namespace workspace.Controllers
{
    [Route("api/[controller]")]
    public class StripeWebHook : Controller
    {
        [HttpPost]
        public async Task<IActionResult> Index()
        {
            var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();
            const string endpointSecret = "whsec_...";
            try
            {
                var stripeEvent = EventUtility.ParseEvent(json);
                var signatureHeader = Request.Headers["Stripe-Signature"];

                stripeEvent = EventUtility.ConstructEvent(json,signatureHeader, endpointSecret);

                if (stripeEvent.Type == EventTypes.PaymentIntentSucceeded)
                {
                    var paymentIntent = stripeEvent.Data.Object as PaymentIntent;
                }
                else if (stripeEvent.Type == EventTypes.PaymentMethodAttached)
                {
                    var paymentMethod = stripeEvent.Data.Object as PaymentMethod;
                }
                else
                {
                    Console.WriteLine("Unhandled event type: {0}", stripeEvent.Type);
                }
                return Ok();
            }
            catch (StripeException e)
            {
                return BadRequest();
            }
        }
    }
}
```

## Thin Event Handlers (Clover+)

Thin events use the `fetchRelatedObject()` method to retrieve the latest object version. These handlers require type narrowing based on the event's `type` property.

### Python (Thin Events)
```python
import os
from stripe import StripeClient
from stripe.events import UnknownEventNotification

from flask import Flask, request, jsonify

app = Flask(__name__)
api_key = os.environ.get("STRIPE_API_KEY", "")
webhook_secret = os.environ.get("WEBHOOK_SECRET", "")

client = StripeClient(api_key)

@app.route("/webhook", methods=["POST"])
def webhook():
    webhook_body = request.data
    sig_header = request.headers.get("Stripe-Signature")

    try:
        event_notif = client.parse_event_notification(
            webhook_body, sig_header, webhook_secret
        )

        if event_notif.type == "v1.billing.meter.error_report_triggered":
            print(f"Meter w/ id {event_notif.related_object.id} had a problem")
            meter = event_notif.fetch_related_object()
            print(f"Meter {meter.display_name} ({meter.id}) had a problem")
            event = event_notif.fetch_event()
            print(f"More info: {event.data.developer_message_summary}")

        elif event_notif.type == "v1.billing.meter.no_meter_found":
            event = event_notif.fetch_event()
            print(f"Err! No meter found: {event.data.developer_message_summary}")

        elif isinstance(event_notif, UnknownEventNotification):
            if event_notif.type == "some.new.event":
                obj = event_notif.fetch_related_object()
                print(f"Related object: {obj}")
                event = event_notif.fetch_event()
                print(f"New event: {event.data}")

        return jsonify(success=True), 200
    except Exception as e:
        return jsonify(error=str(e)), 400
```

### Ruby (Thin Events)
```ruby
require "stripe"
require "sinatra"

api_key = ENV.fetch("STRIPE_API_KEY", nil)
webhook_secret = ENV.fetch("WEBHOOK_SECRET", nil)

client = Stripe::StripeClient.new(api_key)

post "/webhook" do
  webhook_body = request.body.read
  sig_header = request.env["HTTP_STRIPE_SIGNATURE"]
  event_notification = client.parse_event_notification(webhook_body, sig_header, webhook_secret)

  if event_notification.instance_of?(Stripe::Events::V1BillingMeterErrorReportTriggeredEventNotification)
    puts "Received event for meter id:", event_notification.related_object.id
    meter = event_notification.fetch_related_object
    puts "Meter #{meter.display_name} (#{meter.id}) had a problem"
    event = event_notification.fetch_event
    puts "More info:", event.data.developer_message_summary
  elsif event_notification.instance_of?(Stripe::Events::UnknownEventNotification)
    if event_notification.type == "some.new.event"
      # your logic goes here
    end
  end

  status 200
end
```

### PHP (Thin Events)
```php
<?php

require 'vendor/autoload.php';

$api_key = getenv('STRIPE_API_KEY');
$webhook_secret = getenv('WEBHOOK_SECRET');

$app = new \Slim\App();
$client = new \Stripe\StripeClient($api_key);

$app->post('/webhook', static function ($request, $response) use ($client, $webhook_secret) {
    $webhook_body = $request->getBody()->getContents();
    $sig_header = $request->getHeaderLine('Stripe-Signature');

    try {
        $event_notification = $client->parseEventNotification($webhook_body, $sig_header, $webhook_secret);

        if ($event_notification instanceof Stripe\Events\V1BillingMeterErrorReportTriggeredEventNotification) {
            echo "Meter with id {$event_notification->related_object->id} reported an error\n";
            $meter = $event_notification->fetchRelatedObject();
            echo "Meter {$meter->display_name} ({$meter->id}) had a problem\n";
            $event = $event_notification->fetchEvent();
            echo "More info: {$event->data->developer_message_summary}\n";
        } else if ($event_notification instanceof Stripe\Events\UnknownEventNotification) {
            if ($event_notification->type === 'some.new.event') {
                // handle it the same way as above
            }
        }

        return $response->withStatus(200);
    } catch (Exception $e) {
        return $response->withStatus(400)->withJson(['error' => $e->getMessage()]);
    }
});

$app->run();
```

### Java (Thin Events)
```java
import com.stripe.StripeClient;
import com.stripe.events.UnknownEventNotification;
import com.stripe.events.V1BillingMeterErrorReportTriggeredEvent;
import com.stripe.events.V1BillingMeterErrorReportTriggeredEventNotification;
import com.stripe.exception.StripeException;
import com.stripe.model.billing.Meter;
import com.stripe.model.v2.core.EventNotification;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

public class EventNotificationWebhookHandler {
  private static final String API_KEY = System.getenv("STRIPE_API_KEY");
  private static final String WEBHOOK_SECRET = System.getenv("WEBHOOK_SECRET");

  private static final StripeClient client = new StripeClient(API_KEY);

  public static void main(String[] args) throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress(4242), 0);
    server.createContext("/webhook", new WebhookHandler());
    server.setExecutor(null);
    server.start();
  }

  static class WebhookHandler implements HttpHandler {
    @Override
    public void handle(HttpExchange exchange) throws IOException {
      if ("POST".equals(exchange.getRequestMethod())) {
        InputStream requestBody = exchange.getRequestBody();
        String webhookBody = new String(requestBody.readAllBytes(), StandardCharsets.UTF_8);
        String sigHeader = exchange.getRequestHeaders().getFirst("Stripe-Signature");

        try {
          EventNotification notif =
              client.parseEventNotification(webhookBody, sigHeader, WEBHOOK_SECRET);

          if (notif instanceof V1BillingMeterErrorReportTriggeredEventNotification) {
            V1BillingMeterErrorReportTriggeredEventNotification eventNotification =
                (V1BillingMeterErrorReportTriggeredEventNotification) notif;

            System.out.println(
                "Meter w/ id " + eventNotification.getRelatedObject().getId() + " had a problem");

            Meter meter = eventNotification.fetchRelatedObject();
            StringBuilder sb = new StringBuilder();
            sb.append("Meter ")
                .append(meter.getDisplayName())
                .append(" (")
                .append(meter.getId())
                .append(") had a problem");
            System.out.println(sb.toString());

            V1BillingMeterErrorReportTriggeredEvent event = eventNotification.fetchEvent();
            System.out.println("More info: " + event.getData().getDeveloperMessageSummary());
          } else if (notif instanceof UnknownEventNotification) {
            UnknownEventNotification unknownEvent = (UnknownEventNotification) notif;
            if (unknownEvent.getType().equals("some.new.event")) {
              // you can still `.fetchEvent()` and `.fetchRelatedObject()`, but the latter may
              // return `null` if that event type doesn't have a related object.
            }
          }

          exchange.sendResponseHeaders(200, -1);
        } catch (StripeException e) {
          exchange.sendResponseHeaders(400, -1);
        }
      } else {
        exchange.sendResponseHeaders(405, -1);
      }
      exchange.close();
    }
  }
}
```

### TypeScript (Thin Events)
```typescript
import {Stripe} from 'stripe';
import express from 'express';

const app = express();

const apiKey = process.env.STRIPE_API_KEY ?? '';
const webhookSecret = process.env.WEBHOOK_SECRET ?? '';

const client = new Stripe(apiKey);

app.post(
  '/webhook',
  express.raw({type: 'application/json'}),
  async (req, res) => {
    const sig = req.headers['stripe-signature'] ?? '';

    try {
      const eventNotification = client.parseEventNotification(
        req.body,
        sig,
        webhookSecret
      );

      if (eventNotification.type == 'v1.billing.meter.error_report_triggered') {
        console.log(
          `Meter w/ id ${eventNotification.related_object.id} had a problem`
        );

        const meter = await eventNotification.fetchRelatedObject();
        console.log(`Meter ${meter.display_name} (${meter.id}) had a problem`);

        const event = await eventNotification.fetchEvent();
        console.log(`More info: ${event.data.developer_message_summary}`);
      } else if (eventNotification.type === 'v1.billing.meter.no_meter_found') {
        const event = await eventNotification.fetchEvent();
        console.log(
          `Err: No meter found: ${event.data.developer_message_summary}`
        );
      } else if (eventNotification.type === 'some.new.event') {
        const unknownEvent = eventNotification as Stripe.Events.UnknownEventNotification;
        const obj = await unknownEvent.fetchRelatedObject();
        const event = await unknownEvent.fetchEvent();
        console.log(`Got new event: ${event.data}`);
      }

      res.sendStatus(200);
    } catch (err) {
      console.log(`Webhook Error: ${(err as any).stack}`);
      res.status(400).send(`Webhook Error: ${(err as any).message}`);
    }
  }
);

app.listen(4242, () => console.log('Running on port 4242'));
```

### Go (Thin Events)
```go
package main

import (
  "context"
  "io"
  "log/slog"
  "net/http"
  "os"

  "github.com/stripe/stripe-go/v83"
)

func main() {
	http.HandleFunc("/webhook", func(w http.ResponseWriter, req *http.Request) {
		const MaxBodyBytes = int64(65536)
		req.Body = http.MaxBytesReader(w, req.Body, MaxBodyBytes)
		payload, err := io.ReadAll(req.Body)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading request body: %v\n", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		eventNotification, err := client.ParseEventNotification(payload, req.Header.Get("Stripe-Signature"), webhookSecret)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading request body: %v\n", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		switch evt := eventNotification.(type) {
		case *stripe.V1BillingMeterErrorReportTriggeredEventNotification:
			fmt.Printf("Meter w/ id %s had a problem\n", evt.RelatedObject.ID)

			meter, err := evt.FetchRelatedObject(context.TODO())
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error fetching related object: %v\n", err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			sb := fmt.Sprintf("Meter %s (%s) had a problem", meter.DisplayName, meter.ID)
			fmt.Println(sb)

			event, err := evt.FetchEvent(context.TODO())
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error fetching event: %v\n", err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			fmt.Printf("More info: %s\n", event.Data.DeveloperMessageSummary)
		case *stripe.UnknownEventNotification:
			switch evt.Type {
			case "some.new.event":
				return
			}

		default:
			fmt.Fprintf(os.Stderr, "Purposefully skipping the handling of event w/ type: %s\n", evt.GetEventNotification().Type)
		}

		w.WriteHeader(http.StatusOK)
	})

	err := http.ListenAndServe(":4242", nil)
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}
```

### .NET (Thin Events)
```csharp
using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using Stripe.Events;

[Route("api/[controller]")]
[ApiController]
public class EventNotificationWebhookHandler : ControllerBase
{
    private readonly StripeClient client;
    private readonly string webhookSecret;

    public EventNotificationWebhookHandler()
    {
        var apiKey = Environment.GetEnvironmentVariable("STRIPE_API_KEY");
        client = new StripeClient(apiKey);
        webhookSecret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET") ?? string.Empty;
    }

    [HttpPost]
    public async Task<IActionResult> Index()
    {
        var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();
        try
        {
            var eventNotification = client.ParseEventNotification(json, Request.Headers["Stripe-Signature"], webhookSecret);

            if (eventNotification is V1BillingMeterErrorReportTriggeredEventNotification notif)
            {
                Console.WriteLine($"Meter w/ id {notif.RelatedObject.Id} had a problem");
                var meter = await notif.FetchRelatedObjectAsync();
                Console.WriteLine($"Meter {meter.DisplayName} ({meter.Id}) had a problem");
                var evt = await notif.FetchEventAsync();
                Console.WriteLine($"More info: {evt.Data.DeveloperMessageSummary}");
            }
            else if (eventNotification is UnknownEventNotification unknownEvt)
            {
                if (unknownEvt.Type == "some.other.event")
                {
                    // you can still `.fetchEvent()` and `.fetchRelatedObject()`, but the latter may
                    // return `null` if that event type doesn't have a related object.
                }
            }

            return Ok();
        }
        catch (StripeException e)
        {
            return BadRequest(e.Message);
        }
    }
}
```

## Thin Event Handlers (Acacia or Basil)

These handlers parse thin events and retrieve full event data via API calls.

### Python (Acacia/Basil)
```python
import os
from stripe import StripeClient
from stripe.events import V1BillingMeterErrorReportTriggeredEvent

from flask import Flask, request, jsonify

app = Flask(__name__)
api_key = os.environ.get('STRIPE_API_KEY')
webhook_secret = os.environ.get('WEBHOOK_SECRET')

client = StripeClient(api_key)

@app.route('/webhook', methods=['POST'])
def webhook():
    webhook_body = request.data
    sig_header = request.headers.get('Stripe-Signature')

try:
    thin_event = client.parse_thin_event(webhook_body, sig_header, webhook_secret)

    event = client.v2.core.events.retrieve(thin_event.id)
    if isinstance(event, V1BillingMeterErrorReportTriggeredEvent):
        meter = event.fetch_related_object()
        meter_id = meter.id

        # Record the failures and alert your team
        # Add your logic here

    return jsonify(success=True), 200
except Exception as e:
    return jsonify(error=str(e)), 400

if __name__ == '__main__':
    app.run(port=4242)
```

### Ruby (Acacia/Basil)
```ruby
require "stripe"
require "sinatra"

api_key = ENV.fetch("STRIPE_API_KEY", nil)
webhook_secret = ENV.fetch("WEBHOOK_SECRET", nil)

client = Stripe::StripeClient.new(api_key)

post "/webhook" do
  webhook_body = request.body.read
  sig_header = request.env["HTTP_STRIPE_SIGNATURE"]
  thin_event = client.parse_thin_event(webhook_body, sig_header, webhook_secret)

  event = client.v2.core.events.retrieve(thin_event.id)
  if event.instance_of? Stripe::V1BillingMeterErrorReportTriggeredEvent
    meter = event.fetch_related_object
    meter_id = meter.id
  end

  # Record the failures and alert your team
  # Add your logic here
  status 200
end
```

### PHP (Acacia/Basil)
```php
<?php

require 'vendor/autoload.php';

$api_key = getenv('STRIPE_API_KEY');
$webhook_secret = getenv('WEBHOOK_SECRET');

$app = new \Slim\App();
$client = new \Stripe\StripeClient($api_key);

$app->post('/webhook', function ($request, $response) use ($client, $webhook_secret) {
    $webhook_body = $request->getBody()->getContents();
    $sig_header = $request->getHeaderLine('Stripe-Signature');

    try {
        $thin_event = $client->parseThinEvent($webhook_body, $sig_header, $webhook_secret);

        $event = $client->v2->core->events->retrieve($thin_event->id);
        if ($event instanceof \Stripe\Events\V1BillingMeterErrorReportTriggeredEvent) {
            $meter = $event->fetchRelatedObject();
            $meter_id = $meter->id;

            // Record the failures and alert your team
            // Add your logic here
        }
        return $response->withStatus(200);
    } catch (\Exception $e) {
        return $response->withStatus(400)->withJson(['error' => $e->getMessage()]);
    }
});

$app->run();
```

### Java (Acacia/Basil)
```java
import com.stripe.StripeClient;
import com.stripe.events.V1BillingMeterErrorReportTriggeredEvent;
import com.stripe.exception.StripeException;
import com.stripe.model.ThinEvent;
import com.stripe.model.billing.Meter;
import com.stripe.model.v2.Event;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

public class StripeWebhookHandler {
  private static final String API_KEY = System.getenv("STRIPE_API_KEY");
  private static final String WEBHOOK_SECRET = System.getenv("WEBHOOK_SECRET");

  private static final StripeClient client = new StripeClient(API_KEY);

  public static void main(String[] args) throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress(4242), 0);
    server.createContext("/webhook", new WebhookHandler());
    server.setExecutor(null);
    server.start();
  }

  static class WebhookHandler implements HttpHandler {
    @Override
    public void handle(HttpExchange exchange) throws IOException {
      if ("POST".equals(exchange.getRequestMethod())) {
        InputStream requestBody = exchange.getRequestBody();
        String webhookBody = new String(requestBody.readAllBytes(), StandardCharsets.UTF_8);
        String sigHeader = exchange.getRequestHeaders().getFirst("Stripe-Signature");

        try {
          ThinEvent thinEvent = client.parseThinEvent(webhookBody, sigHeader, WEBHOOK_SECRET);

          Event baseEvent = client.v2().core().events().retrieve(thinEvent.getId());
          if (baseEvent instanceof V1BillingMeterErrorReportTriggeredEvent) {
            V1BillingMeterErrorReportTriggeredEvent event =
                (V1BillingMeterErrorReportTriggeredEvent) baseEvent;
            Meter meter = event.fetchRelatedObject();

            String meterId = meter.getId();

            // Record the failures and alert your team
            // Add your logic here
          }

          exchange.sendResponseHeaders(200, -1);
        } catch (StripeException e) {
          exchange.sendResponseHeaders(400, -1);
        }
      } else {
        exchange.sendResponseHeaders(405, -1);
      }
      exchange.close();
    }
  }
}
```

### Node.js (Acacia/Basil)
```javascript
const express = require('express');
const {Stripe} = require('stripe');

const app = express();

const apiKey = process.env.STRIPE_API_KEY;
const webhookSecret = process.env.WEBHOOK_SECRET;

const client = new Stripe(apiKey);

app.post(
  '/webhook',
  express.raw({type: 'application/json'}),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    try {
      const thinEvent = client.parseThinEvent(req.body, sig, webhookSecret);

      const event = await client.v2.core.events.retrieve(thinEvent.id);
      if (event.type == 'v1.billing.meter.error_report_triggered') {
        const meter = await event.fetchRelatedObject();
        const meterId = meter.id;
        // Record the failures and alert your team
        // Add your logic here
      }
      res.sendStatus(200);
    } catch (err) {
      console.log(`Webhook Error: ${err.message}`);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  },
);

app.listen(4242, () => console.log('Running on port 4242'));
```

### Go (Acacia/Basil)
```go
package main

import (
  "context"
  "io"
  "log/slog"
  "net/http"
  "os"

  "github.com/stripe/stripe-go/v82"
)

func main() {
  apiKey := os.Getenv("STRIPE_API_KEY")
  webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
  client := stripe.NewClient(apiKey)

  http.HandleFunc("/webhook", func(w http.ResponseWriter, req *http.Request) {
    defer req.Body.Close()
    payload, err := io.ReadAll(req.Body)
    if err != nil {
      slog.Error("Reading request body", "error", err)
      w.WriteHeader(http.StatusInternalServerError)
      return
    }
    thinEvent, err := client.ParseThinEvent(payload, req.Header.Get("Stripe-Signature"), webhookSecret)
    if err != nil {
      slog.Error("Parsing thin event", "error", err)
      w.WriteHeader(http.StatusInternalServerError)
      return
    }
    event, err := client.V2CoreEvents.Retrieve(context.TODO(), thinEvent.ID, nil)
    if err != nil {
      slog.Error("Retrieving snapshot event", "error", err)
      w.WriteHeader(http.StatusInternalServerError)
      return
    }

    switch e := event.(type) {
    case *stripe.V1BillingMeterErrorReportTriggeredEvent:
      meter, err := e.FetchRelatedObject()
      if err != nil {
        slog.Error("Error fetching related object", "error", err)
        w.WriteHeader(http.StatusInternalServerError)
        return
      }
      meterID := meter.ID
      // Add your logic here
    }

    w.WriteHeader(http.StatusOK)
  })
  err := http.ListenAndServe(":4242", nil)
  if err != nil {
    slog.Error("Starting server", "error", err)
    os.Exit(1)
  }
}
```

### .NET (Acacia/Basil)
```csharp
using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using Stripe.Events;

[Route("api/[controller]")]
[ApiController]
public class WebhookController : ControllerBase
{
    private readonly StripeClient _client;
    private readonly string _webhookSecret;

    public WebhookController()
    {
        var apiKey = Environment.GetEnvironmentVariable("STRIPE_API_KEY");
        _client = new StripeClient(apiKey);
        _webhookSecret = Environment.GetEnvironmentVariable("WEBHOOK_SECRET");
    }

    [HttpPost]
    public async Task<IActionResult> Index()
    {
        var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();
        try
        {
            var thinEvent = _client.ParseThinEvent(json, Request.Headers["Stripe-Signature"], _webhookSecret);
            var baseEvent = await _client.V2.Core.Events.GetAsync(thinEvent.Id);

            if (baseEvent is V1BillingMeterErrorReportTriggeredEvent fullEvent)
            {
                var meter = await fullEvent.FetchRelatedObjectAsync();
                var meterId = meter.Id;
                // Record the failures and alert your team
                // Add your logic here
            }

            return Ok();
        }
        catch (StripeException e)
        {
            return BadRequest(e.Message);
        }
    }
}
```

## Organization Events with Context

For organization webhook endpoints, the `context` field identifies the originating account. Manual API calls (except those using `fetchRelatedObject()` and `fetchEvent()`) require passing the context as a header parameter.

### Ruby with Context
```ruby
require 'json'

post '/webhook' do
  payload = request.body.read
  event = nil

  begin
    event = Stripe::Event.construct_from(
      JSON.parse(payload, symbolize_names: true)
    )
  rescue JSON::ParserError => e
    status 400
    return
  end

  context = event.context

  ACCOUNT_123_API_KEY = "sk_test_123"
  ACCOUNT_456_API_KEY = "sk_test_456"

  account_api_keys = {
    "account_123" => ACCOUNT_123_API_KEY,
    "account_456" => ACCOUNT_456_API_KEY
  }

  api_key = account_api_keys[context]

  if api_key.nil?
    puts "No API key found for context: #{context}"
    status 400
    return
  end

  case event.type
  when 'customer.created'
    customer = event.data.object

    begin
      latest_customer = Stripe::Customer.retrieve(
        customer.id,
        { api_key: api_key }
      )
      handle_customer_created(latest_customer, context)
    rescue => e
      puts "Error retrieving customer: #{e.message}"
      status 500
      return
    end

  when 'payment_method.attached'
    payment_method = event.data.object

    begin
      latest_payment_method = Stripe::PaymentMethod.retrieve(
        payment_method.id,
        { api_key: api_key }
      )
      handle_payment_method_attached(latest_payment_method, context)
    rescue => e
      puts "Error retrieving payment method: #{e.message}"
      status 500
      return
    end

  else
    puts "Unhandled event type: #{event.type}"
  end

  status 200
end
```

### Python with Context
```python
import json
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt

ACCOUNT_123_API_KEY = "sk_test_123"
ACCOUNT_456_API_KEY = "sk_test_456"

account_api_keys = {
    "account_123": ACCOUNT_123_API_KEY,
    "account_456": ACCOUNT_456_API_KEY,
}

@csrf_exempt
def my_webhook_view(request):
    payload = request.body
    event = None

    try:
        event = stripe.Event.construct_from(
            json.loads(payload.decode('utf-8')), stripe.api_key
        )
    except ValueError as e:
        return HttpResponse(status=400)

    context = getattr(event, "context", None)
    if context is None:
        print("Missing context in event.")
        return HttpResponse(status=400)

    api_key = account_api_keys.get(context)
    if api_key is None:
        print(f"No API key found for context: {context}")
        return HttpResponse(status=400)

    if event.type == 'customer.created':
        customer = event.data.object
        try:
            latest_customer = stripe.Customer.retrieve(customer.id, api_key=api_key)
            handle_customer_created(latest_customer, context)
        except Exception as e:
            print(f"Error retrieving customer: {e}")
            return HttpResponse(status=500)

    elif event.type == 'payment_method.attached':
        payment_method = event.data.object
        try:
            latest_payment_method = stripe.PaymentMethod.retrieve(payment_method.id, api_key=api_key)
            handle_payment_method_attached(latest_payment_method, context)
        except Exception as e:
            print(f"Error retrieving payment method: {e}")
            return HttpResponse(status=500)

    else:
        print(f'Unhandled event type {event.type}')

    return HttpResponse(status=200)
```

### Java with Context
```java
public Object handle(Request request, Response response) {
  String payload = request.body();
  Event event = null;

  try {
    event = ApiResource.GSON.fromJson(payload, Event.class);
  } catch (JsonSyntaxException e) {
    response.status(400);
    return "";
  }

  String context = event.getContext();
  if (context == null || context.isEmpty()) {
    System.out.println("Missing context in event.");
    response.status(400);
    return "";
  }

  final String ACCOUNT_123_API_KEY = "sk_test_123";
  final String ACCOUNT_456_API_KEY = "sk_test_456";

  Map<String, String> accountApiKeys = new HashMap<>();
  accountApiKeys.put("account_123", ACCOUNT_123_API_KEY);
  accountApiKeys.put("account_456", ACCOUNT_456_API_KEY);

  String apiKey = accountApiKeys.get(context);
  if (apiKey == null) {
    System.out.println("No API key found for context: " + context);
    response.status(400);
    return "";
  }

  EventDataObjectDeserializer dataObjectDeserializer = event.getDataObjectDeserializer();
  if (!dataObjectDeserializer.getObject().isPresent()) {
    System.out.println("Unable to deserialize object from event.");
    response.status(400);
    return "";
  }

  StripeObject stripeObject = dataObjectDeserializer.getObject().get();

  RequestOptions requestOptions = RequestOptions.builder()
    .setApiKey(apiKey)
    .build();

  try {
    switch (event.getType()) {
      case "customer.created":
        Customer customerEvent = (Customer) stripeObject;
        Customer latestCustomer = Customer.retrieve(customerEvent.getId(), requestOptions);
        handleCustomerCreated(latestCustomer, context);
        break;

      case "payment_method.attached":
        PaymentMethod paymentMethodEvent = (PaymentMethod) stripeObject;
        PaymentMethod latestPaymentMethod = PaymentMethod.retrieve(paymentMethodEvent.getId(), requestOptions);
        handlePaymentMethodAttached(latestPaymentMethod, context);
        break;

      default:
        System.out.println("Unhandled event type: " + event.getType());
    }
  } catch (StripeException e) {
    System.out.println("Stripe API error: " + e.getMessage());
    response.status(500);
    return "";
  }

  response.status(200);
  return "";
}
```

### Node.js with Context
```javascript
const express = require('express');
const app = express();

app.use(express.json({ type: 'application/json' }));

const ACCOUNT_123_API_KEY = 'sk_test_123';
const ACCOUNT_456_API_KEY = 'sk_test_456';

const accountApiKeys = {
  account_123: ACCOUNT_123_API_KEY,
  account_456: ACCOUNT_456_API_KEY,
};

app.post('/webhook', async (request, response) => {
  const event = request.body;

  const context = event.context;
  if (!context) {
    console.error('Missing context in event');
    return response.status(400).send('Missing context');
  }

  const apiKey = accountApiKeys[context];
  if (!apiKey) {
    console.error(`No API key found for context: ${context}`);
    return response.status(400).send('Unknown context');
  }

  const stripe = Stripe(apiKey);

  try {
    switch (event.type) {
      case 'customer.created': {
        const customer = event.data.object;
        const latestCustomer = await stripe.customers.retrieve(customer.id);
        handleCustomerCreated(latestCustomer, context);
        break;
      }
      case 'payment_method.attached': {
        const paymentMethod = event.data.object;
        const latestPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethod.id);
        handlePaymentMethodAttached(latestPaymentMethod, context);
        break;
      }
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    response.json({ received: true });
  } catch (err) {
    console.error(`Error processing event: ${err.message}`);
    response.status(500).send('Internal error');
  }
});

app.listen(4242, () => console.log('Running on port 4242'));
```

### .NET with Context
```csharp
using System;
using System.IO;
using Microsoft.AspNetCore.Mvc;
using Stripe;

namespace workspace.Controllers
{
    [Route("api/[controller]")]
    public class StripeWebHook : Controller
    {
        private const string ACCOUNT_123_API_KEY = "sk_test_123";
        private const string ACCOUNT_456_API_KEY = "sk_test_456";

        private readonly Dictionary<string, string> accountApiKeys = new()
        {
            { "account_123", ACCOUNT_123_API_KEY },
            { "account_456", ACCOUNT_456_API_KEY }
        };

        [HttpPost]
        public async Task<IActionResult> Index()
        {
            var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();

            try
            {
                var stripeEvent = EventUtility.ParseEvent(json);
                var context = stripeEvent.Context;

                if (string.IsNullOrEmpty(context))
                {
                    Console.WriteLine("Missing context in event");
                    return BadRequest();
                }

                if (!accountApiKeys.TryGetValue(context, out var apiKey))
                {
                    Console.WriteLine($"No API key found for context: {context}");
                    return BadRequest();
                }

                var requestOptions = new RequestOptions
                {
                    ApiKey = apiKey
                };

                if (stripeEvent.Type == Events.CustomerCreated)
                {
                    var customerEvent = stripeEvent.Data.Object as Customer;
                    if (customerEvent != null)
                    {
                        var customerService = new CustomerService();
                        var latestCustomer = await customerService.GetAsync(customerEvent.Id, null, requestOptions);
                        HandleCustomerCreated(latestCustomer, context);
                    }
                }
                else if (stripeEvent.Type == Events.PaymentMethodAttached)
                {
                    var paymentMethodEvent = stripeEvent.Data.Object as PaymentMethod;
                    if (paymentMethodEvent != null)
                    {
                        var paymentMethodService = new PaymentMethodService();
                        var latestPaymentMethod = await paymentMethodService.GetAsync(paymentMethodEvent.Id, null, requestOptions);
                        HandlePaymentMethodAttached(latestPaymentMethod, context);
                    }
                }
                else
                {
                    Console.WriteLine("Unhandled event type: {0}", stripeEvent.Type);
                }

                return Ok();
            }
            catch (StripeException e)
            {
                Console.WriteLine($"Stripe error: {e.Message}");
                return BadRequest();
            }
        }

        private void HandleCustomerCreated(Customer customer, string context)
        {
            Console.WriteLine($"Handled customer {customer.Id} for context {context}");
        }

        private void HandlePaymentMethodAttached(PaymentMethod paymentMethod, string context)
        {
            Console.WriteLine($"Handled payment method {paymentMethod.Id} for context {context}");
        }
    }
}
```

## Testing Webhooks Locally

Before going live, test endpoints using Stripe CLI to forward events locally.

### Forward Snapshot Events
```bash
stripe listen --forward-to localhost:4242
```

### Forward Thin Events
```bash
stripe listen --forward-thin-to localhost:4242 --thin-events "*"
```

### Forward Specific Snapshot Events
```bash
stripe listen --events payment_intent.created,customer.created,payment_intent.succeeded,checkout.session.completed,payment_intent.payment_failed \
  --forward-to localhost:4242
```

### Forward Specific Thin Events
```bash
stripe listen --thin-events v1.billing.meter.error_report_triggered,v1.billing.meter.no_meter_found \
  --forward-thin-to localhost:4242
```

### Load from Registered Public Endpoints (Snapshot)
```bash
stripe listen --load-from-webhooks-api --forward-to localhost:4242
```

### Load from Registered Public Endpoints (Thin)
```bash
stripe listen --load-from-webhooks-api --forward-thin-to localhost:4242
```

## Triggering Test Events

### Trigger Snapshot Event
```bash
stripe trigger payment_intent.succeeded
Running fixture for: payment_intent
Trigger succeeded! Check dashboard for event details.
```

### Trigger Thin Event
```bash
stripe preview trigger outbound_payment.posted
Setting up fixture for: finaddr_info
Running fixture for: finaddr_info
Setting up fixture for: create_recipient
Running fixture for: create_recipient
Setting up fixture for: create_destination
Running fixture for: create_destination
Setting up fixture for: create_outbound_payment
Running fixture for: create_outbound_payment
```

## Registering Endpoints

### API Example
```bash
curl -X POST https://api.stripe.com/v2/core/event_destinations \
  -H "Authorization: Bearer <<YOUR_SECRET_KEY>>" \
  -H "Stripe-Version: {{STRIPE_API_VERSION}}" \
  --json '{
    "name": "My event destination",
    "description": "This is my event destination, I like it a lot",
    "type": "webhook_endpoint",
    "event_payload": "thin",
    "enabled_events": [
        "v1.billing.meter.error_report_triggered"
    ],
    "webhook_endpoint": {
        "url": "https://example.com/my/webhook/endpoint"
    }
  }'
```

### CLI Command
```bash
stripe v2 core event_destinations create  \
  --name="My event destination" \
  --description="This is my event destination, I like it a lot" \
  --type=webhook_endpoint \
  --event-payload=thin \
  --enabled-events="v1.billing.meter.error_report_triggered" \
  --webhook-endpoint.url="https://example.com/my/webhook/endpoint"
```

### Ruby API
```ruby
client = Stripe::StripeClient.new("<<YOUR_SECRET_KEY>>")

event_destination = client.v2.core.event_destinations.create({
  name: 'My event destination',
  description: 'This is my event destination, I like it a lot',
  type: 'webhook_endpoint',
  event_payload: 'thin',
  enabled_events: ['v1.billing.meter.error_report_triggered'],
  webhook_endpoint: {url: 'https://example.com/my/webhook/endpoint'},
})
```

### Python API
```python
client = StripeClient("<<YOUR_SECRET_KEY>>")

event_destination = client.v2.core.event_destinations.create({
  "name": "My event destination",
  "description": "This is my event destination, I like it a lot",
  "type": "webhook_endpoint",
  "event_payload": "thin",
  "enabled_events": ["v1.billing.meter.error_report_triggered"],
  "webhook_endpoint": {"url": "https://example.com/my/webhook/endpoint"},
})
```

### PHP API
```php
$stripe = new \Stripe\StripeClient('<<YOUR_SECRET_KEY>>');

$eventDestination = $stripe->v2->core->eventDestinations->create([
  'name' => 'My event destination',
  'description' => 'This is my event destination, I like it a lot',
  'type' => 'webhook_endpoint',
  'event_payload' => 'thin',
  'enabled_events' => ['v1.billing.meter.error_report_triggered'],
  'webhook_endpoint' => ['url' => 'https://example.com/my/webhook/endpoint'],
]);
```

### Java API
```java
StripeClient client = new StripeClient("<<YOUR_SECRET_KEY>>");

EventDestinationCreateParams params =
  EventDestinationCreateParams.builder()
    .setName("My event destination")
    .setDescription("This is my event destination, I like it a lot")
    .setType(EventDestinationCreateParams.Type.WEBHOOK_ENDPOINT)
    .setEventPayload(EventDestinationCreateParams.EventPayload.THIN)
    .addEnabledEvent("v1.billing.meter.error_report_triggered")
    .setWebhookEndpoint(
      EventDestinationCreateParams.WebhookEndpoint.builder()
        .setUrl("https://example.com/my/webhook/endpoint")
        .build()
    )
    .build();

EventDestination eventDestination = client.v2().core().eventDestinations().create(params);
```

### Node.js API
```javascript
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');

const eventDestination = await stripe.v2.core.eventDestinations.create({
  name: 'My event destination',
  description: 'This is my event destination, I like it a lot',
  type: 'webhook_endpoint',
  event_payload: 'thin',
  enabled_events: ['v1.billing.meter.error_report_triggered'],
  webhook_endpoint: {
    url: 'https://example.com/my/webhook/endpoint',
  },
});
```

### Go API
```go
sc := stripe.NewClient("<<YOUR_SECRET_KEY>>")
params := &stripe.V2CoreEventDestinationCreateParams{
  Name: stripe.String("My event destination"),
  Description: stripe.String("This is my event destination, I like it a lot"),
  Type: stripe.String("webhook_endpoint"),
  EventPayload: stripe.String("thin"),
  EnabledEvents: []*string{stripe.String("v1.billing.meter.error_report_triggered")},
  WebhookEndpoint: &stripe.V2CoreEventDestinationCreateWebhookEndpointParams{
    URL: stripe.String("https://example.com/my/webhook/endpoint"),
  },
}
result, err := sc.V2CoreEventDestinations.Create(context.TODO(), params)
```

### .NET API
```csharp
var options = new Stripe.V2.Core.EventDestinationCreateOptions
{
    Name = "My event destination",
    Description = "This is my event destination, I like it a lot",
    Type = "webhook_endpoint",
    EventPayload = "thin",
    EnabledEvents = new List<string> { "v1.billing.meter.error_report_triggered" },
    WebhookEndpoint = new Stripe.V2.Core.EventDestinationCreateWebhookEndpointOptions
    {
        Url = "https://example.com/my/webhook/endpoint",
    },
};
var client = new StripeClient("<<YOUR_SECRET_KEY>>");
var service = client.V2.Core.EventDestinations;
Stripe.V2.Core.EventDestination eventDestination = service.Create(options);
```

## Organization Event Destination Limitations

Organization event destinations have specific restrictions for certain event types:

- **issuing_authorization.request**: Cannot be subscribed to; instead use account-level webhook endpoints
- **checkout_sessions.completed**: Cannot handle redirect behavior when embedded in websites; must use account-level endpoints for redirect functionality
- **invoice.created**: Unsuccessful responses cannot influence automatic invoice finalization; must use account-level endpoints to trigger automatic finalization

## Security Implementation

Verify all webhook requests using official Stripe libraries. Provide the event payload, the `Stripe-Signature` header, and the endpoint's secret. Failed verification raises an error.

**Important**: Stripe requires raw request body for signature verification. Framework manipulation of the raw body causes verification failure.

### Ruby Signature Verification
```ruby
require 'stripe'
require 'sinatra'

Stripe.api_key = '<<YOUR_SECRET_KEY>>'
endpoint_secret = 'whsec_...'

set :port, 4242

post '/my/webhook/url' do
  payload = request.body.read
  sig_header = request.env['HTTP_STRIPE_SIGNATURE']
  event = nil

  begin
    event = Stripe::Webhook.construct_event(
      payload, sig_header, endpoint_secret
    )
  rescue JSON::ParserError => e
    puts "Error parsing payload: #{e.message}"
    status 400
    return
  rescue Stripe::SignatureVerificationError => e
    puts "Error verifying webhook signature: #{e.message}"
    status 400
    return
  end

  case event.type
  when 'payment_intent.succeeded'
    payment_intent = event.data.object
    puts 'PaymentIntent was successful!'
  when 'payment_method.attached'
    payment_method = event.data.object
    puts 'PaymentMethod was attached to a Customer!'
  else
    puts "Unhandled event type: #{event.type}"
  end

  status 200
end
```

### Python Signature Verification
```python
stripe.api_key = '<<YOUR_SECRET_KEY>>'

from django.http import HttpResponse
endpoint_secret = 'whsec_...'

@csrf_exempt
def my_webhook_view(request):
  payload = request.body
  sig_header = request.META['HTTP_STRIPE_SIGNATURE']
  event = None

  try:
    event = stripe.Webhook.construct_event(
      payload, sig_header, endpoint_secret
    )
  except ValueError as e:
    print('Error parsing payload: {}'.format(str(e)))
    return HttpResponse(status=400)
  except stripe.error.SignatureVerificationError as e:
    print('Error verifying webhook signature: {}'.format(str(e)))
    return HttpResponse(status=400)

  if event.type == 'payment_intent.succeeded':
    payment_intent = event.data.object
    print('PaymentIntent was successful!')
  elif event.type == 'payment_method.attached':
    payment_method = event.data.object
    print('PaymentMethod was attached to a Customer!')
  else:
    print('Unhandled event type {}'.format(event.type))

  return HttpResponse(status=200)
```

### PHP Signature Verification
```php
\Stripe\Stripe::setApiKey('<<YOUR_SECRET_KEY>>');

$endpoint_secret = 'whsec_...';

$payload = @file_get_contents('php://input');
$sig_header = $_SERVER['HTTP_STRIPE_SIGNATURE'];
$event = null;

try {
  $event = \Stripe\Webhook::constructEvent(
    $payload, $sig_header, $endpoint_secret
  );
} catch(\UnexpectedValueException $e) {
  http_response_code(400);
  echo json_encode(['Error parsing payload: ' => $e->getMessage()]);
  exit();
} catch(\Stripe\Exception\SignatureVerificationException $e) {
  http_response_code(400);
  echo json_encode(['Error verifying webhook signature: ' => $e->getMessage()]);
  exit();
}

switch ($event->type) {
    case 'payment_intent.succeeded':
        $paymentIntent = $event->data.object;
        handlePaymentIntentSucceeded($paymentIntent);
        break;
    case 'payment_method.attached':
        $paymentMethod = $event->data.object;
        handlePaymentMethodAttached($paymentMethod);
        break;
    default:
        echo 'Received unknown event type ' . $event->type;
}

http_response_code(200);
```

### Java Signature Verification
```java
Stripe.apiKey = "<<YOUR_SECRET_KEY>>";

import com.stripe.Stripe;
import com.stripe.model.StripeObject;
import com.stripe.net.ApiResource;
import com.stripe.net.Webhook;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.PaymentIntent;
import com.stripe.exception.SignatureVerificationException;

String endpointSecret = "whsec_...";

public Object handle(Request request, Response response) {
  String payload = request.body();
  String sigHeader = request.headers("Stripe-Signature");
  Event event = null;

  try {
    event = Webhook.constructEvent(
      payload, sigHeader, endpointSecret
    );
  } catch (JsonSyntaxException e) {
    System.out.println("Error parsing payload: " + e.getMessage());
    response.status(400);
    return gson.toJson(new ErrorResponse(e.getMessage()));
  } catch (SignatureVerificationException e) {
    System.out.println("Error verifying webhook signature: " + e.getMessage());
    response.status(400);
    return gson.toJson(new ErrorResponse(e.getMessage()));
  }

  EventDataObjectDeserializer dataObjectDeserializer = event.getDataObjectDeserializer();
  StripeObject stripeObject = null;
  if (dataObjectDeserializer.getObject().isPresent()) {
    stripeObject = dataObjectDeserializer.getObject().get();
  }

  switch (event.getType()) {
    case "payment_intent.succeeded":
      PaymentIntent paymentIntent = (PaymentIntent) stripeObject;
      System.out.println("PaymentIntent was successful!");
      break;
    case "payment_method.attached":
      PaymentMethod paymentMethod = (PaymentMethod) stripeObject;
      System.out.println("PaymentMethod was attached to a Customer!");
      break;
    default:
      System.out.println("Unhandled event type: " + event.getType());
  }

  response.status(200);
  return "";
}
```

### Node.js Signature Verification
```javascript
const stripe = require('stripe')('<<YOUR_SECRET_KEY>>');
const endpointSecret = 'whsec_...';
const express = require('express');

const app = express();

app.post('/webhook', express.raw({type: 'application/json'}), (request, response) => {
  const sig = request.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent was successful!');
      break;
    case 'payment_method.attached':
      const paymentMethod = event.data.object;
      console.log('PaymentMethod was attached to a Customer!');
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  response.json({received: true});
});

app.listen(4242, () => console.log('Running on port 4242'));
```

## Dashboard Registration Steps

1. Navigate to the [Webhooks tab](https://dashboard.stripe.com/webhooks)
2. Click "Create an event destination"
3. Select event source (Account, Connected accounts, or Accounts for organizations)
4. Choose API version for Event object
5. Select desired event types
6. Select "Continue" then choose "Webhook endpoint" as destination type
7. Provide endpoint URL and optional description
8. Complete registration

## URL Format

Webhook URLs must follow this pattern:

```
https://<your-website>/<your-webhook-endpoint>
```

Example: `https://mycompanysite.com/stripe_webhooks`

## Key Differences - Event Types Overview

**Snapshot Events**: Contain full object data at event time; use `event.data.object` for latest information at moment of event.

**Thin Events**: Contain minimal object identification; use `fetchRelatedObject()` to retrieve latest version from API.

## Additional Resources

- Interactive webhook endpoint builder available for multiple programming languages
- Stripe CLI documentation for local testing
- Official libraries recommended for signature verification
- EventBridge as alternative destination for events
- Support for up to 16 registered webhook endpoints per account
