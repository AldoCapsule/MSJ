import Foundation

enum TransactionType: String, Codable {
    case debit
    case credit
}

struct Transaction: Identifiable, Codable {
    let id: String
    var amount: Double          // Positive = debit (expense), negative = credit (income)
    var date: Date
    var name: String            // Merchant / payee name
    var category: TransactionCategory
    var accountId: String
    var userId: String
    var notes: String?
    var isPending: Bool
    var isManual: Bool          // User-entered vs Plaid-synced
    var plaidTransactionId: String?

    var isExpense: Bool { amount > 0 }
    var isIncome: Bool { amount < 0 }
    var absoluteAmount: Double { abs(amount) }

    init(
        id: String = UUID().uuidString,
        amount: Double,
        date: Date = Date(),
        name: String,
        category: TransactionCategory = .other,
        accountId: String,
        userId: String,
        notes: String? = nil,
        isPending: Bool = false,
        isManual: Bool = false,
        plaidTransactionId: String? = nil
    ) {
        self.id = id
        self.amount = amount
        self.date = date
        self.name = name
        self.category = category
        self.accountId = accountId
        self.userId = userId
        self.notes = notes
        self.isPending = isPending
        self.isManual = isManual
        self.plaidTransactionId = plaidTransactionId
    }
}

extension Transaction {
    var firestoreData: [String: Any] {
        var data: [String: Any] = [
            "id": id,
            "amount": amount,
            "date": date,
            "name": name,
            "category": category.rawValue,
            "accountId": accountId,
            "userId": userId,
            "isPending": isPending,
            "isManual": isManual
        ]
        if let notes = notes { data["notes"] = notes }
        if let plaidId = plaidTransactionId { data["plaidTransactionId"] = plaidId }
        return data
    }

    static func from(_ data: [String: Any], id: String) -> Transaction? {
        guard
            let amount = data["amount"] as? Double,
            let date = data["date"] as? Date,
            let name = data["name"] as? String,
            let categoryRaw = data["category"] as? String,
            let category = TransactionCategory(rawValue: categoryRaw),
            let accountId = data["accountId"] as? String,
            let userId = data["userId"] as? String
        else { return nil }

        return Transaction(
            id: id,
            amount: amount,
            date: date,
            name: name,
            category: category,
            accountId: accountId,
            userId: userId,
            notes: data["notes"] as? String,
            isPending: data["isPending"] as? Bool ?? false,
            isManual: data["isManual"] as? Bool ?? false,
            plaidTransactionId: data["plaidTransactionId"] as? String
        )
    }
}
