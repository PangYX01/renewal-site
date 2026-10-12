OSR BUSINESS RENEW - STANDALONE HTML PACKAGE

UPLOAD
Upload the CONTENTS of this folder to the web root for osrbusinessrenew.com.my.

URL STRUCTURE
/                       -> index.html
/about-us/              -> about-us/index.html
/faqs/                  -> faqs/index.html
/privacy-policy/        -> privacy-policy/index.html
/refund-policy/         -> refund-policy/index.html
/terms-and-conditions/  -> terms-and-conditions/index.html
/payment-confirmation/  -> payment-confirmation/index.html
/payment-failed/        -> payment-failed/index.html
/bm/                    -> Bahasa Malaysia version

IMPORTANT BACKEND NOTE
This package makes the public site/pages/assets independent from WordPress for rendering.
The renewal form JavaScript still contains the existing WordPress REST/AJAX backend calls for SSM verification, pricing, entry creation and payment. Do NOT remove the current WordPress backend until those endpoints are migrated to the standalone PHP/MySQL backend.

ADMIN
/admin/ and /reports/ are placeholders. The actual standalone admin/report backend is the next migration phase.
