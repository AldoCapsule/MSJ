import Foundation

enum Constants {
    enum Backend {
        // Replace with your deployed backend URL
        static let baseURL = "https://your-backend.example.com"

        // Legacy Plaid proxy (v0)
        static let createLinkToken  = "\(baseURL)/plaid/create_link_token"
        static let exchangeToken    = "\(baseURL)/plaid/exchange_public_token"
        static let syncTransactions = "\(baseURL)/plaid/transactions/sync"
        static let accounts         = "\(baseURL)/plaid/accounts"

        // v1 API
        enum V1 {
            static let base = "\(baseURL)/v1"

            // Categories
            static let categories        = "\(base)/categories"
            static func category(_ id: String) -> String { "\(base)/categories/\(id)" }

            // Transactions
            static let transactions      = "\(base)/transactions"
            static func transaction(_ id: String) -> String { "\(base)/transactions/\(id)" }
            static func transactionSplits(_ id: String) -> String { "\(base)/transactions/\(id)/splits" }
            static func transactionReview(_ id: String) -> String { "\(base)/transactions/\(id)/review" }
            static let transactionsBulkEdit = "\(base)/transactions/bulk-edit"
            static let transfersRecompute   = "\(base)/transfers/recompute"

            // Budgets
            static let budgets           = "\(base)/budgets"
            static func budget(_ id: String) -> String { "\(base)/budgets/\(id)" }
            static func budgetRollovers(_ id: String) -> String { "\(base)/budgets/\(id)/rollovers" }

            // Goals
            static let goals             = "\(base)/goals"
            static func goal(_ id: String) -> String { "\(base)/goals/\(id)" }
            static func goalProjection(_ id: String) -> String { "\(base)/goals/\(id)/projection" }

            // Alerts
            static let alertRules        = "\(base)/alerts/rules"
            static func alertRule(_ id: String) -> String { "\(base)/alerts/rules/\(id)" }
            static let alertEvents       = "\(base)/alerts/events"
            static func acknowledgeAlert(_ id: String) -> String { "\(base)/alerts/events/\(id)/acknowledge" }

            // Connections
            static let connections       = "\(base)/connections"
            static func connection(_ id: String) -> String { "\(base)/connections/\(id)" }
            static func connectionRefresh(_ id: String) -> String { "\(base)/connections/\(id)/refresh" }
            static func connectionRepair(_ id: String) -> String { "\(base)/connections/\(id)/repair" }
            static func connectionJobs(_ id: String) -> String { "\(base)/connections/\(id)/refresh-jobs" }

            // Reports
            static let dashboard         = "\(base)/reports/dashboard"
            static let reportSpending    = "\(base)/reports/spending"
            static let reportCashflow    = "\(base)/reports/cashflow"
            static let reportNetWorth    = "\(base)/reports/networth"

            // Accounts
            static let accountsV1        = "\(base)/accounts"
            static func accountV1(_ id: String) -> String { "\(base)/accounts/\(id)" }

            // Rules
            static let rules             = "\(base)/rules"
            static func rule(_ id: String) -> String { "\(base)/rules/\(id)" }
            static func applyRule(_ id: String) -> String { "\(base)/rules/\(id)/apply" }

            // Recurring
            static let recurring         = "\(base)/recurring"
            static let recurringRecompute = "\(base)/recurring/recompute"
            static let recurringUpcoming = "\(base)/recurring/upcoming"

            // Insights
            static let insightsMonthly   = "\(base)/insights/monthly"

            // Investments
            static let holdings          = "\(base)/investments/holdings"
            static let investmentPerf    = "\(base)/investments/performance"
            static let investmentSync    = "\(base)/investments/sync"

            // Exports & Privacy
            static let exports           = "\(base)/exports"
            static func export_(_ id: String) -> String { "\(base)/exports/\(id)" }
            static let privacyDelete     = "\(base)/privacy/delete"
            static func privacyDeleteStatus(_ id: String) -> String { "\(base)/privacy/delete/\(id)/status" }
        }
    }

    enum Firestore {
        static let users             = "users"
        static let accounts          = "accounts"
        static let transactions      = "transactions"
        static let budgets           = "budgets"
        static let profile           = "profile"
        static let goals             = "goals"
        static let alertRules        = "alert_rules"
        static let alertEvents       = "alert_events"
        static let categories        = "categories"
        static let recurringEntities = "recurring_entities"
        static let rules             = "rules"
        static let holdings          = "holdings"
        static let connections       = "connections"
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
