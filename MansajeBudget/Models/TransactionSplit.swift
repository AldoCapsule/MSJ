import Foundation

struct TransactionSplit: Identifiable, Codable {
    let id: String
    var transactionId: String
    var categoryId: String       // References UserCategory.id or TransactionCategory.rawValue
    var amount: Double
    var memo: String?

    init(
        id: String = UUID().uuidString,
        transactionId: String,
        categoryId: String,
        amount: Double,
        memo: String? = nil
    ) {
        self.id = id; self.transactionId = transactionId
        self.categoryId = categoryId; self.amount = amount; self.memo = memo
    }
}

extension TransactionSplit {
    var firestoreData: [String: Any] {
        var data: [String: Any] = ["id": id, "txn_id": transactionId,
                                   "category_id": categoryId, "amount": amount]
        if let memo = memo { data["memo"] = memo }
        return data
    }

    static func from(_ data: [String: Any], id: String) -> TransactionSplit? {
        guard
            let transactionId = data["txn_id"] as? String,
            let categoryId = data["category_id"] as? String,
            let amount = data["amount"] as? Double
        else { return nil }
        return TransactionSplit(id: id, transactionId: transactionId,
                                categoryId: categoryId, amount: amount,
                                memo: data["memo"] as? String)
    }
}
