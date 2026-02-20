import Foundation

enum AccountType: String, Codable, CaseIterable {
    case checking
    case savings
    case credit
    case investment
    case loan
    case other

    var displayName: String {
        switch self {
        case .checking:    return "Checking"
        case .savings:     return "Savings"
        case .credit:      return "Credit Card"
        case .investment:  return "Investment"
        case .loan:        return "Loan"
        case .other:       return "Other"
        }
    }

    var systemImage: String {
        switch self {
        case .checking:    return "banknote"
        case .savings:     return "building.columns"
        case .credit:      return "creditcard"
        case .investment:  return "chart.line.uptrend.xyaxis"
        case .loan:        return "doc.text"
        case .other:       return "ellipsis.circle"
        }
    }
}

struct Account: Identifiable, Codable {
    let id: String
    var name: String
    var type: AccountType
    var balance: Double
    var institutionName: String
    var institutionLogo: String?   // URL string
    var mask: String?              // Last 4 digits
    var userId: String
    var plaidAccountId: String?
    var lastUpdated: Date

    init(
        id: String = UUID().uuidString,
        name: String,
        type: AccountType,
        balance: Double,
        institutionName: String,
        institutionLogo: String? = nil,
        mask: String? = nil,
        userId: String,
        plaidAccountId: String? = nil,
        lastUpdated: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.balance = balance
        self.institutionName = institutionName
        self.institutionLogo = institutionLogo
        self.mask = mask
        self.userId = userId
        self.plaidAccountId = plaidAccountId
        self.lastUpdated = lastUpdated
    }
}

extension Account {
    var firestoreData: [String: Any] {
        var data: [String: Any] = [
            "id": id,
            "name": name,
            "type": type.rawValue,
            "balance": balance,
            "institutionName": institutionName,
            "userId": userId,
            "lastUpdated": lastUpdated
        ]
        if let logo = institutionLogo { data["institutionLogo"] = logo }
        if let mask = mask { data["mask"] = mask }
        if let plaidId = plaidAccountId { data["plaidAccountId"] = plaidId }
        return data
    }

    static func from(_ data: [String: Any], id: String) -> Account? {
        guard
            let name = data["name"] as? String,
            let typeRaw = data["type"] as? String,
            let type = AccountType(rawValue: typeRaw),
            let balance = data["balance"] as? Double,
            let institutionName = data["institutionName"] as? String,
            let userId = data["userId"] as? String
        else { return nil }

        return Account(
            id: id,
            name: name,
            type: type,
            balance: balance,
            institutionName: institutionName,
            institutionLogo: data["institutionLogo"] as? String,
            mask: data["mask"] as? String,
            userId: userId,
            plaidAccountId: data["plaidAccountId"] as? String,
            lastUpdated: (data["lastUpdated"] as? Date) ?? Date()
        )
    }
}
