import Foundation
import FirebaseFirestore

@MainActor
final class FirestoreService {
    static let shared = FirestoreService()
    private let db = Firestore.firestore()

    private init() {}

    // MARK: - User Profile
    func saveProfile(_ profile: UserProfile) async throws {
        try await userDoc(profile.id)
            .collection(Constants.Firestore.profile.isEmpty ? "profile" : "meta")
            .document("profile")
            .setData(profile.firestoreData, merge: true)
    }

    func fetchProfile(uid: String) async throws -> UserProfile? {
        let snap = try await userDoc(uid).collection("meta").document("profile").getDocument()
        guard let data = snap.data() else { return nil }
        return UserProfile.from(data)
    }

    // MARK: - Accounts
    func saveAccount(_ account: Account) async throws {
        try await accountsCol(uid: account.userId)
            .document(account.id)
            .setData(account.firestoreData, merge: true)
    }

    func fetchAccounts(uid: String) async throws -> [Account] {
        let snap = try await accountsCol(uid: uid).getDocuments()
        return snap.documents.compactMap { Account.from($0.data(), id: $0.documentID) }
    }

    func deleteAccount(uid: String, accountId: String) async throws {
        try await accountsCol(uid: uid).document(accountId).delete()
    }

    func listenAccounts(uid: String, onChange: @escaping ([Account]) -> Void) -> ListenerRegistration {
        accountsCol(uid: uid).addSnapshotListener { snap, _ in
            guard let snap else { return }
            let accounts = snap.documents.compactMap { Account.from($0.data(), id: $0.documentID) }
            onChange(accounts)
        }
    }

    // MARK: - Transactions
    func saveTransaction(_ txn: Transaction) async throws {
        try await transactionsCol(uid: txn.userId)
            .document(txn.id)
            .setData(txn.firestoreData, merge: true)
    }

    func fetchTransactions(uid: String, limit: Int = 100) async throws -> [Transaction] {
        let snap = try await transactionsCol(uid: uid)
            .order(by: "date", descending: true)
            .limit(to: limit)
            .getDocuments()
        return snap.documents.compactMap { Transaction.from($0.data(), id: $0.documentID) }
    }

    func fetchTransactions(uid: String, for month: Int, year: Int) async throws -> [Transaction] {
        let calendar = Calendar.current
        var startComps = DateComponents(year: year, month: month, day: 1)
        var endComps = DateComponents(year: year, month: month + 1, day: 1)
        if month == 12 {
            endComps = DateComponents(year: year + 1, month: 1, day: 1)
        }
        let start = calendar.date(from: startComps)!
        let end = calendar.date(from: endComps)!

        let snap = try await transactionsCol(uid: uid)
            .whereField("date", isGreaterThanOrEqualTo: start)
            .whereField("date", isLessThan: end)
            .order(by: "date", descending: true)
            .getDocuments()
        return snap.documents.compactMap { Transaction.from($0.data(), id: $0.documentID) }
    }

    func deleteTransaction(uid: String, transactionId: String) async throws {
        try await transactionsCol(uid: uid).document(transactionId).delete()
    }

    func listenTransactions(uid: String, limit: Int = 50, onChange: @escaping ([Transaction]) -> Void) -> ListenerRegistration {
        transactionsCol(uid: uid)
            .order(by: "date", descending: true)
            .limit(to: limit)
            .addSnapshotListener { snap, _ in
                guard let snap else { return }
                let txns = snap.documents.compactMap { Transaction.from($0.data(), id: $0.documentID) }
                onChange(txns)
            }
    }

    // MARK: - Budgets
    func saveBudget(_ budget: Budget) async throws {
        try await budgetsCol(uid: budget.userId)
            .document(budget.id)
            .setData(budget.firestoreData, merge: true)
    }

    func fetchBudgets(uid: String, month: Int, year: Int) async throws -> [Budget] {
        let snap = try await budgetsCol(uid: uid)
            .whereField("month", isEqualTo: month)
            .whereField("year", isEqualTo: year)
            .getDocuments()
        return snap.documents.compactMap { Budget.from($0.data(), id: $0.documentID) }
    }

    func deleteBudget(uid: String, budgetId: String) async throws {
        try await budgetsCol(uid: uid).document(budgetId).delete()
    }

    // MARK: - Helpers
    private func userDoc(_ uid: String) -> DocumentReference {
        db.collection(Constants.Firestore.users).document(uid)
    }

    private func accountsCol(uid: String) -> CollectionReference {
        userDoc(uid).collection(Constants.Firestore.accounts)
    }

    private func transactionsCol(uid: String) -> CollectionReference {
        userDoc(uid).collection(Constants.Firestore.transactions)
    }

    private func budgetsCol(uid: String) -> CollectionReference {
        userDoc(uid).collection(Constants.Firestore.budgets)
    }
}
