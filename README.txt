OSR Business Renew — WordPress-Free Static Frontend

This package contains the public HTML/CSS/JS site only. It makes NO runtime requests to WordPress (/wp-json, /wp-admin, /wp-includes).

Clean URL structure:
  /                 -> index.html
  /about-us/        -> about-us/index.html
  /faqs/            -> faqs/index.html
  /privacy-policy/  -> privacy-policy/index.html
  /refund-policy/   -> refund-policy/index.html
  /terms-and-conditions/ -> terms-and-conditions/index.html
  /bm/              -> bm/index.html

FORM STATUS
- Pricing uses the exported local values in js/script.js.
- SSM lookup does not contact WordPress. It switches to manual Business Name entry.
- Submit/Pay is intentionally blocked until the standalone backend is connected.
- No form data or payment is sent anywhere in this static build.

DEPLOYMENT
- Vercel: upload/deploy this folder as-is. No vercel.json proxy is required.
- Plesk: upload these files into the document root (usually httpdocs).

NEXT PHASE
Connect a standalone API (PHP/MySQL recommended for Plesk) for SSM verification, pricing, entries, Fiuu payment, callbacks, email/PDF, admin and reports.
