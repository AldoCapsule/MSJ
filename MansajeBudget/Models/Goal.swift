import Foundation

enum GoalType: String, Codable, CaseIterable {
    case savings
    case debt

    var displayName: String {
        switch self {
        case .savings: return "Savings Goal"
        case .debt:    return "Debt Payoff"
        }
    }

    var systemImage: String {
        switch self {
        case .savings: return "banknote.fill"
        case .debt:    return "arrow.down.circle.fill"
        }
    }
}

struct Goal: Identifiable, Codable {
    let id: String
    var userId: String
    var name: String
    var type: GoalType
    var targetAmount: Double
    var targetDate: Date
    var fundingAccountId: String?
    var includeExistingBalance: Bool
    var computedMonthlyContribution: Double
    var currentBalance: Double
    var createdAt: Date

    var progress: Double {
        targetAmount > 0 ? min(currentBalance / targetAmount, 1.0) : 0
    }
    var remainingAmount: Double { max(targetAmount - currentBalance, 0) }
    var isComplete: Bool { currentBalance >= targetAmount }

    var monthsRemaining: Int {
        let calendar = Calendar.current
        let months = calendar.dateComponents([.month], from: Date(), to: targetDate).month ?? 0
        return max(months, 0)
    }

    var requiredMonthlyContribution: Double {
        let months = monthsRemaining
        guard months > 0 else { return remainingAmount }
        return remainingAmount / Double(months)
    }

    var onTrack: Bool { computedMonthlyContribution >= requiredMonthlyContribution }

    init(
        id: String = UUID().uuidString,
        userId: String,
        name: String,
        type: GoalType = .savings,
        targetAmount: Double,
        targetDate: Date,
        fundingAccountId: String? = nil,
        includeExistingBalance: Bool = false,
        computedMonthlyContribution: Double = 0,
        currentBalance: Double = 0,
        createdAt: Date = Date()
    ) {
        self.id = id; self.userId = userId; self.name = name; self.type = type
        self.targetAmount = targetAmount; self.targetDate = targetDate
        self.fundingAccountId = fundingAccountId
        self.includeExistingBalance = includeExistingBalance
        self.computedMonthlyContribution = computedMonthlyContribution
        self.currentBalance = currentBalance; self.createdAt = createdAt
    }
}

extension Goal {
    var firestoreData: [String: Any] {
        var data: [String: Any] = [
            "id": id, "user_id": userId, "name": name,
            "type": type.rawValue, "target_amount": targetAmount,
            "target_date": targetDate,
            "include_existing_balance": includeExistingBalance,
            "computed_monthly_contribution": computedMonthlyContribution,
            "current_balance": currentBalance, "created_at": createdAt
        ]
        if let acct = fundingAccountId { data["funding_account_id"] = acct }
        return data
    }

    static func from(_ data: [String: Any], id: String) -> Goal? {
        guard
            let userId = data["user_id"] as? String,
            let name = data["name"] as? String,
            let typeRaw = data["type"] as? String,
            let type = GoalType(rawValue: typeRaw),
            let targetAmount = data["target_amount"] as? Double,
            let targetDate = data["target_date"] as? Date
        else { return nil }
        return Goal(
            id: id, userId: userId, name: name, type: type,
            targetAmount: targetAmount, targetDate: targetDate,
            fundingAccountId: data["funding_account_id"] as? String,
            includeExistingBalance: data["include_existing_balance"] as? Bool ?? false,
            computedMonthlyContribution: data["computed_monthly_contribution"] as? Double ?? 0,
            currentBalance: data["current_balance"] as? Double ?? 0,
            createdAt: (data["created_at"] as? Date) ?? Date()
        )
    }
}
