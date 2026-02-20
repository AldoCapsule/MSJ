import Foundation

struct Holding: Identifiable, Codable {
    let id: String
    var accountId: String
    var userId: String
    var symbol: String
    var quantity: Double
    var costBasis: Double
    var currentPrice: Double
    var currentValue: Double
    var lastPriceUpdatedAt: Date

    var gainLoss: Double { currentValue - costBasis }
    var returnPct: Double { costBasis > 0 ? (gainLoss / costBasis) * 100 : 0 }
    var isGain: Bool { gainLoss >= 0 }

    init(
        id: String = UUID().uuidString,
        accountId: String,
        userId: String,
        symbol: String,
        quantity: Double,
        costBasis: Double,
        currentPrice: Double,
        currentValue: Double,
        lastPriceUpdatedAt: Date = Date()
    ) {
        self.id = id; self.accountId = accountId; self.userId = userId
        self.symbol = symbol; self.quantity = quantity; self.costBasis = costBasis
        self.currentPrice = currentPrice; self.currentValue = currentValue
        self.lastPriceUpdatedAt = lastPriceUpdatedAt
    }
}

extension Holding {
    var firestoreData: [String: Any] {
        ["id": id, "account_id": accountId, "user_id": userId,
         "symbol": symbol, "quantity": quantity, "cost_basis": costBasis,
         "current_price": currentPrice, "value_current": currentValue,
         "last_price_updated_at": lastPriceUpdatedAt]
    }

    static func from(_ data: [String: Any], id: String) -> Holding? {
        guard
            let accountId = data["account_id"] as? String,
            let userId = data["user_id"] as? String,
            let symbol = data["symbol"] as? String,
            let quantity = data["quantity"] as? Double,
            let costBasis = data["cost_basis"] as? Double,
            let currentPrice = data["current_price"] as? Double,
            let currentValue = data["value_current"] as? Double
        else { return nil }
        return Holding(
            id: id, accountId: accountId, userId: userId, symbol: symbol,
            quantity: quantity, costBasis: costBasis, currentPrice: currentPrice,
            currentValue: currentValue,
            lastPriceUpdatedAt: (data["last_price_updated_at"] as? Date) ?? Date()
        )
    }
}
