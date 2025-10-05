# Privacy Policy - Navigator Web

**Last Updated:** 2025-01-06
**Effective Date:** 2025-01-06

## 1. Introduction

Navigator Web is a professional enforcement tool designed for bailiffs, enforcement agents, and field workers. This privacy policy explains how we handle data when you use our application.

**Key Points:**
- You are the **Data Controller** for work data you process
- We are the **Data Processor** providing infrastructure
- We do not access, analyze, or sell your data
- You have full control to export or delete your data

## 2. Who We Are

**Service Provider:** Navigator Web
**Service Type:** Professional route planning and completion tracking software
**Data Protection Contact:** [Your contact email - to be added]

For GDPR purposes:
- **Data Processor:** Navigator Web (for infrastructure services)
- **Data Controller:** You (the user, for customer/debtor data you enter)

## 3. What Data We Collect

### 3.1 Account & Authentication Data
**What:** Email address, password (encrypted)
**Why:** To authenticate you and secure your account
**Legal Basis:** Contract (providing the service)
**Stored:** Supabase Auth (EU servers)

### 3.2 Work Data You Enter
**What:**
- Addresses (may include personal residences)
- Completion records (outcomes, amounts, timestamps)
- Arrangements (customer names, phone numbers, payment schedules)
- Day session tracking (work hours)
- Case references
- Notes and observations

**Why:** To enable route planning, multi-device sync, and completion tracking
**Legal Basis:** Legitimate Interest (providing multi-device sync service) + Contract
**Stored:**
- Your device (IndexedDB, localStorage)
- Supabase cloud (optional, if you enable sync)

**IMPORTANT:** You are the Data Controller for this information. You must have lawful authority and proper legal basis to collect and process this data under GDPR/UK DPA 2018.

### 3.3 Technical & Usage Data
**What:**
- Device identifiers (browser-generated)
- Login timestamps
- Sync activity logs
- Browser type and version
- IP address (temporary, for authentication)

**Why:** To provide multi-device sync and detect suspicious activity
**Legal Basis:** Legitimate Interest (security and service provision)
**Stored:** Supabase (EU servers)

### 3.4 Cookies & Local Storage
**What:**
- Authentication tokens (session cookies)
- User preferences (dark mode, settings)
- Device ID (for sync)
- Cached map tiles and geocoding results

**Why:** To keep you logged in and improve performance
**Legal Basis:** Strictly Necessary (authentication) + Consent (preferences)
**Stored:** Your browser (localStorage, sessionStorage, IndexedDB)

## 4. How We Use Your Data

### We Use Data To:
✅ Authenticate your login
✅ Sync data across your devices
✅ Store your work records and preferences
✅ Provide route optimization and geocoding
✅ Enable backup and restore functionality
✅ Detect and prevent security issues

### We Do NOT:
❌ Analyze your work data
❌ Share data with advertisers
❌ Sell any personal information
❌ Use data for marketing (unless you opt-in)
❌ Access your data without your explicit request for support

## 5. Legal Basis for Processing (GDPR)

| Data Type | Legal Basis |
|-----------|-------------|
| Email & Password | Contract (Art. 6(1)(b)) - necessary to provide the service |
| Work Data Sync | Legitimate Interest (Art. 6(1)(f)) - multi-device functionality |
| Device IDs | Legitimate Interest (Art. 6(1)(f)) - security and sync |
| Cookies (auth) | Strictly Necessary - authentication |
| Cookies (preferences) | Consent (Art. 6(1)(a)) - optional features |

**Your Work Data:** You must establish your own legal basis (e.g., Legal Obligation under enforcement regulations, Legitimate Interest, etc.) for processing customer/debtor data.

## 6. Data Sharing & Third Parties

### We Share Data With:

**Supabase (Data Hosting)**
- **What:** All synced data
- **Why:** Cloud storage and authentication
- **Where:** EU servers (GDPR compliant)
- **Safeguards:** Data Processing Agreement, ISO 27001 certified
- **Privacy Policy:** https://supabase.com/privacy

**Google Maps API (Optional)**
- **What:** Addresses you choose to geocode
- **Why:** Converting addresses to coordinates
- **Where:** Google cloud infrastructure
- **Safeguards:** Google Cloud DPA
- **Privacy Policy:** https://policies.google.com/privacy
- **Your Control:** Only used when you click "Geocode" or use route planning

**OpenRouteService (Optional)**
- **What:** Coordinates for route optimization
- **Why:** Calculate efficient routes
- **Where:** HeiGIT servers (Germany)
- **Privacy Policy:** https://openrouteservice.org/privacy-policy/

### We Do NOT Share With:
- Marketing companies
- Data brokers
- Social media platforms
- Other enforcement agencies
- Anyone else (except as legally required)

## 7. International Data Transfers

**Primary Storage:** EU servers (Supabase - Frankfurt/Ireland region)
**Your Device:** Data stored locally in your country
**Google Maps:** May transfer addresses to Google (US) when you use geocoding

**Safeguards for non-EU transfers:**
- Standard Contractual Clauses (SCCs)
- Adequacy decisions where applicable
- Your explicit action triggers the transfer (e.g., clicking "Geocode")

## 8. Data Retention

### We Keep Data:
- **Active accounts:** Indefinitely (until you delete)
- **Deleted accounts:** Immediately purged from active systems
- **Backups:** Retained for 30 days, then permanently deleted
- **Logs (security):** 90 days maximum

### You Should Implement:
As the Data Controller for work data, you must establish retention policies for:
- Completed enforcement cases (typically 6 years under UK limitation periods)
- Arrangement records (as required by your contract/regulations)
- Personal data of debtors (delete when no longer necessary)

**Recommendation:** Use Settings → Data Retention to auto-delete old completions.

