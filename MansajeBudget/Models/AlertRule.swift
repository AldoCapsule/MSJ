import Foundation

enum AlertRuleType: String, Codable, CaseIterable {
    case budgetThreshold = "budget_threshold"
    case lowBalance      = "low_balance"
    case largeTxn        = "large_txn"
    case priceChange     = "price_change"

    var displayName: String {
        switch self {
        case .budgetThreshold: return "Budget Threshold"
        case .lowBalance:      return "Low Balance"
        case .largeTxn:        return "Large Transaction"
        case .priceChange:     return "Price Change"
        }
    }

    var systemImage: String {
        switch self {
        case .budgetThreshold: return "gauge.high"
        case .lowBalance:      return "exclamationmark.triangle.fill"
        case .largeTxn:        return "arrow.up.circle.fill"
        case .priceChange:     return "arrow.up.arrow.down.circle.fill"
        }
    }
}

enum AlertChannel: String, Codable, CaseIterable {
    case push
    case email
    case both

    var displayName: String {
        switch self {
        case .push: return "Push"
        case .email: return "Email"
        case .both: return "Push & Email"
        }
    }
}

struct AlertRuleParams: Codable {
    var categoryId: String?
    var accountId: String?
    var thresholdPct: Double?   // e.g. 80.0 for 80%
    var amountThreshold: Double?

    static func budgetThreshold(categoryId: String?, pct: Double) -> AlertRuleParams {
        AlertRuleParams(categoryId: categoryId, accountId: nil, thresholdPct: pct, amountThreshold: nil)
    }
    static func lowBalance(accountId: String, amount: Double) -> AlertRuleParams {
        AlertRuleParams(categoryId: nil, accountId: accountId, thresholdPct: nil, amountThreshold: amount)
    }
    static func largeTransaction(amount: Double) -> AlertRuleParams {
        AlertRuleParams(categoryId: nil, accountId: nil, thresholdPct: nil, amountThreshold: amount)
    }
}

struct AlertRule: Identifiable, Codable {
    let id: String
    var userId: String
    var type: AlertRuleType
    var params: AlertRuleParams
    var channel: AlertChannel
    var enabled: Bool
    var createdAt: Date

    init(
        id: String = UUID().uuidString,
        userId: String,
        type: AlertRuleType,
        params: AlertRuleParams = AlertRuleParams(),
        channel: AlertChannel = .push,
        enabled: Bool = true,
        createdAt: Date = Date()
    ) {
        self.id = id; self.userId = userId; self.type = type
        self.params = params; self.channel = channel
        self.enabled = enabled; self.createdAt = createdAt
    }
}

struct AlertEvent: Identifiable, Codable {
    let id: String
    var alertRuleId: String
    var firedAt: Date
    var payload: [String: String]
    var acknowledgedAt: Date?

    var isAcknowledged: Bool { acknowledgedAt != nil }
}

extension AlertRule {
    var firestoreData: [String: Any] {
        var paramsDict: [String: Any] = [:]
        if let c = params.categoryId { paramsDict["category_id"] = c }
        if let a = params.accountId { paramsDict["account_id"] = a }
        if let t = params.thresholdPct { paramsDict["threshold_pct"] = t }
        if let am = params.amountThreshold { paramsDict["amount_threshold"] = am }
        return ["id": id, "user_id": userId, "type": type.rawValue,
                "params": paramsDict, "channel": channel.rawValue,
                "enabled": enabled, "created_at": createdAt]
    }

    static func from(_ data: [String: Any], id: String) -> AlertRule? {
        guard
            let userId = data["user_id"] as? String,
            let typeRaw = data["type"] as? String,
            let type = AlertRuleType(rawValue: typeRaw)
        else { return nil }
        let p = data["params"] as? [String: Any] ?? [:]
        let params = AlertRuleParams(
            categoryId: p["category_id"] as? String,
            accountId: p["account_id"] as? String,
            thresholdPct: p["threshold_pct"] as? Double,
            amountThreshold: p["amount_threshold"] as? Double
        )
        let channelRaw = data["channel"] as? String ?? "push"
        return AlertRule(id: id, userId: userId, type: type, params: params,
                         channel: AlertChannel(rawValue: channelRaw) ?? .push,
                         enabled: data["enabled"] as? Bool ?? true,
                         createdAt: (data["created_at"] as? Date) ?? Date())
    }
}
