"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomBytes } = require("node:crypto");
require("./fixture.js");

const { entries, say } = require("../lib/say.js");

const LINES = entries();
const line = (name, values) => say(LINES, name, values);
const PRICE = { currency: "NZD", amount_cents: 70, least: 1, most: 1428571 };
const PAGE = "https://checkout.stripe.com/c/pay/cs_test_a1";

function machine() {
  const home = mkdtempSync(join(tmpdir(), "evalation-buy-"));
  mkdirSync(join(home, "keys"), { recursive: true });
  writeFileSync(join(home, "keys", "evalation-plugin.box.installation-key"), randomBytes(32).toString("base64"), { mode: 0o600 });
  writeFileSync(join(home, "keys", "evalation-plugin.box.receiving-key"), randomBytes(32).toString("base64"), { mode: 0o600 });
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ schema: "evalation.local.v1", installation: "box", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  const opener = join(home, "opener.js");
  writeFileSync(opener, `require("node:fs").writeFileSync(${JSON.stringify(join(home, "opened"))}, process.argv[2]);\n`);
  return home;
}

const answering = (price = PRICE, checkout = { url: PAGE }) => (req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(req.url === "/buy/price" ? price : checkout));
};

const refusing = (status, failure, path = "/buy/price") => (req, res) => {
  if (req.url !== path) return answering()(req, res);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ refusals: [{ at: "billing", observed: "the server's own words", required: "do the server's thing", failure }] }));
};

function bought(args, answer = answering(), { home = machine(), opener = true, reachable = true } = {}) {
  return new Promise((resolve) => {
    const asked = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        asked.push({ url: req.url, body: JSON.parse(body || "{}"), signed: Boolean(req.headers["x-evalation-signature"]),
          installation: req.headers["x-evalation-installation"] });
        answer(req, res);
      });
    }).listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const start = () => {
        const child = spawn(process.execPath, [join(__dirname, "..", "bin", "evalation-buy"), ...args], { env: { ...process.env,
          EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file",
          EVALATION_SERVER: `http://127.0.0.1:${port}`, EVALATION_OPENER: opener ? join(home, "opener.js") : join(home, "no-such-opener.js") } });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("exit", (status) => server.close(() => {
          const opened = existsSync(join(home, "opened")) ? readFileSync(join(home, "opened"), "utf8") : null;
          resolve({ status, stdout, stderr, asked, opened, fields: fieldsOf(stdout) });
        }));
      };
      if (reachable) start();
      else server.close(start);
    });
  });
}

function fieldsOf(stdout) {
  const out = {};
  for (const one of stdout.split("\n")) {
    const at = one.indexOf(": ");
    if (at > 0) out[one.slice(0, at)] = one.slice(at + 2);
  }
  return out;
}

