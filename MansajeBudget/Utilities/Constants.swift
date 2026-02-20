import Foundation

enum Constants {
    enum Backend {
        // Replace with your deployed backend URL
        static let baseURL = "https://your-backend.example.com"

        static let createLinkToken  = "\(baseURL)/plaid/create_link_token"
        static let exchangeToken    = "\(baseURL)/plaid/exchange_public_token"
        static let syncTransactions = "\(baseURL)/plaid/transactions/sync"
        static let accounts         = "\(baseURL)/plaid/accounts"
    }

    enum Firestore {
        static let users        = "users"
        static let accounts     = "accounts"
        static let transactions = "transactions"
        static let budgets      = "budgets"
        static let profile      = "profile"
    }

    enum Keychain {
        static let plaidAccessTokenPrefix = "mansaje_plaid_"
        static let service = "com.mansajebudget.app"
    }

    enum Defaults {
        static let currency = "USD"
        static let pageSize = 50
    }
}
