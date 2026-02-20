import SwiftUI
import FirebaseFirestore

@MainActor
final class AccountsViewModel: ObservableObject {
    @Published var accounts: [Account] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showLinkSheet = false
    @Published var linkToken: String?

    private let firestoreService = FirestoreService.shared
    private let plaidService = PlaidService.shared
    private let keychainService = KeychainService.shared
    private var listener: ListenerRegistration?
    private var uid: String = ""

    var totalBalance: Double {
        accounts.reduce(0) { $0 + $1.balance }
    }

    func load(uid: String) {
        self.uid = uid
        listener = firestoreService.listenAccounts(uid: uid) { [weak self] accounts in
            self?.accounts = accounts
        }
    }

    // MARK: - Plaid Link
    func startPlaidLink() {
        isLoading = true
        Task {
            defer { isLoading = false }
            do {
                linkToken = try await plaidService.createLinkToken()
                showLinkSheet = true
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func handlePlaidSuccess(publicToken: String, institutionId: String, institutionName: String) {
        isLoading = true
        Task {
            defer { isLoading = false }
            do {
                let accessToken = try await plaidService.exchangePublicToken(
                    publicToken,
                    institutionId: institutionId,
                    institutionName: institutionName
                )

                // Fetch accounts from Plaid
                let plaidAccounts = try await plaidService.fetchAccounts(accessToken: accessToken)

                for plaidAccount in plaidAccounts {
                    guard let plaidId = plaidAccount["account_id"] as? String,
                          let name = plaidAccount["name"] as? String else { continue }

                    let balances = plaidAccount["balances"] as? [String: Any]
                    let balance = balances?["available"] as? Double ?? balances?["current"] as? Double ?? 0

                    let typeRaw = plaidAccount["type"] as? String ?? ""
                    let accountType: AccountType = {
                        switch typeRaw {
                        case "depository":
                            let sub = plaidAccount["subtype"] as? String ?? ""
                            return sub == "savings" ? .savings : .checking
                        case "credit":    return .credit
                        case "investment": return .investment
                        case "loan":      return .loan
                        default:          return .other
                        }
                    }()

                    let account = Account(
                        name: name,
                        type: accountType,
                        balance: balance,
                        institutionName: institutionName,
                        mask: plaidAccount["mask"] as? String,
                        userId: uid,
                        plaidAccountId: plaidId
                    )

                    // Store access token in Keychain
                    keychainService.savePlaidToken(accessToken, accountId: account.id)

                    // Save account to Firestore
                    try await firestoreService.saveAccount(account)

                    // Sync transactions
                    let transactions = try await plaidService.syncTransactions(accessToken: accessToken)
                    for txn in transactions {
                        try await firestoreService.saveTransaction(txn)
                    }
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func deleteAccount(_ account: Account) {
        Task {
            do {
                try await firestoreService.deleteAccount(uid: uid, accountId: account.id)
                keychainService.deletePlaidToken(for: account.id)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func refreshAccount(_ account: Account) {
        guard let accessToken = keychainService.plaidToken(for: account.id) else { return }
        isLoading = true
        Task {
            defer { isLoading = false }
            do {
                let transactions = try await plaidService.syncTransactions(accessToken: accessToken)
                for txn in transactions {
                    try await firestoreService.saveTransaction(txn)
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    deinit {
        listener?.remove()
    }
}
