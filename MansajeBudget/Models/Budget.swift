import Foundation

enum BudgetStatus: String, Codable {
    case onTrack   = "on_track"
    case warning   = "warning"
    case overBudget = "over_budget"
}

enum RolloverMode: String, Codable {
    case carryForward = "carry_forward"
    case resetEachMonth = "reset_each_month"
}

struct Budget: Identifiable, Codable {
    let id: String
    var category: TransactionCategory
    var limit: Double           // Monthly spending limit
    var spent: Double           // Computed from transactions
    var month: Int              // 1–12
    var year: Int
    var userId: String
    var rolloverEnabled: Bool
    var rolloverMode: RolloverMode
    var rolloverBalance: Double // Carried over from prior month
    var status: BudgetStatus

    var remaining: Double { limit + rolloverBalance - spent }
    var progress: Double {
        let effective = limit + rolloverBalance
        return effective > 0 ? min(spent / effective, 1.0) : 0
    }
    var isOverBudget: Bool { spent > limit + rolloverBalance }

    var computedStatus: BudgetStatus {
        if progress >= 1.0 { return .overBudget }
        if progress >= 0.8 { return .warning }
        return .onTrack
    }

    init(
        id: String = UUID().uuidString,
        category: TransactionCategory,
        limit: Double,
        spent: Double = 0,
        month: Int,
        year: Int,
        userId: String,
        rolloverEnabled: Bool = false,
        rolloverMode: RolloverMode = .resetEachMonth,
        rolloverBalance: Double = 0,
        status: BudgetStatus = .onTrack
    ) {
        self.id = id
        self.category = category
        self.limit = limit
        self.spent = spent
        self.month = month
        self.year = year
        self.userId = userId
        self.rolloverEnabled = rolloverEnabled
        self.rolloverMode = rolloverMode
        self.rolloverBalance = rolloverBalance
        self.status = status
    }

    static func currentMonthBudget(category: TransactionCategory, limit: Double, userId: String) -> Budget {
        let calendar = Calendar.current
        let now = Date()
        return Budget(
            category: category,
            limit: limit,
            month: calendar.component(.month, from: now),
            year: calendar.component(.year, from: now),
            userId: userId
        )
    }
}

extension Budget {
    var firestoreData: [String: Any] {
        [
            "id": id,
            "category": category.rawValue,
            "limit": limit,
            "spent": spent,
            "month": month,
            "year": year,
            "userId": userId,
            "rolloverEnabled": rolloverEnabled,
            "rolloverMode": rolloverMode.rawValue,
            "rolloverBalance": rolloverBalance,
            "status": computedStatus.rawValue
        ]
    }

    static func from(_ data: [String: Any], id: String) -> Budget? {
        guard
            let categoryRaw = data["category"] as? String,
            let category = TransactionCategory(rawValue: categoryRaw),
            let limit = data["limit"] as? Double,
            let month = data["month"] as? Int,
            let year = data["year"] as? Int,
            let userId = data["userId"] as? String
        else { return nil }

        let rolloverRaw = data["rolloverMode"] as? String ?? "reset_each_month"
        let statusRaw = data["status"] as? String ?? "on_track"
        return Budget(
            id: id,
            category: category,
            limit: limit,
            spent: data["spent"] as? Double ?? 0,
            month: month,
            year: year,
            userId: userId,
            rolloverEnabled: data["rolloverEnabled"] as? Bool ?? false,
            rolloverMode: RolloverMode(rawValue: rolloverRaw) ?? .resetEachMonth,
            rolloverBalance: data["rolloverBalance"] as? Double ?? 0,
            status: BudgetStatus(rawValue: statusRaw) ?? .onTrack
        )
    }
}
