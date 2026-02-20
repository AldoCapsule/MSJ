import Foundation

enum RuleMatchType: String, Codable, CaseIterable {
    case merchant
    case regex
    case mcc
    case account

    var displayName: String {
        switch self {
        case .merchant: return "Merchant Name"
        case .regex:    return "Regex Pattern"
        case .mcc:      return "MCC Code"
        case .account:  return "Account"
        }
    }
}

enum RuleApplyScope: String, Codable, CaseIterable {
    case newOnly    = "new_only"
    case allHistory = "all_history"

    var displayName: String {
        switch self {
        case .newOnly:    return "New transactions only"
        case .allHistory: return "Apply to all history"
        }
    }
}

struct CategorizationRule: Identifiable, Codable {
    let id: String
    var userId: String
    var priority: Int
    var matchType: RuleMatchType
    var matchValue: String
    var actionCategoryId: String
    var actionTags: [String]
    var applyScope: RuleApplyScope
    var enabled: Bool
    var lastAppliedAt: Date?
    var createdAt: Date

    init(
        id: String = UUID().uuidString,
        userId: String,
        priority: Int = 100,
        matchType: RuleMatchType = .merchant,
        matchValue: String,
        actionCategoryId: String,
        actionTags: [String] = [],
        applyScope: RuleApplyScope = .newOnly,
        enabled: Bool = true,
        lastAppliedAt: Date? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id; self.userId = userId; self.priority = priority
        self.matchType = matchType; self.matchValue = matchValue
        self.actionCategoryId = actionCategoryId; self.actionTags = actionTags
        self.applyScope = applyScope; self.enabled = enabled
        self.lastAppliedAt = lastAppliedAt; self.createdAt = createdAt
    }

    func matches(transactionName: String, accountId: String) -> Bool {
        let name = transactionName.lowercased()
        switch matchType {
        case .merchant: return name.contains(matchValue.lowercased())
        case .regex:
            guard let regex = try? NSRegularExpression(pattern: matchValue, options: .caseInsensitive) else { return false }
            return regex.firstMatch(in: transactionName, range: NSRange(transactionName.startIndex..., in: transactionName)) != nil
        case .account: return accountId == matchValue
        case .mcc: return false // MCC not available client-side
        }
    }
}

extension CategorizationRule {
    var firestoreData: [String: Any] {
        var data: [String: Any] = [
            "id": id, "user_id": userId, "priority": priority,
            "match_type": matchType.rawValue, "match_value": matchValue,
            "action_category_id": actionCategoryId, "action_tags": actionTags,
            "apply_scope": applyScope.rawValue, "enabled": enabled,
            "created_at": createdAt
        ]
        if let applied = lastAppliedAt { data["last_applied_at"] = applied }
        return data
    }

    static func from(_ data: [String: Any], id: String) -> CategorizationRule? {
        guard
            let userId = data["user_id"] as? String,
            let matchTypeRaw = data["match_type"] as? String,
            let matchType = RuleMatchType(rawValue: matchTypeRaw),
            let matchValue = data["match_value"] as? String,
            let actionCategoryId = data["action_category_id"] as? String
        else { return nil }
        let scopeRaw = data["apply_scope"] as? String ?? "new_only"
        return CategorizationRule(
            id: id, userId: userId,
            priority: data["priority"] as? Int ?? 100,
            matchType: matchType, matchValue: matchValue,
            actionCategoryId: actionCategoryId,
            actionTags: data["action_tags"] as? [String] ?? [],
            applyScope: RuleApplyScope(rawValue: scopeRaw) ?? .newOnly,
            enabled: data["enabled"] as? Bool ?? true,
            lastAppliedAt: data["last_applied_at"] as? Date,
            createdAt: (data["created_at"] as? Date) ?? Date()
        )
    }
}
