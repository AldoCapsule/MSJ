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

    // MARK: - Goals
    func saveGoal(_ goal: Goal) async throws {
        try await goalsCol(uid: goal.userId).document(goal.id).setData(goal.firestoreData, merge: true)
    }

    func fetchGoals(uid: String) async throws -> [Goal] {
        let snap = try await goalsCol(uid: uid).order(by: "created_at", descending: true).getDocuments()
        return snap.documents.compactMap { Goal.from($0.data(), id: $0.documentID) }
    }

    func deleteGoal(uid: String, goalId: String) async throws {
        try await goalsCol(uid: uid).document(goalId).delete()
    }

    // MARK: - Alert Rules
    func saveAlertRule(_ rule: AlertRule) async throws {
        try await alertRulesCol(uid: rule.userId).document(rule.id).setData(rule.firestoreData, merge: true)
    }

    func fetchAlertRules(uid: String) async throws -> [AlertRule] {
        let snap = try await alertRulesCol(uid: uid).order(by: "created_at", descending: true).getDocuments()
        return snap.documents.compactMap { AlertRule.from($0.data(), id: $0.documentID) }
    }

    func deleteAlertRule(uid: String, ruleId: String) async throws {
        try await alertRulesCol(uid: uid).document(ruleId).delete()
    }

    func fetchAlertEvents(uid: String) async throws -> [AlertEvent] {
        let snap = try await userDoc(uid).collection(Constants.Firestore.alertEvents)
            .order(by: "firedAt", descending: true).limit(to: 100).getDocuments()
        return snap.documents.compactMap { d -> AlertEvent? in
            let data = d.data()
            guard let ruleId = data["alert_rule_id"] as? String,
                  let firedAt = data["fired_at"] as? Date else { return nil }
            return AlertEvent(id: d.documentID, alertRuleId: ruleId, firedAt: firedAt,
                              payload: data["payload"] as? [String: String] ?? [:],
                              acknowledgedAt: data["acknowledged_at"] as? Date)
        }
    }

    // MARK: - Categories
    func saveUserCategory(_ category: UserCategory) async throws {
        try await categoriesCol(uid: category.userId).document(category.id).setData(category.firestoreData, merge: true)
    }

    func fetchUserCategories(uid: String) async throws -> [UserCategory] {
        let snap = try await categoriesCol(uid: uid).order(by: "name").getDocuments()
        return snap.documents.compactMap { UserCategory.from($0.data(), id: $0.documentID) }
    }

    func deleteUserCategory(uid: String, categoryId: String) async throws {
        try await categoriesCol(uid: uid).document(categoryId).delete()
    }

    // MARK: - Recurring Entities
    func fetchRecurringEntities(uid: String) async throws -> [RecurringEntity] {
        let snap = try await recurringCol(uid: uid).order(by: "next_due_date").getDocuments()
        return snap.documents.compactMap { RecurringEntity.from($0.data(), id: $0.documentID) }
    }

    // MARK: - Categorization Rules
    func saveRule(_ rule: CategorizationRule) async throws {
        try await rulesCol(uid: rule.userId).document(rule.id).setData(rule.firestoreData, merge: true)
    }

    func fetchRules(uid: String) async throws -> [CategorizationRule] {
        let snap = try await rulesCol(uid: uid).order(by: "priority").getDocuments()
        return snap.documents.compactMap { CategorizationRule.from($0.data(), id: $0.documentID) }
    }

    func deleteRule(uid: String, ruleId: String) async throws {
        try await rulesCol(uid: uid).document(ruleId).delete()
    }

    // MARK: - Holdings
    func fetchHoldings(uid: String) async throws -> [Holding] {
        let snap = try await holdingsCol(uid: uid).order(by: "symbol").getDocuments()
        return snap.documents.compactMap { Holding.from($0.data(), id: $0.documentID) }
    }

    // MARK: - Transaction Splits
    func saveTransactionSplits(_ splits: [TransactionSplit], transactionId: String, uid: String) async throws {
        let batch = db.batch()
        let splitsCol = transactionsCol(uid: uid).document(transactionId).collection("splits")
        for split in splits {
            batch.setData(split.firestoreData, forDocument: splitsCol.document(split.id))
        }
        try await batch.commit()
        try await transactionsCol(uid: uid).document(transactionId).updateData(["isSplit": true])
    }

    func fetchTransactionSplits(uid: String, transactionId: String) async throws -> [TransactionSplit] {
        let snap = try await transactionsCol(uid: uid).document(transactionId)
            .collection("splits").getDocuments()
        return snap.documents.compactMap { TransactionSplit.from($0.data(), id: $0.documentID) }
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

    private func goalsCol(uid: String) -> CollectionReference {
        userDoc(uid).collection(Constants.Firestore.goals)
    }

    private func alertRulesCol(uid: String) -> CollectionReference {
        userDoc(uid).collection(Constants.Firestore.alertRules)
    }

    private func categoriesCol(uid: String) -> CollectionReference {
        userDoc(uid).collection(Constants.Firestore.categories)
    }

    private func recurringCol(uid: String) -> CollectionReference {
        userDoc(uid).collection(Constants.Firestore.recurringEntities)
    }

    private func rulesCol(uid: String) -> CollectionReference {
        userDoc(uid).collection(Constants.Firestore.rules)
    }

    private func holdingsCol(uid: String) -> CollectionReference {
        userDoc(uid).collection(Constants.Firestore.holdings)
    }
}
