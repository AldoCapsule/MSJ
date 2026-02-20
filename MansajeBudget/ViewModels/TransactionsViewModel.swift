import SwiftUI
import FirebaseFirestore

@MainActor
final class TransactionsViewModel: ObservableObject {
    @Published var transactions: [Transaction] = []
    @Published var filteredTransactions: [Transaction] = []
    @Published var searchText = "" {
        didSet { applyFilters() }
    }
    @Published var selectedCategory: TransactionCategory? = nil {
        didSet { applyFilters() }
    }
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showAddTransaction = false

    private let firestoreService = FirestoreService.shared
    private var listener: ListenerRegistration?
    private var uid: String = ""

    var groupedTransactions: [(Date, [Transaction])] {
        let grouped = Dictionary(grouping: filteredTransactions) { txn in
            Calendar.current.startOfDay(for: txn.date)
        }
        return grouped.sorted { $0.key > $1.key }
    }

    func load(uid: String) {
        self.uid = uid
        isLoading = true
        listener = firestoreService.listenTransactions(uid: uid, limit: 200) { [weak self] txns in
            self?.transactions = txns
            self?.applyFilters()
            self?.isLoading = false
        }
    }

    func addTransaction(_ txn: Transaction) {
        Task {
            do {
                try await firestoreService.saveTransaction(txn)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func updateTransaction(_ txn: Transaction) {
        Task {
            do {
                try await firestoreService.saveTransaction(txn)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func deleteTransaction(_ txn: Transaction) {
        Task {
            do {
                try await firestoreService.deleteTransaction(uid: uid, transactionId: txn.id)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Filters
    private func applyFilters() {
        var result = transactions

        if !searchText.isEmpty {
            result = result.filter {
                $0.name.localizedCaseInsensitiveContains(searchText) ||
                $0.category.displayName.localizedCaseInsensitiveContains(searchText)
            }
        }

        if let category = selectedCategory {
            result = result.filter { $0.category == category }
        }

        filteredTransactions = result
    }

    func clearFilters() {
        searchText = ""
        selectedCategory = nil
    }

    deinit {
        listener?.remove()
    }
}
