import SwiftUI

struct CategorySpend: Identifiable {
    let id = UUID()
    let category: TransactionCategory
    let amount: Double
    let percentage: Double
}

struct MonthlyTotal: Identifiable {
    let id = UUID()
    let month: Date
    let spending: Double
    let income: Double
}

@MainActor
final class ReportsViewModel: ObservableObject {
    @Published var categorySpends: [CategorySpend] = []
    @Published var monthlyTotals: [MonthlyTotal] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let firestoreService = FirestoreService.shared

    func load(uid: String) {
        isLoading = true
        Task {
            defer { isLoading = false }
            await computeReports(uid: uid)
        }
    }

    private func computeReports(uid: String) async {
        do {
            // Fetch last 6 months
            let calendar = Calendar.current
            let now = Date()
            var allTransactions: [Transaction] = []

            for offset in 0..<6 {
                guard let date = calendar.date(byAdding: .month, value: -offset, to: now) else { continue }
                let month = calendar.component(.month, from: date)
                let year = calendar.component(.year, from: date)
                let txns = try await firestoreService.fetchTransactions(uid: uid, for: month, year: year)
                allTransactions.append(contentsOf: txns)

                // Build monthly total
                let spending = txns.filter(\.isExpense).reduce(0) { $0 + $1.amount }
                let income = txns.filter(\.isIncome).reduce(0) { $0 + abs($1.amount) }
                let startOfMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: date))!
                monthlyTotals.append(MonthlyTotal(month: startOfMonth, spending: spending, income: income))
            }

            monthlyTotals.sort { $0.month < $1.month }

            // Build category breakdown for current month
            let currentMonth = calendar.component(.month, from: now)
            let currentYear = calendar.component(.year, from: now)
            let currentMonthTxns = allTransactions.filter {
                let comps = calendar.dateComponents([.month, .year], from: $0.date)
                return comps.month == currentMonth && comps.year == currentYear && $0.isExpense
            }

            let totalExpenses = currentMonthTxns.reduce(0) { $0 + $1.amount }

            let grouped = Dictionary(grouping: currentMonthTxns, by: \.category)
            categorySpends = grouped.map { category, txns in
                let amount = txns.reduce(0) { $0 + $1.amount }
                let percentage = totalExpenses > 0 ? amount / totalExpenses : 0
                return CategorySpend(category: category, amount: amount, percentage: percentage)
            }.sorted { $0.amount > $1.amount }

        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
