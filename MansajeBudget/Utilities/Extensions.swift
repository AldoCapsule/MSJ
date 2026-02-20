import SwiftUI

// MARK: - Color + Hex
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Date
extension Date {
    var formatted_mdy: String {
        Formatters.mediumDate.string(from: self)
    }

    var formatted_monthYear: String {
        Formatters.monthYear.string(from: self)
    }

    var formatted_relativeDay: String {
        if Calendar.current.isDateInToday(self) { return "Today" }
        if Calendar.current.isDateInYesterday(self) { return "Yesterday" }
        return formatted_mdy
    }

    var startOfMonth: Date {
        Calendar.current.dateInterval(of: .month, for: self)!.start
    }

    var endOfMonth: Date {
        Calendar.current.dateInterval(of: .month, for: self)!.end
    }

    func isSameDay(as other: Date) -> Bool {
        Calendar.current.isDate(self, inSameDayAs: other)
    }
}

// MARK: - Double (currency)
extension Double {
    var asCurrency: String {
        Formatters.currency.string(from: NSNumber(value: self)) ?? "$\(self)"
    }

    var asCurrencyAbs: String {
        Formatters.currency.string(from: NSNumber(value: abs(self))) ?? "$\(abs(self))"
    }

    var asPercent: String {
        Formatters.percent.string(from: NSNumber(value: self)) ?? "\(Int(self * 100))%"
    }
}

// MARK: - View
extension View {
    func cardStyle() -> some View {
        self
            .padding()
            .background(Color(.secondarySystemBackground))
            .cornerRadius(16)
    }

    func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

// MARK: - Array
extension Array where Element == Transaction {
    var totalExpenses: Double {
        filter(\.isExpense).reduce(0) { $0 + $1.amount }
    }

    var totalIncome: Double {
        filter(\.isIncome).reduce(0) { $0 + abs($1.amount) }
    }

    func grouped(by keyPath: KeyPath<Transaction, Date>) -> [Date: [Transaction]] {
        Dictionary(grouping: self) { txn in
            Calendar.current.startOfDay(for: txn[keyPath: keyPath])
        }
    }
}
