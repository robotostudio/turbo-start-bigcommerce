import { appendFileSync } from "node:fs";

/**
 * THROWAWAY CAPTURE STUB — ROB-2612.
 *
 * Logs every BigCommerce webhook delivery verbatim and returns 200. No auth
 * check, no Sanity write, no parsing. The real receiver is ROB-2616 and
 * replaces this file wholesale.
 *
 * `?sleep=N` delays the response by N seconds without delaying the log write,
 * so a delivery that BigCommerce gives up on still leaves a record of when the
 * origin actually finished. That is what separates a BigCommerce ACK timeout
 * from a tunnel timeout.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG = process.env.WEBHOOK_CAPTURE_LOG ?? "/tmp/bc-webhooks.log";

export async function POST(request: Request) {
  const receivedAt = new Date().toISOString();
  const body = await request.text();
  const sleepSeconds = Number(
    new URL(request.url).searchParams.get("sleep") ?? 0
  );

  appendFileSync(
    LOG,
    `${JSON.stringify({
      event: "received",
      receivedAt,
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body,
    })}\n`
  );

  if (sleepSeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));
  }

  appendFileSync(
    LOG,
    `${JSON.stringify({
      event: "responded",
      receivedAt,
      respondedAt: new Date().toISOString(),
      sleepSeconds,
      status: 200,
    })}\n`
  );

  return new Response("ok", { status: 200 });
}
