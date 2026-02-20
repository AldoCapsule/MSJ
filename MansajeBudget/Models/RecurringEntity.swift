import Foundation

enum RecurringCadence: String, Codable, CaseIterable {
    case weekly
    case monthly
    case quarterly
    case annual

    var displayName: String {
        switch self {
        case .weekly:    return "Weekly"
        case .monthly:   return "Monthly"
        case .quarterly: return "Quarterly"
        case .annual:    return "Annual"
        }
    }

    var systemImage: String {
        switch self {
        case .weekly:    return "calendar.badge.clock"
        case .monthly:   return "calendar"
        case .quarterly: return "calendar.badge.checkmark"
        case .annual:    return "calendar.circle.fill"
        }
    }
}

struct PricePoint: Codable {
    var date: String      // ISO date "yyyy-MM-dd"
    var amount: Double
}

struct RecurringEntity: Identifiable, Codable {
    let id: String
    var userId: String
    var merchantName: String
    var merchantId: String?
    var cadence: RecurringCadence
    var nextDueDate: Date
    var lastAmount: Double
    var isSubscription: Bool
    var priceChangeFlag: Bool
    var priceHistory: [PricePoint]
    var isUserCreated: Bool

    var daysUntilDue: Int {
        Calendar.current.dateComponents([.day], from: Date(), to: nextDueDate).day ?? 0
    }

    var isDueSoon: Bool { daysUntilDue <= 7 && daysUntilDue >= 0 }
    var isOverdue: Bool { nextDueDate < Date() }

    init(
        id: String = UUID().uuidString,
        userId: String,
        merchantName: String,
        merchantId: String? = nil,
        cadence: RecurringCadence = .monthly,
        nextDueDate: Date,
        lastAmount: Double,
        isSubscription: Bool = false,
        priceChangeFlag: Bool = false,
        priceHistory: [PricePoint] = [],
        isUserCreated: Bool = false
    ) {
        self.id = id; self.userId = userId; self.merchantName = merchantName
        self.merchantId = merchantId; self.cadence = cadence
        self.nextDueDate = nextDueDate; self.lastAmount = lastAmount
        self.isSubscription = isSubscription; self.priceChangeFlag = priceChangeFlag
        self.priceHistory = priceHistory; self.isUserCreated = isUserCreated
    }
}

extension RecurringEntity {
    var firestoreData: [String: Any] {
        var data: [String: Any] = [
            "id": id, "user_id": userId, "merchant_name": merchantName,
            "cadence": cadence.rawValue, "next_due_date": nextDueDate,
            "last_amount": lastAmount, "is_subscription": isSubscription,
            "price_change_flag": priceChangeFlag,
            "price_history": priceHistory.map { ["date": $0.date, "amount": $0.amount] },
            "is_user_created": isUserCreated
        ]
        if let mid = merchantId { data["merchant_id"] = mid }
        return data
    }

    static func from(_ data: [String: Any], id: String) -> RecurringEntity? {
        guard
            let userId = data["user_id"] as? String,
            let merchantName = data["merchant_name"] as? String,
            let cadenceRaw = data["cadence"] as? String,
            let cadence = RecurringCadence(rawValue: cadenceRaw),
            let nextDueDate = data["next_due_date"] as? Date,
            let lastAmount = data["last_amount"] as? Double
        else { return nil }
        let rawHistory = data["price_history"] as? [[String: Any]] ?? []
        let history = rawHistory.compactMap { h -> PricePoint? in
            guard let date = h["date"] as? String, let amount = h["amount"] as? Double else { return nil }
            return PricePoint(date: date, amount: amount)
        }
        return RecurringEntity(
            id: id, userId: userId, merchantName: merchantName,
            merchantId: data["merchant_id"] as? String, cadence: cadence,
            nextDueDate: nextDueDate, lastAmount: lastAmount,
            isSubscription: data["is_subscription"] as? Bool ?? false,
            priceChangeFlag: data["price_change_flag"] as? Bool ?? false,
            priceHistory: history,
            isUserCreated: data["is_user_created"] as? Bool ?? false
        )
    }
}
