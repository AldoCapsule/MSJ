import SwiftUI
import FirebaseFirestore

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var accounts: [Account] = []
    @Published var recentTransactions: [Transaction] = []
    @Published var budgets: [Budget] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let firestoreService = FirestoreService.shared
    private var accountsListener: ListenerRegistration?
    private var transactionsListener: ListenerRegistration?

    var netWorth: Double {
        accounts.reduce(0) { sum, account in
            switch account.type {
            case .credit, .loan: return sum - account.balance
            default:             return sum + account.balance
            }
        }
    }

    var totalAssets: Double {
        accounts.filter { $0.type != .credit && $0.type != .loan }
            .reduce(0) { $0 + $1.balance }
    }

    var totalLiabilities: Double {
        accounts.filter { $0.type == .credit || $0.type == .loan }
            .reduce(0) { $0 + $1.balance }
    }

    var monthlySpending: Double {
        let calendar = Calendar.current
        let now = Date()
        let month = calendar.component(.month, from: now)
        let year = calendar.component(.year, from: now)
        return recentTransactions
            .filter { txn in
                let components = calendar.dateComponents([.month, .year], from: txn.date)
                return components.month == month && components.year == year && txn.isExpense
            }
            .reduce(0) { $0 + $1.amount }
    }

    var budgetSummary: (spent: Double, total: Double) {
        let total = budgets.reduce(0) { $0 + $1.limit }
        let spent = budgets.reduce(0) { $0 + $1.spent }
        return (spent, total)
    }

    func load(uid: String) {
        isLoading = true
        startListening(uid: uid)
        Task {
            defer { isLoading = false }
            await loadBudgets(uid: uid)
        }
    }

    func startListening(uid: String) {
        accountsListener = firestoreService.listenAccounts(uid: uid) { [weak self] accounts in
            self?.accounts = accounts
        }
        transactionsListener = firestoreService.listenTransactions(uid: uid, limit: 20) { [weak self] txns in
            self?.recentTransactions = txns
        }
    }

    func stopListening() {
        accountsListener?.remove()
        transactionsListener?.remove()
    }

    private func loadBudgets(uid: String) async {
        let calendar = Calendar.current
        let now = Date()
        let month = calendar.component(.month, from: now)
        let year = calendar.component(.year, from: now)
        do {
            budgets = try await firestoreService.fetchBudgets(uid: uid, month: month, year: year)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    deinit {
        accountsListener?.remove()
        transactionsListener?.remove()
    }
}
