// Puts a clean set of FREE demo slots into your live API, so the web page has
// something to book. Usage:
//   node scripts/seed-demo.mjs https://your-app.vercel.app YOUR_API_KEY
// WARNING: this wipes every slot and booking first (it calls /reset).
// Run it BEFORE you submit the form. Do not run it after you submit.

const [base, key] = process.argv.slice(2);
if (!base || !key) {
  console.log("Usage: node scripts/seed-demo.mjs https://your-app.vercel.app YOUR_API_KEY");
  process.exit(1);
}

const days = ["2030-03-04", "2030-03-05", "2030-03-06"];
const times = [["09:00", "09:30"], ["09:30", "10:00"], ["10:00", "10:30"], ["10:30", "11:00"]];
const doctors = ["Dr Ade", "Dr Bola"];

const slots = [];
let n = 1;
for (const day of days) {
  for (const doctor of doctors) {
    for (const [start, end] of times) {
      slots.push({
        id: "demo-" + n++,
        provider: doctor,
        start: day + "T" + start + ":00Z",
        end: day + "T" + end + ":00Z",
      });
    }
  }
}

const res = await fetch(base + "/reset", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": key },
  body: JSON.stringify({ slots }),
});
console.log("Status:", res.status, await res.text());
console.log(res.status === 200 ? "Done: " + slots.length + " free demo slots are ready." : "Something went wrong.");
