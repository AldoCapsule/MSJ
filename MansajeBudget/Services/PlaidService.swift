import Foundation
import LinkKit

@MainActor
final class PlaidService: ObservableObject {
    static let shared = PlaidService()
    private let authService = AuthService.shared

    private init() {}

    // MARK: - Create Link Token
    func createLinkToken() async throws -> String {
        let idToken = try await authService.getIDToken()
        var request = URLRequest(url: URL(string: Constants.Backend.createLinkToken)!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response, data: data)

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let linkToken = json?["link_token"] as? String else {
            throw PlaidError.invalidResponse("Missing link_token in response")
        }
        return linkToken
    }

    // MARK: - Exchange Public Token
    func exchangePublicToken(_ publicToken: String, institutionId: String, institutionName: String) async throws -> String {
        let idToken = try await authService.getIDToken()
        var request = URLRequest(url: URL(string: Constants.Backend.exchangeToken)!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "public_token": publicToken,
            "institution_id": institutionId,
            "institution_name": institutionName
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response, data: data)

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let accessToken = json?["access_token"] as? String else {
            throw PlaidError.invalidResponse("Missing access_token in response")
        }
        return accessToken
    }

    // MARK: - Fetch Transactions
    func syncTransactions(accessToken: String) async throws -> [Transaction] {
        guard let uid = AuthService.shared.currentUser?.uid else { throw AuthError.notAuthenticated }
        let idToken = try await authService.getIDToken()

        var request = URLRequest(url: URL(string: Constants.Backend.syncTransactions)!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["access_token": accessToken])

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response, data: data)

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let added = json?["added"] as? [[String: Any]] ?? []
        return added.compactMap { plaidTxn -> Transaction? in
            guard
                let plaidId = plaidTxn["transaction_id"] as? String,
                let name = plaidTxn["name"] as? String,
                let amount = plaidTxn["amount"] as? Double,
                let dateString = plaidTxn["date"] as? String,
                let date = Formatters.isoDate.date(from: dateString),
                let accountId = plaidTxn["account_id"] as? String
            else { return nil }

            let plaidCategories = plaidTxn["category"] as? [String] ?? []
            let category = TransactionCategory.from(plaidCategories: plaidCategories)

            return Transaction(
                id: UUID().uuidString,
                amount: amount,
                date: date,
                name: name,
                category: category,
                accountId: accountId,
                userId: uid,
                isPending: plaidTxn["pending"] as? Bool ?? false,
                isManual: false,
                plaidTransactionId: plaidId
            )
        }
    }

    // MARK: - Fetch Accounts
    func fetchAccounts(accessToken: String) async throws -> [[String: Any]] {
        let idToken = try await authService.getIDToken()
        var request = URLRequest(url: URL(string: Constants.Backend.accounts)!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["access_token": accessToken])

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response, data: data)

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return json?["accounts"] as? [[String: Any]] ?? []
    }

    // MARK: - Plaid Link Handler
    func createLinkHandler(token: String, onSuccess: @escaping (String, String, String) -> Void, onExit: @escaping () -> Void) throws -> Handler {
        var config = LinkTokenConfiguration(token: token) { success in
            let publicToken = success.publicToken
            let institutionId = success.metadata.institution?.id ?? ""
            let institutionName = success.metadata.institution?.name ?? "Unknown"
            onSuccess(publicToken, institutionId, institutionName)
        }
        config.onExit = { _ in onExit() }

        let result = Plaid.create(config)
        switch result {
        case .success(let handler): return handler
        case .failure(let error):  throw error
        }
    }

    // MARK: - Private
    private func validateHTTPResponse(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw PlaidError.networkError("Invalid response")
        }
        guard (200...299).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw PlaidError.serverError(http.statusCode, msg)
        }
    }
}

enum PlaidError: LocalizedError {
    case invalidResponse(String)
    case networkError(String)
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse(let msg): return "Invalid response: \(msg)"
        case .networkError(let msg):    return "Network error: \(msg)"
        case .serverError(let code, let msg): return "Server error \(code): \(msg)"
        }
    }
}
