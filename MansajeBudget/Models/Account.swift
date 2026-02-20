import Foundation

enum AccountType: String, Codable, CaseIterable {
    case checking
    case savings
    case credit
    case investment
    case loan
    case mortgage
    case other

    var displayName: String {
        switch self {
        case .checking:    return "Checking"
        case .savings:     return "Savings"
        case .credit:      return "Credit Card"
        case .investment:  return "Investment"
        case .loan:        return "Loan"
        case .mortgage:    return "Mortgage"
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
        case .mortgage:    return "house.fill"
        case .other:       return "ellipsis.circle"
        }
    }

    var isLiability: Bool { self == .credit || self == .loan || self == .mortgage }
}

struct Account: Identifiable, Codable {
    let id: String
    var name: String
    var type: AccountType
    var balance: Double
    var availableBalance: Double?
    var institutionName: String
    var institutionLogo: String?   // URL string
    var mask: String?              // Last 4 digits
    var userId: String
    var plaidAccountId: String?
    var lastUpdated: Date
    var isHidden: Bool
    var isHiddenFromBudgets: Bool
    var isClosed: Bool

    var displayBalance: Double { availableBalance ?? balance }

    init(
        id: String = UUID().uuidString,
        name: String,
        type: AccountType,
        balance: Double,
        availableBalance: Double? = nil,
        institutionName: String,
        institutionLogo: String? = nil,
        mask: String? = nil,
        userId: String,
        plaidAccountId: String? = nil,
        lastUpdated: Date = Date(),
        isHidden: Bool = false,
        isHiddenFromBudgets: Bool = false,
        isClosed: Bool = false
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.balance = balance
        self.availableBalance = availableBalance
        self.institutionName = institutionName
        self.institutionLogo = institutionLogo
        self.mask = mask
        self.userId = userId
        self.plaidAccountId = plaidAccountId
        self.lastUpdated = lastUpdated
        self.isHidden = isHidden
        self.isHiddenFromBudgets = isHiddenFromBudgets
        self.isClosed = isClosed
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
            "lastUpdated": lastUpdated,
            "isHidden": isHidden,
            "isHiddenFromBudgets": isHiddenFromBudgets,
            "isClosed": isClosed
        ]
        if let logo = institutionLogo { data["institutionLogo"] = logo }
        if let mask = mask { data["mask"] = mask }
        if let plaidId = plaidAccountId { data["plaidAccountId"] = plaidId }
        if let avail = availableBalance { data["availableBalance"] = avail }
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
            availableBalance: data["availableBalance"] as? Double,
            institutionName: institutionName,
            institutionLogo: data["institutionLogo"] as? String,
            mask: data["mask"] as? String,
            userId: userId,
            plaidAccountId: data["plaidAccountId"] as? String,
            lastUpdated: (data["lastUpdated"] as? Date) ?? Date(),
            isHidden: data["isHidden"] as? Bool ?? false,
            isHiddenFromBudgets: data["isHiddenFromBudgets"] as? Bool ?? false,
            isClosed: data["isClosed"] as? Bool ?? false
        )
    }
}