## 9. Your Rights (GDPR/UK DPA)

### You Have the Right To:

**1. Access (Art. 15)**
- Download all your data: Settings → Export All Data
- Request data we hold: Contact us

**2. Rectification (Art. 16)**
- Edit any data directly in the app
- Correct inaccurate information anytime

**3. Erasure / "Right to be Forgotten" (Art. 17)**
- Delete account: Settings → Delete Account
- All data permanently removed within 30 days

**4. Data Portability (Art. 20)**
- Export data in JSON or CSV format
- Take your data to another service

**5. Restriction of Processing (Art. 18)**
- Disable cloud sync (use offline mode only)
- Pause account (contact us)

**6. Object to Processing (Art. 21)**
- Stop using optional features (geocoding, sync)
- Delete account to stop all processing

**7. Automated Decision-Making (Art. 22)**
- We do not use automated decision-making or profiling

### How to Exercise Rights:
- **In-app:** Settings → Privacy & Data
- **Email:** [Your data protection contact]
- **Response time:** Within 30 days (GDPR requirement)

## 10. Data Security

### Technical Measures:
✅ **Encryption in transit:** TLS/HTTPS for all connections
✅ **Encryption at rest:** Supabase encrypted databases
✅ **Authentication:** Supabase Auth with email verification
✅ **Password security:** Bcrypt hashing (never stored in plaintext)
✅ **Access controls:** Row-level security policies
✅ **Audit logs:** Track data access and changes

### Organizational Measures:
✅ Regular security updates
✅ Limited personnel access
✅ Data breach response plan
✅ GDPR compliance reviews

### Your Responsibilities:
- Use a strong, unique password
- Enable two-factor authentication (when available)
- Don't share login credentials
- Keep your device secure
- Report suspicious activity immediately

## 11. Data Breach Notification

**If a breach occurs:**
1. We will notify you within **72 hours** (GDPR requirement)
2. You will receive details of:
   - What data was affected
   - Potential consequences
   - Measures we've taken
   - Steps you should take

**Your responsibility:**
- As Data Controller for work data, you must notify:
  - ICO (UK) or relevant supervisory authority
  - Affected data subjects (if high risk)
- Within 72 hours of becoming aware

## 12. Children's Privacy

This application is **NOT intended for use by individuals under 18**.

We do not knowingly collect data from minors. If we discover such data, it will be immediately deleted.

**Exception:** Enforcement work may involve addresses of properties where minors reside. As Data Controller, you must implement appropriate safeguards for any sensitive data.

## 13. Cookies & Tracking Technologies

### Essential Cookies (No consent required):
- `sb-auth-token` - Authentication session
- `navigator_device_id` - Multi-device sync
- `navigator-web:settings` - User preferences

### Optional Cookies (Requires consent):
- Map tile cache - Improves performance
- Geocoding cache - Reduces API calls

### Analytics:
- We currently do **NOT** use analytics or tracking
- If added in future, we will obtain explicit consent

**Your control:** Settings → Privacy & Data → Cookie Preferences

## 14. Changes to This Policy

- We may update this policy to reflect service changes or legal requirements
- **Material changes:** We will notify you via email and in-app notification
- **Minor updates:** Posted here with new "Last Updated" date
- **Your consent:** Continued use = acceptance (unless material change requires explicit consent)

**Version history:** Available on request

## 15. Supervisory Authority

You have the right to lodge a complaint with your data protection authority:

**UK Users:**
Information Commissioner's Office (ICO)
Website: https://ico.org.uk
Phone: 0303 123 1113

**EU Users:**
Your national supervisory authority
List: https://edpb.europa.eu/about-edpb/board/members_en

## 16. Contact Us

**Data Protection Queries:**
Email: [Your data protection email]
Response time: Within 7 days

**Technical Support:**
Via application documentation and help center

**Postal Address:**
[Your company address - if applicable]

## 17. Specific Processing Activities

### Multi-Device Sync
- **Purpose:** Access data on multiple devices
- **Data:** All work data you enter
- **Method:** Conflict resolution using timestamps
- **Control:** Disable in Settings → Auto-sync on app start

### Geocoding
- **Purpose:** Convert addresses to map coordinates
- **Data:** Addresses you select
- **Processors:** Google Maps API
- **Control:** Manual trigger only (you click "Geocode")

### Route Optimization
- **Purpose:** Calculate efficient visit order
- **Data:** Coordinates (not full addresses)
- **Processors:** OpenRouteService
- **Control:** Manual trigger only

### SMS Reminders (Future Feature)
- **Purpose:** Send payment reminders
- **Data:** Phone numbers, arrangement details
- **Legal requirement:** You must obtain consent from recipients
- **Control:** Fully optional feature

## 18. Your Data, Your Control

**Remember:**
- ✅ You own 100% of your data
- ✅ Export anytime in standard formats
- ✅ Delete account permanently with one click
- ✅ Use offline mode (no cloud sync)
- ✅ We are just the tool - you control how it's used

**For work data (customer/debtor information):**
- YOU are the Data Controller
- YOU must comply with GDPR
- YOU must have lawful basis
- YOU must handle data subject requests
- We provide tools to help you comply

---

## Appendix: Glossary

**Data Controller:** Entity that determines purposes and means of processing personal data
**Data Processor:** Entity that processes data on behalf of the controller
**GDPR:** General Data Protection Regulation (EU)
**UK DPA 2018:** UK Data Protection Act 2018
**Personal Data:** Any information relating to an identified or identifiable person
**Sensitive Data:** Health, biometric, criminal conviction data (we don't process this)

---

**Last Updated:** 2025-01-06
**Version:** 1.0
**Next Review:** 2025-07-06

---

**Questions?** Contact us at [your email]
