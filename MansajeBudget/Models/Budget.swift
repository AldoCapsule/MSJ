import Foundation

struct Budget: Identifiable, Codable {
    let id: String
    var category: TransactionCategory
    var limit: Double           // Monthly spending limit
    var spent: Double           // Computed from transactions
    var month: Int              // 1–12
    var year: Int
    var userId: String

    var remaining: Double { limit - spent }
    var progress: Double { limit > 0 ? min(spent / limit, 1.0) : 0 }
    var isOverBudget: Bool { spent > limit }

    init(
        id: String = UUID().uuidString,
        category: TransactionCategory,
        limit: Double,
        spent: Double = 0,
        month: Int,
        year: Int,
        userId: String
    ) {
        self.id = id
        self.category = category
        self.limit = limit
        self.spent = spent
        self.month = month
        self.year = year
        self.userId = userId
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
            "userId": userId
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

        return Budget(
            id: id,
            category: category,
            limit: limit,
            spent: data["spent"] as? Double ?? 0,
            month: month,
            year: year,
            userId: userId
        )
    }
}
