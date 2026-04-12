/**
 * Email 2 — Day 3 — Follow-up
 * Goal: add social proof, re-engage
 */
module.exports = {
  subject: (c) => `Re: {{agency_name}} + Prophives`,

  html: (c) => `
<p>Hi {{first_name}},</p>

<p>Just wanted to follow up on my last email in case it got buried.</p>

<p>One of our clients — a 50-property portfolio manager in Dubai — told us: <em>"Prophives cut the time I spend on tenant emails from 3 hours a day to under 30 minutes."</em></p>

<p>We've built features specifically for the {{city}} market:</p>
<ul>
  <li>Automated rent reminders (WhatsApp + email)</li>
  <li>AI ticket classification — tenants log issues, AI routes them instantly</li>
  <li>Document storage for tenancy contracts</li>
  <li>Owner + tenant portals, branded to your agency</li>
</ul>

<p>Happy to walk you through a quick demo — no commitment, no pitch deck. Just 15 minutes on a call.</p>

<p>Worth a look?</p>

<p>Tushar<br>
<a href="https://prophives.com">prophives.com</a></p>

<p style="font-size:11px;color:#999;">
  <a href="{{unsubscribe_url}}">Unsubscribe</a>
</p>
`.trim(),

  text: (c) => `
Hi {{first_name}},

Just wanted to follow up on my last email in case it got buried.

One of our clients — a 50-property portfolio manager in Dubai — told us: "Prophives cut the time I spend on tenant emails from 3 hours a day to under 30 minutes."

We've built features specifically for the {{city}} market:
- Automated rent reminders (WhatsApp + email)
- AI ticket classification — tenants log issues, AI routes them instantly
- Document storage for tenancy contracts
- Owner + tenant portals, branded to your agency

Happy to walk you through a quick demo — no commitment, no pitch deck. Just 15 minutes on a call.

Worth a look?

Tushar
prophives.com

Unsubscribe: {{unsubscribe_url}}
`.trim(),
};
