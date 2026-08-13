import assert from "node:assert/strict";

/**
 * Runs the assignment's exact scenario against a running server over HTTP —
 * the real API contract, status codes and error bodies, not the service
 * layer directly. Point it at a deployment with:
 *
 *   BASE_URL=https://your-deploy.vercel.app npm run verify:scenario
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

let cookie = "";
let orderId = "";

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Origin", BASE_URL);
  if (cookie) headers.set("Cookie", cookie);

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  // Better Auth's session cookie — carried on every subsequent request so the
  // script authenticates like a real browser session, not a bearer token.
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) {
    cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  }

  return response;
}

function offsetDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function signUpTestUser(): Promise<void> {
  const email = `verify-scenario-${Date.now()}@example.com`;
  const response = await request("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "verify-scenario-password",
      name: "Scenario Verifier",
    }),
  });
  assert.equal(response.status, 200, `sign-up should succeed, got ${response.status}`);
}

async function createOrderStep(): Promise<string> {
  const response = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: "Acme Inc",
      dueDate: offsetDate(7),
      items: [{ description: "Widget", quantity: 2, unitPrice: "500.00" }],
    }),
  });
  assert.equal(response.status, 201, `expected 201, got ${response.status}`);

  const body = await response.json();
  assert.equal(body.data.orderTotal, "1000.00");
  orderId = body.data.id;

  return `total ${body.data.orderTotal}`;
}

async function firstPayment(): Promise<string> {
  const response = await request(`/api/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify({ amount: "400.00", date: offsetDate(0) }),
  });
  assert.equal(response.status, 201, `expected 201, got ${response.status}`);

  const body = await response.json();
  assert.equal(body.data.status, "partially_paid");
  assert.equal(body.data.amountDue, "600.00");

  return `${body.data.status}, $${body.data.amountDue} due`;
}

async function secondPayment(): Promise<string> {
  const response = await request(`/api/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify({ amount: "600.00", date: offsetDate(0) }),
  });
  assert.equal(response.status, 201, `expected 201, got ${response.status}`);

  const body = await response.json();
  assert.equal(body.data.status, "paid");
  assert.equal(body.data.amountDue, "0.00");

  return `${body.data.status}, $${body.data.amountDue} due`;
}

async function rejectedPayment(): Promise<string> {
  const response = await request(`/api/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify({ amount: "1.00", date: offsetDate(0) }),
  });
  assert.equal(response.status, 409, `expected 409, got ${response.status}`);

  const body = await response.json();
  assert.equal(body.error.code, "OVERPAYMENT");
  assert.equal(body.error.details.maxAllowedAmount, "0.00");
  assert.match(body.error.message, /already fully paid/i);

  // The assertion that actually matters: a rejection that still wrote a row
  // would pass a naive test that only checks the response.
  const after = await request(`/api/orders/${orderId}`);
  const afterBody = await after.json();
  assert.equal(afterBody.data.amountPaid, "1000.00", "the rejected payment must leave no trace");

  return `409 OVERPAYMENT, max allowed $${body.error.details.maxAllowedAmount}`;
}

const steps: { label: string; run: () => Promise<string> }[] = [
  { label: "Create order: 2 x $500.00, due in 7 days", run: createOrderStep },
  { label: "Record $400.00", run: firstPayment },
  { label: "Record $600.00", run: secondPayment },
  { label: "Reject $1.00", run: rejectedPayment },
];

async function main() {
  console.log(`Verifying assignment scenario against ${BASE_URL}\n`);
  await signUpTestUser();

  let passed = 0;
  for (const step of steps) {
    try {
      const detail = await step.run();
      console.log(`\u2714 ${step.label.padEnd(45)} ${detail}`);
      passed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`\u2716 ${step.label.padEnd(45)} ${message}`);
    }
  }

  console.log(`\n${passed}/${steps.length} passed`);
  if (passed !== steps.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
