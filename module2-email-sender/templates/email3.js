/**
 * Email 3 — Day 6 — Final breakup email
 * Goal: last chance, low pressure, leave door open
 */
module.exports = {
  subject: (c) => `Closing the loop — {{agency_name}}`,

  html: (c) => `
<p>Hi {{first_name}},</p>

<p>I'll keep this short — I know you're busy managing properties.</p>

<p>This is my last email. I don't want to be another person clogging your inbox.</p>

<p>If the timing isn't right, no worries at all. If you ever want to see how Prophives could work for {{agency_name}}, you can book a 15-min demo directly here: <a href="https://prophives.com">prophives.com</a></p>

<p>Wishing you a full occupancy rate this month.</p>

<p>Tushar</p>

<p style="font-size:11px;color:#999;">
  <a href="{{unsubscribe_url}}">Unsubscribe</a>
</p>
`.trim(),

  text: (c) => `
Hi {{first_name}},

I'll keep this short — I know you're busy managing properties.

This is my last email. I don't want to be another person clogging your inbox.

If the timing isn't right, no worries at all. If you ever want to see how Prophives could work for {{agency_name}}, you can visit: prophives.com

Wishing you a full occupancy rate this month.

Tushar

Unsubscribe: {{unsubscribe_url}}
`.trim(),
};