test("the price comes back as a question naming the price per credit, with each total in its label and a way to talk it through", async () => {
  const ran = await bought(["price"]);
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.deepStrictEqual(ran.asked.map((one) => [one.url, one.signed, one.installation]), [["/buy/price", true, "box"]]);
  assert.strictEqual(ran.fields.price, "NZD 0.70");
  const asked = JSON.parse(ran.fields.question).questions;
  assert.strictEqual(asked.length, 1);
  assert.strictEqual(asked[0].question, LINES["ev-account.buy-ask"].ask.replace("<price>", "NZD 0.70"));
  assert.match(asked[0].question, /NZD 0\.70 each/);
  assert.match(asked[0].question, /nothing is charged until you pay on Stripe's page/);
  assert.deepStrictEqual(asked[0].options.map((one) => one.label),
    ["Buy 10 for NZD 7.00", "Buy 50 for NZD 35.00", line("ev-account.buy-none"), line("ev-account.buy-talk")]);
  assert.strictEqual(asked[0].options[0].description, line("ev-account.buy-count-means", { count: 10 }));
  assert.strictEqual(asked[0].multiSelect, false);
});

test("the counts offered never fall below the least one payment can take, and totals carry thousands separators", async () => {
  const ran = await bought(["price"], answering({ currency: "GBP", amount_cents: 2, least: 15, most: 49999999 }));
  const labels = JSON.parse(ran.fields.question).questions[0].options.map((one) => one.label);
  assert.deepStrictEqual(labels.slice(0, 2), ["Buy 15 for GBP 0.30", "Buy 75 for GBP 1.50"]);
  const dear = await bought(["price"], answering({ currency: "NZD", amount_cents: 250000, least: 1, most: 399 }));
  assert.deepStrictEqual(JSON.parse(dear.fields.question).questions[0].options.slice(0, 2).map((one) => one.label),
    ["Buy 10 for NZD 25,000.00", "Buy 50 for NZD 125,000.00"]);
  const narrow = await bought(["price"], answering({ currency: "NZD", amount_cents: 7000, least: 1, most: 14 }));
  assert.deepStrictEqual(JSON.parse(narrow.fields.question).questions[0].options.map((one) => one.label),
    ["Buy 10 for NZD 700.00", line("ev-account.buy-none"), line("ev-account.buy-talk")], "a count over the most is never offered");
});

test("a checkout asks for the count signed, opens Stripe's page and prints its address with the line to show", async () => {
  const ran = await bought(["checkout", "10"]);
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.deepStrictEqual(ran.asked.map((one) => [one.url, one.signed]), [["/buy/price", true], ["/buy/checkout", true]]);
  assert.deepStrictEqual(ran.asked[1].body, { credits: 10 });
  assert.strictEqual(ran.opened, PAGE);
  assert.strictEqual(ran.fields.url, PAGE);
  assert.strictEqual(ran.fields.said, line("ev-account.buy-opened", { url: PAGE }));
  assert.match(ran.fields.said, /run \/ev-account to see your new balance/);
});

test("where the browser can't be opened, the line sends the person to the address", async () => {
  const ran = await bought(["checkout", "10"], answering(), { opener: false });
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.strictEqual(ran.fields.said, line("ev-account.buy-open-yourself", { url: PAGE }));
});

test("a typed count that isn't whole or is outside the limits is refused before anything is bought, naming the limit", async () => {
  for (const [typed, said] of [
    ["ten", line("ev-account.buy-not-a-number")],
    ["2.5", line("ev-account.buy-not-a-number")],
    ["0", line("ev-account.buy-too-few", { least: "1" })],
    ["2000000", line("ev-account.buy-too-many", { most: "1,428,571" })],
  ]) {
    const ran = await bought(["checkout", typed]);
    assert.strictEqual(ran.fields.said, said, typed);
    assert.strictEqual(ran.fields.again, "yes", `${typed} has the question asked again`);
    assert.ok(!ran.asked.some((one) => one.url === "/buy/checkout"), `${typed} is never sent to be bought`);
    assert.strictEqual(ran.opened, null);
  }
  const ran = await bought(["checkout", "3"], answering({ ...PRICE, least: 5 }));
  assert.strictEqual(ran.fields.said, line("ev-account.buy-too-few", { least: "5" }));
});

test("a refusal is shown in the plugin's words, chosen by its kind and never its wording", async () => {
  for (const [path, status, failure, name] of [
    ["/buy/price", 422, "no-price", "ev-account.buy-no-price"],
    ["/buy/price", 503, "payments-unavailable", "ev-account.buy-unavailable"],
    ["/buy/checkout", 503, "payments-unavailable", "ev-account.buy-unavailable"],
    ["/buy/checkout", 503, "transport-failure", "ev-account.buy-unavailable"],
    ["/buy/checkout", 422, "checkout-refused", "ev-account.buy-refused"],
    ["/buy/checkout", 422, "something-new", "ev-account.buy-other"],
    ["/buy/price", 401, "not-live", "ev-account.refused"],
  ]) {
    const ran = await bought(path === "/buy/price" ? ["price"] : ["checkout", "10"], refusing(status, failure, path));
    assert.strictEqual(ran.fields.said, line(name), `${failure} at ${path}`);
    assert.strictEqual(ran.fields.again, undefined);
    assert.doesNotMatch(ran.stdout, /server's own words|server's thing/);
    assert.strictEqual(ran.fields.question, undefined);
    assert.strictEqual(ran.opened, null);
  }
});

test("a server that isn't reachable has its own line, and opens nothing", async () => {
  for (const args of [["price"], ["checkout", "10"]]) {
    const ran = await bought(args, answering(), { reachable: false });
    assert.strictEqual(ran.fields.said, line("ev-account.buy-unreachable"), args.join(" "));
    assert.strictEqual(ran.opened, null);
  }
});

test("no line in the plugin tells a person to email support to buy pack credits", () => {
  const found = Object.entries(LINES).filter(([, one]) => /buy[^.]*support@|support@[^.]*buy/i.test(one.say ?? one.ask ?? ""));
  assert.deepStrictEqual(found.map(([name]) => name), []);
});
