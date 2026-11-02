// A stand-in for the Stripe API endpoints the site calls, so the end-to-end
// suite can run without a Stripe account. Point the site at it with
// STRIPE_API_BASE=http://localhost:<port>.
import http from "node:http";

const port = Number(process.env.PORT ?? 12111);
const sessions = new Map();
const calls = [];
let n = 0;

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
      const params = parseForm(body);
      calls.push({ method: req.method, path: url.pathname, params, idem: req.headers["idempotency-key"] });
      const send = (o, s = 200) => {
        res.writeHead(s, { "content-type": "application/json" });
        res.end(JSON.stringify(o));
      };
      if (url.pathname === "/__log") return send(calls);
      if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
        const id = `cs_test_${++n}`;
        const items = Object.values(params.line_items ?? {});
        const amount_total = items.reduce((s, li) => s + Number(li.price_data.unit_amount) * Number(li.quantity), 0);
        const s = { id, object: "checkout.session", url: `https://checkout.stripe.test/${id}`, mode: params.mode, metadata: params.metadata ?? {}, amount_total, status: "open", params };
        sessions.set(id, s);
        return send(s);
      }
      const m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/);
      if (m) {
        const s = sessions.get(m[1]);
        return s ? send({ ...s, status: "complete" }) : send({ error: { message: "no such session" } }, 404);
      }
      if (url.pathname === "/v1/refunds") return send({ id: `re_${++n}`, object: "refund", amount: Number(params.amount) });
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
