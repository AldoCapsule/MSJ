import SwiftUI

@MainActor
final class InvestmentsViewModel: ObservableObject {
    @Published var holdings: [Holding] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let firestoreService = FirestoreService.shared
    private var uid: String = ""

    var totalValue: Double { holdings.reduce(0) { $0 + $1.currentValue } }
    var totalCostBasis: Double { holdings.reduce(0) { $0 + $1.costBasis } }
    var totalGainLoss: Double { totalValue - totalCostBasis }
    var totalReturnPct: Double { totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0 }
    var gainers: [Holding] { holdings.filter(\.isGain).sorted { $0.returnPct > $1.returnPct } }
    var losers: [Holding] { holdings.filter { !$0.isGain }.sorted { $0.returnPct < $1.returnPct } }

    func load(uid: String) {
        self.uid = uid
        Task { await fetchHoldings() }
    }

    func fetchHoldings() async {
        isLoading = true
        defer { isLoading = false }
        do {
            holdings = try await firestoreService.fetchHoldings(uid: uid)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
