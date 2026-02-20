import SwiftUI

@MainActor
final class BudgetViewModel: ObservableObject {
    @Published var budgets: [Budget] = []
    @Published var transactions: [Transaction] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let firestoreService = FirestoreService.shared
    private var uid: String = ""
    private(set) var selectedMonth: Int
    private(set) var selectedYear: Int

    init() {
        let cal = Calendar.current
        let now = Date()
        selectedMonth = cal.component(.month, from: now)
        selectedYear = cal.component(.year, from: now)
    }

    var totalLimit: Double { budgets.reduce(0) { $0 + $1.limit } }
    var totalSpent: Double { budgets.reduce(0) { $0 + $1.spent } }
    var overBudgetCount: Int { budgets.filter(\.isOverBudget).count }

    func load(uid: String) {
        self.uid = uid
        Task { await fetchAll() }
    }

    func fetchAll() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let budgetsFetch = firestoreService.fetchBudgets(uid: uid, month: selectedMonth, year: selectedYear)
            async let txnsFetch = firestoreService.fetchTransactions(uid: uid, for: selectedMonth, year: selectedYear)
            (budgets, transactions) = try await (budgetsFetch, txnsFetch)
            reconcileSpent()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reconcileSpent() {
        for i in budgets.indices {
            let category = budgets[i].category
            let spent = transactions
                .filter { $0.category == category && $0.isExpense }
                .reduce(0) { $0 + $1.amount }
            budgets[i].spent = spent
        }
    }

    func addBudget(category: TransactionCategory, limit: Double) {
        let budget = Budget(
            category: category,
            limit: limit,
            month: selectedMonth,
            year: selectedYear,
            userId: uid
        )
        Task {
            do {
                try await firestoreService.saveBudget(budget)
                budgets.append(budget)
                reconcileSpent()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func updateBudget(_ budget: Budget) {
        Task {
            do {
                try await firestoreService.saveBudget(budget)
                if let idx = budgets.firstIndex(where: { $0.id == budget.id }) {
                    budgets[idx] = budget
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func deleteBudget(_ budget: Budget) {
        Task {
            do {
                try await firestoreService.deleteBudget(uid: uid, budgetId: budget.id)
                budgets.removeAll { $0.id == budget.id }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func navigateMonth(forward: Bool) {
        var month = selectedMonth + (forward ? 1 : -1)
        var year = selectedYear
        if month > 12 { month = 1; year += 1 }
        if month < 1  { month = 12; year -= 1 }
        selectedMonth = month
        selectedYear = year
        Task { await fetchAll() }
    }
}
