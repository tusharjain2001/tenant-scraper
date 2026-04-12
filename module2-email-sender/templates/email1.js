/**
 * Email 1 — Day 0 — First touch
 * Goal: spark curiosity, not a hard sell
 */
module.exports = {
  subject: (c) => `Quick question about managing {{agency_name}}'s properties`,

  html: (c) => `
<p>Hi {{first_name}},</p>

<p>I came across {{agency_name}} while researching property management companies in {{city}} — impressive portfolio.</p>

<p>I run Prophives, an AI-powered property management platform built specifically for landlords and agencies like yours. It handles tenant communication, maintenance tickets, rent reminders, and document management — all in one place.</p>

<p>Most of our clients tell us it cuts their admin time by 60% in the first month.</p>

<p>Would it make sense to show you how it works for a {{city}}-based agency? Takes about 15 minutes.</p>

<p>Best,<br>
Tushar<br>
Prophives — AI Property Management<br>
<a href="https://prophives.com">prophives.com</a></p>

<p style="font-size:11px;color:#999;">
  If you'd prefer not to hear from us, <a href="{{unsubscribe_url}}">click here to unsubscribe</a>.
</p>
`.trim(),

  text: (c) => `
Hi {{first_name}},

I came across {{agency_name}} while researching property management companies in {{city}} — impressive portfolio.

I run Prophives, an AI-powered property management platform built specifically for landlords and agencies like yours. It handles tenant communication, maintenance tickets, rent reminders, and document management — all in one place.

Most of our clients tell us it cuts their admin time by 60% in the first month.

Would it make sense to show you how it works for a {{city}}-based agency? Takes about 15 minutes.

Best,
Tushar
Prophives — AI Property Management
prophives.com

If you'd prefer not to hear from us, unsubscribe: {{unsubscribe_url}}
`.trim(),
};
