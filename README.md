# MansajeBudget

A full-featured personal finance iOS app modeled after Mint — built with **Swift/SwiftUI**, **Firebase**, and **Plaid**.

---

## Features

- **Dashboard** — Net worth, monthly spending, budget overview, recent transactions
- **Transactions** — Search, filter by category, manually add, edit, delete
- **Budget** — Set monthly category limits, track progress with visual rings and bars
- **Accounts** — Link bank accounts via Plaid, auto-sync transactions
- **Reports** — Spending by category (donut chart) and trends over time (line chart)
- **Security** — Face ID / Touch ID lock, Plaid tokens stored in iOS Keychain
- **Auth** — Email/password, Sign in with Apple

---

## Tech Stack

| Layer | Technology |
|---|---|
| iOS App | Swift 5.9+, SwiftUI, iOS 17+ |
| Charts | Swift Charts (built-in) |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Bank Connectivity | Plaid Link iOS SDK |
| Security | LocalAuthentication, Keychain |
| Backend Proxy | Node.js + Express |

---

## Project Structure

```
MansajeBudget/          ← iOS Xcode project source files
MansajeBudgetBackend/   ← Node.js backend proxy
README.md
```

---

## iOS Setup (requires macOS + Xcode 15+)

> **Windows users:** You need a Mac to compile and run Swift/iOS apps. All source files are ready — open them in Xcode on a Mac.

### 1. Create Xcode Project

1. Open Xcode → **File → New → Project**
2. Choose **iOS → App**
3. Product Name: `MansajeBudget`
4. Interface: **SwiftUI**, Language: **Swift**
5. Bundle Identifier: `com.yourname.MansajeBudget`

### 2. Add Swift Package Dependencies

In Xcode → **File → Add Package Dependencies**:

| Package | URL |
|---|---|
| Firebase iOS SDK | `https://github.com/firebase/firebase-ios-sdk` |
| Plaid LinkKit | `https://github.com/plaid/plaid-link-ios` |
| Google Sign-In | `https://github.com/google/GoogleSignIn-iOS` |

Select these Firebase products:
- `FirebaseAuth`
- `FirebaseFirestore`
- `FirebaseFirestoreSwift`

### 3. Add Source Files

Copy all `.swift` files from `MansajeBudget/` into your Xcode project navigator, preserving the folder structure.

### 4. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project → Add an iOS app
3. Bundle ID must match your Xcode project
4. Download `GoogleService-Info.plist`
5. Drag it into the root of your Xcode project (check **"Add to targets"**)

### 5. Configure Info.plist

Add these keys to `Info.plist`:

```xml
<!-- Face ID usage description -->
<key>NSFaceIDUsageDescription</key>
<string>MansajeBudget uses Face ID to securely unlock your financial data.</string>

<!-- Plaid Link requires this for camera (check scanning) -->
<key>NSCameraUsageDescription</key>
<string>Used for check scanning when linking accounts.</string>

<!-- App Transport Security — allow HTTPS only -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>
```

### 6. Update Constants.swift

Edit `MansajeBudget/Utilities/Constants.swift` and set your deployed backend URL:

```swift
static let baseURL = "https://your-backend.example.com"
```

### 7. Enable Firebase Auth Providers

In Firebase Console → **Authentication → Sign-in method**:
- Enable **Email/Password**
- Enable **Apple** (requires Apple Developer account)

### 8. Firestore Security Rules

In Firebase Console → **Firestore → Rules**, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### 9. Build and Run

Select **iPhone 15 Pro simulator** → press **⌘R**

---

## Backend Setup (Node.js)

### 1. Install Dependencies

```bash
cd MansajeBudgetBackend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your real Plaid and Firebase credentials
```

### 3. Get Credentials

**Plaid:**
1. Sign up at [dashboard.plaid.com](https://dashboard.plaid.com)
2. Go to **Team Settings → Keys**
3. Copy `client_id` and your **Sandbox** secret

**Firebase Admin:**
1. Firebase Console → **Project Settings → Service Accounts**
2. Click **Generate new private key**
3. Save as `MansajeBudgetBackend/firebase-service-account.json`

### 4. Start the Server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000` by default.

### 5. Expose Locally for Webhook Testing (Optional)

```bash
# Install ngrok: https://ngrok.com
ngrok http 3000
# Copy the https URL into .env → PLAID_WEBHOOK_URL
```

### 6. Deploy to Production

Options:
- **Firebase Hosting + Cloud Functions** (recommended for Firebase projects)
- **Railway** — `railway up`
- **Render** — connect GitHub repo
- **Fly.io** — `fly launch`

---

## Plaid Sandbox Testing

In sandbox mode, use these test credentials in Plaid Link:
- **Username:** `user_good`
- **Password:** `pass_good`
- **MFA Code:** `1234`

---

## Security Architecture

| Layer | Implementation |
|---|---|
| Firebase Auth | All Firestore reads/writes gated by UID |
| Firestore Rules | Users can only access `users/{their-uid}/...` |
| Plaid tokens | Stored in iOS Keychain, never in Firestore or UserDefaults |
| Backend auth | Every request verified via Firebase ID token |
| Transport | HTTPS enforced; App Transport Security in Info.plist |
| Biometric lock | Face ID/Touch ID required on app foreground |
| Certificate Pinning | Optional — implement via `URLSessionDelegate` for additional security |

---

## Architecture: MVVM

```
Views → ViewModels → Services → Firebase / Plaid / Keychain
```

All ViewModels use `@MainActor` + `async/await`. Services are singletons accessed via `.shared`.

---

## Firestore Data Model

```
users/{uid}/
  meta/profile          ← UserProfile document
  accounts/{accountId}  ← Account documents
  transactions/{txnId}  ← Transaction documents
  budgets/{budgetId}    ← Budget documents
```

---

## File Index (41 files)

### iOS Source (34 files)
- `MansajeBudgetApp.swift` — App entry point, Firebase init
- `ContentView.swift` — Auth gate, biometric lock screen
- `Models/` — User, Account, Transaction, Budget, Category
- `Services/` — AuthService, FirestoreService, PlaidService, KeychainService, BiometricService
- `ViewModels/` — Auth, Dashboard, Transactions, Budget, Accounts, Reports
- `Views/Auth/` — LoginView, SignUpView
- `Views/Main/` — MainTabView
- `Views/Dashboard/` — DashboardView
- `Views/Transactions/` — TransactionsView, AddTransactionView, TransactionDetailView
- `Views/Budget/` — BudgetView, BudgetDetailView
- `Views/Accounts/` — AccountsView, LinkAccountView
- `Views/Reports/` — ReportsView
- `Views/Settings/` — SettingsView
- `Utilities/` — Constants, Extensions, Formatters

### Backend (6 files)
- `server.js` — Express app
- `routes/plaid.js` — Plaid API proxy routes
- `routes/webhooks.js` — Plaid webhook handler
- `middleware/auth.js` — Firebase token verification
- `package.json`
- `.env.example`

---

## License

MIT
