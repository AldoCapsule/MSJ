import Foundation

enum TransactionType: String, Codable {
    case debit
    case credit
}

enum ReviewStatus: String, Codable {
    case unreviewed
    case reviewed
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
    // New fields (all optional/defaulted for backwards compat)
    var isHidden: Bool
    var reviewStatus: ReviewStatus
    var reviewedAt: Date?
    var isSplit: Bool
    var isTransfer: Bool
    var transferMatchId: String?
    var normalizedFingerprint: String?
    var lineageGroupId: String?
    var rawDescription: String?

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
        plaidTransactionId: String? = nil,
        isHidden: Bool = false,
        reviewStatus: ReviewStatus = .unreviewed,
        reviewedAt: Date? = nil,
        isSplit: Bool = false,
        isTransfer: Bool = false,
        transferMatchId: String? = nil,
        normalizedFingerprint: String? = nil,
        lineageGroupId: String? = nil,
        rawDescription: String? = nil
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
        self.isHidden = isHidden
        self.reviewStatus = reviewStatus
        self.reviewedAt = reviewedAt
        self.isSplit = isSplit
        self.isTransfer = isTransfer
        self.transferMatchId = transferMatchId
        self.normalizedFingerprint = normalizedFingerprint
        self.lineageGroupId = lineageGroupId
        self.rawDescription = rawDescription
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
            "isManual": isManual,
            "isHidden": isHidden,
            "reviewStatus": reviewStatus.rawValue,
            "isSplit": isSplit,
            "isTransfer": isTransfer
        ]
        if let notes = notes { data["notes"] = notes }
        if let plaidId = plaidTransactionId { data["plaidTransactionId"] = plaidId }
        if let reviewed = reviewedAt { data["reviewedAt"] = reviewed }
        if let matchId = transferMatchId { data["transferMatchId"] = matchId }
        if let fp = normalizedFingerprint { data["normalizedFingerprint"] = fp }
        if let lg = lineageGroupId { data["lineageGroupId"] = lg }
        if let raw = rawDescription { data["rawDescription"] = raw }
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

        let reviewRaw = data["reviewStatus"] as? String ?? "unreviewed"
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
            plaidTransactionId: data["plaidTransactionId"] as? String,
            isHidden: data["isHidden"] as? Bool ?? false,
            reviewStatus: ReviewStatus(rawValue: reviewRaw) ?? .unreviewed,
            reviewedAt: data["reviewedAt"] as? Date,
            isSplit: data["isSplit"] as? Bool ?? false,
            isTransfer: data["isTransfer"] as? Bool ?? false,
            transferMatchId: data["transferMatchId"] as? String,
            normalizedFingerprint: data["normalizedFingerprint"] as? String,
            lineageGroupId: data["lineageGroupId"] as? String,
            rawDescription: data["rawDescription"] as? String
        )
    }
}
