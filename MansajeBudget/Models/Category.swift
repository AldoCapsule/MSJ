import SwiftUI

enum TransactionCategory: String, Codable, CaseIterable, Identifiable {
    case food
    case groceries
    case transport
    case utilities
    case rent
    case entertainment
    case health
    case shopping
    case travel
    case education
    case income
    case transfer
    case fees
    case personal
    case other

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .food:          return "Food & Dining"
        case .groceries:     return "Groceries"
        case .transport:     return "Transportation"
        case .utilities:     return "Utilities"
        case .rent:          return "Rent & Mortgage"
        case .entertainment: return "Entertainment"
        case .health:        return "Health & Wellness"
        case .shopping:      return "Shopping"
        case .travel:        return "Travel"
        case .education:     return "Education"
        case .income:        return "Income"
        case .transfer:      return "Transfer"
        case .fees:          return "Fees & Charges"
        case .personal:      return "Personal"
        case .other:         return "Other"
        }
    }

    var systemImage: String {
        switch self {
        case .food:          return "fork.knife"
        case .groceries:     return "cart.fill"
        case .transport:     return "car.fill"
        case .utilities:     return "bolt.fill"
        case .rent:          return "house.fill"
        case .entertainment: return "tv.fill"
        case .health:        return "heart.fill"
        case .shopping:      return "bag.fill"
        case .travel:        return "airplane"
        case .education:     return "book.fill"
        case .income:        return "dollarsign.circle.fill"
        case .transfer:      return "arrow.left.arrow.right"
        case .fees:          return "exclamationmark.circle.fill"
        case .personal:      return "person.fill"
        case .other:         return "ellipsis.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .food:          return Color(hex: "#FF6B6B")
        case .groceries:     return Color(hex: "#51CF66")
        case .transport:     return Color(hex: "#339AF0")
        case .utilities:     return Color(hex: "#FCC419")
        case .rent:          return Color(hex: "#845EF7")
        case .entertainment: return Color(hex: "#FF922B")
        case .health:        return Color(hex: "#F06595")
        case .shopping:      return Color(hex: "#20C997")
        case .travel:        return Color(hex: "#4DABF7")
        case .education:     return Color(hex: "#A9E34B")
        case .income:        return Color(hex: "#2F9E44")
        case .transfer:      return Color(hex: "#868E96")
        case .fees:          return Color(hex: "#FA5252")
        case .personal:      return Color(hex: "#CC5DE8")
        case .other:         return Color(hex: "#ADB5BD")
        }
    }

    // Map Plaid categories to our categories
    static func from(plaidCategories: [String]) -> TransactionCategory {
        let primary = plaidCategories.first?.lowercased() ?? ""
        let secondary = plaidCategories.dropFirst().first?.lowercased() ?? ""

        switch primary {
        case "food and drink":
            return secondary.contains("grocer") ? .groceries : .food
        case "travel":
            return secondary.contains("airline") || secondary.contains("flight") ? .travel : .transport
        case "transfer":         return .transfer
        case "payment":          return .fees
        case "recreation":       return .entertainment
        case "healthcare":       return .health
        case "shops":            return .shopping
        case "service":          return .personal
        case "tax":              return .fees
        case "education":        return .education
        case "community":        return .personal
        case "income":           return .income
        default:                 return .other
        }
    }
}
