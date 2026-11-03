// A stand-in for the Stripe API endpoints the site calls, so the end-to-end
// suite can run without a Stripe account. Point the site at it with
// STRIPE_API_BASE=http://localhost:<port>.
//
// Besides the Stripe endpoints it has three test-only ones: GET /__log lists
// every call made to it; POST /__objects (JSON) registers an invoice or
// subscription for the site to retrieve by id, or a refund (as if made from
// the dashboard) for GET /v1/refunds to list; POST /__refunds {"fail":true}
// makes POST /v1/refunds fail like an outage until {"fail":false}.
import http from "node:http";

const port = Number(process.env.PORT ?? 12111);
const sessions = new Map();
const objects = new Map();
const refunds = [];
const calls = [];
let n = 0;
let refundsFail = false;

function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) {
    const path = k.replace(/\]/g, "").split("[");
    let o = out;
    path.forEach((p, i) => {
      if (i === path.length - 1) o[p] = v;
      else o = o[p] ??= {};
    });
  }
  return out;
}

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const isJson = (req.headers["content-type"] ?? "").includes("application/json");
      const params = isJson ? (body ? JSON.parse(body) : {}) : parseForm(body);
      calls.push({ method: req.method, path: url.pathname, params, idem: req.headers["idempotency-key"] });
      const send = (o, s = 200) => {
        res.writeHead(s, { "content-type": "application/json" });
        res.end(JSON.stringify(o));
      };
      const notFound = (what) => send({ error: { type: "invalid_request_error", code: "resource_missing", message: `No such ${what}` } }, 404);

      if (url.pathname === "/__log") return send(calls);
      if (req.method === "POST" && url.pathname === "/__objects") {
        objects.set(params.id, params);
        if (params.object === "refund") refunds.push({ status: "succeeded", metadata: {}, ...params });
        return send({ ok: true });
      }
      if (req.method === "POST" && url.pathname === "/__refunds") {
        refundsFail = params.fail === true;
        return send({ ok: true });
      }

      if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
        if (params.customer === "cus_missing") {
          return send({ error: { type: "invalid_request_error", code: "resource_missing", param: "customer", message: "No such customer: 'cus_missing'" } }, 400);
        }
        const id = `cs_test_${++n}`;
        const items = Object.values(params.line_items ?? {});
        const amount_total = items.reduce((s, li) => s + Number(li.price_data.unit_amount) * Number(li.quantity), 0);
        const s = { id, object: "checkout.session", url: `https://checkout.stripe.test/${id}`, mode: params.mode, metadata: params.metadata ?? {}, amount_total, status: "open", params };
        sessions.set(id, s);
        return send(s);
      }
      let m = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)$/);
      if (m) {
        const s = sessions.get(m[1]);
        return s ? send({ ...s, status: "complete", payment_status: "paid", payment_intent: `pi_${s.id}` }) : notFound("session");
      }
      m = url.pathname.match(/^\/v1\/(invoices|subscriptions)\/([^/]+)$/);
      if (m) {
        const o = objects.get(m[2]);
        return o ? send(o) : notFound(m[1].slice(0, -1));
      }
      if (req.method === "GET" && url.pathname === "/v1/refunds") {
        const pi = url.searchParams.get("payment_intent");
        return send({ object: "list", has_more: false, data: refunds.filter((r) => !pi || r.payment_intent === pi) });
      }
      if (url.pathname === "/v1/refunds") {
        if (refundsFail) {
          res.writeHead(503, { "content-type": "application/json", "stripe-should-retry": "false" });
          return res.end(JSON.stringify({ error: { type: "api_error", message: "Simulated outage" } }));
        }
        const refund = { id: `re_${++n}`, object: "refund", status: "succeeded", amount: Number(params.amount), payment_intent: params.payment_intent, metadata: params.metadata ?? {} };
        refunds.push(refund);
        return send(refund);
      }
      if (url.pathname === "/v1/invoice_payments") {
        return send({
          object: "list",
          has_more: false,
          data: [{ id: "inpay_1", object: "invoice_payment", status: "paid", payment: { type: "payment_intent", payment_intent: `pi_for_${url.searchParams.get("invoice")}` } }],
        });
      }
      send({ error: { message: `unhandled ${req.method} ${url.pathname}` } }, 404);
    });
  })
  .listen(port, () => console.log(`fake stripe on ${port}`));
