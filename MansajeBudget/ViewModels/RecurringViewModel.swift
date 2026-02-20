import SwiftUI

@MainActor
final class RecurringViewModel: ObservableObject {
    @Published var entities: [RecurringEntity] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let firestoreService = FirestoreService.shared
    private var uid: String = ""

    var upcoming: [RecurringEntity] {
        let cutoff = Calendar.current.date(byAdding: .day, value: 30, to: Date())!
        return entities.filter { $0.nextDueDate <= cutoff }
    }

    var subscriptions: [RecurringEntity] { entities.filter(\.isSubscription) }
    var priceChanges: [RecurringEntity] { entities.filter(\.priceChangeFlag) }
    var monthlyTotal: Double { entities.filter { $0.cadence == .monthly }.reduce(0) { $0 + $1.lastAmount } }

    func load(uid: String) {
        self.uid = uid
        Task { await fetchEntities() }
    }

    func fetchEntities() async {
        isLoading = true
        defer { isLoading = false }
        do {
            entities = try await firestoreService.fetchRecurringEntities(uid: uid)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func recompute() {
        isLoading = true
        Task {
            defer { isLoading = false }
            // Trigger backend recompute
            guard let idToken = try? await AuthService.shared.getIDToken() else { return }
            var request = URLRequest(url: URL(string: Constants.Backend.V1.recurringRecompute)!)
            request.httpMethod = "POST"
            request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
            if let (_, _) = try? await URLSession.shared.data(for: request) {
                await fetchEntities()
            }
        }
    }
}
